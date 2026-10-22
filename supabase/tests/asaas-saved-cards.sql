-- Synthetic fixtures only. No provider requests or persistent database writes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TEMP TABLE sc_ids(kind text PRIMARY KEY,id uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO sc_ids(kind) VALUES('owner'),('other'),('unconfirmed'),('blocked'),('revision'),('sandbox_revision'),('card'),('secret');
GRANT SELECT,UPDATE ON sc_ids TO service_role;
INSERT INTO auth.users(id,email,email_confirmed_at,banned_until)
 SELECT id,'saved-card-fixture-'||id||'@example.invalid',CASE WHEN kind<>'unconfirmed' THEN now() END,CASE WHEN kind='blocked' THEN now()+interval '1 day' END
 FROM sc_ids WHERE kind IN('owner','other','unconfirmed','blocked');
UPDATE asaas_private.settings SET revision=(SELECT id FROM sc_ids WHERE kind=CASE environment WHEN 'production' THEN 'revision' ELSE 'sandbox_revision' END),
 tested=true,online_enabled=true,api_key_secret_id=vault.create_secret('synthetic_api_key_no_provider_calls'),
 webhook_token_secret_id=vault.create_secret('synthetic_webhook_no_provider_calls'),webhook_id='hook_fixture',registered_payment_contract=1;
UPDATE asaas_private.settings SET webhook_revision=revision;
INSERT INTO asaas_private.customers(user_id,environment,customer_id)
 SELECT id,env,'cus_fixture_'||replace(id::text,'-','') FROM sc_ids CROSS JOIN unnest(ARRAY['production','sandbox']) env WHERE kind IN('owner','other','unconfirmed','blocked');

DO $$ DECLARE role_name text; signature text; BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='asaas_private.saved_cards'::regclass) THEN RAISE EXCEPTION 'FAIL RLS disabled'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(role_name,'asaas_private.delete_saved_card_secret()','EXECUTE') THEN RAISE EXCEPTION 'FAIL direct token cleanup execute grant'; END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY['public.asaas_saved_cards_list(uuid,text,uuid)','public.asaas_saved_card_get(uuid,text,uuid,uuid,text)','public.asaas_saved_card_save(uuid,text,uuid,text,text,text,text)','public.asaas_saved_card_remove(uuid,uuid)'] LOOP
  IF (SELECT prosecdef FROM pg_proc WHERE oid=signature::regprocedure) THEN RAISE EXCEPTION 'FAIL exposed definer'; END IF;
  IF NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'FAIL service grant'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_function_privilege(role_name,signature,'EXECUTE') OR has_table_privilege(role_name,'asaas_private.saved_cards','SELECT,INSERT,UPDATE,DELETE') OR has_schema_privilege(role_name,'asaas_private','USAGE') THEN RAISE EXCEPTION 'FAIL browser privilege'; END IF;
  END LOOP;
 END LOOP;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.asaas_saved_cards_list(gen_random_uuid(),'production',gen_random_uuid()); RAISE EXCEPTION 'FAIL anon RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.asaas_saved_card_get(gen_random_uuid(),'production',gen_random_uuid(),gen_random_uuid(),'cus_fixture'); RAISE EXCEPTION 'FAIL anon get'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.asaas_saved_card_save(gen_random_uuid(),'production',gen_random_uuid(),'cus_fixture','tok_synthetic_0123456789','VISA','1234'); RAISE EXCEPTION 'FAIL anon save'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.asaas_saved_card_remove(gen_random_uuid(),gen_random_uuid()); RAISE EXCEPTION 'FAIL anon remove'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.asaas_saved_cards_list(gen_random_uuid(),'production',gen_random_uuid()); RAISE EXCEPTION 'FAIL authenticated RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.asaas_saved_card_get(gen_random_uuid(),'production',gen_random_uuid(),gen_random_uuid(),'cus_fixture'); RAISE EXCEPTION 'FAIL authenticated get'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.asaas_saved_card_save(gen_random_uuid(),'production',gen_random_uuid(),'cus_fixture','tok_synthetic_0123456789','VISA','1234'); RAISE EXCEPTION 'FAIL authenticated save'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.asaas_saved_card_remove(gen_random_uuid(),gen_random_uuid()); RAISE EXCEPTION 'FAIL authenticated remove'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM 1 FROM asaas_private.saved_cards; RAISE EXCEPTION 'FAIL browser table'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Removal uses the narrowly scoped trigger, without service-role DELETE
-- privileges over unrelated Vault secrets.
REVOKE DELETE ON vault.secrets FROM service_role;
SET LOCAL ROLE service_role;
DO $$ DECLARE uid uuid:=(SELECT id FROM sc_ids WHERE kind='owner'); other_uid uuid:=(SELECT id FROM sc_ids WHERE kind='other'); rev uuid:=(SELECT id FROM sc_ids WHERE kind='revision'); cid text; card uuid; metadata jsonb; denied_uid uuid; BEGIN
 cid:='cus_fixture_'||replace(uid::text,'-','');
 card:=public.asaas_saved_card_save(uid,'production',rev,cid,'tok_synthetic_0123456789','VISA','1234');
 UPDATE sc_ids SET id=card WHERE kind='card';
 IF public.asaas_saved_card_save(uid,'production',rev,cid,'tok_synthetic_0123456789','VISA','1234') IS DISTINCT FROM card THEN RAISE EXCEPTION 'FAIL duplicate token'; END IF;
 -- PostgreSQL bounds regex repetitions at 255; length validation must accept
 -- the documented 256-character opaque-token upper boundary independently.
 IF NOT public.asaas_saved_card_remove(uid,public.asaas_saved_card_save(uid,'production',rev,cid,repeat('a',16),'VISA','1234')) THEN RAISE EXCEPTION 'FAIL minimum token length'; END IF;
 IF NOT public.asaas_saved_card_remove(uid,public.asaas_saved_card_save(uid,'production',rev,cid,repeat('a',256),'VISA','1234')) THEN RAISE EXCEPTION 'FAIL maximum token length'; END IF;
 BEGIN PERFORM public.asaas_saved_card_save(uid,'production',rev,cid,repeat('a',15),'VISA','1234'); RAISE EXCEPTION 'FAIL short token accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_saved_card_save(uid,'production',rev,cid,repeat('a',257),'VISA','1234'); RAISE EXCEPTION 'FAIL long token accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_saved_card_save(uid,'production',rev,cid,'tok invalid_0123456789','VISA','1234'); RAISE EXCEPTION 'FAIL unsafe token characters'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 metadata:=public.asaas_saved_cards_list(uid,'production',rev);
 IF metadata IS DISTINCT FROM jsonb_build_array(jsonb_build_object('id',card,'brand','VISA','last4','1234')) THEN RAISE EXCEPTION 'FAIL metadata shape or token leak'; END IF;
 IF public.asaas_saved_cards_list(other_uid,'production',rev) IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'FAIL foreign metadata'; END IF;
 IF public.asaas_saved_card_get(uid,'production',rev,card,cid) IS DISTINCT FROM jsonb_build_object('token','tok_synthetic_0123456789') THEN RAISE EXCEPTION 'FAIL owner token'; END IF;
 IF public.asaas_saved_card_get(other_uid,'production',rev,card,cid) IS NOT NULL OR public.asaas_saved_card_remove(other_uid,card) THEN RAISE EXCEPTION 'FAIL foreign card ownership'; END IF;
 IF public.asaas_saved_card_get(uid,'production',rev,card,'cus_wrong') IS NOT NULL THEN RAISE EXCEPTION 'FAIL foreign customer'; END IF;
 IF public.asaas_saved_cards_list(uid,'sandbox',rev) IS DISTINCT FROM '[]'::jsonb OR public.asaas_saved_card_get(uid,'sandbox',rev,card,cid) IS NOT NULL THEN RAISE EXCEPTION 'FAIL environment isolation'; END IF;
 IF public.asaas_saved_cards_list(uid,'production',gen_random_uuid()) IS DISTINCT FROM '[]'::jsonb OR public.asaas_saved_card_get(uid,'production',gen_random_uuid(),card,cid) IS NOT NULL THEN RAISE EXCEPTION 'FAIL revision isolation'; END IF;
 BEGIN PERFORM public.asaas_saved_card_save(uid,'production',gen_random_uuid(),cid,'tok_synthetic_other_012345','VISA','1234'); RAISE EXCEPTION 'FAIL stale revision save'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN PERFORM public.asaas_saved_card_save(uid,'production',rev,'cus_wrong','tok_synthetic_other_012345','VISA','1234'); RAISE EXCEPTION 'FAIL customer binding save'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.asaas_saved_card_save(uid,'production',rev,cid,'4111111111111111','VISA','1234'); RAISE EXCEPTION 'FAIL PAN accepted as token'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_saved_card_save(uid,'production',rev,cid,'tok_synthetic_other_012345','VISA','123'); RAISE EXCEPTION 'FAIL CVV-sized last4'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.asaas_saved_card_save(uid,'production',rev,cid,'tok_synthetic_other_012345','<script>','1234'); RAISE EXCEPTION 'FAIL unsafe brand'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 FOR denied_uid IN SELECT id FROM sc_ids WHERE kind IN('unconfirmed','blocked') LOOP
  BEGIN PERFORM public.asaas_saved_card_save(denied_uid,'production',rev,'cus_fixture_'||replace(denied_uid::text,'-',''),'tok_synthetic_other_012345','VISA','1234'); RAISE EXCEPTION 'FAIL inactive account'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
END $$;
RESET ROLE;
UPDATE sc_ids SET id=(SELECT token_secret_id FROM asaas_private.saved_cards WHERE id=(SELECT id FROM sc_ids WHERE kind='card')) WHERE kind='secret';
DO $$ BEGIN
 IF (SELECT count(*) FROM asaas_private.saved_cards WHERE user_id=(SELECT id FROM sc_ids WHERE kind='owner'))<>1 THEN RAISE EXCEPTION 'FAIL dedup rows'; END IF;
 IF NOT EXISTS(SELECT FROM vault.secrets WHERE id=(SELECT id FROM sc_ids WHERE kind='secret') AND secret<>'tok_synthetic_0123456789') THEN RAISE EXCEPTION 'FAIL token not encrypted at rest'; END IF;
END $$;
-- Rotation and customer replacement invalidate reads without exposing old tokens.
UPDATE asaas_private.settings SET revision=gen_random_uuid() WHERE environment='production';
SET LOCAL ROLE service_role;
DO $$ DECLARE uid uuid:=(SELECT id FROM sc_ids WHERE kind='owner'); rev uuid:=(SELECT id FROM sc_ids WHERE kind='revision'); BEGIN
 IF public.asaas_saved_cards_list(uid,'production',rev) IS DISTINCT FROM '[]'::jsonb OR public.asaas_saved_card_get(uid,'production',rev,(SELECT id FROM sc_ids WHERE kind='card'),'cus_fixture_'||replace(uid::text,'-','')) IS NOT NULL THEN RAISE EXCEPTION 'FAIL rotated config'; END IF;
END $$;
RESET ROLE;
UPDATE asaas_private.settings SET revision=(SELECT id FROM sc_ids WHERE kind='revision') WHERE environment='production';
UPDATE asaas_private.customers SET customer_id='cus_replaced' WHERE user_id=(SELECT id FROM sc_ids WHERE kind='owner') AND environment='production';
SET LOCAL ROLE service_role;
DO $$ DECLARE uid uuid:=(SELECT id FROM sc_ids WHERE kind='owner'); rev uuid:=(SELECT id FROM sc_ids WHERE kind='revision'); BEGIN
 IF public.asaas_saved_cards_list(uid,'production',rev) IS DISTINCT FROM '[]'::jsonb OR public.asaas_saved_card_get(uid,'production',rev,(SELECT id FROM sc_ids WHERE kind='card'),'cus_fixture_'||replace(uid::text,'-','')) IS NOT NULL THEN RAISE EXCEPTION 'FAIL replaced customer'; END IF;
 IF NOT public.asaas_saved_card_remove(uid,(SELECT id FROM sc_ids WHERE kind='card')) OR public.asaas_saved_card_remove(uid,(SELECT id FROM sc_ids WHERE kind='card')) THEN RAISE EXCEPTION 'FAIL remove/idempotence'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT FROM vault.secrets WHERE id=(SELECT id FROM sc_ids WHERE kind='secret')) OR EXISTS(SELECT FROM asaas_private.saved_cards WHERE id=(SELECT id FROM sc_ids WHERE kind='card')) THEN RAISE EXCEPTION 'FAIL removal retained token'; END IF;
END $$;
-- Account cascades also erase the opaque token; the auth deletion runtime
-- must not need broad access to Vault to remove this one associated secret.
SET LOCAL ROLE service_role;
DO $$ DECLARE uid uuid:=(SELECT id FROM sc_ids WHERE kind='other'); BEGIN
 UPDATE sc_ids SET id=public.asaas_saved_card_save(uid,'production',(SELECT id FROM sc_ids WHERE kind='revision'),'cus_fixture_'||replace(uid::text,'-',''),'tok_cascade_synthetic_0123456789','VISA','5678') WHERE kind='card';
END $$;
RESET ROLE;
UPDATE sc_ids SET id=(SELECT token_secret_id FROM asaas_private.saved_cards WHERE id=(SELECT id FROM sc_ids WHERE kind='card')) WHERE kind='secret';
DELETE FROM auth.users WHERE id=(SELECT id FROM sc_ids WHERE kind='other');
DO $$ BEGIN
 IF EXISTS(SELECT FROM vault.secrets WHERE id=(SELECT id FROM sc_ids WHERE kind='secret')) OR EXISTS(SELECT FROM asaas_private.saved_cards WHERE id=(SELECT id FROM sc_ids WHERE kind='card')) THEN RAISE EXCEPTION 'FAIL account deletion retained token'; END IF;
 IF EXISTS(SELECT FROM asaas_private.settings settings WHERE NOT EXISTS(SELECT FROM vault.secrets secret WHERE secret.id=settings.api_key_secret_id) OR NOT EXISTS(SELECT FROM vault.secrets secret WHERE secret.id=settings.webhook_token_secret_id)) THEN RAISE EXCEPTION 'FAIL cleanup deleted unrelated credentials'; END IF;
END $$;
SELECT 'saved card storage contracts passed' AS result;
ROLLBACK;
