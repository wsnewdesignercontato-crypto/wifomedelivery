-- Use the temporary fixtures from order-acceptance-flow.sql; caller wraps BEGIN / ROLLBACK.
CREATE TEMP TABLE courier_registration_result (value jsonb);
GRANT ALL ON courier_registration_result TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ DECLARE saved jsonb; old_name text; BEGIN
 SELECT nome INTO old_name FROM public.profiles WHERE id=auth.uid();
 saved:=public.save_courier_registration(
 jsonb_build_object('nome','Saved courier contract','telefone','31988888888','cnh','12345678901','cpf','00000000000','cidade_atuacao','Contract city'),
 jsonb_build_object('nome',old_name,'telefone','31999999999','cnh',NULL,'cpf',NULL,'cidade_atuacao',NULL));
 PERFORM public.save_courier_registration(
 jsonb_build_object('nome','Saved courier contract','telefone','31988888888','cnh','12345678901','cpf','00000000000','cidade_atuacao','Contract city'),
 jsonb_build_object('nome',old_name,'telefone','31999999999','cnh',NULL,'cpf',NULL,'cidade_atuacao',NULL));
 INSERT INTO courier_registration_result VALUES(saved);
 IF saved->'courier'->>'cnh'<>'12345678901' OR saved->'profile'->>'telefone'<>'31988888888' OR NOT (saved->'completion'->>'complete')::boolean THEN RAISE EXCEPTION 'FAIL incomplete confirmed save'; END IF;
 BEGIN PERFORM public.save_courier_registration('{"aprovacao":"approved"}','{"aprovacao":"incompleto"}'); RAISE EXCEPTION 'FAIL self approval'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.save_courier_registration(jsonb_build_object('user_id',(SELECT id FROM atomic_delivery_ids WHERE kind='courier')),'{}'); RAISE EXCEPTION 'FAIL changed account'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.save_courier_registration('{"telefone":"31977777777"}','{"telefone":"31999999999"}'); RAISE EXCEPTION 'FAIL stale form overwrote saved phone'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM public.save_courier_registration('{"rg":"contract-rg"}','{"rg":null}');
 IF NOT EXISTS(SELECT FROM public.courier_profiles WHERE user_id=auth.uid() AND cnh='12345678901' AND telefone='31988888888' AND rg='contract-rg') THEN RAISE EXCEPTION 'FAIL partial save cleared other fields'; END IF;
END $$;
RESET ROLE;
CREATE FUNCTION public.courier_registration_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.cnh='99999999999' THEN RAISE EXCEPTION 'injected_registration_failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER contract_registration_failure BEFORE UPDATE ON public.courier_profiles FOR EACH ROW EXECUTE FUNCTION public.courier_registration_fail_write();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.save_courier_registration('{"telefone":"31966666666","cnh":"99999999999"}','{"telefone":"31988888888","cnh":"12345678901"}'); RAISE EXCEPTION 'FAIL injected write succeeded'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected_registration_failure' THEN RAISE; END IF; END;
 IF (SELECT telefone FROM public.profiles WHERE id=auth.uid())<>'31988888888' OR (SELECT cnh FROM public.courier_profiles WHERE user_id=auth.uid())<>'12345678901' THEN RAISE EXCEPTION 'FAIL partially saved registration'; END IF;
END $$;
-- A new session reads the same persisted personal data after the write.
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='courier'),'role','authenticated')::text,true);
DO $$ DECLARE old_phone text; saved jsonb; BEGIN
 SELECT telefone INTO old_phone FROM public.courier_profiles WHERE user_id=auth.uid();
 saved:=public.save_courier_registration('{"telefone":"31955555555","cnh":"12345678901"}',jsonb_build_object('telefone',old_phone,'cnh',NULL));
 IF saved->'courier'->>'status'<>'online' OR saved->'courier'->>'aprovacao'<>'approved' OR (saved->'courier'->>'score_mensal')::int<>100 THEN RAISE EXCEPTION 'FAIL saving changed approval or availability'; END IF;
 IF EXISTS(SELECT FROM public.courier_profiles WHERE user_id=(SELECT id FROM atomic_delivery_ids WHERE kind='customer')) THEN RAISE EXCEPTION 'FAIL registration leaked to another account'; END IF;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM public.courier_profiles WHERE user_id=auth.uid() AND telefone='31988888888' AND cnh='12345678901') THEN RAISE EXCEPTION 'FAIL saved fields missing after returning'; END IF;
 IF NOT (public.check_profile_complete(auth.uid(),'entregador')->>'complete')::boolean THEN RAISE EXCEPTION 'FAIL repeated completion'; END IF;
 INSERT INTO public.courier_documents(courier_id,tipo,url,status) VALUES(auth.uid(),'cnh_frente','https://example.invalid/contract-cnh.jpg','em_analise');
 IF NOT EXISTS(SELECT FROM public.courier_documents WHERE courier_id=auth.uid() AND tipo='cnh_frente') THEN RAISE EXCEPTION 'FAIL document not persisted'; END IF;
END $$;
RESET ROLE;
INSERT INTO atomic_delivery_ids(kind) VALUES('registration_vehicle_one'),('registration_vehicle_two');
INSERT INTO public.courier_vehicles(id,courier_id,tipo,placa,ativo) VALUES
 ((SELECT id FROM atomic_delivery_ids WHERE kind='registration_vehicle_one'),(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'moto','ABC1D23',true),
 ((SELECT id FROM atomic_delivery_ids WHERE kind='registration_vehicle_two'),(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'moto','ABC1D24',false);
CREATE FUNCTION public.courier_vehicle_fail_activate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.ativo AND current_setting('test.fail_vehicle_activation',true)='yes' THEN RAISE EXCEPTION 'injected_vehicle_failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER contract_vehicle_failure BEFORE UPDATE ON public.courier_vehicles FOR EACH ROW EXECUTE FUNCTION public.courier_vehicle_fail_activate();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM set_config('test.fail_vehicle_activation','yes',true);
 BEGIN PERFORM public.activate_my_courier_vehicle((SELECT id FROM atomic_delivery_ids WHERE kind='registration_vehicle_two')); RAISE EXCEPTION 'FAIL broken vehicle switch succeeded'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected_vehicle_failure' THEN RAISE; END IF; END;
 IF NOT (SELECT ativo FROM public.courier_vehicles WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='registration_vehicle_one')) THEN RAISE EXCEPTION 'FAIL old vehicle was deactivated after rollback'; END IF;
 PERFORM set_config('test.fail_vehicle_activation','no',true);
 PERFORM public.activate_my_courier_vehicle((SELECT id FROM atomic_delivery_ids WHERE kind='registration_vehicle_two'));
 IF (SELECT count(*) FROM public.courier_vehicles WHERE courier_id=auth.uid() AND ativo)<>1 THEN RAISE EXCEPTION 'FAIL active vehicle not unique'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.save_courier_registration(jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'FAIL anonymous registration write'; END IF;
END $$;
