
-- Criar a função confirm_pickup_order que está faltando
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
