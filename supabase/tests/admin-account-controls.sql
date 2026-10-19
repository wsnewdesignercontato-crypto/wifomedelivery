-- Prefix with order-acceptance-flow.sql fixture creation and always ROLLBACK.
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM public.check_account_access();
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Active customer denied'; END IF;
 BEGIN PERFORM public.admin_search_users('',1,50); RAISE EXCEPTION 'Customer listed Auth accounts'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE auth.users SET banned_until=now()+interval '10 days' WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='customer');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.check_account_access(); RAISE EXCEPTION 'Old JWT accepted after ban'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT FROM public.profiles WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Banned user read profile through RLS'; END IF;
 IF EXISTS(SELECT FROM public.addresses WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Banned user read address through RLS'; END IF;
END $$;
RESET ROLE;
UPDATE auth.users SET banned_until=NULL WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='customer');
SET LOCAL ROLE authenticated;
DO $$ BEGIN PERFORM public.check_account_access(); IF NOT EXISTS(SELECT FROM public.profiles WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Unblocked user denied'; END IF; END $$;
RESET ROLE;
UPDATE auth.users SET deleted_at=now() WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='customer');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.check_account_access(); RAISE EXCEPTION 'Deleted account old JWT accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT FROM public.profiles WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Deleted account bypassed RLS'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='admin'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
 result:=public.admin_search_users('atomic-delivery-',1,100);
 IF EXISTS(SELECT FROM jsonb_array_elements(result->'users') u WHERE (u->>'id')::uuid=(SELECT id FROM atomic_delivery_ids WHERE kind='customer')) THEN RAISE EXCEPTION 'Deleted account still listed'; END IF;
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(result->'users') u WHERE u ? 'blocked') THEN RAISE EXCEPTION 'Block status missing'; END IF;
END $$;
RESET ROLE;
-- Every pre-existing sensitive table retains its policies and adds only a restrictive guard.
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND c.relrowsecurity AND n.nspname='public' AND NOT EXISTS(SELECT FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='account_must_be_active' AND NOT p.polpermissive)) THEN RAISE EXCEPTION 'Account RLS guard missing'; END IF;
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='customer')) THEN RAISE EXCEPTION 'Historical profile removed'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE anon;
SELECT public.check_account_access();
RESET ROLE;
SELECT 'Account block/deletion/old-token contracts passed; rollback fixtures' AS result;
