BEGIN;
CREATE TEMP TABLE lifecycle_ids(kind text PRIMARY KEY,id uuid DEFAULT gen_random_uuid());
GRANT SELECT ON lifecycle_ids TO authenticated;
INSERT INTO lifecycle_ids(kind) VALUES('customer'),('merchant'),('store'),('product'),('group'),('addon'),('coupon'),('key');
INSERT INTO auth.users(id,email,raw_user_meta_data)
 SELECT id,'lifecycle-'||id||'@example.invalid','{}' FROM lifecycle_ids WHERE kind IN('customer','merchant');
UPDATE public.profiles SET telefone='31999999999' WHERE id=(SELECT id FROM lifecycle_ids WHERE kind='customer');
INSERT INTO public.addresses(user_id,rua,cidade,is_default) VALUES((SELECT id FROM lifecycle_ids WHERE kind='customer'),'Test street','Test city',true);
INSERT INTO public.establishments(id,owner_id,nome,status,is_open,cidade,taxa_entrega_cents)
 VALUES((SELECT id FROM lifecycle_ids WHERE kind='store'),(SELECT id FROM lifecycle_ids WHERE kind='merchant'),'Lifecycle store','aprovado',true,'Test city',500);
INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque,disponivel)
 VALUES((SELECT id FROM lifecycle_ids WHERE kind='product'),(SELECT id FROM lifecycle_ids WHERE kind='store'),'Catalog product',1000,2,true);
INSERT INTO public.addon_groups(id,establishment_id,nome,obrigatorio,minimo,maximo,ativo)
 VALUES((SELECT id FROM lifecycle_ids WHERE kind='group'),(SELECT id FROM lifecycle_ids WHERE kind='store'),'Required group',true,1,1,true);
INSERT INTO public.product_addon_groups(product_id,addon_group_id) VALUES((SELECT id FROM lifecycle_ids WHERE kind='product'),(SELECT id FROM lifecycle_ids WHERE kind='group'));
INSERT INTO public.addons(id,addon_group_id,nome,preco_extra_cents,estoque,ativo)
 VALUES((SELECT id FROM lifecycle_ids WHERE kind='addon'),(SELECT id FROM lifecycle_ids WHERE kind='group'),'Catalog addon',200,4,true);
INSERT INTO public.coupons(id,establishment_id,code,type,percent,usage_limit)
 VALUES((SELECT id FROM lifecycle_ids WHERE kind='coupon'),(SELECT id FROM lifecycle_ids WHERE kind='store'),'LIFE-'||(SELECT id FROM lifecycle_ids WHERE kind='coupon'),'percent',10,1);
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade,addons)
 VALUES((SELECT id FROM lifecycle_ids WHERE kind='customer'),(SELECT id FROM lifecycle_ids WHERE kind='store'),(SELECT id FROM lifecycle_ids WHERE kind='product'),'Forged',1,2,jsonb_build_array(jsonb_build_object('id',(SELECT id FROM lifecycle_ids WHERE kind='addon'),'preco_extra_cents',1)));
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM lifecycle_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ DECLARE result jsonb; oid uuid; coupon_code text:='LIFE-'||(SELECT id FROM lifecycle_ids WHERE kind='coupon'); BEGIN
 result:=public.quote_order((SELECT id FROM lifecycle_ids WHERE kind='store'),gen_random_uuid(),'pix','delivery','{"rua":"Test street","cidade":"Test city"}',NULL,coupon_code);
 IF (result->>'subtotal_cents')::int<>2400 OR (result->>'total_cents')::int<>2660 THEN RAISE EXCEPTION 'Quote must use catalog addons/freight/discount'; END IF;
 IF EXISTS(SELECT 1 FROM public.orders WHERE cliente_id=auth.uid()) OR (SELECT estoque FROM public.products WHERE id=(SELECT id FROM lifecycle_ids WHERE kind='product'))<>2 OR (SELECT used_count FROM public.coupons WHERE id=(SELECT id FROM lifecycle_ids WHERE kind='coupon'))<>0 THEN RAISE EXCEPTION 'Quote changed data'; END IF;
 BEGIN
  PERFORM public.checkout_order((SELECT id FROM lifecycle_ids WHERE kind='store'),(SELECT id FROM lifecycle_ids WHERE kind='key'),'pix','delivery','{"rua":"Test street","cidade":"Test city"}',NULL,coupon_code,100);
  RAISE EXCEPTION 'Checkout accepted a different confirmed total';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 result:=public.checkout_order((SELECT id FROM lifecycle_ids WHERE kind='store'),(SELECT id FROM lifecycle_ids WHERE kind='key'),'pix','delivery','{"rua":"Test street","cidade":"Test city"}',NULL,coupon_code,2660);
 oid:=(result->>'order_id')::uuid;
 IF (SELECT used_count FROM public.coupons WHERE id=(SELECT id FROM lifecycle_ids WHERE kind='coupon'))<>1 OR (SELECT estoque FROM public.products WHERE id=(SELECT id FROM lifecycle_ids WHERE kind='product'))<>0 OR (SELECT estoque FROM public.addons WHERE id=(SELECT id FROM lifecycle_ids WHERE kind='addon'))<>2 THEN RAISE EXCEPTION 'Checkout must consume stock and coupon once'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_items WHERE order_id=oid AND preco_unit_cents=1200 AND addons->0->>'nome'='Catalog addon' AND (addons->0->>'preco_extra_cents')::int=200) THEN RAISE EXCEPTION 'Addon snapshot forged'; END IF;
 UPDATE public.orders SET status='cancelled' WHERE id=oid;
 UPDATE public.orders SET status='cancelled' WHERE id=oid;
 IF (SELECT estoque FROM public.products WHERE id=(SELECT id FROM lifecycle_ids WHERE kind='product'))<>2 OR (SELECT estoque FROM public.addons WHERE id=(SELECT id FROM lifecycle_ids WHERE kind='addon'))<>4 THEN RAISE EXCEPTION 'Cancellation did not restore stock exactly once'; END IF;
 IF (SELECT used_count FROM public.coupons WHERE id=(SELECT id FROM lifecycle_ids WHERE kind='coupon'))<>0 THEN RAISE EXCEPTION 'Cancellation did not return the coupon reservation'; END IF;
 INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade,addons)
 VALUES(auth.uid(),(SELECT id FROM lifecycle_ids WHERE kind='store'),(SELECT id FROM lifecycle_ids WHERE kind='product'),'Forged',1,1,jsonb_build_array(jsonb_build_object('id',(SELECT id FROM lifecycle_ids WHERE kind='addon'))));
 UPDATE public.cart_items SET addons='[]' WHERE user_id=auth.uid();
 BEGIN
  PERFORM public.checkout_order((SELECT id FROM lifecycle_ids WHERE kind='store'),gen_random_uuid(),'pix','pickup',NULL,NULL,NULL);
  RAISE EXCEPTION 'Required addon omitted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 DELETE FROM public.cart_items WHERE user_id=auth.uid();
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM lifecycle_ids WHERE kind='merchant'),'role','authenticated')::text,true);
DELETE FROM public.products WHERE id=(SELECT id FROM lifecycle_ids WHERE kind='product');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.order_items WHERE product_id=(SELECT id FROM lifecycle_ids WHERE kind='product')) OR NOT EXISTS(SELECT 1 FROM public.order_items WHERE nome_snapshot='Catalog product' AND preco_unit_cents=1200 AND product_id IS NULL) THEN RAISE EXCEPTION 'Sold product deletion lost receipt snapshot'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Checkout lifecycle contracts passed; fixtures rolled back' AS result;
