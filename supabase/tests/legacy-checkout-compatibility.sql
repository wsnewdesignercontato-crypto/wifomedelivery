-- Already-loaded versions may keep calling the published quote/submit RPCs during rollout.
BEGIN;
CREATE TEMP TABLE compatibility_ids(kind text PRIMARY KEY,id uuid DEFAULT gen_random_uuid());
GRANT SELECT ON compatibility_ids TO authenticated;
INSERT INTO compatibility_ids(kind) VALUES('customer'),('owner'),('store'),('product'),('coupon'),('key');
INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT id,'compat-'||id||'@example.invalid','{}' FROM compatibility_ids WHERE kind IN('customer','owner');
UPDATE public.profiles SET telefone='31999999999' WHERE id=(SELECT id FROM compatibility_ids WHERE kind='customer');
INSERT INTO public.addresses(user_id,rua,cidade,is_default) VALUES((SELECT id FROM compatibility_ids WHERE kind='customer'),'Test street','Test city',true);
INSERT INTO public.establishments(id,owner_id,nome,status,is_open) VALUES((SELECT id FROM compatibility_ids WHERE kind='store'),(SELECT id FROM compatibility_ids WHERE kind='owner'),'Compatibility store','aprovado',true);
INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque,disponivel) VALUES((SELECT id FROM compatibility_ids WHERE kind='product'),(SELECT id FROM compatibility_ids WHERE kind='store'),'Compatibility product',750,5,true);
INSERT INTO public.coupons(id,code,type,percent,usage_limit,establishment_id) VALUES((SELECT id FROM compatibility_ids WHERE kind='coupon'),'COMP-'||(SELECT id FROM compatibility_ids WHERE kind='coupon'),'percent',20,1,(SELECT id FROM compatibility_ids WHERE kind='store'));
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES((SELECT id FROM compatibility_ids WHERE kind='customer'),(SELECT id FROM compatibility_ids WHERE kind='store'),(SELECT id FROM compatibility_ids WHERE kind='product'),'Forged',1,2);
UPDATE public.platform_settings SET maintenance_mode=true WHERE id=1;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM compatibility_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ DECLARE q jsonb; BEGIN
 q:=public.quote_checkout((SELECT id FROM compatibility_ids WHERE kind='store'),'pickup',NULL);
 BEGIN
  PERFORM public.submit_checkout((SELECT id FROM compatibility_ids WHERE kind='store'),'pix','pickup',NULL,NULL,NULL,gen_random_uuid(),q->>'fingerprint');
  RAISE EXCEPTION 'Legacy checkout bypassed maintenance';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.platform_settings SET maintenance_mode=false WHERE id=1;
UPDATE public.establishments SET cidade='Test city' WHERE id=(SELECT id FROM compatibility_ids WHERE kind='store');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM compatibility_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ DECLARE q jsonb; BEGIN
 q:=public.quote_checkout((SELECT id FROM compatibility_ids WHERE kind='store'),'delivery',NULL);
 BEGIN
  PERFORM public.submit_checkout((SELECT id FROM compatibility_ids WHERE kind='store'),'pix','delivery','{"rua":"Test street","cidade":"Other city"}',NULL,NULL,gen_random_uuid(),q->>'fingerprint');
  RAISE EXCEPTION 'Legacy checkout bypassed delivery city';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.establishment_delivery_zones(establishment_id,nome,bairro,taxa_cents,ativo) VALUES((SELECT id FROM compatibility_ids WHERE kind='store'),'Test area','Covered neighborhood',500,true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM compatibility_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ DECLARE q jsonb; BEGIN
 q:=public.quote_checkout((SELECT id FROM compatibility_ids WHERE kind='store'),'delivery',NULL);
 BEGIN
  PERFORM public.submit_checkout((SELECT id FROM compatibility_ids WHERE kind='store'),'pix','delivery','{"rua":"Test street","cidade":"Test city","bairro":"Outside"}',NULL,NULL,gen_random_uuid(),q->>'fingerprint');
  RAISE EXCEPTION 'Legacy checkout bypassed configured delivery zones';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DELETE FROM public.establishment_delivery_zones WHERE establishment_id=(SELECT id FROM compatibility_ids WHERE kind='store');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM compatibility_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ DECLARE q jsonb; result jsonb; repeated jsonb; code text:='COMP-'||(SELECT id FROM compatibility_ids WHERE kind='coupon'); BEGIN
 q:=public.quote_checkout((SELECT id FROM compatibility_ids WHERE kind='store'),'pickup',code);
 IF (q->>'total_cents')::int<>1200 THEN RAISE EXCEPTION 'Published quote RPC changed unexpectedly'; END IF;
 result:=public.submit_checkout((SELECT id FROM compatibility_ids WHERE kind='store'),'pix','pickup',NULL,NULL,code,(SELECT id FROM compatibility_ids WHERE kind='key'),q->>'fingerprint');
 repeated:=public.submit_checkout((SELECT id FROM compatibility_ids WHERE kind='store'),'pix','pickup',NULL,NULL,code,(SELECT id FROM compatibility_ids WHERE kind='key'),q->>'fingerprint');
 IF result<>repeated OR (result->>'total_cents')::int<>1200 THEN RAISE EXCEPTION 'Published submit RPC lost compatibility or idempotency'; END IF;
 IF public.get_order_delivery_code((result->>'order_id')::uuid)->>'codigo_entrega' IS NULL THEN RAISE EXCEPTION 'Legacy order missing private confirmation code'; END IF;
 UPDATE public.orders SET status='cancelled' WHERE id=(result->>'order_id')::uuid;
 UPDATE public.orders SET status='cancelled' WHERE id=(result->>'order_id')::uuid;
 IF (SELECT estoque FROM public.products WHERE id=(SELECT id FROM compatibility_ids WHERE kind='product'))<>5 OR (SELECT used_count FROM public.coupons WHERE id=(SELECT id FROM compatibility_ids WHERE kind='coupon'))<>0 THEN RAISE EXCEPTION 'Compatibility cancellation restored inventory/coupon incorrectly'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE checkout_key=(SELECT id FROM compatibility_ids WHERE kind='key') AND coupon_funder='merchant') THEN RAISE EXCEPTION 'Legacy discount funding was lost'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{}',true);
-- This shape existed before coupon_funder/commission_cents were introduced.
INSERT INTO public.orders(cliente_id,establishment_id,status,subtotal_cents,frete_cents,desconto_cents,total_cents,forma_pagamento,tipo_entrega,discount_funder)
VALUES((SELECT id FROM compatibility_ids WHERE kind='customer'),(SELECT id FROM compatibility_ids WHERE kind='store'),'ready',1000,0,200,800,'pix','pickup','establishment');
UPDATE public.orders SET status='delivered' WHERE establishment_id=(SELECT id FROM compatibility_ids WHERE kind='store') AND checkout_key IS NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.platform_ledger l JOIN public.orders o ON o.id=l.order_id WHERE o.establishment_id=(SELECT id FROM compatibility_ids WHERE kind='store') AND o.checkout_key IS NULL AND l.merchant_payout_cents=1000-l.commission_cents-200 AND l.platform_revenue_cents=l.commission_cents AND l.discount_funder='establishment') THEN RAISE EXCEPTION 'Pre-migration store coupon was charged to platform'; END IF;
END $$;
ROLLBACK;
SELECT 'Published checkout compatibility passed; fixtures rolled back' AS result;
