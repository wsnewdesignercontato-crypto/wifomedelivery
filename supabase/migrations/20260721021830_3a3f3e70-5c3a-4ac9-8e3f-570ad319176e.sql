
-- 1. courier_profiles: remove broad merchant SELECT, expose safe cols via view
DROP POLICY IF EXISTS "Merchants view online approved couriers" ON public.courier_profiles;

CREATE OR REPLACE VIEW public.couriers_available_public
WITH (security_invoker = off) AS
SELECT user_id, veiculo, avaliacao, lat, lng, last_seen, status, aprovacao
FROM public.courier_profiles
WHERE status = 'online' AND aprovacao = 'approved';

REVOKE ALL ON public.couriers_available_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.couriers_available_public TO authenticated;

-- 2. establishment_delivery_zones: restrict public read to approved estabs
DROP POLICY IF EXISTS "dz_public_read" ON public.establishment_delivery_zones;
CREATE POLICY "dz_public_read" ON public.establishment_delivery_zones
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.establishments e
  WHERE e.id = establishment_delivery_zones.establishment_id
    AND e.status = 'aprovado'
));

-- 3. platform_settings: restrict base to admin; expose safe public fields via view
DROP POLICY IF EXISTS "Everyone reads settings" ON public.platform_settings;
CREATE POLICY "Admins read settings" ON public.platform_settings
FOR SELECT
USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE VIEW public.platform_settings_public
WITH (security_invoker = off) AS
SELECT id, bestseller_threshold, ad_default_seconds
FROM public.platform_settings;

REVOKE ALL ON public.platform_settings_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_settings_public TO anon, authenticated;

-- 4. product_addon_groups: restrict to approved establishments + available products
DROP POLICY IF EXISTS "pag_public_read" ON public.product_addon_groups;
CREATE POLICY "pag_public_read" ON public.product_addon_groups
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.products p
  JOIN public.establishments e ON e.id = p.establishment_id
  WHERE p.id = product_addon_groups.product_id
    AND p.disponivel = true
    AND e.status = 'aprovado'
));
