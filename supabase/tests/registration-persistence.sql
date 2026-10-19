-- Run after the fixture prefix in order-acceptance-flow.sql; always ROLLBACK.
RESET ROLE;
GRANT INSERT ON atomic_delivery_ids TO authenticated;
INSERT INTO atomic_delivery_ids(kind) VALUES('address_a'),('address_b'),('foreign_address');
INSERT INTO public.addresses(id,user_id,rua,cidade,is_default)
SELECT id,(SELECT id FROM atomic_delivery_ids WHERE kind=CASE WHEN a.kind='foreign_address' THEN 'owner' ELSE 'customer' END),'Persistence street','Persistence city',false FROM atomic_delivery_ids a WHERE kind IN ('address_a','address_b','foreign_address');
CREATE FUNCTION public.registration_fail_default() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN IF current_setting('test.fail_default',true)='yes' AND NEW.is_default THEN RAISE EXCEPTION 'injected_default_failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER registration_fail_default BEFORE UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.registration_fail_default();
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a uuid:=(SELECT id FROM atomic_delivery_ids WHERE kind='address_a'); b uuid:=(SELECT id FROM atomic_delivery_ids WHERE kind='address_b'); result jsonb; n integer; BEGIN
 UPDATE public.profiles SET telefone='31888888888',nome='Persisted customer' WHERE id=auth.uid();
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=auth.uid() AND telefone='31888888888' AND nome='Persisted customer') THEN RAISE EXCEPTION 'Customer save did not persist'; END IF;
 UPDATE public.profiles SET telefone='31777777777' WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='owner');
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Customer changed another account'; END IF;
 result:=public.set_my_default_address(a);
 IF (result->>'id')::uuid<>a OR NOT (result->>'is_default')::boolean OR (SELECT count(*) FROM public.addresses WHERE user_id=auth.uid() AND is_default)<>1 THEN RAISE EXCEPTION 'Default not saved'; END IF;
 PERFORM set_config('test.fail_default','yes',true);
 BEGIN PERFORM public.set_my_default_address(b); RAISE EXCEPTION 'Expected injected failure'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected_default_failure' THEN RAISE; END IF; END;
 IF NOT EXISTS(SELECT FROM public.addresses WHERE id=a AND is_default) THEN RAISE EXCEPTION 'Failed switch erased old default'; END IF;
 PERFORM set_config('test.fail_default','no',true);
 BEGIN PERFORM public.set_my_default_address((SELECT id FROM atomic_delivery_ids WHERE kind='foreign_address')); RAISE EXCEPTION 'Foreign default accepted'; EXCEPTION WHEN no_data_found THEN NULL; END;
 PERFORM public.set_my_default_address(b);
 PERFORM public.set_my_default_address(b);
 IF (SELECT count(*) FROM public.addresses WHERE user_id=auth.uid() AND is_default)<>1 THEN RAISE EXCEPTION 'Repeated default not idempotent'; END IF;
 DELETE FROM public.addresses WHERE id=a AND user_id=auth.uid();
 IF EXISTS(SELECT FROM public.addresses WHERE id=a) THEN RAISE EXCEPTION 'Deletion not persisted'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='owner'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE e uuid:=(SELECT id FROM atomic_delivery_ids WHERE kind='store'); secret jsonb; BEGIN
 UPDATE public.establishments SET telefone='31666666666',banco_conta='test-account',cidade='Saved city' WHERE id=e AND owner_id=auth.uid();
 IF NOT EXISTS(SELECT FROM public.establishments WHERE id=e AND telefone='31666666666' AND cidade='Saved city' AND status='aprovado') THEN RAISE EXCEPTION 'Store contact not persisted or approval changed'; END IF;
 SELECT public.get_establishment_private(e) INTO secret;
 IF secret->>'banco_conta'<>'test-account' THEN RAISE EXCEPTION 'Store private save not persisted'; END IF;
 UPDATE public.establishments SET descricao='Changed description only' WHERE id=e;
 SELECT public.get_establishment_private(e) INTO secret;
 IF secret->>'banco_conta'<>'test-account' OR NOT EXISTS(SELECT FROM public.establishments WHERE id=e AND telefone='31666666666') THEN RAISE EXCEPTION 'Partial edit erased contact or bank'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.set_my_default_address(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous RPC access'; END IF;
END $$;
SELECT 'Registration and atomic address contracts passed; all fixtures roll back' AS result;
