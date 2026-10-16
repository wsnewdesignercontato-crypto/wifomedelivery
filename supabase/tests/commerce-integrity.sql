-- Run with psql -v ON_ERROR_STOP=1. All fixtures are rolled back.
BEGIN;
CREATE TEMP TABLE commerce_ids(kind text PRIMARY KEY, id uuid DEFAULT gen_random_uuid());
GRANT SELECT ON commerce_ids TO authenticated;
INSERT INTO commerce_ids(kind) VALUES ('customer'),('merchant'),('courier'),('outsider'),('admin'),('store'),('product'),('key');
INSERT INTO auth.users(id,email,raw_user_meta_data)
 SELECT id,'commerce-contract-'||id||'@example.invalid','{"nome":"Commerce contract"}'::jsonb
 FROM commerce_ids WHERE kind IN ('customer','merchant','courier','outsider','admin');
UPDATE public.profiles SET telefone='31999999999' WHERE id=(SELECT id FROM commerce_ids WHERE kind='customer');
INSERT INTO public.addresses(user_id,rua,cidade,is_default) VALUES((SELECT id FROM commerce_ids WHERE kind='customer'),'Test street','Test city',true);
INSERT INTO public.user_roles(user_id,role) SELECT id,'admin' FROM commerce_ids WHERE kind='admin';
INSERT INTO public.establishments(id,owner_id,nome,status,is_open,cidade,taxa_entrega_cents,kyc_status,pix_key,banco_titular)
 VALUES ((SELECT id FROM commerce_ids WHERE kind='store'),(SELECT id FROM commerce_ids WHERE kind='merchant'),'Commerce contract','aprovado',true,'Test city',500,'aprovado','fixture@example.invalid','Fixture');
INSERT INTO public.products(id,establishment_id,nome,preco_cents,disponivel)
 VALUES ((SELECT id FROM commerce_ids WHERE kind='product'),(SELECT id FROM commerce_ids WHERE kind='store'),'Real catalog name',1200,true);
INSERT INTO public.courier_profiles(user_id,aprovacao,kyc_status,pix_key)
 VALUES ((SELECT id FROM commerce_ids WHERE kind='courier'),'aprovado','aprovado','fixture@example.invalid');
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade)
 VALUES ((SELECT id FROM commerce_ids WHERE kind='customer'),(SELECT id FROM commerce_ids WHERE kind='store'),(SELECT id FROM commerce_ids WHERE kind='product'),'Forged name',1,2);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM commerce_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ DECLARE result jsonb; repeated jsonb; BEGIN
 result := public.checkout_order((SELECT id FROM commerce_ids WHERE kind='store'),(SELECT id FROM commerce_ids WHERE kind='key'),'dinheiro','pickup',NULL,NULL,NULL);
 IF (result->>'total_cents')::int <> 2400 THEN RAISE EXCEPTION 'Checkout trusted forged cart price'; END IF;
 repeated := public.checkout_order((SELECT id FROM commerce_ids WHERE kind='store'),(SELECT id FROM commerce_ids WHERE kind='key'),'dinheiro','pickup',NULL,NULL,NULL);
 IF repeated <> result THEN RAISE EXCEPTION 'Retry duplicated checkout'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id=(result->>'order_id')::uuid AND nome_snapshot='Real catalog name' AND preco_unit_cents=1200 AND quantidade=2) THEN RAISE EXCEPTION 'Missing immutable catalog snapshot'; END IF;
 BEGIN
  PERFORM public.checkout_order((SELECT id FROM commerce_ids WHERE kind='store'),(SELECT id FROM commerce_ids WHERE kind='key'),'pix','pickup',NULL,NULL,NULL);
  RAISE EXCEPTION 'Changed request reused idempotency key';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  INSERT INTO public.orders(cliente_id,establishment_id,status,total_cents) VALUES(auth.uid(),(SELECT id FROM commerce_ids WHERE kind='store'),'delivered',1);
  RAISE EXCEPTION 'Direct forged order permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM set_config('app.order_write_context','checkout',true);
  INSERT INTO public.orders(cliente_id,establishment_id,status,total_cents) VALUES(auth.uid(),(SELECT id FROM commerce_ids WHERE kind='store'),'placed',1);
  RAISE EXCEPTION 'Forged checkout context permitted direct order';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.order_items SET preco_unit_cents=1 WHERE order_id=(result->>'order_id')::uuid;
  RAISE EXCEPTION 'Direct item update permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.checkout_order((SELECT id FROM commerce_ids WHERE kind='store'),gen_random_uuid(),'carteira','pickup',NULL,NULL,NULL);
  RAISE EXCEPTION 'Unfunded consumer wallet accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM commerce_ids WHERE kind='merchant'),'role','authenticated')::text,true);
DO $$ BEGIN
 BEGIN
  UPDATE public.orders SET total_cents=1 WHERE establishment_id=(SELECT id FROM commerce_ids WHERE kind='store');
  RAISE EXCEPTION 'Merchant changed financial fields';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.establishment_withdrawals(establishment_id,requested_by,valor_cents,status)
   VALUES((SELECT id FROM commerce_ids WHERE kind='store'),auth.uid(),1000000,'pago');
  RAISE EXCEPTION 'Direct paid withdrawal accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.request_withdrawal('merchant',500,(SELECT id FROM commerce_ids WHERE kind='store'),gen_random_uuid());
  RAISE EXCEPTION 'Withdrawal without settled funds accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 INSERT INTO public.coupons(code,type,percent,establishment_id) VALUES ('CONTRACT-'||gen_random_uuid(),'percent',10,(SELECT id FROM commerce_ids WHERE kind='store'));
 BEGIN
  INSERT INTO public.coupons(code,type,percent) VALUES ('GLOBAL-'||gen_random_uuid(),'percent',10);
  RAISE EXCEPTION 'Merchant created global coupon';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO commerce_ids(kind) VALUES('store_discount'),('platform_discount');
INSERT INTO public.orders(id,cliente_id,establishment_id,status,subtotal_cents,frete_cents,desconto_cents,total_cents,commission_cents,coupon_funder,forma_pagamento,tipo_entrega)
 SELECT id,(SELECT id FROM commerce_ids WHERE kind='customer'),(SELECT id FROM commerce_ids WHERE kind='store'),'on_the_way',10000,500,3000,7500,1500,CASE WHEN kind='store_discount' THEN 'merchant' ELSE 'platform' END,'dinheiro','delivery'
 FROM commerce_ids WHERE kind IN ('store_discount','platform_discount');
INSERT INTO public.deliveries(order_id,entregador_id,status)
 SELECT id,(SELECT id FROM commerce_ids WHERE kind='courier'),'to_customer' FROM commerce_ids WHERE kind IN ('store_discount','platform_discount');
UPDATE public.orders SET status='delivered' WHERE id IN (SELECT id FROM commerce_ids WHERE kind IN ('store_discount','platform_discount'));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.platform_ledger WHERE order_id=(SELECT id FROM commerce_ids WHERE kind='store_discount') AND merchant_payout_cents=5500 AND courier_payout_cents=500 AND platform_revenue_cents=1500 AND status='pending') THEN RAISE EXCEPTION 'Store-funded discount allocation incorrect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_ledger WHERE order_id=(SELECT id FROM commerce_ids WHERE kind='platform_discount') AND merchant_payout_cents=8500 AND courier_payout_cents=500 AND platform_revenue_cents=-1500 AND status='pending') THEN RAISE EXCEPTION 'Platform-funded discount allocation incorrect'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_ledger WHERE order_id IN(SELECT id FROM commerce_ids WHERE kind IN ('store_discount','platform_discount')) AND gross_cents<>merchant_payout_cents+courier_payout_cents+platform_revenue_cents) THEN RAISE EXCEPTION 'Unbalanced ledger'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM commerce_ids WHERE kind='merchant'),'role','authenticated')::text,true);
DO $$ BEGIN
 BEGIN
  PERFORM public.settle_order_payment((SELECT id FROM commerce_ids WHERE kind='store_discount'),'forged receipt');
  RAISE EXCEPTION 'Merchant settled their own receipt';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.orders SET status='refunded' WHERE id=(SELECT id FROM commerce_ids WHERE kind='store_discount');
  RAISE EXCEPTION 'Merchant forged refund';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM commerce_ids WHERE kind='admin'),'role','authenticated')::text,true);
SELECT public.settle_order_payment((SELECT id FROM commerce_ids WHERE kind='store_discount'),'Manual contract receipt');
SELECT public.settle_order_payment((SELECT id FROM commerce_ids WHERE kind='store_discount'),'Duplicate request');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
-- Display pagination must not truncate wallet balances.
INSERT INTO public.platform_ledger(order_id,establishment_id,courier_id,gross_cents,commission_cents,delivery_fee_cents,courier_payout_cents,merchant_payout_cents,platform_revenue_cents,status)
 SELECT (SELECT id FROM commerce_ids WHERE kind='store_discount'),(SELECT id FROM commerce_ids WHERE kind='store'),(SELECT id FROM commerce_ids WHERE kind='courier'),200,0,100,100,100,0,'paid' FROM generate_series(1,105);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM commerce_ids WHERE kind='merchant'),'role','authenticated')::text,true);
DO $$ DECLARE balance jsonb; wid uuid; BEGIN
 balance:=public.wallet_summary('merchant',(SELECT id FROM commerce_ids WHERE kind='store'));
 IF (balance->>'available_cents')::int<>16000 OR (balance->>'pending_cents')::int<>8500 THEN RAISE EXCEPTION 'Wallet must aggregate complete history and distinguish pending'; END IF;
 wid:=public.request_withdrawal('merchant',5000,(SELECT id FROM commerce_ids WHERE kind='store'),(SELECT id FROM commerce_ids WHERE kind='key'));
 IF public.request_withdrawal('merchant',5000,(SELECT id FROM commerce_ids WHERE kind='store'),(SELECT id FROM commerce_ids WHERE kind='key'))<>wid THEN RAISE EXCEPTION 'Withdrawal retry duplicated the request'; END IF;
 IF (public.wallet_summary('merchant',(SELECT id FROM commerce_ids WHERE kind='store'))->>'available_cents')::int<>11000 THEN RAISE EXCEPTION 'Retry reserved funds twice even with sufficient balance'; END IF;
 PERFORM public.request_withdrawal('merchant',10500,(SELECT id FROM commerce_ids WHERE kind='store'),gen_random_uuid());
 IF (public.wallet_summary('merchant',(SELECT id FROM commerce_ids WHERE kind='store'))->>'available_cents')::int<>500 THEN RAISE EXCEPTION 'Requested withdrawal did not reserve funds'; END IF;
 BEGIN
  PERFORM public.request_withdrawal('merchant',1000,(SELECT id FROM commerce_ids WHERE kind='store'),gen_random_uuid());
  RAISE EXCEPTION 'Repeated withdrawal exceeded balance';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM commerce_ids WHERE kind='courier'),'role','authenticated')::text,true);
DO $$ BEGIN
 IF (public.wallet_summary('courier',NULL)->>'available_cents')::int<>11000 THEN RAISE EXCEPTION 'Courier full-history amount incorrect'; END IF;
 PERFORM public.request_withdrawal('courier',11000,NULL,gen_random_uuid());
 IF (public.wallet_summary('courier',NULL)->>'available_cents')::int<>0 THEN RAISE EXCEPTION 'Courier withdrawal did not reserve funds'; END IF;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM commerce_ids WHERE kind='admin'),'role','authenticated')::text,true);
SELECT public.record_order_refund((SELECT id FROM commerce_ids WHERE kind='store_discount'),'Manual refund contract');
SELECT public.record_order_refund((SELECT id FROM commerce_ids WHERE kind='store_discount'),'Repeated refund');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.platform_ledger WHERE order_id=(SELECT id FROM commerce_ids WHERE kind='store_discount') AND status<>'reversed') THEN RAISE EXCEPTION 'Refund did not reverse all affected earnings'; END IF;
 IF (SELECT count(*) FROM public.admin_audit_log WHERE entity_id=(SELECT id::text FROM commerce_ids WHERE kind='store_discount') AND action='record_manual_full_refund')<>1 THEN RAISE EXCEPTION 'Refund must be idempotent and audited'; END IF;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM commerce_ids WHERE kind='merchant'),'role','authenticated')::text,true);
DO $$ BEGIN
 IF (public.wallet_summary('merchant',(SELECT id FROM commerce_ids WHERE kind='store'))->>'available_cents')::int<>0 THEN RAISE EXCEPTION 'Reversed funds remained withdrawable'; END IF;
 BEGIN
  PERFORM public.record_order_refund((SELECT id FROM commerce_ids WHERE kind='platform_discount'),'Forged refund');
  RAISE EXCEPTION 'Merchant recorded an administrative refund';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Commerce integrity contracts passed; fixtures rolled back' AS result;
