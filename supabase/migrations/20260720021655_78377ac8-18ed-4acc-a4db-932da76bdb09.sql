
INSERT INTO public.user_roles (user_id, role)
SELECT '55b3a774-38bd-4002-80e0-5b66acde954e', 'admin'::app_role
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '55b3a774-38bd-4002-80e0-5b66acde954e' AND role = 'admin');

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read audit log" ON public.admin_audit_log;
CREATE POLICY "Admins read audit log" ON public.admin_audit_log FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins insert audit log" ON public.admin_audit_log;
CREATE POLICY "Admins insert audit log" ON public.admin_audit_log FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) AND admin_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_log(created_at DESC);

DROP POLICY IF EXISTS "Admins full access profiles" ON public.profiles;
CREATE POLICY "Admins full access profiles" ON public.profiles FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins full access user_roles" ON public.user_roles;
CREATE POLICY "Admins full access user_roles" ON public.user_roles FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins full access establishments" ON public.establishments;
CREATE POLICY "Admins full access establishments" ON public.establishments FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins full access courier_profiles" ON public.courier_profiles;
CREATE POLICY "Admins full access courier_profiles" ON public.courier_profiles FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins full access orders" ON public.orders;
CREATE POLICY "Admins full access orders" ON public.orders FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins full access order_items" ON public.order_items;
CREATE POLICY "Admins full access order_items" ON public.order_items FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins full access deliveries" ON public.deliveries;
CREATE POLICY "Admins full access deliveries" ON public.deliveries FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins full access reviews" ON public.reviews;
CREATE POLICY "Admins full access reviews" ON public.reviews FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins full access products" ON public.products;
CREATE POLICY "Admins full access products" ON public.products FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id INT PRIMARY KEY DEFAULT 1,
  platform_name TEXT NOT NULL DEFAULT 'WiFome',
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  default_delivery_fee_cents INT NOT NULL DEFAULT 500,
  default_radius_km NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.platform_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Everyone reads settings" ON public.platform_settings;
CREATE POLICY "Everyone reads settings" ON public.platform_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins update settings" ON public.platform_settings;
CREATE POLICY "Admins update settings" ON public.platform_settings FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
