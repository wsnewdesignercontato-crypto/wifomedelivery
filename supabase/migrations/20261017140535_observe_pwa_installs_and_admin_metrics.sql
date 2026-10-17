-- Public pages report observations through the application server. Neither
-- anonymous callers nor signed-in accounts can read or write this table/RPC.
CREATE TABLE public.pwa_install_observations (
  app_type text NOT NULL CHECK (app_type IN ('cliente', 'estabelecimento', 'entrega')),
  installation_id uuid NOT NULL,
  installed boolean NOT NULL,
  evidence text NOT NULL CHECK (evidence IN ('appinstalled', 'standalone', 'browser-query')),
  first_installed_at timestamptz NOT NULL,
  last_opened_at timestamptz,
  last_observed_at timestamptz NOT NULL,
  PRIMARY KEY (app_type, installation_id),
  CONSTRAINT pwa_install_observations_evidence_state_check CHECK (installed OR evidence = 'browser-query')
);
COMMENT ON TABLE public.pwa_install_observations IS
  'Browser-declared PWA installation telemetry per origin/device UUID; no account, IP, location or OS attestation.';
ALTER TABLE public.pwa_install_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pwa_install_observations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pwa_install_observations TO service_role;
GRANT SELECT ON TABLE public.user_app_installs TO service_role;

CREATE FUNCTION public.observe_pwa_install(
  p_app_type text, p_installation_id uuid, p_evidence text, p_installed boolean
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_app_type IS NULL OR p_app_type NOT IN ('cliente', 'estabelecimento', 'entrega') THEN
    RAISE EXCEPTION 'Invalid app_type' USING ERRCODE = '22023';
  END IF;
  IF p_installation_id IS NULL THEN
    RAISE EXCEPTION 'installation_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_evidence IS NULL OR p_evidence NOT IN ('appinstalled', 'standalone', 'browser-query')
    OR p_installed IS NULL OR (NOT p_installed AND p_evidence <> 'browser-query') THEN
    RAISE EXCEPTION 'Invalid installation evidence/state' USING ERRCODE = '22023';
  END IF;
  IF NOT p_installed THEN
    -- Regular visits only update an existing observation. A historical
    -- authenticated confirmation can also supply that existing installation:
    -- import it lazily so a first negative report does not leave legacy state
    -- permanently active. Never import accounts that merely visited.
    UPDATE public.pwa_install_observations
    SET installed = false, evidence = p_evidence, last_observed_at = statement_timestamp()
    WHERE app_type = p_app_type AND installation_id = p_installation_id;
    IF FOUND THEN RETURN; END IF;
    INSERT INTO public.pwa_install_observations (
      app_type, installation_id, installed, evidence,
      first_installed_at, last_opened_at, last_observed_at
    ) SELECT p_app_type, p_installation_id, false, p_evidence,
      coalesce(min(installed_at), statement_timestamp()), max(last_opened_at), statement_timestamp()
      FROM public.user_app_installs
      WHERE app_type = p_app_type AND installation_id = p_installation_id
      HAVING bool_or(installed) OR min(installed_at) IS NOT NULL
    ON CONFLICT (app_type, installation_id) DO UPDATE SET
      installed = false, evidence = EXCLUDED.evidence, last_observed_at = statement_timestamp();
    RETURN;
  END IF;
  INSERT INTO public.pwa_install_observations AS existing (
    app_type, installation_id, installed, evidence,
    first_installed_at, last_opened_at, last_observed_at
  ) VALUES (
    p_app_type, p_installation_id, true, p_evidence, statement_timestamp(),
    CASE WHEN p_evidence = 'standalone' THEN statement_timestamp() END, statement_timestamp()
  ) ON CONFLICT (app_type, installation_id) DO UPDATE SET
    installed = true,
    evidence = EXCLUDED.evidence,
    last_opened_at = CASE WHEN p_evidence = 'standalone'
      THEN statement_timestamp() ELSE existing.last_opened_at END,
    last_observed_at = statement_timestamp();
END;
$$;

-- Service-role only: the application checks the current admin role before
-- calling this aggregate. Device IDs/user IDs never leave the server endpoint.
CREATE FUNCTION public.admin_pwa_install_metrics() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH profiles(app_type, sort_order) AS (
    VALUES ('cliente', 1), ('estabelecimento', 2), ('entrega', 3)
  ), legacy AS (
    SELECT app_type, installation_id, bool_or(installed) AS installed,
      min(installed_at) AS first_installed_at,
      max(greatest(installed_at, last_opened_at)) AS last_observed_at
    FROM public.user_app_installs GROUP BY app_type, installation_id
  ), devices AS (
    SELECT coalesce(o.app_type, l.app_type) AS app_type,
      coalesce(o.installed, l.installed) AS installed,
      least(o.first_installed_at, l.first_installed_at) AS first_installed_at,
      greatest(o.last_observed_at, l.last_observed_at) AS last_observed_at
    FROM public.pwa_install_observations o FULL OUTER JOIN legacy l
      ON l.app_type = o.app_type AND l.installation_id = o.installation_id
  ), installations AS (
    SELECT app_type,
      count(*) FILTER (WHERE installed) AS active_installs,
      count(*) FILTER (WHERE installed OR first_installed_at IS NOT NULL) AS historical_installs,
      max(last_observed_at) AS last_observed_at
    FROM devices GROUP BY app_type
  ), accounts AS (
    SELECT app_type, count(DISTINCT user_id) AS identified_accounts
    FROM public.user_app_installs WHERE installed_at IS NOT NULL OR installed
    GROUP BY app_type
  )
  SELECT jsonb_build_object(
    'updatedAt', statement_timestamp(),
    'apps', jsonb_agg(jsonb_build_object(
      'appType', p.app_type,
      'activeInstalls', coalesce(i.active_installs, 0),
      'historicalInstalls', coalesce(i.historical_installs, 0),
      'identifiedAccounts', coalesce(a.identified_accounts, 0),
      'lastObservedAt', i.last_observed_at
    ) ORDER BY p.sort_order)
  ) FROM profiles p LEFT JOIN installations i USING (app_type)
    LEFT JOIN accounts a USING (app_type);
$$;

REVOKE ALL ON FUNCTION public.observe_pwa_install(text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_pwa_install_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.observe_pwa_install(text, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_pwa_install_metrics() TO service_role;
