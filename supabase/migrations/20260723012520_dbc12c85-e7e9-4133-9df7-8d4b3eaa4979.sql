
ALTER VIEW public.public_platform_settings SET (security_invoker = true);
GRANT SELECT (bestseller_threshold, ad_default_seconds) ON public.platform_settings TO anon, authenticated;
DROP POLICY IF EXISTS "platform_settings_public_fields_read" ON public.platform_settings;
CREATE POLICY "platform_settings_public_fields_read" ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (true);
