-- Device/origin installation observations, independent for each app profile.
CREATE TABLE public.user_app_installs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_type text NOT NULL CHECK (app_type IN ('cliente', 'estabelecimento', 'entrega')),
  installation_id uuid NOT NULL,
  installed boolean NOT NULL,
  evidence text NOT NULL CHECK (evidence IN ('appinstalled', 'standalone', 'browser-query')),
  installed_at timestamptz,
  last_opened_at timestamptz,
  CONSTRAINT user_app_installs_pkey PRIMARY KEY (user_id, app_type, installation_id),
  CONSTRAINT user_app_installs_evidence_state_check CHECK (installed OR evidence = 'browser-query')
);

COMMENT ON TABLE public.user_app_installs IS
  'Client-observed installation evidence per user, app and origin/device UUID; not proof of OS installation or a global account preference.';

ALTER TABLE public.user_app_installs ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_app_installs_owner_select ON public.user_app_installs
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY user_app_installs_owner_insert ON public.user_app_installs
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY user_app_installs_owner_update ON public.user_app_installs
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Stamp dates for both RPC and any permitted direct Data API writes. Column
-- grants below prevent clients from supplying timestamps or changing identity.
CREATE FUNCTION public.stamp_user_app_install() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.evidence IS NULL OR NEW.evidence NOT IN ('appinstalled', 'standalone', 'browser-query')
     OR NEW.installed IS NULL OR (NOT NEW.installed AND NEW.evidence <> 'browser-query') THEN
    RAISE EXCEPTION 'Invalid installation evidence/state' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.installed_at := CASE WHEN NEW.installed THEN statement_timestamp() ELSE NULL END;
    NEW.last_opened_at := CASE WHEN NEW.evidence = 'standalone' THEN statement_timestamp() ELSE NULL END;
  ELSE
    NEW.installed_at := COALESCE(OLD.installed_at,
      CASE WHEN NEW.installed THEN statement_timestamp() ELSE NULL END);
    NEW.last_opened_at := CASE WHEN NEW.evidence = 'standalone'
      THEN statement_timestamp() ELSE OLD.last_opened_at END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stamp_user_app_install
  BEFORE INSERT OR UPDATE ON public.user_app_installs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_user_app_install();

CREATE FUNCTION public.record_app_install(
  p_app_type text,
  p_installation_id uuid,
  p_evidence text,
  p_installed boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_record public.user_app_installs;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required' USING ERRCODE = '42501';
  END IF;
  IF p_app_type IS NULL OR p_app_type NOT IN ('cliente', 'estabelecimento', 'entrega') THEN
    RAISE EXCEPTION 'Invalid app_type' USING ERRCODE = '22023';
  END IF;
  IF p_installation_id IS NULL THEN
    RAISE EXCEPTION 'installation_id is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.user_app_installs (user_id, app_type, installation_id, installed, evidence)
  VALUES (v_user_id, p_app_type, p_installation_id, p_installed, p_evidence)
  ON CONFLICT (user_id, app_type, installation_id) DO UPDATE
    SET installed = EXCLUDED.installed, evidence = EXCLUDED.evidence
  RETURNING * INTO v_record;
  RETURN to_jsonb(v_record);
END;
$$;

REVOKE ALL ON TABLE public.user_app_installs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_app_installs TO authenticated;
GRANT INSERT (user_id, app_type, installation_id, installed, evidence)
  ON public.user_app_installs TO authenticated;
GRANT UPDATE (installed, evidence) ON public.user_app_installs TO authenticated;
REVOKE ALL ON FUNCTION public.stamp_user_app_install() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_app_install(text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_app_install(text, uuid, text, boolean) TO authenticated;
