
-- Helper: courier is assigned to this order
CREATE OR REPLACE FUNCTION private.is_courier_of_order(_order_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.order_id = _order_id AND d.entregador_id = _user_id
  )
$$;

-- Helper: user is the client of this order
CREATE OR REPLACE FUNCTION private.is_client_of_order(_order_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = _order_id AND o.cliente_id = _user_id
  )
$$;

-- Helper: user owns the establishment of this order
CREATE OR REPLACE FUNCTION private.owns_establishment_of_order(_order_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.establishments e ON e.id = o.establishment_id
    WHERE o.id = _order_id AND e.owner_id = _user_id
  )
$$;

GRANT EXECUTE ON FUNCTION private.is_courier_of_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_client_of_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_establishment_of_order(uuid, uuid) TO authenticated;

-- Remove policies duplicadas de admin (ficaram 2 iguais)
DROP POLICY IF EXISTS "Admins full access orders" ON public.orders;
DROP POLICY IF EXISTS "Admins full access deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Admins full access establishments" ON public.establishments;

-- Recria orders_courier_read sem subquery direta em deliveries
DROP POLICY IF EXISTS orders_courier_read ON public.orders;
CREATE POLICY orders_courier_read ON public.orders
FOR SELECT USING (private.is_courier_of_order(id, auth.uid()));

-- Recria deliveries_cliente_read sem subquery direta em orders
DROP POLICY IF EXISTS deliveries_cliente_read ON public.deliveries;
CREATE POLICY deliveries_cliente_read ON public.deliveries
FOR SELECT USING (private.is_client_of_order(order_id, auth.uid()));

-- Também recria as de estabelecimento em deliveries usando a função (evita cadeia com orders)
DROP POLICY IF EXISTS deliveries_estab_read ON public.deliveries;
CREATE POLICY deliveries_estab_read ON public.deliveries
FOR SELECT USING (private.owns_establishment_of_order(order_id, auth.uid()));

DROP POLICY IF EXISTS deliveries_estab_insert ON public.deliveries;
CREATE POLICY deliveries_estab_insert ON public.deliveries
FOR INSERT WITH CHECK (private.owns_establishment_of_order(order_id, auth.uid()));

DROP POLICY IF EXISTS deliveries_estab_update ON public.deliveries;
CREATE POLICY deliveries_estab_update ON public.deliveries
FOR UPDATE USING (private.owns_establishment_of_order(order_id, auth.uid()))
WITH CHECK (private.owns_establishment_of_order(order_id, auth.uid()));
