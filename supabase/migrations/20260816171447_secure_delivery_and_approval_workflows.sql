CREATE OR REPLACE FUNCTION private.is_courier_dispatch_approved(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courier_profiles cp
    WHERE cp.user_id = p_user_id
      AND lower(coalesce(cp.status, '')) NOT IN ('blocked', 'bloqueado')
      AND lower(coalesce(cp.aprovacao, '')) NOT IN ('rejected', 'rejeitado', 'recusado', 'blocked', 'bloqueado')
      AND lower(coalesce(cp.kyc_status, '')) NOT IN ('rejected', 'rejeitado', 'recusado', 'blocked', 'bloqueado')
      AND (
        lower(coalesce(cp.aprovacao, '')) IN ('approved', 'aprovado')
        OR lower(coalesce(cp.kyc_status, '')) IN ('approved', 'aprovado')
      )
  );
$$;

REVOKE ALL ON FUNCTION private.is_courier_dispatch_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_courier_dispatch_approved(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "deliveries_courier_broadcast_read" ON public.deliveries;
CREATE POLICY "deliveries_courier_broadcast_read"
ON public.deliveries
FOR SELECT
TO authenticated
USING (
  status = 'broadcasting'
  AND private.is_courier_dispatch_approved(auth.uid())
  AND (entregador_id IS NULL OR entregador_id = auth.uid())
);

DROP POLICY IF EXISTS "deliveries_courier_update" ON public.deliveries;
CREATE POLICY "deliveries_courier_update"
ON public.deliveries
FOR UPDATE
TO authenticated
USING (
  entregador_id = auth.uid()
  OR (
    status = 'broadcasting'
    AND private.is_courier_dispatch_approved(auth.uid())
    AND (entregador_id IS NULL OR entregador_id = auth.uid())
  )
)
WITH CHECK (
  entregador_id = auth.uid()
  AND (
    status <> 'broadcasting'
    OR private.is_courier_dispatch_approved(auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.notify_couriers_new_ride()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cidade text;
  v_valor text;
BEGIN
  IF NEW.status NOT IN ('created', 'broadcasting') THEN
    RETURN NEW;
  END IF;

  SELECT e.cidade INTO v_cidade
  FROM public.orders o
  JOIN public.establishments e ON e.id = o.establishment_id
  WHERE o.id = NEW.order_id;

  v_valor := to_char(COALESCE(NEW.valor_entrega_cents, 0) / 100.0, 'FM999999990.00');

  INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
  SELECT cp.user_id,
         'Nova corrida disponivel!',
         'Corrida de R$ ' || v_valor || ' disponivel agora. Toque para aceitar antes de outro entregador.',
         '/entregador/corridas',
         'entregador'
  FROM public.courier_profiles cp
  WHERE cp.status = 'online'
    AND private.is_courier_dispatch_approved(cp.user_id)
    AND (
      v_cidade IS NULL
      OR cp.cidade_atuacao IS NULL
      OR lower(btrim(cp.cidade_atuacao)) = lower(btrim(v_cidade))
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(cp.cidades_atuacao, ARRAY[]::text[])) c
        WHERE lower(btrim(c)) = lower(btrim(v_cidade))
      )
    );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.orders_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'delivered' AND NEW.status NOT IN ('refunded') THEN
    RAISE EXCEPTION 'Cannot change delivered order to %', NEW.status;
  END IF;
  IF OLD.status = 'refunded' THEN
    RAISE EXCEPTION 'Order already refunded';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status NOT IN ('refunded') THEN
    RAISE EXCEPTION 'Cancelled order can only be refunded';
  END IF;

  IF NEW.status = 'cancelled' THEN
    allowed := true;
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
  ELSIF NEW.status = 'refunded' THEN
    allowed := OLD.status IN ('cancelled', 'delivered');
    NEW.refunded_at := COALESCE(NEW.refunded_at, now());
    IF NEW.refund_status = 'none' THEN
      NEW.refund_status := 'completed';
    END IF;
    IF NEW.refund_amount_cents = 0 THEN
      NEW.refund_amount_cents := NEW.total_cents;
    END IF;
  ELSE
    allowed := (OLD.status, NEW.status) IN (
      ('placed', 'accepted'),
      ('accepted', 'preparing'),
      ('preparing', 'ready'),
      ('waiting_courier', 'courier_assigned'),
      ('courier_assigned', 'picked_up'),
      ('picked_up', 'on_the_way'),
      ('on_the_way', 'arriving'),
      ('arriving', 'delivered'),
      ('on_the_way', 'delivered'),
      ('picked_up', 'delivered')
    );

    IF OLD.status = 'ready' AND NEW.status = 'waiting_courier' THEN
      allowed := COALESCE(OLD.tipo_entrega, 'delivery') <> 'pickup';
    ELSIF OLD.status = 'ready' AND NEW.status = 'delivered' THEN
      allowed := COALESCE(OLD.tipo_entrega, 'delivery') = 'pickup';
    END IF;
  END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_pickup_order(p_order_id uuid, p_codigo text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  JOIN public.establishments e ON e.id = o.establishment_id
  WHERE o.id = p_order_id
    AND e.owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF COALESCE(v_order.tipo_entrega, 'delivery') <> 'pickup' THEN
    RAISE EXCEPTION 'pickup_only';
  END IF;

  IF v_order.status = 'delivered' THEN
    RETURN;
  END IF;

  IF v_order.status <> 'ready' THEN
    RAISE EXCEPTION 'order_not_ready';
  END IF;

  IF v_order.codigo_expira_em IS NOT NULL AND v_order.codigo_expira_em < now() THEN
    RAISE EXCEPTION 'code_expired';
  END IF;

  IF v_order.codigo_entrega IS NULL OR trim(p_codigo) <> v_order.codigo_entrega THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  UPDATE public.orders
  SET status = 'delivered'
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_pickup_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_pickup_order(uuid, text) TO authenticated;
