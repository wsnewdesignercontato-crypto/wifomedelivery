-- Temporary fixtures, full delivery and acceptance-timeout contract. All changes roll back.
BEGIN;
-- Full-schema integration contract. Run after the atomic delivery migration.
-- Fixtures, test triggers, users, codes, ledger entries and orders all roll back.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT set_config('request.jwt.claim.sub','',true);
CREATE TEMP TABLE atomic_delivery_ids(kind text PRIMARY KEY,id uuid DEFAULT gen_random_uuid());
GRANT SELECT,UPDATE ON atomic_delivery_ids TO authenticated;
INSERT INTO atomic_delivery_ids(kind) VALUES('admin'),('owner'),('customer'),('courier'),('other_courier'),('unapproved'),('store'),('product'),('order'),('delivery'),('key');
INSERT INTO auth.users(id,email,raw_user_meta_data)
 SELECT id,'atomic-delivery-'||id||'@example.invalid','{"nome":"Atomic delivery contract"}'::jsonb
 FROM atomic_delivery_ids WHERE kind IN ('admin','owner','customer','courier','other_courier','unapproved');
INSERT INTO public.user_roles(user_id,role) SELECT id,'admin' FROM atomic_delivery_ids WHERE kind='admin';
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='admin'),'role','authenticated')::text,true);
UPDATE public.profiles SET telefone='31999999999' WHERE id IN(SELECT id FROM atomic_delivery_ids);
INSERT INTO public.addresses(user_id,rua,cidade,is_default)
 VALUES((SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'Contract street','Contract city',true);
INSERT INTO public.courier_profiles(user_id,status,aprovacao,kyc_status,telefone,cpf,cidade_atuacao)
 SELECT id,CASE WHEN kind='unapproved' THEN 'pendente' ELSE 'online' END::public.courier_status,
 CASE WHEN kind='unapproved' THEN 'pending' ELSE 'approved' END,
 CASE WHEN kind='unapproved' THEN 'pending' ELSE 'approved' END,'31999999999','12345678901','Contract city'
 FROM atomic_delivery_ids WHERE kind IN ('courier','other_courier','unapproved')
 ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,aprovacao=excluded.aprovacao,kyc_status=excluded.kyc_status;
INSERT INTO public.user_roles(user_id,role)
 SELECT id,'entregador' FROM atomic_delivery_ids WHERE kind IN ('courier','other_courier','unapproved') ON CONFLICT DO NOTHING;
INSERT INTO public.establishments(id,owner_id,nome,status,is_open,cidade,taxa_entrega_cents)
 VALUES((SELECT id FROM atomic_delivery_ids WHERE kind='store'),(SELECT id FROM atomic_delivery_ids WHERE kind='owner'),'Atomic delivery rollback contract','aprovado',true,'Contract city',500);
INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque,disponivel)
 VALUES((SELECT id FROM atomic_delivery_ids WHERE kind='product'),(SELECT id FROM atomic_delivery_ids WHERE kind='store'),'Contract product',1000,10,true);
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade)
 VALUES((SELECT id FROM atomic_delivery_ids WHERE kind='customer'),(SELECT id FROM atomic_delivery_ids WHERE kind='store'),(SELECT id FROM atomic_delivery_ids WHERE kind='product'),'Contract product',1000,1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ DECLARE result jsonb; BEGIN
 result:=public.checkout_order((SELECT id FROM atomic_delivery_ids WHERE kind='store'),(SELECT id FROM atomic_delivery_ids WHERE kind='key'),'pix','delivery','{"rua":"Contract street","cidade":"Contract city"}',NULL,NULL,1500);
 UPDATE atomic_delivery_ids SET id=(result->>'order_id')::uuid WHERE kind='order';
 BEGIN PERFORM public.dispatch_order_delivery((SELECT id FROM atomic_delivery_ids WHERE kind='order'),500,NULL); RAISE EXCEPTION 'FAIL customer dispatched'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='owner'),'role','authenticated')::text,true);
UPDATE public.orders SET status='accepted' WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='order');
UPDATE public.orders SET status='preparing' WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='order');
UPDATE public.orders SET status='ready' WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='order');
RESET ROLE;
CREATE FUNCTION public.atomic_delivery_contract_fail_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF current_setting('test.atomic_delivery_fail',true)='yes' THEN RAISE EXCEPTION 'injected_order_failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER atomic_delivery_contract_fail_order BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.atomic_delivery_contract_fail_order();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM set_config('test.atomic_delivery_fail','yes',true);
 BEGIN PERFORM public.dispatch_order_delivery((SELECT id FROM atomic_delivery_ids WHERE kind='order'),500,NULL); RAISE EXCEPTION 'FAIL dispatch did not throw'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected_order_failure' THEN RAISE; END IF; END;
 IF EXISTS(SELECT FROM public.deliveries WHERE order_id=(SELECT id FROM atomic_delivery_ids WHERE kind='order')) THEN RAISE EXCEPTION 'FAIL dispatch was partially committed'; END IF;
 PERFORM set_config('test.atomic_delivery_fail','no',true);
 PERFORM public.dispatch_order_delivery((SELECT id FROM atomic_delivery_ids WHERE kind='order'),999,NULL);
 UPDATE atomic_delivery_ids SET id=(SELECT id FROM public.deliveries WHERE order_id=(SELECT id FROM atomic_delivery_ids WHERE kind='order')) WHERE kind='delivery';
 IF public.dispatch_order_delivery((SELECT id FROM atomic_delivery_ids WHERE kind='order'),999,NULL)<>'exists' THEN RAISE EXCEPTION 'FAIL dispatch retry'; END IF;
 IF (SELECT valor_entrega_cents FROM public.deliveries WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='delivery'))<>500 THEN RAISE EXCEPTION 'FAIL stale caller fee replaced confirmed freight'; END IF;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='unapproved'),'role','authenticated')::text,true);
DO $$ BEGIN
 BEGIN PERFORM public.transition_courier_delivery((SELECT id FROM atomic_delivery_ids WHERE kind='delivery'),'accepted'); RAISE EXCEPTION 'FAIL unapproved acceptance'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='courier'),'role','authenticated')::text,true);
DO $$ DECLARE d uuid:=(SELECT id FROM atomic_delivery_ids WHERE kind='delivery'); BEGIN
 PERFORM set_config('test.atomic_delivery_fail','yes',true);
 BEGIN PERFORM public.transition_courier_delivery(d,'accepted'); RAISE EXCEPTION 'FAIL accept did not throw'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected_order_failure' THEN RAISE; END IF; END;
 IF EXISTS(SELECT FROM public.deliveries WHERE id=d AND (status<>'broadcasting' OR entregador_id IS NOT NULL OR aceito_em IS NOT NULL)) THEN RAISE EXCEPTION 'FAIL acceptance partially committed'; END IF;
 IF (SELECT status FROM public.courier_profiles WHERE user_id=auth.uid())<>'online' THEN RAISE EXCEPTION 'FAIL failed acceptance changed availability'; END IF;
 PERFORM set_config('test.atomic_delivery_fail','no',true);
 PERFORM public.transition_courier_delivery(d,'accepted');
 PERFORM public.transition_courier_delivery(d,'accepted');
 IF (SELECT status FROM public.orders WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='order'))<>'courier_assigned' OR (SELECT status FROM public.courier_profiles WHERE user_id=auth.uid())<>'ocupado' THEN RAISE EXCEPTION 'FAIL accept sync'; END IF;
 BEGIN PERFORM public.transition_courier_delivery(d,'picked_up'); RAISE EXCEPTION 'FAIL skipped stage'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.transition_courier_delivery(d,'to_store');
 PERFORM public.transition_courier_delivery(d,'at_store');
 PERFORM set_config('test.atomic_delivery_fail','yes',true);
 BEGIN PERFORM public.transition_courier_delivery(d,'picked_up'); RAISE EXCEPTION 'FAIL pickup did not throw'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected_order_failure' THEN RAISE; END IF; END;
 IF (SELECT status FROM public.deliveries WHERE id=d)<>'at_store' OR (SELECT coletado_em FROM public.deliveries WHERE id=d) IS NOT NULL THEN RAISE EXCEPTION 'FAIL pickup partially committed'; END IF;
 PERFORM set_config('test.atomic_delivery_fail','no',true);
 PERFORM public.transition_courier_delivery(d,'picked_up');
 PERFORM public.transition_courier_delivery(d,'picked_up');
 PERFORM public.transition_courier_delivery(d,'to_customer');
 PERFORM public.transition_courier_delivery(d,'at_customer');
 BEGIN PERFORM public.transition_courier_delivery(d,'delivered'); RAISE EXCEPTION 'FAIL proof bypass'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='other_courier'),'role','authenticated')::text,true);
DO $$ DECLARE d uuid:=(SELECT id FROM atomic_delivery_ids WHERE kind='delivery'); BEGIN
 BEGIN PERFORM public.transition_courier_delivery(d,'accepted'); RAISE EXCEPTION 'FAIL second courier acceptance'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.transition_courier_delivery(d,'at_customer'); RAISE EXCEPTION 'FAIL second courier progress'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='admin'),'role','authenticated')::text,true);
DO $$ DECLARE oid uuid:=(SELECT id FROM atomic_delivery_ids WHERE kind='order'); code text; BEGIN
 SELECT s.code INTO code FROM private.order_delivery_codes s WHERE s.order_id=oid;
 PERFORM set_config('test.atomic_delivery_code',code,true);
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='courier'),'role','authenticated')::text,true);
DO $$ DECLARE oid uuid:=(SELECT id FROM atomic_delivery_ids WHERE kind='order'); BEGIN
 PERFORM public.confirm_delivery_code(oid,current_setting('test.atomic_delivery_code'),NULL);
 IF (SELECT status FROM public.orders WHERE id=oid)<>'delivered' OR (SELECT status FROM public.deliveries WHERE order_id=oid)<>'delivered' OR (SELECT status FROM public.courier_profiles WHERE user_id=auth.uid())<>'online' THEN RAISE EXCEPTION 'FAIL proof completion sync'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.dispatch_order_delivery(uuid,integer,uuid)','EXECUTE') OR has_function_privilege('anon','public.transition_courier_delivery(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'FAIL anonymous execute'; END IF;
END $$;

SELECT 'Atomic delivery workflow contracts passed; all fixtures rolled back' AS result;


RESET ROLE;
GRANT INSERT ON atomic_delivery_ids TO authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'role','authenticated')::text,true);
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade)
 VALUES((SELECT id FROM atomic_delivery_ids WHERE kind='customer'),(SELECT id FROM atomic_delivery_ids WHERE kind='store'),(SELECT id FROM atomic_delivery_ids WHERE kind='product'),'Timeout fixture',1000,1);
SET LOCAL ROLE authenticated;
DO $timeout$
DECLARE result jsonb; oid uuid; deadline timestamptz;
BEGIN
 result:=public.checkout_order((SELECT id FROM atomic_delivery_ids WHERE kind='store'),gen_random_uuid(),'pix','delivery','{"rua":"Contract street","cidade":"Contract city"}',NULL,NULL,1500);
 oid:=(result->>'order_id')::uuid;
 SELECT acceptance_deadline INTO deadline FROM public.orders WHERE id=oid;
 IF deadline IS NULL OR deadline<clock_timestamp()+interval '40 seconds' THEN RAISE EXCEPTION 'Deadline not assigned'; END IF;
 INSERT INTO atomic_delivery_ids(kind,id) VALUES('timeout_order',oid);
 BEGIN PERFORM private.expire_unaccepted_order(oid,clock_timestamp()+interval '2 minutes'); RAISE EXCEPTION 'Customer expired order'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $timeout$;
RESET ROLE;
DO $timeout$
DECLARE oid uuid; initial_stock integer; count_before integer;
BEGIN
 SELECT id INTO oid FROM atomic_delivery_ids WHERE kind='timeout_order';
 SELECT estoque INTO initial_stock FROM public.products WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='product');
 SELECT count(*) INTO count_before FROM public.notifications WHERE user_id=(SELECT id FROM atomic_delivery_ids WHERE kind='customer') AND mensagem LIKE '%não respondeu%';
 IF private.expire_unaccepted_order(oid) THEN RAISE EXCEPTION 'Expired early'; END IF;
 IF NOT private.expire_unaccepted_order(oid,clock_timestamp()+interval '2 minutes') THEN RAISE EXCEPTION 'Failed to expire'; END IF;
 IF private.expire_unaccepted_order(oid,clock_timestamp()+interval '2 minutes') THEN RAISE EXCEPTION 'Repeated expiry'; END IF;
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=oid AND status='cancelled' AND cancelled_role='sistema' AND cancellation_reason LIKE '%não respondeu%') THEN RAISE EXCEPTION 'Missing cancellation state'; END IF;
 IF (SELECT estoque FROM public.products WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='product'))<>initial_stock+1 THEN RAISE EXCEPTION 'Stock not restored exactly once'; END IF;
 IF (SELECT count(*) FROM public.notifications WHERE user_id=(SELECT id FROM atomic_delivery_ids WHERE kind='customer') AND mensagem LIKE '%não respondeu%')<>count_before+1 THEN RAISE EXCEPTION 'Customer timeout notice missing or duplicated'; END IF;
 IF has_function_privilege('authenticated','private.expire_unaccepted_orders()','execute') OR has_function_privilege('anon','private.expire_unaccepted_order(uuid,timestamptz)','execute') THEN RAISE EXCEPTION 'Worker exposed'; END IF;
END $timeout$;

ROLLBACK;
