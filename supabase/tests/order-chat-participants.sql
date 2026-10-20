-- Full-schema contract: synthetic identities and every generated row roll back.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
CREATE TEMP TABLE generated_test_ids(kind text PRIMARY KEY,id uuid DEFAULT gen_random_uuid());
GRANT SELECT,INSERT ON generated_test_ids TO authenticated;
INSERT INTO generated_test_ids(kind) VALUES('admin'),('owner'),('customer'),('courier'),('outsider'),('store'),('request');
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 SELECT id,'test-generator-'||id||'@example.invalid',now(),'{"nome":"Test generator rollback contract"}'::jsonb
 FROM generated_test_ids WHERE kind IN('admin','owner','customer','courier','outsider');
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
DO $$ BEGIN
 PERFORM public.transition_courier_delivery((SELECT id FROM public.deliveries WHERE order_id=(SELECT id FROM generated_test_ids WHERE kind='order')),'accepted');
END $$;
RESET ROLE;

CREATE FUNCTION pg_temp.assert_chat(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF;
END $$;
CREATE FUNCTION pg_temp.expect_chat_error(statement text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
 BEGIN
  EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS actual_state=RETURNED_SQLSTATE;
  IF actual_state=expected_state THEN RETURN; END IF;
  RAISE EXCEPTION 'Expected SQLSTATE %, received %',expected_state,actual_state;
 END;
 RAISE EXCEPTION 'Expected SQLSTATE %, operation succeeded',expected_state;
END $$;
CREATE TEMP TABLE chat_contract_ids(scope text PRIMARY KEY,id uuid NOT NULL);
GRANT SELECT,INSERT ON chat_contract_ids TO authenticated;

-- Create as actual participants; no privileged bypass of chat INSERT policies.
SET LOCAL ROLE authenticated;
DO $$ DECLARE actor record; cid uuid; oid uuid:=(SELECT id FROM generated_test_ids WHERE kind='order'); BEGIN
 FOR actor IN SELECT * FROM (VALUES
  ('customer','cliente','client_store'),
  ('customer','cliente','client_courier'),
  ('owner','estabelecimento','store_courier')
 ) AS participants(kind,role,scope) LOOP
  PERFORM set_config('request.jwt.claim.sub',(SELECT id::text FROM generated_test_ids WHERE kind=actor.kind),true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',auth.uid(),'role','authenticated')::text,true);
  INSERT INTO public.order_chats(order_id,escopo) VALUES(oid,actor.scope) RETURNING id INTO cid;
  INSERT INTO chat_contract_ids(scope,id) VALUES(actor.scope,cid);
 END LOOP;
END $$;

-- Both members of each pair must send successfully, with their real author role.
DO $$ DECLARE actor record; BEGIN
 FOR actor IN SELECT * FROM (VALUES
  ('customer','cliente','client_store'),('owner','estabelecimento','client_store'),
  ('customer','cliente','client_courier'),('courier','entregador','client_courier'),
  ('owner','estabelecimento','store_courier'),('courier','entregador','store_courier')
 ) AS participants(kind,role,scope) LOOP
  PERFORM set_config('request.jwt.claim.sub',(SELECT id::text FROM generated_test_ids WHERE kind=actor.kind),true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',auth.uid(),'role','authenticated')::text,true);
  INSERT INTO public.order_messages(chat_id,sender_id,sender_role,tipo,conteudo)
   VALUES((SELECT id FROM chat_contract_ids WHERE scope=actor.scope),auth.uid(),actor.role,'text','Synthetic rollback chat contract');
 END LOOP;
END $$;

-- Each actor reads exactly its two conversations and four messages. The third scope is hidden.
DO $$ DECLARE actor record; oid uuid:=(SELECT id FROM generated_test_ids WHERE kind='order'); BEGIN
 FOR actor IN SELECT * FROM (VALUES
  ('customer','cliente','store_courier'),
  ('owner','estabelecimento','client_courier'),
  ('courier','entregador','client_store')
 ) AS participants(kind,role,forbidden_scope) LOOP
  PERFORM set_config('request.jwt.claim.sub',(SELECT id::text FROM generated_test_ids WHERE kind=actor.kind),true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',auth.uid(),'role','authenticated')::text,true);
  PERFORM pg_temp.assert_chat((SELECT count(*)=2 FROM public.order_chats WHERE order_id=oid),actor.kind||': two visible chats');
  PERFORM pg_temp.assert_chat(NOT EXISTS(SELECT FROM public.order_chats WHERE order_id=oid AND escopo=actor.forbidden_scope),actor.kind||': forbidden chat must be hidden');
  PERFORM pg_temp.assert_chat((SELECT count(*)=4 FROM public.order_messages WHERE chat_id IN(SELECT id FROM chat_contract_ids)),actor.kind||': four visible messages');
  PERFORM pg_temp.assert_chat(NOT EXISTS(SELECT FROM public.order_messages WHERE chat_id=(SELECT id FROM chat_contract_ids WHERE scope=actor.forbidden_scope)),actor.kind||': forbidden messages must be hidden');
  PERFORM pg_temp.expect_chat_error(format('INSERT INTO public.order_chats(order_id,escopo) VALUES(%L,%L)',oid,actor.forbidden_scope),'42501');
  PERFORM pg_temp.expect_chat_error(format('INSERT INTO public.order_messages(chat_id,sender_id,sender_role,tipo,conteudo) VALUES(%L,%L,%L,''text'',''Forbidden synthetic contract'')',
   (SELECT id FROM chat_contract_ids WHERE scope=actor.forbidden_scope),auth.uid(),actor.role),'42501');
 END LOOP;
END $$;

-- A participant cannot impersonate the other member, or claim another sender role.
DO $$ DECLARE actor record; allowed_scope text; cid uuid; BEGIN
 FOR actor IN SELECT * FROM (VALUES
  ('customer','cliente','owner','estabelecimento','client_store'),
  ('owner','estabelecimento','customer','cliente','client_store'),
  ('courier','entregador','customer','cliente','client_courier')
 ) AS participants(kind,role,other_kind,other_role,scope) LOOP
  PERFORM set_config('request.jwt.claim.sub',(SELECT id::text FROM generated_test_ids WHERE kind=actor.kind),true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',auth.uid(),'role','authenticated')::text,true);
  SELECT id INTO cid FROM chat_contract_ids WHERE scope=actor.scope;
  PERFORM pg_temp.expect_chat_error(format('INSERT INTO public.order_messages(chat_id,sender_id,sender_role,tipo,conteudo) VALUES(%L,%L,%L,''text'',''False identity synthetic contract'')',
   cid,(SELECT id FROM generated_test_ids WHERE kind=actor.other_kind),actor.other_role),'42501');
  PERFORM pg_temp.expect_chat_error(format('INSERT INTO public.order_messages(chat_id,sender_id,sender_role,tipo,conteudo) VALUES(%L,%L,%L,''text'',''False role synthetic contract'')',
   cid,auth.uid(),actor.other_role),'42501');
 END LOOP;
END $$;

DO $$ DECLARE target_scope text; oid uuid:=(SELECT id FROM generated_test_ids WHERE kind='order'); BEGIN
 PERFORM set_config('request.jwt.claim.sub',(SELECT id::text FROM generated_test_ids WHERE kind='outsider'),true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',auth.uid(),'role','authenticated')::text,true);
 PERFORM pg_temp.assert_chat(NOT EXISTS(SELECT FROM public.order_chats WHERE order_id=oid),'Outsider must see no chats');
 PERFORM pg_temp.assert_chat(NOT EXISTS(SELECT FROM public.order_messages WHERE chat_id IN(SELECT id FROM chat_contract_ids)),'Outsider must see no messages');
 FOREACH target_scope IN ARRAY ARRAY['client_store','client_courier','store_courier'] LOOP
  PERFORM pg_temp.expect_chat_error(format('INSERT INTO public.order_chats(order_id,escopo) VALUES(%L,%L)',oid,target_scope),'42501');
  PERFORM pg_temp.expect_chat_error(format('INSERT INTO public.order_messages(chat_id,sender_id,sender_role,tipo,conteudo) VALUES(%L,%L,''cliente'',''text'',''Outsider synthetic contract'')',
   (SELECT c.id FROM chat_contract_ids c WHERE c.scope=target_scope),auth.uid()),'42501');
 END LOOP;
END $$;

-- Duplicate creation must preserve the existing conversation (the frontend recovers by SELECT).
DO $$ DECLARE oid uuid:=(SELECT id FROM generated_test_ids WHERE kind='order'); original uuid; BEGIN
 PERFORM set_config('request.jwt.claim.sub',(SELECT id::text FROM generated_test_ids WHERE kind='customer'),true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',auth.uid(),'role','authenticated')::text,true);
 SELECT id INTO original FROM public.order_chats WHERE order_id=oid AND escopo='client_store';
 PERFORM pg_temp.expect_chat_error(format('INSERT INTO public.order_chats(order_id,escopo) VALUES(%L,''client_store'')',oid),'23505');
 PERFORM pg_temp.assert_chat((SELECT id=original FROM public.order_chats WHERE order_id=oid AND escopo='client_store'),'Duplicate retry must recover the original chat ID');
END $$;
RESET ROLE;
DO $$ BEGIN
 PERFORM pg_temp.assert_chat((SELECT count(*)=3 FROM public.order_chats WHERE order_id=(SELECT id FROM generated_test_ids WHERE kind='order')),'Exactly three conversations must exist');
 PERFORM pg_temp.assert_chat((SELECT count(*)=6 FROM public.order_messages WHERE chat_id IN(SELECT id FROM chat_contract_ids)),'Exactly six legitimate messages must exist');
END $$;
ROLLBACK;
SELECT 'Order chat contracts passed: six participant sends; scope and outsider isolation; author identity; unique conversation; all fixtures rolled back' AS result;
