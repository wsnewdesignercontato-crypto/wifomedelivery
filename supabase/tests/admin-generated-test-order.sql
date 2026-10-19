-- Full-schema contract: synthetic identities and every generated row roll back.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
CREATE TEMP TABLE generated_test_ids(kind text PRIMARY KEY,id uuid DEFAULT gen_random_uuid());
GRANT SELECT,INSERT ON generated_test_ids TO authenticated;
INSERT INTO generated_test_ids(kind) VALUES('admin'),('owner'),('customer'),('courier'),('store'),('request');
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 SELECT id,'test-generator-'||id||'@example.invalid',now(),'{"nome":"Test generator rollback contract"}'::jsonb
 FROM generated_test_ids WHERE kind IN('admin','owner','customer','courier');
INSERT INTO public.user_roles(user_id,role) SELECT id,'admin' FROM generated_test_ids WHERE kind='admin' ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles(user_id,role) SELECT id,'estabelecimento' FROM generated_test_ids WHERE kind='owner' ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles(user_id,role) SELECT id,'entregador' FROM generated_test_ids WHERE kind='courier' ON CONFLICT DO NOTHING;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM generated_test_ids WHERE kind='admin'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM generated_test_ids WHERE kind='admin'),true);
INSERT INTO public.establishments(id,owner_id,nome,status,is_open,cidade,taxa_entrega_cents)
 VALUES((SELECT id FROM generated_test_ids WHERE kind='store'),(SELECT id FROM generated_test_ids WHERE kind='owner'),
 'Generator rollback contract','aprovado',true,'Contract city',500);
INSERT INTO public.addresses(user_id,rua,cidade,is_default)
 VALUES((SELECT id FROM generated_test_ids WHERE kind='customer'),'Contract street','Contract city',true);
INSERT INTO public.courier_profiles(user_id,status,aprovacao,kyc_status,cidade_atuacao,telefone)
 SELECT id,'online','approved','approved','Contract city','31999999999' FROM generated_test_ids WHERE kind='courier'
 ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,aprovacao=excluded.aprovacao,kyc_status=excluded.kyc_status,cidade_atuacao=excluded.cidade_atuacao;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM generated_test_ids WHERE kind='admin'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM generated_test_ids WHERE kind='admin'),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
 PERFORM public.admin_payment_test('toggle','{"enabled":true}');
 result:=public.admin_generate_test_order((SELECT id FROM generated_test_ids WHERE kind='request'),
  (SELECT id FROM generated_test_ids WHERE kind='customer'),(SELECT id FROM generated_test_ids WHERE kind='store'),
  (SELECT id FROM generated_test_ids WHERE kind='courier'),2900);
 PERFORM public.admin_generate_test_order((SELECT id FROM generated_test_ids WHERE kind='request'),
  (SELECT id FROM generated_test_ids WHERE kind='customer'),(SELECT id FROM generated_test_ids WHERE kind='store'),
  (SELECT id FROM generated_test_ids WHERE kind='courier'),2900);
 IF (SELECT count(*) FROM public.orders WHERE establishment_id=(SELECT id FROM generated_test_ids WHERE kind='store') AND is_test)<>1 THEN RAISE EXCEPTION 'Duplicate or missing generated order'; END IF;
 INSERT INTO generated_test_ids(kind,id) SELECT 'order',id FROM public.orders WHERE establishment_id=(SELECT id FROM generated_test_ids WHERE kind='store');
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM generated_test_ids WHERE kind='owner'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM generated_test_ids WHERE kind='owner'),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE oid uuid:=(SELECT id FROM generated_test_ids WHERE kind='order'); BEGIN
 IF NOT EXISTS(SELECT FROM public.notifications WHERE user_id=auth.uid() AND audience='estabelecimento' AND test_sale_id IS NOT NULL) THEN RAISE EXCEPTION 'Store notification missing'; END IF;
 UPDATE public.orders SET status='accepted' WHERE id=oid;
 UPDATE public.orders SET status='preparing' WHERE id=oid;
 UPDATE public.orders SET status='ready' WHERE id=oid;
 PERFORM public.dispatch_order_delivery(oid,500,NULL);
END $$;
RESET ROLE;
DO $$ DECLARE oid uuid:=(SELECT id FROM generated_test_ids WHERE kind='order'); BEGIN
 IF NOT EXISTS(SELECT FROM public.deliveries WHERE order_id=oid AND is_test AND status='broadcasting' AND entregador_id=(SELECT id FROM generated_test_ids WHERE kind='courier')) THEN RAISE EXCEPTION 'Test ride not generated for the selected courier'; END IF;
 IF NOT EXISTS(SELECT FROM public.notifications WHERE user_id=(SELECT id FROM generated_test_ids WHERE kind='courier') AND audience='entregador' AND test_sale_id IS NOT NULL) THEN RAISE EXCEPTION 'Courier notification missing'; END IF;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM generated_test_ids WHERE kind='courier'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM generated_test_ids WHERE kind='courier'),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE oid uuid:=(SELECT id FROM generated_test_ids WHERE kind='order'); BEGIN
 PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries WHERE order_id=oid),'accepted');
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=oid AND status='courier_assigned') THEN RAISE EXCEPTION 'Order and ride not synchronized'; END IF;
 PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries WHERE order_id=oid),'to_store');
 PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries WHERE order_id=oid),'at_store');
 PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries WHERE order_id=oid),'picked_up');
 PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries WHERE order_id=oid),'to_customer');
 PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries WHERE order_id=oid),'at_customer');
END $$;
RESET ROLE;
SELECT set_config('test.generator_code',(SELECT code FROM private.order_delivery_codes WHERE order_id=(SELECT id FROM generated_test_ids WHERE kind='order')),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE oid uuid:=(SELECT id FROM generated_test_ids WHERE kind='order'); BEGIN
 PERFORM public.confirm_delivery_code(oid,current_setting('test.generator_code'),NULL);
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=oid AND status='delivered') OR
    NOT EXISTS(SELECT FROM public.deliveries WHERE order_id=oid AND status='delivered') THEN RAISE EXCEPTION 'Test completion not synchronized'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE oid uuid:=(SELECT id FROM generated_test_ids WHERE kind='order'); BEGIN
 IF EXISTS(SELECT FROM public.platform_ledger WHERE order_id=oid) OR EXISTS(SELECT FROM asaas_private.payment_attempts WHERE order_id=oid) THEN RAISE EXCEPTION 'Test affected real financial records'; END IF;
 IF has_function_privilege('anon','public.admin_generate_test_order(uuid,uuid,uuid,uuid,integer)','execute') THEN RAISE EXCEPTION 'Anonymous generator access'; END IF;
END $$;
SELECT 'Generated test order completed through store, courier offer, acceptance and delivery; no real finance; all fixtures rolled back' AS result;
ROLLBACK;
