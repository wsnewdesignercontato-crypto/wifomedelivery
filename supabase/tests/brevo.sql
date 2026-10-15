BEGIN;
DO $$
DECLARE f record; payload jsonb; revision uuid; result text;
BEGIN
  IF to_regprocedure('public.brevo_settings_get()') IS NULL THEN
    RAISE EXCEPTION 'Brevo private configuration RPCs are missing';
  END IF;
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'brevo_%' LOOP
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Browser role can execute private Brevo RPC';
    END IF;
    IF NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Server role cannot execute Brevo RPC'; END IF;
  END LOOP;
  IF has_schema_privilege('anon','brevo_private','USAGE') OR has_schema_privilege('authenticated','brevo_private','USAGE') THEN
    RAISE EXCEPTION 'Private schema is browser-accessible';
  END IF;
  PERFORM public.brevo_settings_save('PedeTrem','sender@example.invalid','xkeysib-' || repeat('a',64));
  payload := public.brevo_settings_get();
  IF payload->>'configured' <> 'true' OR payload->>'tested' <> 'false' OR payload::text LIKE '%xkeysib-%' THEN
    RAISE EXCEPTION 'Status leaks secret or reports untested configuration as tested';
  END IF;
  payload := public.brevo_credentials_get();
  IF payload->>'apiKey' <> 'xkeysib-' || repeat('a',64) THEN RAISE EXCEPTION 'Secret cannot be recovered by server'; END IF;
  IF EXISTS(SELECT 1 FROM vault.secrets WHERE name='wifome_brevo_api_key' AND secret::text LIKE '%xkeysib-%') THEN
    RAISE EXCEPTION 'Secret is stored in cleartext';
  END IF;
  revision := (public.brevo_test_reserve()->>'revision')::uuid;
  BEGIN
    PERFORM public.brevo_test_reserve();
    RAISE EXCEPTION 'Test sending has no cooldown';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
  PERFORM public.brevo_test_complete(revision,true);
  IF public.brevo_settings_get()->>'tested' <> 'true' THEN RAISE EXCEPTION 'Successful test not recorded'; END IF;
  PERFORM public.brevo_settings_save('Novo remetente','sender@example.invalid',NULL);
  IF public.brevo_credentials_get()->>'apiKey' <> 'xkeysib-' || repeat('a',64) THEN RAISE EXCEPTION 'Blank key wiped saved credential'; END IF;
  IF public.brevo_settings_get()->>'tested' <> 'false' THEN RAISE EXCEPTION 'Changed settings retained old test'; END IF;
  PERFORM public.brevo_test_complete(revision,true);
  IF public.brevo_settings_get()->>'tested' <> 'false' THEN RAISE EXCEPTION 'Stale test validates changed settings'; END IF;
  result := public.brevo_hook_claim('test-hook-id','payload-hash');
  IF result <> 'claimed' THEN RAISE EXCEPTION 'Cannot claim first hook'; END IF;
  IF public.brevo_hook_claim('test-hook-id','payload-hash') <> 'busy' THEN RAISE EXCEPTION 'Concurrent hook can send twice'; END IF;
  PERFORM public.brevo_hook_complete('test-hook-id','payload-hash');
  IF public.brevo_hook_claim('test-hook-id','payload-hash') <> 'sent' THEN RAISE EXCEPTION 'Hook delivery not deduplicated'; END IF;
  BEGIN
    PERFORM public.brevo_hook_claim('test-hook-id','changed-hash');
    RAISE EXCEPTION 'Hook id accepted with altered body';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
END $$;
ROLLBACK;
SELECT 'Brevo privacy, key preservation, cooldown, revision and duplicate-delivery contracts passed; fixtures rolled back' AS result;
