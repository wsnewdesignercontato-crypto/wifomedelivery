-- Synthetic identities and orders only. Always rolls back; sends no real charge.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE cc_ids(kind text PRIMARY KEY,id uuid DEFAULT gen_random_uuid());
INSERT INTO cc_ids(kind) VALUES('admin'),('merchant'),('other'),('customer'),('store'),('second_store'),('product'),('coupon'),('key');
GRANT SELECT ON cc_ids TO authenticated,anon;
INSERT INTO auth.users(id,email,email_confirmed_at)
SELECT id,'coupon-contract-'||id||'@example.invalid',now() FROM cc_ids WHERE kind IN('admin','merchant','other','customer');
INSERT INTO public.user_roles(user_id,role) SELECT id,'admin' FROM cc_ids WHERE kind='admin' ON CONFLICT DO NOTHING;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM cc_ids WHERE kind='admin'),true);
INSERT INTO public.profiles(id,nome,telefone)
SELECT id,'Coupon contract','31999999999' FROM cc_ids WHERE kind='customer'
ON CONFLICT(id) DO UPDATE SET telefone=excluded.telefone;
INSERT INTO public.addresses(user_id,rua,cidade,is_default) VALUES((SELECT id FROM cc_ids WHERE kind='customer'),'Fixture street','Test city',true);
INSERT INTO public.establishments(id,owner_id,nome,status,is_open,cidade,taxa_entrega_cents) VALUES
((SELECT id FROM cc_ids WHERE kind='store'),(SELECT id FROM cc_ids WHERE kind='merchant'),'Coupon contract','aprovado',true,'Test city',900),
((SELECT id FROM cc_ids WHERE kind='second_store'),(SELECT id FROM cc_ids WHERE kind='other'),'Coupon other','aprovado',true,'Test city',900);
INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque,disponivel)
VALUES((SELECT id FROM cc_ids WHERE kind='product'),(SELECT id FROM cc_ids WHERE kind='store'),'Coupon product',10000,10,true);
INSERT INTO public.coupons(id,code,type,percent,ativo)
VALUES((SELECT id FROM cc_ids WHERE kind='coupon'),'QA-'||(SELECT id FROM cc_ids WHERE kind='coupon'),'percent',15,true);
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade)
VALUES((SELECT id FROM cc_ids WHERE kind='customer'),(SELECT id FROM cc_ids WHERE kind='store'),(SELECT id FROM cc_ids WHERE kind='product'),'Coupon product',1,1);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM cc_ids WHERE kind='customer'),true);
DO $$ BEGIN
 BEGIN
  PERFORM public.quote_order((SELECT id FROM cc_ids WHERE kind='store'),gen_random_uuid(),'pix','pickup',NULL,NULL,'QA-'||(SELECT id FROM cc_ids WHERE kind='coupon'));
  RAISE EXCEPTION 'FAIL coupon accepted without merchant consent';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM cc_ids WHERE kind='other'),true);
DO $$ BEGIN
 BEGIN
  PERFORM public.set_coupon_participation((SELECT id FROM cc_ids WHERE kind='store'),(SELECT id FROM cc_ids WHERE kind='coupon'),gen_random_uuid(),true);
  RAISE EXCEPTION 'FAIL another store changed participation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM cc_ids WHERE kind='merchant'),true);
DO $$ DECLARE campaigns jsonb; rev uuid; BEGIN
 campaigns:=public.merchant_coupon_campaigns((SELECT id FROM cc_ids WHERE kind='store'));
 SELECT (c->>'campaign_revision')::uuid INTO rev FROM jsonb_array_elements(campaigns) c WHERE c->>'id'=(SELECT id::text FROM cc_ids WHERE kind='coupon');
 PERFORM public.set_coupon_participation((SELECT id FROM cc_ids WHERE kind='store'),(SELECT id FROM cc_ids WHERE kind='coupon'),rev,true);
 BEGIN INSERT INTO public.coupons(code,type,percent) VALUES('FORGED-'||gen_random_uuid(),'percent',20);
  RAISE EXCEPTION 'FAIL merchant created a coupon'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM cc_ids WHERE kind='customer'),true);
DO $$ DECLARE quote jsonb; created jsonb; BEGIN
 quote:=public.quote_order((SELECT id FROM cc_ids WHERE kind='store'),gen_random_uuid(),'pix','pickup',NULL,NULL,'QA-'||(SELECT id FROM cc_ids WHERE kind='coupon'));
 IF quote->>'total_cents'<>'8500' OR quote->>'desconto_cents'<>'1500' THEN RAISE EXCEPTION 'FAIL authoritative quote %',quote; END IF;
 IF EXISTS(SELECT FROM public.customer_coupon_offers(ARRAY[(SELECT id FROM cc_ids WHERE kind='second_store')])) THEN RAISE EXCEPTION 'FAIL opted-out store offer'; END IF;
 created:=public.checkout_order((SELECT id FROM cc_ids WHERE kind='store'),(SELECT id FROM cc_ids WHERE kind='key'),'pix','pickup',NULL,NULL,'QA-'||(SELECT id FROM cc_ids WHERE kind='coupon'),8500,false);
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM public.orders WHERE checkout_key=(SELECT id FROM cc_ids WHERE kind='key') AND coupon_funder='merchant' AND discount_funder='establishment' AND total_cents=8500 AND coupon_campaign_revision IS NOT NULL)
 THEN RAISE EXCEPTION 'FAIL merchant funding snapshot'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM cc_ids WHERE kind='admin'),true);
UPDATE public.coupons SET percent=20 WHERE id=(SELECT id FROM cc_ids WHERE kind='coupon');
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM cc_ids WHERE kind='customer'),true);
DO $$ BEGIN
 IF EXISTS(SELECT FROM public.customer_coupon_offers(ARRAY[(SELECT id FROM cc_ids WHERE kind='store')])) THEN RAISE EXCEPTION 'FAIL old acceptance survived new terms'; END IF;
 IF(public.checkout_order((SELECT id FROM cc_ids WHERE kind='store'),(SELECT id FROM cc_ids WHERE kind='key'),'pix','pickup',NULL,NULL,'QA-'||(SELECT id FROM cc_ids WHERE kind='coupon'),8500,false)->>'total_cents')<>'8500'
 THEN RAISE EXCEPTION 'FAIL retry changed a confirmed order'; END IF;
END $$;
RESET ROLE;
SELECT 'coupon campaign contracts passed; all synthetic data rolled back' AS result;
ROLLBACK;
