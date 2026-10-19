-- Synthetic fixtures and Vault values only; safe to run against the installed schema with rollback.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN IF to_regprocedure('public.checkout_online_order(uuid,uuid,text,text,jsonb,text,text,integer)') IS NULL THEN RAISE EXCEPTION 'Online checkout contract missing'; END IF; END $$;
CREATE TEMP TABLE ap_ids(kind text PRIMARY KEY,id uuid DEFAULT gen_random_uuid());
INSERT INTO ap_ids(kind) VALUES('customer'),('other'),('merchant'),('admin'),('store'),('product'),('key'),('coupon');
GRANT SELECT ON ap_ids TO authenticated,service_role;
INSERT INTO auth.users(id,email,email_confirmed_at) SELECT id,'asaas-contract-'||id||'@example.invalid',now() FROM ap_ids WHERE kind IN('customer','other','merchant','admin');
INSERT INTO public.user_roles(user_id,role) VALUES((SELECT id FROM ap_ids WHERE kind='admin'),'admin') ON CONFLICT DO NOTHING;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM ap_ids WHERE kind='admin'),true),set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM ap_ids WHERE kind='admin'),'role','authenticated')::text,true);
INSERT INTO public.profiles(id,nome,telefone) SELECT id,'Asaas contract','31999999999' FROM ap_ids WHERE kind IN('customer','other','merchant','admin') ON CONFLICT(id) DO UPDATE SET telefone=excluded.telefone;
INSERT INTO public.addresses(user_id,rua,cidade,is_default) VALUES((SELECT id FROM ap_ids WHERE kind='customer'),'Fixture street','Test city',true);
INSERT INTO public.establishments(id,owner_id,nome,status,is_open,cidade,taxa_entrega_cents) VALUES((SELECT id FROM ap_ids WHERE kind='store'),(SELECT id FROM ap_ids WHERE kind='merchant'),'Asaas fixture','aprovado',true,'Test city',500);
INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque,disponivel) VALUES((SELECT id FROM ap_ids WHERE kind='product'),(SELECT id FROM ap_ids WHERE kind='store'),'Asaas fixture product',1000,10,true);
INSERT INTO public.coupons(id,establishment_id,code,type,percent,usage_limit) VALUES((SELECT id FROM ap_ids WHERE kind='coupon'),(SELECT id FROM ap_ids WHERE kind='store'),'ASAAS-'||(SELECT id FROM ap_ids WHERE kind='coupon'),'percent',10,5);
SELECT public.asaas_settings_save('production','notify@example.invalid',repeat('k',64),repeat('t',64));
SELECT public.asaas_connection_complete('production',(public.asaas_settings_get('production')->>'revision')::uuid,true);
SELECT public.asaas_webhook_complete('production',(public.asaas_settings_get('production')->>'revision')::uuid,'hook_fixture');
UPDATE asaas_private.settings SET registered_payment_contract=1 WHERE environment='production';
SELECT public.asaas_online_set_enabled(true);
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES((SELECT id FROM ap_ids WHERE kind='customer'),(SELECT id FROM ap_ids WHERE kind='store'),(SELECT id FROM ap_ids WHERE kind='product'),'Forged price',1,1);
CREATE TEMP TABLE ap_order(id uuid); GRANT ALL ON ap_order TO authenticated,service_role;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM ap_ids WHERE kind='customer'),true),set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM ap_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ DECLARE result jsonb; oid uuid; coupon text:='ASAAS-'||(SELECT id FROM ap_ids WHERE kind='coupon'); BEGIN
 result:=public.checkout_online_order((SELECT id FROM ap_ids WHERE kind='store'),(SELECT id FROM ap_ids WHERE kind='key'),'pix','delivery','{"rua":"Fixture street","cidade":"Test city"}',NULL,coupon,1400);
 oid:=(result->>'order_id')::uuid; INSERT INTO ap_order VALUES(oid);
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=oid AND status='pending_payment' AND payment_channel='asaas' AND acceptance_deadline IS NULL AND total_cents=1400) THEN RAISE EXCEPTION 'FAIL online pending authoritative total'; END IF;
 IF EXISTS(SELECT FROM public.notifications WHERE link_url='/estabelecimento/pedidos' AND user_id=(SELECT id FROM ap_ids WHERE kind='merchant')) THEN RAISE EXCEPTION 'FAIL early merchant notification'; END IF;
 result:=public.checkout_online_order((SELECT id FROM ap_ids WHERE kind='store'),(SELECT id FROM ap_ids WHERE kind='key'),'pix','delivery','{"rua":"Fixture street","cidade":"Test city"}',NULL,coupon,1400);
 IF result->>'order_id'<>oid::text OR (SELECT estoque FROM public.products WHERE id=(SELECT id FROM ap_ids WHERE kind='product'))<>9 OR (SELECT used_count FROM public.coupons WHERE id=(SELECT id FROM ap_ids WHERE kind='coupon'))<>1 THEN RAISE EXCEPTION 'FAIL repeated order reserves twice'; END IF;
 BEGIN UPDATE public.orders SET status='placed' WHERE id=oid; IF EXISTS(SELECT FROM public.orders WHERE id=oid AND status='placed') THEN RAISE EXCEPTION 'FAIL forged confirmation'; END IF; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.orders SET online_payment_state='received' WHERE id=oid; IF EXISTS(SELECT FROM public.orders WHERE id=oid AND online_payment_state='received') THEN RAISE EXCEPTION 'FAIL forged payment state'; END IF; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
CREATE TEMP TABLE ap_attempt(value jsonb); GRANT ALL ON ap_attempt TO service_role;
SET LOCAL ROLE service_role;
DO $$ DECLARE a jsonb; c jsonb; s jsonb; uid uuid:=(SELECT id FROM ap_ids WHERE kind='customer'); oid uuid:=(SELECT id FROM ap_order); BEGIN
 a:=public.asaas_payment_claim(uid,oid); INSERT INTO ap_attempt VALUES(a);
 IF a->>'mode'<>'create' THEN RAISE EXCEPTION 'FAIL first claim'; END IF;
 c:=public.asaas_payment_claim(uid,oid); IF c->>'mode'<>'reuse' THEN RAISE EXCEPTION 'FAIL concurrent claim'; END IF;
 BEGIN PERFORM public.asaas_settings_save('production','notify@example.invalid',repeat('n',64),NULL); RAISE EXCEPTION 'FAIL credential rotation while active'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 c:=public.asaas_customer_claim(uid,'production');
 IF NOT public.asaas_customer_complete(uid,'production',(c->>'operationId')::uuid,'cus_fixture') THEN RAISE EXCEPTION 'FAIL customer association'; END IF;
 s:=jsonb_build_object('id','pay_fixture','customerId','cus_fixture','externalReference',a->>'externalReference','billingType','PIX','valueCents',1400,'netValueCents',1390,'refundedValueCents',0,'status','CONFIRMED');
 BEGIN PERFORM public.asaas_payment_attach((a->>'attemptId')::uuid,(a->>'operationId')::uuid,s||'{"valueCents":1}'::jsonb); RAISE EXCEPTION 'FAIL forged amount attach'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF NOT public.asaas_payment_attach((a->>'attemptId')::uuid,(a->>'operationId')::uuid,s) THEN RAISE EXCEPTION 'FAIL attach'; END IF;
 PERFORM public.asaas_payment_apply((a->>'attemptId')::uuid,s);
 PERFORM public.asaas_payment_apply((a->>'attemptId')::uuid,s);
END $$;
RESET ROLE;
DO $$ DECLARE oid uuid:=(SELECT id FROM ap_order); BEGIN
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=oid AND status='placed' AND online_payment_state='confirmed' AND acceptance_deadline BETWEEN clock_timestamp()+interval '50 seconds' AND clock_timestamp()+interval '61 seconds' AND payment_received_at IS NULL AND NOT dinheiro_recebido) THEN RAISE EXCEPTION 'FAIL confirmation/deadline/manual settlement'; END IF;
 IF (SELECT count(*) FROM public.notifications WHERE link_url='/estabelecimento/pedidos' AND user_id=(SELECT id FROM ap_ids WHERE kind='merchant'))<>1 THEN RAISE EXCEPTION 'FAIL duplicate or missing merchant notice'; END IF;
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE a jsonb:=(SELECT value FROM ap_attempt); s jsonb; BEGIN
 s:=jsonb_build_object('id','pay_fixture','customerId','cus_fixture','externalReference',a->>'externalReference','billingType','PIX','valueCents',1400,'netValueCents',1390,'refundedValueCents',0,'status','PENDING');
 PERFORM public.asaas_payment_apply((a->>'attemptId')::uuid,s);
 IF public.asaas_payment_view((SELECT id FROM ap_ids WHERE kind='customer'),(SELECT id FROM ap_order))->>'state'<>'confirmed' THEN RAISE EXCEPTION 'FAIL old event regressed state'; END IF;
 BEGIN PERFORM public.asaas_payment_view((SELECT id FROM ap_ids WHERE kind='other'),(SELECT id FROM ap_order)); RAISE EXCEPTION 'FAIL other user access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.orders SET status='cancelled' WHERE id=(SELECT id FROM ap_order);
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=(SELECT id FROM ap_order) AND online_payment_state='refund_pending') OR NOT EXISTS(SELECT FROM asaas_private.payment_issues WHERE order_id=(SELECT id FROM ap_order) AND resolved_at IS NULL) THEN RAISE EXCEPTION 'FAIL paid cancellation missing refund issue'; END IF;
 IF (SELECT estoque FROM public.products WHERE id=(SELECT id FROM ap_ids WHERE kind='product'))<>10 OR (SELECT used_count FROM public.coupons WHERE id=(SELECT id FROM ap_ids WHERE kind='coupon'))<>0 THEN RAISE EXCEPTION 'FAIL stock/coupon restoration'; END IF;
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE a jsonb:=(SELECT value FROM ap_attempt); s jsonb; BEGIN
 s:=jsonb_build_object('id','pay_fixture','customerId','cus_fixture','externalReference',a->>'externalReference','billingType','PIX','valueCents',1400,'netValueCents',1390,'refundedValueCents',0,'status','RECEIVED');
 PERFORM public.asaas_payment_apply((a->>'attemptId')::uuid,s);
 s:=s||'{"status":"REFUNDED","refundedValueCents":1400}'::jsonb;
 PERFORM public.asaas_payment_apply((a->>'attemptId')::uuid,s);
 IF public.asaas_payment_view((SELECT id FROM ap_ids WHERE kind='customer'),(SELECT id FROM ap_order))->>'state'<>'refunded' THEN RAISE EXCEPTION 'FAIL verified refund'; END IF;
 IF NOT public.asaas_webhook_record('production','evt_fixture&123','PAYMENT_RECEIVED','pay_fixture','RECEIVED') THEN RAISE EXCEPTION 'FAIL ampersand event'; END IF;
 IF public.asaas_webhook_record('production','evt_fixture&123','PAYMENT_RECEIVED','pay_fixture','RECEIVED') THEN RAISE EXCEPTION 'FAIL duplicate event'; END IF;
END $$;
RESET ROLE;
-- The previously shipped catalog/test checkout remains usable after the new core extraction.
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES((SELECT id FROM ap_ids WHERE kind='customer'),(SELECT id FROM ap_ids WHERE kind='store'),(SELECT id FROM ap_ids WHERE kind='product'),'Forged price',1,1);
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
 r:=public.checkout_order((SELECT id FROM ap_ids WHERE kind='store'),gen_random_uuid(),'pix','pickup',NULL,NULL,NULL,1000);
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=(r->>'order_id')::uuid AND status='placed' AND payment_channel='delivery' AND acceptance_deadline IS NOT NULL) THEN RAISE EXCEPTION 'FAIL offline checkout regression'; END IF;
 UPDATE public.orders SET status='cancelled' WHERE id=(r->>'order_id')::uuid;
END $$;
RESET ROLE;
INSERT INTO public.coupons(id,code,type,percent,ativo,min_order_cents) VALUES(gen_random_uuid(),'FREE-'||(SELECT id FROM ap_ids WHERE kind='coupon'),'percent',100,true,0);
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES((SELECT id FROM ap_ids WHERE kind='customer'),(SELECT id FROM ap_ids WHERE kind='store'),(SELECT id FROM ap_ids WHERE kind='product'),'Free fixture',1,1);
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
 r:=public.checkout_online_order((SELECT id FROM ap_ids WHERE kind='store'),gen_random_uuid(),'pix','pickup',NULL,NULL,'FREE-'||(SELECT id FROM ap_ids WHERE kind='coupon'),0);
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=(r->>'order_id')::uuid AND status='placed' AND payment_channel='free' AND total_cents=0) THEN RAISE EXCEPTION 'FAIL free order'; END IF;
 UPDATE public.orders SET status='cancelled' WHERE id=(r->>'order_id')::uuid;
END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM ap_ids WHERE kind='admin'),true),set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM ap_ids WHERE kind='admin'),'role','authenticated')::text,true);
SELECT public.admin_payment_test('toggle','{"enabled":true}');
SELECT public.admin_payment_test('enroll',jsonb_build_object('store_id',(SELECT id FROM ap_ids WHERE kind='store'),'customer_id',(SELECT id FROM ap_ids WHERE kind='customer')));
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM ap_ids WHERE kind='customer'),true),set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM ap_ids WHERE kind='customer'),'role','authenticated')::text,true);
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES((SELECT id FROM ap_ids WHERE kind='customer'),(SELECT id FROM ap_ids WHERE kind='store'),(SELECT id FROM ap_ids WHERE kind='product'),'Simulated fixture',1,1);
DO $$ DECLARE r jsonb; BEGIN
 r:=public.checkout_test_order((SELECT id FROM ap_ids WHERE kind='store'),gen_random_uuid(),'pix','pickup',NULL,NULL,NULL,1000);
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=(r->>'order_id')::uuid AND is_test AND status='placed') OR (SELECT estoque FROM public.products WHERE id=(SELECT id FROM ap_ids WHERE kind='product'))<>10 THEN RAISE EXCEPTION 'FAIL simulator regression'; END IF;
END $$;
RESET ROLE;
-- A timed-out attempt can only be reconciled, including when a caller requests retry.
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES((SELECT id FROM ap_ids WHERE kind='customer'),(SELECT id FROM ap_ids WHERE kind='store'),(SELECT id FROM ap_ids WHERE kind='product'),'Timeout fixture',1,1);
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
 r:=public.checkout_online_order((SELECT id FROM ap_ids WHERE kind='store'),gen_random_uuid(),'cartao','pickup',NULL,NULL,NULL,1000);
 INSERT INTO ap_order VALUES((r->>'order_id')::uuid);
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE a jsonb;c jsonb;s jsonb;oid uuid:=(SELECT id FROM ap_order WHERE id<>(SELECT (value->>'orderId')::uuid FROM ap_attempt));uid uuid:=(SELECT id FROM ap_ids WHERE kind='customer'); BEGIN
 a:=public.asaas_payment_claim(uid,oid);
 IF public.asaas_payment_fail((a->>'attemptId')::uuid,gen_random_uuid(),'declined') THEN RAISE EXCEPTION 'FAIL stale lease accepted'; END IF;
 IF NOT public.asaas_payment_fail((a->>'attemptId')::uuid,(a->>'operationId')::uuid,'uncertain') THEN RAISE EXCEPTION 'FAIL uncertain state'; END IF;
 c:=public.asaas_payment_claim(uid,oid,true);
 IF c->>'mode'<>'reconcile' OR c->>'attemptId'<>a->>'attemptId' THEN RAISE EXCEPTION 'FAIL uncertainty created second attempt'; END IF;
 s:=jsonb_build_object('id','pay_timeout','customerId','cus_fixture','externalReference',a->>'externalReference','billingType','CREDIT_CARD','valueCents',1000,'netValueCents',970,'refundedValueCents',0,'status','PENDING');
 IF public.asaas_payment_attach((a->>'attemptId')::uuid,NULL,s) THEN RAISE EXCEPTION 'FAIL null lease accepted'; END IF;
 IF NOT public.asaas_payment_attach((a->>'attemptId')::uuid,(c->>'operationId')::uuid,s) THEN RAISE EXCEPTION 'FAIL current reconciliation lease rejected'; END IF;
 PERFORM public.asaas_payment_apply((a->>'attemptId')::uuid,s);
 IF public.asaas_payment_attach((a->>'attemptId')::uuid,NULL,s) THEN RAISE EXCEPTION 'FAIL null lease after completed operation accepted'; END IF;
 PERFORM public.asaas_payment_cancel_request(uid,oid);
 PERFORM public.asaas_payment_apply((a->>'attemptId')::uuid,s);
 IF public.asaas_payment_view(uid,oid)->>'state'<>'cancel_pending' THEN RAISE EXCEPTION 'FAIL cancellation intent lost'; END IF;
 PERFORM public.asaas_payment_apply((a->>'attemptId')::uuid,s||'{"status":"RECEIVED"}'::jsonb);
 IF public.asaas_payment_view(uid,oid)->>'state'<>'refund_pending' THEN RAISE EXCEPTION 'FAIL paid cancellation not queued'; END IF;
END $$;
RESET ROLE;
CREATE TEMP TABLE ap_extra(kind text,id uuid); GRANT ALL ON ap_extra TO authenticated,service_role;
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES((SELECT id FROM ap_ids WHERE kind='customer'),(SELECT id FROM ap_ids WHERE kind='store'),(SELECT id FROM ap_ids WHERE kind='product'),'Cancel retry fixture',1,1);
SET LOCAL ROLE authenticated;
INSERT INTO ap_extra SELECT 'cancel',(public.checkout_online_order((SELECT id FROM ap_ids WHERE kind='store'),gen_random_uuid(),'cartao','pickup',NULL,NULL,NULL,1000)->>'order_id')::uuid;
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES((SELECT id FROM ap_ids WHERE kind='customer'),(SELECT id FROM ap_ids WHERE kind='store'),(SELECT id FROM ap_ids WHERE kind='product'),'Duplicate fixture',1,1);
INSERT INTO ap_extra SELECT 'duplicate',(public.checkout_online_order((SELECT id FROM ap_ids WHERE kind='store'),gen_random_uuid(),'cartao','pickup',NULL,NULL,NULL,1000)->>'order_id')::uuid;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE uid uuid:=(SELECT id FROM ap_ids WHERE kind='customer');oid uuid;a jsonb;b jsonb;s jsonb;BEGIN
 oid:=(SELECT id FROM ap_extra WHERE kind='cancel');a:=public.asaas_payment_claim(uid,oid);
 PERFORM public.asaas_payment_fail((a->>'attemptId')::uuid,(a->>'operationId')::uuid,'declined');
 PERFORM public.asaas_payment_cancel_request(uid,oid);
 BEGIN PERFORM public.asaas_payment_claim(uid,oid,true);RAISE EXCEPTION 'FAIL retry after cancellation intent';EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;END;
 oid:=(SELECT id FROM ap_extra WHERE kind='duplicate');a:=public.asaas_payment_claim(uid,oid);
 PERFORM public.asaas_payment_fail((a->>'attemptId')::uuid,(a->>'operationId')::uuid,'declined');
 b:=public.asaas_payment_claim(uid,oid,true);
 s:=jsonb_build_object('id','pay_second','customerId','cus_fixture','externalReference',b->>'externalReference','billingType','CREDIT_CARD','valueCents',1000,'netValueCents',970,'refundedValueCents',0,'status','RECEIVED');
 PERFORM public.asaas_payment_apply((b->>'attemptId')::uuid,s);
 s:=s||jsonb_build_object('id','pay_late_first','externalReference',a->>'externalReference','status','CONFIRMED');
 PERFORM public.asaas_payment_apply((a->>'attemptId')::uuid,s);
 IF public.asaas_payment_view(uid,oid)->>'state'<>'refund_pending' THEN RAISE EXCEPTION 'FAIL duplicate payment not held';END IF;
 PERFORM public.asaas_payment_apply((b->>'attemptId')::uuid,s||jsonb_build_object('id','pay_second','externalReference',b->>'externalReference','status','RECEIVED'));
 IF public.asaas_payment_view(uid,oid)->>'state'<>'refund_pending' THEN RAISE EXCEPTION 'FAIL primary reconciliation removed duplicate hold';END IF;
 PERFORM public.asaas_payment_apply((a->>'attemptId')::uuid,s||'{"status":"REFUNDED","refundedValueCents":1000}'::jsonb);
 IF public.asaas_payment_view(uid,oid)->>'state'<>'received' OR NOT EXISTS(SELECT FROM public.orders WHERE id=oid AND status='placed') THEN RAISE EXCEPTION 'FAIL duplicate refund cancelled valid order';END IF;
END $$;
RESET ROLE;
-- Synthetic historical row, inserted directly; never mutate immutable checkout timestamps.
INSERT INTO ap_extra VALUES('expiry',gen_random_uuid());
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
INSERT INTO public.orders(id,cliente_id,establishment_id,status,payment_channel,online_payment_state,subtotal_cents,total_cents,forma_pagamento,tipo_entrega,created_at)
VALUES((SELECT id FROM ap_extra WHERE kind='expiry'),(SELECT id FROM ap_ids WHERE kind='customer'),(SELECT id FROM ap_ids WHERE kind='store'),'pending_payment','asaas','creating',1000,1000,'pix','pickup',clock_timestamp()-interval '11 minutes');
SELECT private.expire_unpaid_asaas_orders();
DO $$ BEGIN IF NOT EXISTS(SELECT FROM public.orders WHERE id=(SELECT id FROM ap_extra WHERE kind='expiry') AND status='cancelled' AND online_payment_state='cancel_pending') THEN RAISE EXCEPTION 'FAIL operational expiry';END IF;END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE work jsonb;w jsonb;BEGIN
 work:=public.asaas_payment_work_claim(10);
 IF jsonb_array_length(work)>10 THEN RAISE EXCEPTION 'FAIL batch limit';END IF;
 IF jsonb_array_length(public.asaas_payment_work_claim(10))<>0 THEN RAISE EXCEPTION 'FAIL concurrent work lease';END IF;
 FOR w IN SELECT * FROM jsonb_array_elements(work) LOOP
  IF public.asaas_payment_work_complete((w->>'workId')::uuid,gen_random_uuid(),'done') THEN RAISE EXCEPTION 'FAIL stale work lease';END IF;
  IF NOT public.asaas_payment_work_complete((w->>'workId')::uuid,(w->>'operationId')::uuid,'retry') THEN RAISE EXCEPTION 'FAIL current work lease';END IF;
 END LOOP;
END $$;
RESET ROLE;
DO $$ DECLARE p regprocedure; BEGIN
 FOR p IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'asaas_%' LOOP
  IF has_function_privilege('anon',p,'EXECUTE') OR has_function_privilege('authenticated',p,'EXECUTE') THEN RAISE EXCEPTION 'FAIL service RPC exposed: %',p; END IF;
 END LOOP;
END $$;
ROLLBACK;
SELECT 'Asaas payment SQL contract passed; fixtures rolled back' AS result;
