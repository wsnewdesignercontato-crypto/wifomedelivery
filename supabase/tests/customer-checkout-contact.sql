BEGIN;
CREATE TEMP TABLE contact_ids(kind text PRIMARY KEY,id uuid DEFAULT gen_random_uuid());
GRANT SELECT ON contact_ids TO anon,authenticated;
INSERT INTO contact_ids(kind) VALUES('customer'),('owner'),('store'),('product');
INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT id,'checkout-contact-'||id||'@example.invalid','{}' FROM contact_ids WHERE kind IN('customer','owner');
INSERT INTO public.establishments(id,owner_id,nome,status,is_open) VALUES((SELECT id FROM contact_ids WHERE kind='store'),(SELECT id FROM contact_ids WHERE kind='owner'),'Visitor store','aprovado',true);
INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque,disponivel) VALUES((SELECT id FROM contact_ids WHERE kind='product'),(SELECT id FROM contact_ids WHERE kind='store'),'Public product',500,5,true);
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES((SELECT id FROM contact_ids WHERE kind='customer'),(SELECT id FROM contact_ids WHERE kind='store'),(SELECT id FROM contact_ids WHERE kind='product'),'Public product',500,1);
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.establishments WHERE id=(SELECT id FROM contact_ids WHERE kind='store')) OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=(SELECT id FROM contact_ids WHERE kind='product')) THEN RAISE EXCEPTION 'Visitor cannot browse approved catalog'; END IF;
 PERFORM public.public_store_sales();
 BEGIN
  PERFORM banco_conta FROM public.establishments;
  RAISE EXCEPTION 'Visitor can read banking data';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM id FROM public.orders;
  RAISE EXCEPTION 'Visitor can read orders';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.checkout_order((SELECT id FROM contact_ids WHERE kind='store'),gen_random_uuid(),'pix','pickup');
  RAISE EXCEPTION 'Visitor checked out without login';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM contact_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ BEGIN
 BEGIN
  PERFORM public.checkout_order((SELECT id FROM contact_ids WHERE kind='store'),gen_random_uuid(),'pix','pickup');
  RAISE EXCEPTION 'Checkout accepted missing phone and address';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
UPDATE public.profiles SET telefone='(31) 99999-9999' WHERE id=auth.uid();
DO $$ BEGIN
 BEGIN
  PERFORM public.checkout_order((SELECT id FROM contact_ids WHERE kind='store'),gen_random_uuid(),'pix','pickup');
  RAISE EXCEPTION 'Checkout accepted missing address';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
INSERT INTO public.addresses(user_id,rua,cidade,is_default) VALUES(auth.uid(),'Rua de teste','Cidade teste',true);
DO $$ DECLARE result jsonb; BEGIN
 result:=public.checkout_order((SELECT id FROM contact_ids WHERE kind='store'),gen_random_uuid(),'pix','pickup',NULL,NULL,NULL,500);
 IF (result->>'total_cents')::int<>500 THEN RAISE EXCEPTION 'Complete contact details did not unlock purchase'; END IF;
 IF (SELECT count(*) FROM public.orders WHERE cliente_id=auth.uid())<>1 THEN RAISE EXCEPTION 'Rejected checkouts created an order'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Visitor/contact contracts passed; fixtures rolled back' AS result;
