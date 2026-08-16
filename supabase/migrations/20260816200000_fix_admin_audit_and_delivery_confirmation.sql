CREATE OR REPLACE FUNCTION private.audit_platform_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_actor_id uuid;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_actor_id := COALESCE(auth.uid(), NEW.updated_by, OLD.updated_by);
  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
    IF v_old->v_key IS DISTINCT FROM v_new->v_key THEN
      v_changes :=
        v_changes
        || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old->v_key, 'new', v_new->v_key)
        );
    END IF;
  END LOOP;

  IF v_actor_id IS NOT NULL AND v_changes <> '{}'::jsonb THEN
    INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_actor_id,
      'platform_settings.update',
      'platform_settings',
      NEW.id::text,
      v_changes
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_role(_target_user uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'grant_role',
    'user',
    _target_user::text,
    jsonb_build_object('role', _role)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_role(_target_user uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  IF _role = 'admin' AND (SELECT COUNT(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last admin';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _target_user
    AND role = _role;

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'revoke_role',
    'user',
    _target_user::text,
    jsonb_build_object('role', _role)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_role(uuid, app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_revoke_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_role(uuid, app_role) TO authenticated;

CREATE OR REPLACE FUNCTION private.courier_confirm_delivery_core(
  p_order_id uuid,
  p_codigo text,
  p_prova_url text DEFAULT NULL,
  p_metodo text DEFAULT 'code'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_delivery public.deliveries%ROWTYPE;
  v_metodo text := lower(COALESCE(NULLIF(btrim(p_metodo), ''), 'code'));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_metodo = 'code+photo' THEN
    v_metodo := 'photo';
  ELSIF v_metodo NOT IN ('code', 'photo', 'signature', 'contactless') THEN
    v_metodo := 'code';
  END IF;

  SELECT *
  INTO v_delivery
  FROM public.deliveries
  WHERE order_id = p_order_id
    AND entregador_id = v_uid
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.status = 'delivered' THEN
    RETURN;
  END IF;

  IF v_order.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'order_finalized';
  END IF;

  IF v_order.codigo_expira_em IS NOT NULL AND v_order.codigo_expira_em < now() THEN
    RAISE EXCEPTION 'code_expired';
  END IF;

  IF v_order.codigo_entrega IS NULL OR btrim(p_codigo) <> v_order.codigo_entrega THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  UPDATE public.deliveries
  SET status = 'delivered',
      entregue_em = COALESCE(entregue_em, now())
  WHERE id = v_delivery.id;

  UPDATE public.orders
  SET status = 'delivered',
      entrega_metodo_prova = v_metodo,
      dinheiro_recebido = (v_order.forma_pagamento = 'dinheiro'),
      prova_url = COALESCE(p_prova_url, prova_url)
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION private.courier_confirm_delivery_core(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.courier_confirm_delivery_core(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.courier_confirm_delivery(
  _order_id uuid,
  _codigo text,
  _prova_url text DEFAULT NULL,
  _metodo text DEFAULT 'code'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private
AS $$
BEGIN
  PERFORM private.courier_confirm_delivery_core(_order_id, _codigo, _prova_url, _metodo);
END;
$$;

CREATE OR REPLACE FUNCTION public.courier_confirm_delivery(p_order_id uuid, p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private
AS $$
BEGIN
  PERFORM private.courier_confirm_delivery_core(p_order_id, p_codigo, NULL, 'code');
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.courier_confirm_delivery(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_confirm_delivery(uuid, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.courier_confirm_delivery(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_confirm_delivery(uuid, text) TO authenticated;
