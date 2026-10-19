-- Asaas configuration only: credentials stay in Vault and no payment, order or
-- ledger write is introduced. Admin authorization lives in server handlers;
-- every exposed RPC below is callable only with the server's service role.
CREATE SCHEMA asaas_private;
REVOKE ALL ON SCHEMA asaas_private FROM PUBLIC,anon,authenticated;

CREATE TABLE asaas_private.settings (
 environment text PRIMARY KEY CHECK(environment IN ('sandbox','production')),
 notification_email text NOT NULL DEFAULT '',
 api_key_secret_id uuid REFERENCES vault.secrets(id) ON DELETE SET NULL,
 webhook_token_secret_id uuid REFERENCES vault.secrets(id) ON DELETE SET NULL,
 revision uuid NOT NULL DEFAULT gen_random_uuid(),
 tested boolean NOT NULL DEFAULT false,
 tested_at timestamptz,
 webhook_id text,
 webhook_revision uuid,
 last_webhook_at timestamptz,
 operation_id uuid,
 operation_expires_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((operation_id IS NULL)=(operation_expires_at IS NULL))
);
ALTER TABLE asaas_private.settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON asaas_private.settings FROM PUBLIC,anon,authenticated;
INSERT INTO asaas_private.settings(environment) VALUES('sandbox'),('production');

CREATE TABLE asaas_private.webhook_events (
 environment text NOT NULL REFERENCES asaas_private.settings(environment),
 event_id text NOT NULL CHECK(length(event_id) BETWEEN 1 AND 240 AND event_id ~ '^[A-Za-z0-9_-]+$'),
 event_type text NOT NULL CHECK(event_type ~ '^[A-Z][A-Z0-9_]{1,95}$'),
 payment_id text CHECK(length(payment_id) BETWEEN 1 AND 128 AND payment_id ~ '^[A-Za-z0-9_-]+$'),
 payment_status text CHECK(payment_status ~ '^[A-Z][A-Z0-9_]{1,63}$'),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(environment,event_id)
);
ALTER TABLE asaas_private.webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON asaas_private.webhook_events FROM PUBLIC,anon,authenticated;
CREATE INDEX ON asaas_private.webhook_events(environment,received_at DESC);

CREATE FUNCTION asaas_private.require_environment(_environment text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF _environment IS NULL OR _environment NOT IN ('sandbox','production') THEN
  RAISE EXCEPTION 'Invalid Asaas environment' USING ERRCODE='22023';
 END IF;
END $$;
REVOKE ALL ON FUNCTION asaas_private.require_environment(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.asaas_settings_get(_environment text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 SELECT jsonb_build_object(
  'environment',s.environment,'notificationEmail',s.notification_email,
  'configured',s.api_key_secret_id IS NOT NULL,'tested',s.tested,'testedAt',s.tested_at,
  'webhookConfigured',coalesce(s.tested AND s.webhook_id IS NOT NULL AND s.webhook_token_secret_id IS NOT NULL AND s.webhook_revision=s.revision,false),
  'webhookId',s.webhook_id,'lastWebhookAt',s.last_webhook_at,'revision',s.revision
 ) INTO result FROM asaas_private.settings s WHERE s.environment=_environment;
 RETURN result;
END $$;

CREATE FUNCTION public.asaas_credentials_get(_environment text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 SELECT jsonb_build_object(
  'environment',s.environment,'notificationEmail',s.notification_email,
  'apiKey',k.decrypted_secret,'webhookToken',t.decrypted_secret,
  'revision',s.revision,'tested',s.tested,'webhookId',s.webhook_id
 ) INTO result FROM asaas_private.settings s
 LEFT JOIN vault.decrypted_secrets k ON k.id=s.api_key_secret_id
 LEFT JOIN vault.decrypted_secrets t ON t.id=s.webhook_token_secret_id
 WHERE s.environment=_environment;
 RETURN result;
END $$;

CREATE FUNCTION public.asaas_settings_save(_environment text,_notification_email text,_api_key text DEFAULT NULL,_webhook_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s asaas_private.settings%ROWTYPE; email text:=lower(btrim(_notification_email)); key_value text; token_value text;
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 IF email IS NULL OR length(email) NOT BETWEEN 3 AND 254 OR
  email !~ '^[^[:space:][:cntrl:]@<>"\\]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
  RAISE EXCEPTION 'Invalid notification email' USING ERRCODE='22023';
 END IF;
 SELECT * INTO s FROM asaas_private.settings WHERE environment=_environment FOR UPDATE;
 IF s.operation_id IS NOT NULL AND s.operation_expires_at>clock_timestamp() THEN
  RAISE EXCEPTION 'Asaas registration in progress' USING ERRCODE='55000';
 END IF;
 SELECT decrypted_secret INTO key_value FROM vault.decrypted_secrets WHERE id=s.api_key_secret_id;
 SELECT decrypted_secret INTO token_value FROM vault.decrypted_secrets WHERE id=s.webhook_token_secret_id;
 IF _api_key IS NOT NULL AND _api_key ~ '[^[:space:]]' THEN key_value:=_api_key; END IF;
 IF _webhook_token IS NOT NULL AND _webhook_token ~ '[^[:space:]]' THEN token_value:=_webhook_token; END IF;
 IF key_value IS NULL THEN RAISE EXCEPTION 'API key required' USING ERRCODE='22023'; END IF;
 IF length(key_value) NOT BETWEEN 20 AND 4096 OR key_value ~ '[[:space:][:cntrl:]]' THEN
  RAISE EXCEPTION 'Invalid API key format' USING ERRCODE='22023';
 END IF;
 IF token_value IS NOT NULL AND (length(token_value) NOT BETWEEN 32 AND 255 OR token_value ~ '[[:space:][:cntrl:]]' OR token_value=key_value OR left(token_value,6)='$aact_') THEN
  RAISE EXCEPTION 'Invalid webhook token' USING ERRCODE='22023';
 END IF;
 IF s.api_key_secret_id IS NULL THEN
  s.api_key_secret_id:=vault.create_secret(key_value,'pedetrem_asaas_'||_environment||'_api_key_'||gen_random_uuid()::text,'Private Asaas API key');
 ELSIF _api_key IS NOT NULL AND _api_key ~ '[^[:space:]]' THEN
  PERFORM vault.update_secret(s.api_key_secret_id,key_value);
 END IF;
 IF token_value IS NOT NULL THEN
  IF s.webhook_token_secret_id IS NULL THEN
   s.webhook_token_secret_id:=vault.create_secret(token_value,'pedetrem_asaas_'||_environment||'_webhook_token_'||gen_random_uuid()::text,'Private Asaas webhook authentication token');
  ELSIF _webhook_token IS NOT NULL AND _webhook_token ~ '[^[:space:]]' THEN
   PERFORM vault.update_secret(s.webhook_token_secret_id,token_value);
  END IF;
 END IF;
 UPDATE asaas_private.settings SET notification_email=email,api_key_secret_id=s.api_key_secret_id,webhook_token_secret_id=s.webhook_token_secret_id,
  revision=gen_random_uuid(),tested=false,tested_at=NULL,webhook_revision=NULL,
  operation_id=NULL,operation_expires_at=NULL,updated_at=clock_timestamp()
 WHERE environment=_environment;
 -- Keep the previous provider webhook ID for server-side update/reuse, but its
 -- completion is invalid until this new revision is tested and registered.
 RETURN public.asaas_settings_get(_environment);
END $$;

-- The server must acquire before reading credentials for provider registration
-- and release in finally. Save shares this row lock, preventing an old provider
-- request from racing a newer configuration while its 90-second lease is live.
CREATE FUNCTION public.asaas_operation_acquire(_environment text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s asaas_private.settings%ROWTYPE; operation uuid:=gen_random_uuid();
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 SELECT * INTO s FROM asaas_private.settings WHERE environment=_environment FOR UPDATE;
 IF s.operation_id IS NOT NULL AND s.operation_expires_at>clock_timestamp() THEN
  RAISE EXCEPTION 'Asaas registration in progress' USING ERRCODE='55000';
 END IF;
 UPDATE asaas_private.settings SET operation_id=operation,operation_expires_at=clock_timestamp()+interval '90 seconds'
 WHERE environment=_environment;
 RETURN operation;
END $$;

CREATE FUNCTION public.asaas_operation_release(_environment text,_operation_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 UPDATE asaas_private.settings SET operation_id=NULL,operation_expires_at=NULL
 WHERE environment=_environment AND operation_id=_operation_id;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END $$;

CREATE FUNCTION public.asaas_connection_complete(_environment text,_revision uuid,_success boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 IF _success IS NULL THEN RAISE EXCEPTION 'Missing connection result' USING ERRCODE='22023'; END IF;
 UPDATE asaas_private.settings SET tested=_success,tested_at=clock_timestamp(),
  webhook_revision=CASE WHEN _success THEN webhook_revision ELSE NULL END,updated_at=clock_timestamp()
 WHERE environment=_environment AND revision=_revision AND api_key_secret_id IS NOT NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END $$;

CREATE FUNCTION public.asaas_webhook_complete(_environment text,_revision uuid,_webhook_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 IF _webhook_id IS NULL OR length(_webhook_id) NOT BETWEEN 1 AND 160 OR _webhook_id !~ '^[A-Za-z0-9_-]+$' THEN
  RAISE EXCEPTION 'Invalid webhook ID' USING ERRCODE='22023';
 END IF;
 UPDATE asaas_private.settings SET webhook_id=_webhook_id,webhook_revision=_revision,updated_at=clock_timestamp()
 WHERE environment=_environment AND revision=_revision AND tested AND api_key_secret_id IS NOT NULL AND webhook_token_secret_id IS NOT NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END $$;

CREATE FUNCTION public.asaas_webhook_record(_environment text,_event_id text,_event_type text,_payment_id text DEFAULT NULL,_payment_status text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted integer;
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 IF _event_id IS NULL OR length(_event_id) NOT BETWEEN 1 AND 240 OR _event_id !~ '^[A-Za-z0-9_-]+$' OR
  _event_type IS NULL OR _event_type !~ '^[A-Z][A-Z0-9_]{1,95}$' OR
  (_payment_id IS NOT NULL AND (length(_payment_id) NOT BETWEEN 1 AND 128 OR _payment_id !~ '^[A-Za-z0-9_-]+$')) OR
  (_payment_status IS NOT NULL AND _payment_status !~ '^[A-Z][A-Z0-9_]{1,63}$') THEN
  RAISE EXCEPTION 'Invalid webhook metadata' USING ERRCODE='22023';
 END IF;
 INSERT INTO asaas_private.webhook_events(environment,event_id,event_type,payment_id,payment_status)
 VALUES(_environment,_event_id,_event_type,_payment_id,_payment_status) ON CONFLICT(environment,event_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=1 THEN
  UPDATE asaas_private.settings SET last_webhook_at=clock_timestamp() WHERE environment=_environment;
 END IF;
 RETURN inserted=1;
END $$;

REVOKE ALL ON FUNCTION public.asaas_settings_get(text),public.asaas_credentials_get(text),
 public.asaas_operation_acquire(text),public.asaas_operation_release(text,uuid),
 public.asaas_settings_save(text,text,text,text),public.asaas_connection_complete(text,uuid,boolean),
 public.asaas_webhook_complete(text,uuid,text),public.asaas_webhook_record(text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_settings_get(text),public.asaas_credentials_get(text),
 public.asaas_operation_acquire(text),public.asaas_operation_release(text,uuid),
 public.asaas_settings_save(text,text,text,text),public.asaas_connection_complete(text,uuid,boolean),
 public.asaas_webhook_complete(text,uuid,text),public.asaas_webhook_record(text,text,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
