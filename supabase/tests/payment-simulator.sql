-- Run with the temporary fixtures from order-acceptance-flow.sql; always roll back.
INSERT INTO atomic_delivery_ids(kind) VALUES('test_sale'),('test_order'),('test_delivery'),('declined_sale'),('active_sale'),('active_order'),('active_delivery'),('busy_sale'),('busy_test_order'),('real_delivery');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ DECLARE r jsonb; BEGIN
 BEGIN PERFORM public.admin_payment_test('state'); RAISE EXCEPTION 'FAIL customer opened simulator'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=public.checkout_order((SELECT id FROM atomic_delivery_ids WHERE kind='store'),(SELECT id FROM atomic_delivery_ids WHERE kind='key'),'pix','delivery','{"rua":"Contract street","cidade":"Contract city"}',NULL,NULL,1500);
 UPDATE atomic_delivery_ids SET id=(r->>'order_id')::uuid WHERE kind='order';
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='admin'),'role','authenticated')::text,true);
DO $$ DECLARE r jsonb; payload jsonb; sid uuid; BEGIN
 r:=public.admin_payment_test('state');
 IF (r->>'enabled')::boolean THEN RAISE EXCEPTION 'FAIL enabled by default'; END IF;
 payload:=jsonb_build_object('request_key',gen_random_uuid(),'store_id',(SELECT id FROM atomic_delivery_ids WHERE kind='store'),'customer_id',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'courier_id',(SELECT id FROM atomic_delivery_ids WHERE kind='courier'),'fulfillment','delivery','payment_method','pix','subtotal_cents',1000,'address','{"rua":"Contract test street","cidade":"Contract city"}'::jsonb);
 BEGIN PERFORM public.admin_payment_test('create',payload); RAISE EXCEPTION 'FAIL created with test off'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.admin_payment_test('toggle','{"enabled":true}');
 r:=public.admin_payment_test('create',payload);
 IF (r->>'count')::integer<>1 THEN RAISE EXCEPTION 'FAIL pending test'; END IF;
 sid:=(r->'sales'->0->>'id')::uuid;
 UPDATE atomic_delivery_ids SET id=sid WHERE kind='test_sale';
 r:=public.admin_payment_test('create',payload);
 IF (r->>'count')::integer<>1 THEN RAISE EXCEPTION 'FAIL duplicate test request'; END IF;
 r:=public.admin_payment_test('approve',jsonb_build_object('sale_id',sid));
 UPDATE atomic_delivery_ids SET id=(r->'sales'->0->>'order_id')::uuid WHERE kind='test_order';
 PERFORM public.admin_payment_test('approve',jsonb_build_object('sale_id',sid));
END $$;
RESET ROLE;
DO $$ DECLARE oid uuid:=(SELECT id FROM atomic_delivery_ids WHERE kind='test_order'); BEGIN
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=oid AND is_test AND checkout_key IS NULL AND payment_received_at IS NULL) THEN RAISE EXCEPTION 'FAIL test flag'; END IF;
 IF (SELECT estoque FROM public.products WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='product'))<>9 THEN RAISE EXCEPTION 'FAIL test changed stock'; END IF;
 IF (SELECT count(*) FROM public.notifications WHERE test_sale_id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_sale') AND audience='estabelecimento' AND titulo LIKE '[TESTE]%')<>1 THEN RAISE EXCEPTION 'FAIL merchant notification'; END IF;
 IF has_function_privilege('anon','public.admin_payment_test(text,jsonb)','EXECUTE') OR has_table_privilege('authenticated','private.payment_test_sales','SELECT') THEN RAISE EXCEPTION 'FAIL grants'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ BEGIN
 BEGIN UPDATE public.orders SET test_sale_id=NULL WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_order'); RAISE EXCEPTION 'FAIL removed test identity'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.orders SET test_sale_id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_sale') WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='order'); RAISE EXCEPTION 'FAIL disguised real order'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_payment_test('approve',jsonb_build_object('sale_id',(SELECT id FROM atomic_delivery_ids WHERE kind='test_sale'))); RAISE EXCEPTION 'FAIL customer payment approval'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='owner'),'role','authenticated')::text,true);
UPDATE public.orders SET status='accepted' WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_order');
UPDATE public.orders SET status='preparing' WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_order');
UPDATE public.orders SET status='ready' WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_order');
SELECT public.dispatch_order_delivery((SELECT id FROM atomic_delivery_ids WHERE kind='test_order'),999,NULL);
RESET ROLE;
UPDATE atomic_delivery_ids SET id=(SELECT id FROM public.deliveries WHERE order_id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_order')) WHERE kind='test_delivery';
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM public.deliveries WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_delivery') AND is_test AND entregador_id=(SELECT id FROM atomic_delivery_ids WHERE kind='courier')) THEN RAISE EXCEPTION 'FAIL selected courier'; END IF;
 IF (SELECT count(*) FROM public.notifications WHERE test_sale_id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_sale') AND audience='entregador')<>1 THEN RAISE EXCEPTION 'FAIL courier notice'; END IF;
 IF EXISTS(SELECT FROM public.notifications WHERE test_sale_id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_sale') AND user_id=(SELECT id FROM atomic_delivery_ids WHERE kind='other_courier')) THEN RAISE EXCEPTION 'FAIL notified unrelated courier'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='other_courier'),'role','authenticated')::text,true);
DO $$ BEGIN
 IF EXISTS(SELECT FROM public.deliveries WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_delivery')) THEN RAISE EXCEPTION 'FAIL unrelated courier sees test'; END IF;
 BEGIN PERFORM public.transition_courier_delivery((SELECT id FROM atomic_delivery_ids WHERE kind='test_delivery'),'accepted'); RAISE EXCEPTION 'FAIL unrelated courier accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='courier'),'role','authenticated')::text,true);
DO $$ DECLARE d uuid:=(SELECT id FROM atomic_delivery_ids WHERE kind='test_delivery'); BEGIN
 PERFORM public.transition_courier_delivery(d,'accepted');
 PERFORM public.transition_courier_delivery(d,'to_store');
 PERFORM public.transition_courier_delivery(d,'at_store');
 PERFORM public.transition_courier_delivery(d,'picked_up');
 PERFORM public.transition_courier_delivery(d,'to_customer');
 PERFORM public.transition_courier_delivery(d,'at_customer');
END $$;
RESET ROLE;
SELECT set_config('test.simulator_code',(SELECT code FROM private.order_delivery_codes WHERE order_id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_order')),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN PERFORM public.confirm_delivery_code((SELECT id FROM atomic_delivery_ids WHERE kind='test_order'),current_setting('test.simulator_code'),NULL); END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='admin'),'role','authenticated')::text,true);
DO $$ BEGIN
 BEGIN PERFORM public.settle_order_payment((SELECT id FROM atomic_delivery_ids WHERE kind='test_order'),'simulation-must-not-credit'); RAISE EXCEPTION 'FAIL test became real receipt'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT FROM public.platform_ledger WHERE order_id=(SELECT id FROM atomic_delivery_ids WHERE kind='test_order')) THEN RAISE EXCEPTION 'FAIL test financial ledger'; END IF;
 IF (SELECT order_count FROM public.public_store_sales() WHERE establishment_id=(SELECT id FROM atomic_delivery_ids WHERE kind='store'))<>0 THEN RAISE EXCEPTION 'FAIL test ranked as sale'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; sid uuid; BEGIN
 PERFORM public.admin_payment_test('refund',jsonb_build_object('sale_id',(SELECT id FROM atomic_delivery_ids WHERE kind='test_sale')));
 r:=public.admin_payment_test('create',jsonb_build_object('request_key',gen_random_uuid(),'store_id',(SELECT id FROM atomic_delivery_ids WHERE kind='store'),'customer_id',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'fulfillment','pickup','payment_method','cartao','subtotal_cents',2000));
 SELECT (x->>'id')::uuid INTO sid FROM jsonb_array_elements(r->'sales') x WHERE (x->>'subtotal_cents')::integer=2000;
 r:=public.admin_payment_test('decline',jsonb_build_object('sale_id',sid));
 r:=public.admin_payment_test('create',jsonb_build_object('request_key',gen_random_uuid(),'store_id',(SELECT id FROM atomic_delivery_ids WHERE kind='store'),'customer_id',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'courier_id',(SELECT id FROM atomic_delivery_ids WHERE kind='courier'),'fulfillment','delivery','payment_method','pix','subtotal_cents',3000,'address','{"rua":"Active cleanup test street","cidade":"Contract city"}'::jsonb));
 SELECT (x->>'id')::uuid INTO sid FROM jsonb_array_elements(r->'sales') x WHERE (x->>'subtotal_cents')::integer=3000;
 UPDATE atomic_delivery_ids SET id=sid WHERE kind='active_sale';
 r:=public.admin_payment_test('approve',jsonb_build_object('sale_id',sid));
 UPDATE atomic_delivery_ids SET id=(SELECT (x->>'order_id')::uuid FROM jsonb_array_elements(r->'sales') x WHERE (x->>'id')::uuid=sid) WHERE kind='active_order';
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='owner'),'role','authenticated')::text,true);
UPDATE public.orders SET status='accepted' WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='active_order');
UPDATE public.orders SET status='preparing' WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='active_order');
UPDATE public.orders SET status='ready' WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='active_order');
SELECT public.dispatch_order_delivery((SELECT id FROM atomic_delivery_ids WHERE kind='active_order'),999,NULL);
RESET ROLE;
UPDATE atomic_delivery_ids SET id=(SELECT id FROM public.deliveries WHERE order_id=(SELECT id FROM atomic_delivery_ids WHERE kind='active_order')) WHERE kind='active_delivery';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='courier'),'role','authenticated')::text,true);
SELECT public.transition_courier_delivery((SELECT id FROM atomic_delivery_ids WHERE kind='active_delivery'),'accepted');
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='admin'),'role','authenticated')::text,true);
DO $$ DECLARE r jsonb; sid uuid; BEGIN
 r:=public.admin_payment_test('create',jsonb_build_object('request_key',gen_random_uuid(),'store_id',(SELECT id FROM atomic_delivery_ids WHERE kind='store'),'customer_id',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'courier_id',(SELECT id FROM atomic_delivery_ids WHERE kind='other_courier'),'fulfillment','delivery','payment_method','pix','subtotal_cents',4000,'address','{"rua":"Busy courier test street","cidade":"Contract city"}'::jsonb));
 SELECT (x->>'id')::uuid INTO sid FROM jsonb_array_elements(r->'sales') x WHERE (x->>'subtotal_cents')::integer=4000;
 UPDATE atomic_delivery_ids SET id=sid WHERE kind='busy_sale';
 r:=public.admin_payment_test('approve',jsonb_build_object('sale_id',sid));
 UPDATE atomic_delivery_ids SET id=(SELECT (x->>'order_id')::uuid FROM jsonb_array_elements(r->'sales') x WHERE (x->>'id')::uuid=sid) WHERE kind='busy_test_order';
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='owner'),'role','authenticated')::text,true);
UPDATE public.orders SET status='accepted' WHERE id IN(SELECT id FROM atomic_delivery_ids WHERE kind IN('busy_test_order','order'));
UPDATE public.orders SET status='preparing' WHERE id IN(SELECT id FROM atomic_delivery_ids WHERE kind IN('busy_test_order','order'));
UPDATE public.orders SET status='ready' WHERE id IN(SELECT id FROM atomic_delivery_ids WHERE kind IN('busy_test_order','order'));
SELECT public.dispatch_order_delivery((SELECT id FROM atomic_delivery_ids WHERE kind='busy_test_order'),500,NULL);
SELECT public.dispatch_order_delivery((SELECT id FROM atomic_delivery_ids WHERE kind='order'),500,(SELECT id FROM atomic_delivery_ids WHERE kind='other_courier'));
RESET ROLE;
UPDATE atomic_delivery_ids SET id=(SELECT id FROM public.deliveries WHERE order_id=(SELECT id FROM atomic_delivery_ids WHERE kind='order')) WHERE kind='real_delivery';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='other_courier'),'role','authenticated')::text,true);
SELECT public.transition_courier_delivery((SELECT id FROM atomic_delivery_ids WHERE kind='real_delivery'),'accepted');
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='admin'),'role','authenticated')::text,true);
SELECT public.admin_payment_test('refund',jsonb_build_object('sale_id',(SELECT id FROM atomic_delivery_ids WHERE kind='busy_sale'))) IS NOT NULL AS simulated_refund_done;
RESET ROLE;
DO $$ BEGIN IF (SELECT status FROM public.courier_profiles WHERE user_id=(SELECT id FROM atomic_delivery_ids WHERE kind='other_courier'))<>'ocupado' THEN RAISE EXCEPTION 'FAIL test refund freed courier on real delivery'; END IF; END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
 PERFORM public.admin_payment_test('toggle','{"enabled":false}');
 BEGIN PERFORM public.admin_payment_test('cleanup','{}'); RAISE EXCEPTION 'FAIL unconfirmed cleanup'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 r:=public.admin_payment_test('cleanup','{"confirmation":"LIMPAR TESTES"}');
 IF (r->>'count')::integer<>0 OR (r->>'enabled')::boolean THEN RAISE EXCEPTION 'FAIL cleanup state'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT FROM public.orders WHERE is_test) OR EXISTS(SELECT FROM public.notifications WHERE test_sale_id IS NOT NULL) THEN RAISE EXCEPTION 'FAIL test residue'; END IF;
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='order') AND NOT is_test AND status='courier_assigned') THEN RAISE EXCEPTION 'FAIL cleanup affected real order'; END IF;
 IF (SELECT estoque FROM public.products WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='product'))<>9 THEN RAISE EXCEPTION 'FAIL cleanup changed real stock'; END IF;
 IF (SELECT status FROM public.courier_profiles WHERE user_id=(SELECT id FROM atomic_delivery_ids WHERE kind='courier'))<>'online' THEN RAISE EXCEPTION 'FAIL cleanup left courier occupied'; END IF;
 IF (SELECT status FROM public.courier_profiles WHERE user_id=(SELECT id FROM atomic_delivery_ids WHERE kind='other_courier'))<>'ocupado' THEN RAISE EXCEPTION 'FAIL cleanup freed courier working on a real order'; END IF;
END $$;
SELECT 'Payment simulator: permissions, approval, refusal, delivery, receipt isolation, refund and cleanup passed; rolled back' AS result;
