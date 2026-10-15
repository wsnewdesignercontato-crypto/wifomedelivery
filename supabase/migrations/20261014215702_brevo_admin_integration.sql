-- Private Brevo credentials. Browser roles can never call these RPCs.
-- SECURITY DEFINER is limited to service_role, used by authenticated admin
-- server handlers and signed Supabase Auth hooks; it grants no browser access.
BEGIN;
CREATE SCHEMA IF NOT EXISTS brevo_private;
REVOKE ALL ON SCHEMA brevo_private FROM PUBLIC, anon, authenticated;

CREATE TABLE brevo_private.settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  sender_name text NOT NULL CHECK (length(sender_name) BETWEEN 1 AND 80),
  sender_email text NOT NULL CHECK (length(sender_email) BETWEEN 3 AND 254),
  secret_id uuid REFERENCES vault.secrets(id) ON DELETE SET NULL,
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  last_test_attempt_at timestamptz,
  last_test_at timestamptz,
  last_test_success boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brevo_private.settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brevo_private.settings FROM PUBLIC, anon, authenticated;
INSERT INTO brevo_private.settings(id,sender_name,sender_email) VALUES(1,'PedeTrem','wsnewdesignercontato@gmail.com');

CREATE TABLE brevo_private.hook_deliveries (
  request_id text PRIMARY KEY CHECK (length(request_id) BETWEEN 1 AND 240),
  payload_hash text NOT NULL CHECK (length(payload_hash) BETWEEN 1 AND 128),
  sent boolean NOT NULL DEFAULT false,
  lease_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brevo_private.hook_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brevo_private.hook_deliveries FROM PUBLIC, anon, authenticated;
CREATE INDEX ON brevo_private.hook_deliveries(created_at);

CREATE FUNCTION public.brevo_settings_get() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'senderName',sender_name,'senderEmail',sender_email,
    'configured',secret_id IS NOT NULL,'tested',last_test_success,
    'testedAt',last_test_at
  ) FROM brevo_private.settings WHERE id=1;
$$;

CREATE FUNCTION public.brevo_credentials_get() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'senderName',s.sender_name,'senderEmail',s.sender_email,
    'apiKey',v.decrypted_secret,'revision',s.revision,'tested',s.last_test_success
  ) FROM brevo_private.settings s LEFT JOIN vault.decrypted_secrets v ON v.id=s.secret_id WHERE s.id=1;
$$;

CREATE FUNCTION public.brevo_settings_save(_sender_name text,_sender_email text,_api_key text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE secret_ref uuid;
BEGIN
  IF length(btrim(_sender_name)) NOT BETWEEN 1 AND 80 OR length(_sender_email) NOT BETWEEN 3 AND 254 THEN
    RAISE EXCEPTION 'Invalid sender settings' USING ERRCODE='22023';
  END IF;
  SELECT secret_id INTO secret_ref FROM brevo_private.settings WHERE id=1 FOR UPDATE;
  IF _api_key IS NOT NULL THEN
    IF length(_api_key) NOT BETWEEN 20 AND 512 OR _api_key NOT LIKE 'xkeysib-%' THEN
      RAISE EXCEPTION 'Invalid API key format' USING ERRCODE='22023';
    END IF;
    IF secret_ref IS NULL THEN
      secret_ref := vault.create_secret(_api_key,'wifome_brevo_api_key','Private Brevo API credential for wifome');
    ELSE
      PERFORM vault.update_secret(secret_ref,_api_key);
    END IF;
  END IF;
  IF secret_ref IS NULL THEN RAISE EXCEPTION 'API key required' USING ERRCODE='22023'; END IF;
  UPDATE brevo_private.settings SET sender_name=btrim(_sender_name),sender_email=lower(btrim(_sender_email)),
    secret_id=secret_ref,revision=gen_random_uuid(),last_test_success=false,last_test_at=NULL,updated_at=now() WHERE id=1;
END;
$$;

CREATE FUNCTION public.brevo_test_reserve() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE settings brevo_private.settings%ROWTYPE;
BEGIN
  SELECT * INTO settings FROM brevo_private.settings WHERE id=1 FOR UPDATE;
  IF settings.secret_id IS NULL THEN RAISE EXCEPTION 'API key required' USING ERRCODE='22023'; END IF;
  IF settings.last_test_attempt_at > now() - interval '60 seconds' THEN
    RAISE EXCEPTION 'Test cooldown active' USING ERRCODE='P0002';
  END IF;
  UPDATE brevo_private.settings SET last_test_attempt_at=now() WHERE id=1;
  RETURN public.brevo_credentials_get();
END;
$$;

CREATE FUNCTION public.brevo_test_complete(_revision uuid,_success boolean) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE brevo_private.settings SET last_test_success=_success,last_test_at=now() WHERE id=1 AND revision=_revision;
$$;

CREATE FUNCTION public.brevo_hook_claim(_request_id text,_payload_hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE delivery brevo_private.hook_deliveries%ROWTYPE; inserted_count integer;
BEGIN
  DELETE FROM brevo_private.hook_deliveries WHERE created_at < now() - interval '1 day';
  INSERT INTO brevo_private.hook_deliveries(request_id,payload_hash,lease_until)
    VALUES(_request_id,_payload_hash,now()+interval '30 seconds') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  SELECT * INTO delivery FROM brevo_private.hook_deliveries WHERE request_id=_request_id FOR UPDATE;
  IF delivery.payload_hash IS DISTINCT FROM _payload_hash THEN
    RAISE EXCEPTION 'Hook payload changed' USING ERRCODE='P0002';
  END IF;
  IF delivery.sent THEN RETURN 'sent'; END IF;
  IF inserted_count=0 AND delivery.lease_until > now() THEN RETURN 'busy'; END IF;
  UPDATE brevo_private.hook_deliveries SET lease_until=now()+interval '30 seconds' WHERE request_id=_request_id;
  RETURN 'claimed';
END;
$$;

CREATE FUNCTION public.brevo_hook_complete(_request_id text,_payload_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE brevo_private.hook_deliveries SET sent=true WHERE request_id=_request_id AND payload_hash=_payload_hash;
$$;

REVOKE ALL ON FUNCTION public.brevo_settings_get(), public.brevo_credentials_get(),
  public.brevo_settings_save(text,text,text), public.brevo_test_reserve(),
  public.brevo_test_complete(uuid,boolean), public.brevo_hook_claim(text,text),
  public.brevo_hook_complete(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brevo_settings_get(), public.brevo_credentials_get(),
  public.brevo_settings_save(text,text,text), public.brevo_test_reserve(),
  public.brevo_test_complete(uuid,boolean), public.brevo_hook_claim(text,text),
  public.brevo_hook_complete(text,text) TO service_role;
COMMIT;
