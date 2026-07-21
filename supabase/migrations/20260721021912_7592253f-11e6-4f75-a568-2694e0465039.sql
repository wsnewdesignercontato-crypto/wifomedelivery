
-- Drop the flagged views
DROP VIEW IF EXISTS public.couriers_available_public;
DROP VIEW IF EXISTS public.platform_settings_public;

-- Safe RPC for merchants to list available couriers (no PII)
CREATE OR REPLACE FUNCTION public.list_available_couriers()
RETURNS TABLE(
  user_id uuid,
  veiculo text,
  avaliacao numeric,
  lat double precision,
  lng double precision,
  last_seen timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.user_id, cp.veiculo, cp.avaliacao, cp.lat, cp.lng, cp.last_seen
  FROM public.courier_profiles cp
  WHERE cp.status = 'online'
    AND cp.aprovacao = 'approved'
    AND (
      private.has_role(auth.uid(), 'estabelecimento'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role)
    );
$$;

REVOKE ALL ON FUNCTION public.list_available_couriers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_available_couriers() TO authenticated;

-- Safe RPC to read the couple of public display-only platform settings
CREATE OR REPLACE FUNCTION public.get_public_platform_settings()
RETURNS TABLE(
  bestseller_threshold integer,
  ad_default_seconds integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bestseller_threshold, ad_default_seconds
  FROM public.platform_settings
  WHERE id = 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_platform_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_platform_settings() TO anon, authenticated;
