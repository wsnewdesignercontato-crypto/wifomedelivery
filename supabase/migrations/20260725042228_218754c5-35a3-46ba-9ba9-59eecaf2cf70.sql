
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS printer_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS printer_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS printer_width_mm integer NOT NULL DEFAULT 80;

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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT o.cliente_id, o.establishment_id INTO v_cliente, v_estab
    FROM public.orders o WHERE o.id = _order_id;
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  SELECT e.owner_id INTO v_owner FROM public.establishments e WHERE e.id = v_estab;
  IF v_owner IS DISTINCT FROM v_uid THEN
    IF NOT EXISTS (SELECT 1 FROM public.deliveries d WHERE d.order_id = _order_id AND d.entregador_id = v_uid) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;
  RETURN QUERY
    SELECT p.nome, p.telefone FROM public.profiles p WHERE p.id = v_cliente;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_order_client_contact(uuid) TO authenticated;
