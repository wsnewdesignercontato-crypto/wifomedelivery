
-- 1) Audit trigger for platform_settings
CREATE OR REPLACE FUNCTION private.audit_platform_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
    IF v_old->v_key IS DISTINCT FROM v_new->v_key THEN
      v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('old', v_old->v_key, 'new', v_new->v_key));
    END IF;
  END LOOP;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (
      auth.uid(),
      'platform_settings.update',
      'platform_settings',
      NEW.id::text,
      v_changes
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_platform_settings ON public.platform_settings;
CREATE TRIGGER trg_audit_platform_settings
AFTER UPDATE ON public.platform_settings
FOR EACH ROW EXECUTE FUNCTION private.audit_platform_settings_change();

-- 2) Delivery code expiration
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS codigo_expira_em timestamptz;

-- Backfill: 30 min a partir de agora para pedidos ativos sem expiração
UPDATE public.orders
SET codigo_expira_em = now() + interval '30 minutes'
WHERE codigo_entrega IS NOT NULL
  AND codigo_expira_em IS NULL
  AND status NOT IN ('delivered','cancelled','refunded');

-- Trigger para setar expiração sempre que codigo_entrega for gerado/alterado
CREATE OR REPLACE FUNCTION private.set_delivery_code_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.codigo_entrega IS DISTINCT FROM OLD.codigo_entrega AND NEW.codigo_entrega IS NOT NULL THEN
    NEW.codigo_expira_em := now() + interval '30 minutes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_delivery_code_expiry ON public.orders;
CREATE TRIGGER trg_set_delivery_code_expiry
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.set_delivery_code_expiry();

-- Também para INSERT
CREATE OR REPLACE FUNCTION private.set_delivery_code_expiry_ins()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.codigo_entrega IS NOT NULL AND NEW.codigo_expira_em IS NULL THEN
    NEW.codigo_expira_em := now() + interval '30 minutes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_delivery_code_expiry_ins ON public.orders;
CREATE TRIGGER trg_set_delivery_code_expiry_ins
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.set_delivery_code_expiry_ins();

-- 3) RPC para cliente regenerar o código expirado
CREATE OR REPLACE FUNCTION public.regenerate_delivery_code(p_order_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new_code text;
  v_cliente uuid;
  v_status order_status;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT cliente_id, status INTO v_cliente, v_status
  FROM public.orders WHERE id = p_order_id;

  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_cliente <> v_uid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_status IN ('delivered','cancelled','refunded') THEN
    RAISE EXCEPTION 'order_finalized';
  END IF;

  v_new_code := lpad((floor(random()*10000))::int::text, 4, '0');

  UPDATE public.orders
  SET codigo_entrega = v_new_code,
      codigo_expira_em = now() + interval '30 minutes'
  WHERE id = p_order_id;

  RETURN v_new_code;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_delivery_code(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.regenerate_delivery_code(uuid) TO authenticated;

-- 4) Reforça courier_confirm_delivery para checar expiração
CREATE OR REPLACE FUNCTION public.courier_confirm_delivery(p_order_id uuid, p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_codigo text;
  v_exp timestamptz;
  v_courier uuid;
  v_status order_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT o.codigo_entrega, o.codigo_expira_em, d.entregador_id, o.status
  INTO v_codigo, v_exp, v_courier, v_status
  FROM public.orders o
  LEFT JOIN public.deliveries d ON d.order_id = o.id
  WHERE o.id = p_order_id;

  IF v_courier IS NULL OR v_courier <> v_uid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_status = 'delivered' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF v_exp IS NOT NULL AND v_exp < now() THEN
    RAISE EXCEPTION 'code_expired';
  END IF;

  IF v_codigo IS NULL OR trim(p_codigo) <> v_codigo THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  UPDATE public.orders
  SET status = 'delivered', delivered_at = now()
  WHERE id = p_order_id;

  UPDATE public.deliveries
  SET status = 'delivered', delivered_at = now()
  WHERE order_id = p_order_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.courier_confirm_delivery(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.courier_confirm_delivery(uuid, text) TO authenticated;
