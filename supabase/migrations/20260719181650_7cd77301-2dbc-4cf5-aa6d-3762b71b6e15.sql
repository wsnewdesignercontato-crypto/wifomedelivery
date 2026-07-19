-- 1) Move has_role into a private schema so it's not exposed via the Data API
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO postgres, service_role;

-- Recreate policies to call private.has_role instead of public.has_role
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS user_roles_admin_all ON public.user_roles;
CREATE POLICY user_roles_admin_all ON public.user_roles FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS global_categories_admin_all ON public.global_categories;
CREATE POLICY global_categories_admin_all ON public.global_categories FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS establishments_admin_all ON public.establishments;
CREATE POLICY establishments_admin_all ON public.establishments FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS menu_categories_admin_all ON public.menu_categories;
CREATE POLICY menu_categories_admin_all ON public.menu_categories FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS products_admin_all ON public.products;
CREATE POLICY products_admin_all ON public.products FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS courier_profiles_admin_all ON public.courier_profiles;
CREATE POLICY courier_profiles_admin_all ON public.courier_profiles FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS orders_admin_all ON public.orders;
CREATE POLICY orders_admin_all ON public.orders FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS order_items_visible ON public.order_items;
CREATE POLICY order_items_visible ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.cliente_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = o.establishment_id AND e.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.deliveries d WHERE d.order_id = o.id AND d.entregador_id = auth.uid())
        OR private.has_role(auth.uid(), 'admin')
      )
  ));

DROP POLICY IF EXISTS order_items_admin_all ON public.order_items;
CREATE POLICY order_items_admin_all ON public.order_items FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS deliveries_admin_all ON public.deliveries;
CREATE POLICY deliveries_admin_all ON public.deliveries FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 2) Stop exposing sensitive establishment columns to anonymous users
DROP POLICY IF EXISTS establishments_public_read_approved ON public.establishments;
REVOKE SELECT ON public.establishments FROM anon;

CREATE OR REPLACE VIEW public.establishments_public
WITH (security_invoker = true) AS
SELECT
  id,
  owner_id,
  nome,
  categoria_id,
  logo_url,
  capa_url,
  descricao,
  endereco,
  cidade,
  estado,
  lat,
  lng,
  taxa_entrega_cents,
  raio_entrega_km,
  tempo_medio_min,
  pedido_minimo_cents,
  status,
  is_open,
  avaliacao,
  created_at,
  updated_at
FROM public.establishments
WHERE status = 'aprovado';

GRANT SELECT ON public.establishments_public TO anon, authenticated;

-- Signed-in users can still read approved storefronts through the base table
-- for use cases needing columns the view exposes.
CREATE POLICY establishments_authenticated_read_approved
  ON public.establishments FOR SELECT TO authenticated
  USING (status = 'aprovado');
