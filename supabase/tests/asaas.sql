-- Fake credentials only. All configuration, Vault secrets and event fixtures roll back.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF to_regprocedure('public.asaas_settings_get(text)') IS NULL THEN RAISE EXCEPTION 'Asaas configuration RPCs are missing'; END IF;
END $$;
CREATE TEMP TABLE asaas_contract_snapshot(kind text PRIMARY KEY,value jsonb);
DO $$ BEGIN
 IF to_regclass('brevo_private.settings') IS NOT NULL THEN EXECUTE 'INSERT INTO asaas_contract_snapshot VALUES(''brevo'',(SELECT jsonb_agg(to_jsonb(s)) FROM brevo_private.settings s))'; END IF;
 IF to_regclass('public.orders') IS NOT NULL THEN EXECUTE 'INSERT INTO asaas_contract_snapshot VALUES(''orders'',(SELECT jsonb_build_object(''count'',count(*),''latest'',max(updated_at)) FROM public.orders))'; END IF;
 IF to_regclass('public.platform_ledger') IS NOT NULL THEN EXECUTE 'INSERT INTO asaas_contract_snapshot VALUES(''ledger'',(SELECT jsonb_build_object(''count'',count(*),''gross'',sum(gross_cents)) FROM public.platform_ledger))'; END IF;
END $$;
-- Isolate the test from any configured real account without reading its secret.
UPDATE asaas_private.settings SET api_key_secret_id=NULL,webhook_token_secret_id=NULL,notification_email='',
 revision=gen_random_uuid(),tested=false,tested_at=NULL,webhook_id=NULL,webhook_revision=NULL,last_webhook_at=NULL,operation_id=NULL,operation_expires_at=NULL;
CREATE TEMP TABLE asaas_contract_ids(event_id text);
CREATE TEMP TABLE asaas_contract_leases(operation_id uuid);
INSERT INTO asaas_contract_ids VALUES('evt_contract_'||replace(gen_random_uuid()::text,'-',''));
GRANT SELECT ON asaas_contract_ids TO service_role;
GRANT ALL ON asaas_contract_leases TO service_role;

SET LOCAL ROLE service_role;
DO $$
DECLARE s jsonb; c jsonb; old_revision uuid; revision uuid; activity timestamptz;
 key_s text:='$aact_hmlg_'||repeat('a',64); key_p text:='$aact_prod_'||repeat('b',64);
 token_s text:=repeat('1',64); token_p text:=repeat('2',64); eid text:=(SELECT event_id FROM asaas_contract_ids);
BEGIN
 s:=public.asaas_settings_get('sandbox');
 IF s->>'environment'<>'sandbox' OR s->>'notificationEmail'<>'' OR s->>'configured'<>'false' OR s->>'tested'<>'false' OR s->>'webhookConfigured'<>'false' THEN RAISE EXCEPTION 'FAIL empty settings DTO'; END IF;
 IF NOT s ?& ARRAY['environment','notificationEmail','configured','tested','testedAt','webhookConfigured','webhookId','lastWebhookAt','revision'] THEN RAISE EXCEPTION 'FAIL settings DTO contract'; END IF;
 BEGIN PERFORM public.asaas_settings_get('other'); RAISE EXCEPTION 'FAIL unknown environment'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_settings_get(NULL); RAISE EXCEPTION 'FAIL missing environment'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_settings_save('sandbox','notify@example.invalid',NULL,NULL); RAISE EXCEPTION 'FAIL first save without key'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_settings_save('sandbox',E'bad\nBcc: victim@example.invalid',key_s,token_s); RAISE EXCEPTION 'FAIL email injection'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_settings_save('sandbox','notify@example.c',key_s,token_s); RAISE EXCEPTION 'FAIL invalid email suffix'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_settings_save('sandbox','notify@example.invalid',key_s,key_s); RAISE EXCEPTION 'FAIL webhook reused API key'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_settings_save('sandbox','notify@example.invalid',key_s,'short'); RAISE EXCEPTION 'FAIL short webhook token'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_settings_save('sandbox','notify@example.invalid',key_s,repeat('a',32)||' '); RAISE EXCEPTION 'FAIL whitespace webhook token'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_settings_save('sandbox','notify@example.invalid',key_s,'$aact_prod_'||repeat('c',64)); RAISE EXCEPTION 'FAIL another API key used as webhook token'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_settings_save('sandbox','notify@example.invalid',key_s,repeat('a',32)||chr(127)); RAISE EXCEPTION 'FAIL control character webhook token'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_settings_save('sandbox','notify@example.invalid',key_s||chr(127),token_s); RAISE EXCEPTION 'FAIL control character API key'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.asaas_settings_save('sandbox',' NOTIFY@Example.invalid ',key_s,token_s);
 s:=public.asaas_settings_get('sandbox'); c:=public.asaas_credentials_get('sandbox');
 IF s->>'notificationEmail'<>'notify@example.invalid' OR s->>'configured'<>'true' OR s->>'tested'<>'false' THEN RAISE EXCEPTION 'FAIL saved settings'; END IF;
 IF s ? 'apiKey' OR s ? 'webhookToken' OR s::text LIKE '%'||key_s||'%' OR s::text LIKE '%'||token_s||'%' THEN RAISE EXCEPTION 'FAIL settings DTO secret leak'; END IF;
 IF c->>'apiKey'<>key_s OR c->>'webhookToken'<>token_s OR c->>'environment'<>'sandbox' THEN RAISE EXCEPTION 'FAIL Vault server retrieval'; END IF;
 IF public.asaas_settings_get('production')->>'configured'<>'false' THEN RAISE EXCEPTION 'FAIL cross-environment key leakage'; END IF;
 PERFORM public.asaas_settings_save('production','production@example.invalid',key_p,token_p);
 IF public.asaas_credentials_get('production')->>'apiKey'<>key_p OR public.asaas_credentials_get('sandbox')->>'apiKey'<>key_s THEN RAISE EXCEPTION 'FAIL environment isolation'; END IF;
 revision:=(c->>'revision')::uuid;
 IF public.asaas_webhook_complete('sandbox',revision,'hook_before_test') THEN RAISE EXCEPTION 'FAIL untested webhook configured'; END IF;
 IF NOT public.asaas_connection_complete('sandbox',revision,true) THEN RAISE EXCEPTION 'FAIL connection result'; END IF;
 IF public.asaas_settings_get('sandbox')->>'tested'<>'true' OR public.asaas_settings_get('sandbox')->>'testedAt' IS NULL THEN RAISE EXCEPTION 'FAIL tested state'; END IF;
 IF NOT public.asaas_webhook_complete('sandbox',revision,'hook_contract') THEN RAISE EXCEPTION 'FAIL webhook result'; END IF;
 IF public.asaas_settings_get('sandbox')->>'webhookConfigured'<>'true' THEN RAISE EXCEPTION 'FAIL webhook configured state'; END IF;
 old_revision:=revision;
 PERFORM public.asaas_settings_save('sandbox','changed@example.invalid',' ',E'\t');
 s:=public.asaas_settings_get('sandbox'); c:=public.asaas_credentials_get('sandbox'); revision:=(s->>'revision')::uuid;
 IF revision=old_revision OR s->>'tested'<>'false' OR s->>'webhookConfigured'<>'false' OR s->>'testedAt' IS NOT NULL THEN RAISE EXCEPTION 'FAIL saved revision retained completion'; END IF;
 IF c->>'apiKey'<>key_s OR c->>'webhookToken'<>token_s OR c->>'webhookId'<>'hook_contract' THEN RAISE EXCEPTION 'FAIL blank secret preservation or webhook reuse ID'; END IF;
 IF public.asaas_connection_complete('sandbox',old_revision,true) OR public.asaas_webhook_complete('sandbox',old_revision,'stale_hook') THEN RAISE EXCEPTION 'FAIL stale completion'; END IF;
 BEGIN PERFORM public.asaas_settings_save('sandbox','changed@example.invalid',token_s,NULL); RAISE EXCEPTION 'FAIL effective saved token equals new API key'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF NOT public.asaas_connection_complete('sandbox',revision,false) OR public.asaas_settings_get('sandbox')->>'tested'<>'false' THEN RAISE EXCEPTION 'FAIL failed test state'; END IF;
 IF NOT public.asaas_connection_complete('sandbox',revision,true) OR NOT public.asaas_webhook_complete('sandbox',revision,'hook_current') THEN RAISE EXCEPTION 'FAIL current completion'; END IF;
 IF NOT public.asaas_webhook_record('sandbox',eid,'PAYMENT_RECEIVED','pay_contract','RECEIVED') THEN RAISE EXCEPTION 'FAIL first event'; END IF;
 activity:=(public.asaas_settings_get('sandbox')->>'lastWebhookAt')::timestamptz;
 IF activity IS NULL THEN RAISE EXCEPTION 'FAIL webhook activity timestamp'; END IF;
 IF public.asaas_webhook_record('sandbox',eid,'PAYMENT_RECEIVED','pay_contract','RECEIVED') THEN RAISE EXCEPTION 'FAIL duplicate event'; END IF;
 IF (public.asaas_settings_get('sandbox')->>'lastWebhookAt')::timestamptz IS DISTINCT FROM activity THEN RAISE EXCEPTION 'FAIL duplicate event changed activity'; END IF;
 IF NOT public.asaas_webhook_record('production',eid,'PAYMENT_RECEIVED',NULL,NULL) THEN RAISE EXCEPTION 'FAIL cross-environment deduplication'; END IF;
 BEGIN PERFORM public.asaas_webhook_record('sandbox','bad id with email@example.invalid','PAYMENT_RECEIVED',NULL,NULL); RAISE EXCEPTION 'FAIL non-metadata event ID'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_webhook_record('sandbox',eid||'_invalid','raw body contains personal information',NULL,NULL); RAISE EXCEPTION 'FAIL non-metadata event type'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.asaas_settings_save('sandbox','o''brien@example.invalid','$aact_hmlg_'||repeat('d',64),repeat('3',64));
 c:=public.asaas_credentials_get('sandbox');
 IF c->>'apiKey'<>'$aact_hmlg_'||repeat('d',64) OR c->>'webhookToken'<>repeat('3',64) OR c->>'notificationEmail'<>'o''brien@example.invalid' THEN RAISE EXCEPTION 'FAIL Vault credential rotation'; END IF;
 IF public.asaas_credentials_get('production')->>'apiKey'<>key_p THEN RAISE EXCEPTION 'FAIL rotation changed other environment'; END IF;
END $$;
-- A provider registration owns its environment until completion or timeout.
DO $$ DECLARE operation uuid; production_operation uuid; previous jsonb; BEGIN
 previous:=public.asaas_settings_get('sandbox');
 operation:=public.asaas_operation_acquire('sandbox');
 IF operation IS NULL THEN RAISE EXCEPTION 'FAIL lease not acquired'; END IF;
 BEGIN PERFORM public.asaas_settings_save('sandbox','changed@example.invalid',NULL,NULL); RAISE EXCEPTION 'FAIL save raced active registration'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 IF public.asaas_settings_get('sandbox') IS DISTINCT FROM previous THEN RAISE EXCEPTION 'FAIL rejected save changed settings'; END IF;
 BEGIN PERFORM public.asaas_operation_acquire('sandbox'); RAISE EXCEPTION 'FAIL concurrent registration acquired lease'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 IF public.asaas_operation_release('sandbox',gen_random_uuid()) THEN RAISE EXCEPTION 'FAIL wrong lease owner released'; END IF;
 -- Read/test operations remain available, and another environment is independent.
 PERFORM public.asaas_credentials_get('sandbox');
 IF NOT public.asaas_connection_complete('sandbox',(previous->>'revision')::uuid,true) THEN RAISE EXCEPTION 'FAIL test blocked by registration'; END IF;
 production_operation:=public.asaas_operation_acquire('production');
 IF NOT public.asaas_operation_release('production',production_operation) THEN RAISE EXCEPTION 'FAIL environment-specific release'; END IF;
 IF NOT public.asaas_operation_release('sandbox',operation) OR public.asaas_operation_release('sandbox',operation) THEN RAISE EXCEPTION 'FAIL matched lease release'; END IF;
 PERFORM public.asaas_settings_save('sandbox','released@example.invalid',NULL,NULL);
 INSERT INTO asaas_contract_leases VALUES(public.asaas_operation_acquire('sandbox'));
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM asaas_private.settings WHERE environment='sandbox' AND operation_expires_at BETWEEN clock_timestamp()+interval '80 seconds' AND clock_timestamp()+interval '95 seconds') THEN RAISE EXCEPTION 'FAIL lease must last 90 seconds'; END IF;
END $$;
UPDATE asaas_private.settings SET operation_expires_at=clock_timestamp()-interval '1 second' WHERE environment='sandbox';
SET LOCAL ROLE service_role;
DO $$ DECLARE previous uuid:=(SELECT operation_id FROM asaas_contract_leases); current_operation uuid; BEGIN
 current_operation:=public.asaas_operation_acquire('sandbox');
 IF current_operation=previous THEN RAISE EXCEPTION 'FAIL expired lease reused owner token'; END IF;
 IF public.asaas_operation_release('sandbox',previous) THEN RAISE EXCEPTION 'FAIL old owner released replacement lease'; END IF;
 BEGIN PERFORM public.asaas_settings_save('sandbox','race@example.invalid',NULL,NULL); RAISE EXCEPTION 'FAIL old release cleared replacement lease'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 IF NOT public.asaas_operation_release('sandbox',current_operation) THEN RAISE EXCEPTION 'FAIL replacement owner release'; END IF;
 PERFORM public.asaas_settings_save('sandbox','after-expiry@example.invalid',NULL,NULL);
 DELETE FROM asaas_contract_leases;
 INSERT INTO asaas_contract_leases VALUES(public.asaas_operation_acquire('sandbox'));
END $$;
RESET ROLE;
UPDATE asaas_private.settings SET operation_expires_at=clock_timestamp()-interval '1 second' WHERE environment='sandbox';
SET LOCAL ROLE service_role;
DO $$ BEGIN
 PERFORM public.asaas_settings_save('sandbox','save-after-expiry@example.invalid',NULL,NULL);
 IF public.asaas_operation_release('sandbox',(SELECT operation_id FROM asaas_contract_leases)) THEN RAISE EXCEPTION 'FAIL expired owner survived a new save'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE f record; row_data jsonb; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'asaas_%' LOOP
  IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') OR NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'FAIL Asaas RPC privilege'; END IF;
 END LOOP;
 IF has_schema_privilege('anon','asaas_private','USAGE') OR has_schema_privilege('authenticated','asaas_private','USAGE') THEN RAISE EXCEPTION 'FAIL private schema exposed'; END IF;
 IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='asaas_private' AND c.relkind='r' AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'FAIL private table RLS disabled'; END IF;
 IF EXISTS(SELECT FROM vault.secrets WHERE id IN(SELECT api_key_secret_id FROM asaas_private.settings UNION ALL SELECT webhook_token_secret_id FROM asaas_private.settings) AND (secret::text LIKE '%$aact_%' OR secret::text LIKE '%'||repeat('1',64)||'%')) THEN RAISE EXCEPTION 'FAIL stored plaintext secret'; END IF;
 SELECT to_jsonb(e) INTO row_data FROM asaas_private.webhook_events e WHERE environment='sandbox' AND event_id=(SELECT event_id FROM asaas_contract_ids);
 IF row_data IS NULL OR row_data ?| ARRAY['raw_body','payload','email','customer','api_key','webhook_token'] THEN RAISE EXCEPTION 'FAIL raw body or PII persisted'; END IF;
 IF (SELECT count(*) FROM asaas_private.webhook_events WHERE event_id=(SELECT event_id FROM asaas_contract_ids))<>2 THEN RAISE EXCEPTION 'FAIL event deduplication storage'; END IF;
 IF to_regclass('brevo_private.settings') IS NOT NULL THEN EXECUTE 'SELECT jsonb_agg(to_jsonb(s)) FROM brevo_private.settings s' INTO row_data; IF row_data IS DISTINCT FROM (SELECT value FROM asaas_contract_snapshot WHERE kind='brevo') THEN RAISE EXCEPTION 'FAIL Brevo changed'; END IF; END IF;
 IF to_regclass('public.orders') IS NOT NULL THEN EXECUTE 'SELECT jsonb_build_object(''count'',count(*),''latest'',max(updated_at)) FROM public.orders' INTO row_data; IF row_data IS DISTINCT FROM (SELECT value FROM asaas_contract_snapshot WHERE kind='orders') THEN RAISE EXCEPTION 'FAIL orders changed'; END IF; END IF;
 IF to_regclass('public.platform_ledger') IS NOT NULL THEN EXECUTE 'SELECT jsonb_build_object(''count'',count(*),''gross'',sum(gross_cents)) FROM public.platform_ledger' INTO row_data; IF row_data IS DISTINCT FROM (SELECT value FROM asaas_contract_snapshot WHERE kind='ledger') THEN RAISE EXCEPTION 'FAIL ledger changed'; END IF; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.asaas_settings_get('sandbox'); RAISE EXCEPTION 'FAIL browser read settings'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.asaas_credentials_get('sandbox'); RAISE EXCEPTION 'FAIL browser read secrets'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.asaas_operation_acquire('sandbox'); RAISE EXCEPTION 'FAIL browser acquired registration lease'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.asaas_settings_save('sandbox','attacker@example.invalid',NULL,NULL); RAISE EXCEPTION 'FAIL browser changed settings'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM 1 FROM asaas_private.settings; RAISE EXCEPTION 'FAIL browser read private table'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.asaas_settings_get('sandbox'); RAISE EXCEPTION 'FAIL anonymous settings read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.asaas_credentials_get('sandbox'); RAISE EXCEPTION 'FAIL anonymous secrets read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Asaas service-only configuration, Vault, environment, revision and webhook contracts passed; fixtures rolled back' AS result;
