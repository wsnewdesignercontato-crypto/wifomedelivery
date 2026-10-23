-- The settings screen writes directly through the signed-in user's Data API.
-- Its admin-only RLS policy existed, but the UPDATE grant was missing.
DO $$ BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.platform_settings'::regclass) THEN
    RAISE EXCEPTION 'platform_settings RLS must remain enabled';
  END IF;
END $$;

-- Do not grant operations that bypass row policies or change the singleton id.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.platform_settings FROM anon, authenticated;
REVOKE UPDATE (id) ON public.platform_settings FROM anon, authenticated;
GRANT UPDATE (
  platform_name, commission_pct, default_delivery_fee_cents, default_radius_km,
  maintenance_mode, bestseller_threshold, ad_default_seconds,
  score_delay_warn_ratio, score_delay_warn_penalty,
  score_delay_severe_ratio, score_delay_severe_penalty,
  score_review_bad_max, score_review_bad_penalty,
  score_review_regular_rating, score_review_regular_penalty,
  score_start, score_band_warn, score_band_critical,
  support_email, support_whatsapp, support_phone, updated_by, updated_at
) ON public.platform_settings TO authenticated;

-- The existing SELECT/UPDATE admin policies and active-account restriction stay in force.
NOTIFY pgrst, 'reload schema';
