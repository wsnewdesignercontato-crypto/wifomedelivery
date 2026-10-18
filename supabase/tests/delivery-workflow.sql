BEGIN;
INSERT INTO public.establishments(id,owner_id,nome) VALUES
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Delivery test');
INSERT INTO public.courier_profiles(user_id,status,aprovacao,kyc_status) VALUES
 ('20000000-0000-4000-8000-000000000001','online','approved','approved'),
 ('20000000-0000-4000-8000-000000000002','online','approved','approved'),
 ('20000000-0000-4000-8000-000000000003','pendente','pending','pending'),
 ('20000000-0000-4000-8000-000000000004','bloqueado','approved','approved');
INSERT INTO public.orders(id,cliente_id,establishment_id,status,frete_cents) VALUES
 ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ready',450),
 ('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ready',650),
 ('30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ready',350);
-- A second-write failure must roll back the delivery INSERT / UPDATE and timestamps.
CREATE FUNCTION public.test_fail_delivery_order_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF current_setting('test.fail_order_write',true)='yes' THEN RAISE EXCEPTION 'injected_order_failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER test_fail_delivery_order_write BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.test_fail_delivery_order_write();
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM set_config('test.fail_order_write','yes',true);
 BEGIN
  PERFORM public.dispatch_order_delivery('30000000-0000-4000-8000-000000000001',500,NULL);
  RAISE EXCEPTION 'FAIL dispatch did not throw';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected_order_failure' THEN RAISE; END IF; END;
 IF EXISTS(SELECT FROM public.deliveries) OR (SELECT status FROM public.orders WHERE id='30000000-0000-4000-8000-000000000001')<>'ready' THEN RAISE EXCEPTION 'FAIL dispatch rollback'; END IF;
 PERFORM set_config('test.fail_order_write','no',true);
 IF public.dispatch_order_delivery('30000000-0000-4000-8000-000000000001',500,NULL)<>'dispatched' THEN RAISE EXCEPTION 'FAIL dispatch'; END IF;
 IF public.dispatch_order_delivery('30000000-0000-4000-8000-000000000001',999,NULL)<>'exists' THEN RAISE EXCEPTION 'FAIL dispatch retry'; END IF;
 IF (SELECT valor_entrega_cents FROM public.deliveries WHERE order_id='30000000-0000-4000-8000-000000000001')<>450 THEN RAISE EXCEPTION 'FAIL dispatch used caller fee instead of confirmed order freight'; END IF;
 PERFORM public.dispatch_order_delivery('30000000-0000-4000-8000-000000000002',600,'20000000-0000-4000-8000-000000000002');
 PERFORM public.dispatch_order_delivery('30000000-0000-4000-8000-000000000003',600,NULL);
 UPDATE public.deliveries SET status='cancelled',aceito_em=now(),coletado_em=now(),lat=1,lng=2 WHERE order_id='30000000-0000-4000-8000-000000000003';
 PERFORM set_config('test.fail_order_write','yes',true);
 BEGIN PERFORM public.dispatch_order_delivery('30000000-0000-4000-8000-000000000003',42,NULL); RAISE EXCEPTION 'FAIL redispatch did not throw'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected_order_failure' THEN RAISE; END IF; END;
 IF NOT EXISTS(SELECT FROM public.deliveries WHERE order_id='30000000-0000-4000-8000-000000000003' AND status='cancelled' AND lat=1 AND coletado_em IS NOT NULL) THEN RAISE EXCEPTION 'FAIL cancelled reset rollback'; END IF;
 PERFORM set_config('test.fail_order_write','no',true);
 PERFORM public.dispatch_order_delivery('30000000-0000-4000-8000-000000000003',42,NULL);
 IF NOT EXISTS(SELECT FROM public.deliveries WHERE order_id='30000000-0000-4000-8000-000000000003' AND status='broadcasting' AND valor_entrega_cents=350 AND lat IS NULL AND lng IS NULL AND aceito_em IS NULL AND coletado_em IS NULL) THEN RAISE EXCEPTION 'FAIL cancelled reset'; END IF;
END $$;
-- Customer/other owner cannot dispatch or accept.
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
 BEGIN PERFORM public.dispatch_order_delivery('30000000-0000-4000-8000-000000000001',500,NULL); RAISE EXCEPTION 'FAIL foreign dispatch'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries LIMIT 1),'accepted'); RAISE EXCEPTION 'FAIL customer accept'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
 BEGIN PERFORM public.dispatch_order_delivery('30000000-0000-4000-8000-000000000001',500,NULL); RAISE EXCEPTION 'FAIL missing identity dispatch'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries LIMIT 1),'accepted'); RAISE EXCEPTION 'FAIL missing identity acceptance'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
DO $$ BEGIN
 BEGIN PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries WHERE order_id='30000000-0000-4000-8000-000000000001'),'accepted'); RAISE EXCEPTION 'FAIL blocked acceptance'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
 BEGIN PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries WHERE order_id='30000000-0000-4000-8000-000000000001'),'accepted'); RAISE EXCEPTION 'FAIL unapproved accept'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE d uuid; BEGIN
 SELECT id INTO d FROM public.deliveries WHERE order_id='30000000-0000-4000-8000-000000000001';
 PERFORM set_config('test.fail_order_write','yes',true);
 BEGIN PERFORM public.transition_courier_delivery(d,'accepted'); RAISE EXCEPTION 'FAIL accept did not throw'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected_order_failure' THEN RAISE; END IF; END;
 IF EXISTS(SELECT FROM public.deliveries WHERE id=d AND (status<>'broadcasting' OR entregador_id IS NOT NULL OR aceito_em IS NOT NULL)) THEN RAISE EXCEPTION 'FAIL accept rollback'; END IF;
 PERFORM set_config('test.fail_order_write','no',true);
 PERFORM public.transition_courier_delivery(d,'accepted');
 PERFORM public.transition_courier_delivery(d,'accepted');
 IF (SELECT status FROM public.orders WHERE id='30000000-0000-4000-8000-000000000001')<>'courier_assigned' OR (SELECT status FROM public.courier_profiles WHERE user_id=auth.uid())<>'ocupado' THEN RAISE EXCEPTION 'FAIL accept sync'; END IF;
 BEGIN PERFORM public.transition_courier_delivery(d,'picked_up'); RAISE EXCEPTION 'FAIL skipped stage'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.transition_courier_delivery(d,'to_store');
 PERFORM public.transition_courier_delivery(d,'at_store');
 PERFORM set_config('test.fail_order_write','yes',true);
 BEGIN PERFORM public.transition_courier_delivery(d,'picked_up'); RAISE EXCEPTION 'FAIL advance did not throw'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected_order_failure' THEN RAISE; END IF; END;
 IF (SELECT status FROM public.deliveries WHERE id=d)<>'at_store' OR (SELECT coletado_em FROM public.deliveries WHERE id=d) IS NOT NULL THEN RAISE EXCEPTION 'FAIL advance rollback'; END IF;
 PERFORM set_config('test.fail_order_write','no',true);
 PERFORM public.transition_courier_delivery(d,'picked_up');
 PERFORM public.transition_courier_delivery(d,'picked_up');
 PERFORM public.transition_courier_delivery(d,'to_customer');
 PERFORM public.transition_courier_delivery(d,'at_customer');
 IF (SELECT status FROM public.orders WHERE id='30000000-0000-4000-8000-000000000001')<>'arriving' THEN RAISE EXCEPTION 'FAIL progress sync'; END IF;
 BEGIN PERFORM public.transition_courier_delivery(d,'delivered'); RAISE EXCEPTION 'FAIL proof bypass'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries WHERE order_id='30000000-0000-4000-8000-000000000002'),'accepted'); RAISE EXCEPTION 'FAIL directed assignment bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries WHERE order_id='30000000-0000-4000-8000-000000000003'),'accepted'); RAISE EXCEPTION 'FAIL second active delivery'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
DO $$ DECLARE d uuid; BEGIN
 SELECT id INTO d FROM public.deliveries WHERE order_id='30000000-0000-4000-8000-000000000001';
 BEGIN PERFORM public.transition_courier_delivery(d,'accepted'); RAISE EXCEPTION 'FAIL second courier stole delivery'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.transition_courier_delivery(d,'at_customer'); RAISE EXCEPTION 'FAIL second courier advanced delivery'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.dispatch_order_delivery(uuid,integer,uuid)','EXECUTE') OR has_function_privilege('anon','public.transition_courier_delivery(uuid,text)','EXECUTE') OR has_function_privilege('anon','private.transition_courier_delivery(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'FAIL anon execute'; END IF;
END $$;
ROLLBACK;
