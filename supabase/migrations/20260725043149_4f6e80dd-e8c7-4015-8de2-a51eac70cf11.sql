CREATE OR REPLACE FUNCTION public.get_order_client_contact(_order_id uuid)
RETURNS TABLE (nome text, telefone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente uuid;
  v_estab uuid;
  v_owner uuid;
  v_is_courier boolean := false;
  v_is_owner boolean := false;
  v_is_admin boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT o.cliente_id, o.establishment_id INTO v_cliente, v_estab
    FROM public.orders o WHERE o.id = _order_id;
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;

  SELECT e.owner_id INTO v_owner FROM public.establishments e WHERE e.id = v_estab;
  v_is_owner := (v_owner = v_uid);

  SELECT EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.order_id = _order_id AND d.entregador_id = v_uid
  ) INTO v_is_courier;

  BEGIN
    v_is_admin := public.has_role(v_uid, 'admin'::app_role);
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  IF NOT (v_is_owner OR v_is_courier OR v_is_admin) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
    SELECT
      p.nome,
      CASE
        WHEN v_is_courier OR v_is_admin THEN p.telefone
        ELSE NULL
      END AS telefone
    FROM public.profiles p WHERE p.id = v_cliente;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_order_client_contact(uuid) TO authenticated;