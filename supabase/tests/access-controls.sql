-- Role-isolated regression contracts. All identities and records are rolled back.
BEGIN;
CREATE FUNCTION pg_temp.denied(statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception THEN
    RETURN;
  END;
  RAISE EXCEPTION 'Expected denial: %', statement;
END $$;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF;
END $$;

DO $$
DECLARE
  client uuid := gen_random_uuid(); owner uuid := gen_random_uuid(); courier uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid(); admin uuid := gen_random_uuid(); store uuid := gen_random_uuid();
  oid uuid := gen_random_uuid(); pickup uuid := gen_random_uuid(); chat uuid;
  who uuid;
BEGIN
  FOREACH who IN ARRAY ARRAY[client,owner,courier,outsider,admin] LOOP
    INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(who,'access-'||who||'@example.invalid','{"nome":"Access contract"}');
  END LOOP;
  INSERT INTO public.user_roles(user_id,role) VALUES(admin,'admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.establishments(id,owner_id,nome,status,banco_conta,cnpj)
  VALUES(store,owner,'Access contract','aprovado','TEST-SECRET-BANK','TEST-SECRET-DOC');
  INSERT INTO public.courier_profiles(user_id,status,aprovacao,kyc_status) VALUES(courier,'offline','approved','approved');
  INSERT INTO public.orders(id,cliente_id,establishment_id,status,total_cents,subtotal_cents,forma_pagamento,codigo_entrega,codigo_expira_em,tipo_entrega)
  VALUES(oid,client,store,'on_the_way',1200,1200,'dinheiro','1234',now()+interval '10 minutes','delivery'),
        (pickup,client,store,'ready',1200,1200,'dinheiro','4321',now()+interval '10 minutes','pickup');
  INSERT INTO public.deliveries(order_id,entregador_id,status) VALUES(oid,courier,'to_customer');
  INSERT INTO public.order_chats(order_id,escopo) VALUES(oid,'client_store'),(oid,'store_courier'),(oid,'client_courier');
  INSERT INTO public.order_messages(chat_id,sender_id,sender_role,tipo,conteudo)
  SELECT id,owner,'estabelecimento','text','private-'||escopo FROM public.order_chats WHERE order_id=oid AND escopo IN ('client_store','store_courier');
  INSERT INTO public.order_messages(chat_id,sender_id,sender_role,tipo,conteudo)
  SELECT id,courier,'entregador','text','private-'||escopo FROM public.order_chats WHERE order_id=oid AND escopo='client_courier';
  -- New paths carry scope. A legacy path must only follow its associated chat message.
  INSERT INTO storage.objects(bucket_id,name) VALUES('chat-attachments',owner||'/'||oid||'/store_courier/private.png'),('chat-attachments',owner||'/'||oid||'/legacy.png');
  INSERT INTO public.order_messages(chat_id,sender_id,sender_role,tipo,anexo_url)
  SELECT id,owner,'estabelecimento','image',owner||'/'||oid||'/legacy.png' FROM public.order_chats WHERE order_id=oid AND escopo='store_courier';
  PERFORM set_config('test.client',client::text,true); PERFORM set_config('test.owner',owner::text,true);
  PERFORM set_config('test.courier',courier::text,true); PERFORM set_config('test.outsider',outsider::text,true);
  PERFORM set_config('test.admin',admin::text,true); PERFORM set_config('test.store',store::text,true);
  PERFORM set_config('test.order',oid::text,true); PERFORM set_config('test.pickup',pickup::text,true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.client'),true);
SELECT pg_temp.denied('SELECT banco_conta FROM public.establishments');
SELECT pg_temp.denied('SELECT cnpj FROM public.establishments');
SELECT pg_temp.denied('SELECT codigo_entrega FROM public.orders');
SELECT pg_temp.denied(format('SELECT public.get_establishment_private(%L)',current_setting('test.store')));
SELECT pg_temp.assert_true((public.get_order_delivery_code(current_setting('test.order')::uuid)->>'codigo_entrega')='1234','Customer must see own proof code through authorized API');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.order_chats WHERE order_id=current_setting('test.order')::uuid),'Customer must see exactly client_store and client_courier');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.order_messages WHERE conteudo='private-store_courier'),'Customer must not read store/courier conversation');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='chat-attachments'),'Customer must not sign either scoped or legacy store/courier attachment');
SELECT pg_temp.denied(format('INSERT INTO public.order_chats(order_id,escopo) VALUES(%L,''store_courier'')',current_setting('test.pickup')));
SELECT pg_temp.denied('UPDATE public.order_messages SET conteudo=''tampered'',sender_id=auth.uid(),sender_role=''cliente'' WHERE conteudo=''private-client_store''');
UPDATE public.order_messages SET lida_em=now() WHERE conteudo='private-client_store';
SELECT pg_temp.assert_true((SELECT lida_em IS NOT NULL FROM public.order_messages WHERE conteudo='private-client_store'),'Authorized read receipt must remain writable');
SELECT pg_temp.denied(format('INSERT INTO storage.objects(bucket_id,name) VALUES(''chat-attachments'',auth.uid()||''/%s/store_courier/attack.png'')',current_setting('test.order')));

SELECT set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
SELECT pg_temp.assert_true(public.get_establishment_private(current_setting('test.store')::uuid)->>'banco_conta'='TEST-SECRET-BANK','Owner must retain private financial profile');
SELECT pg_temp.denied(format('UPDATE public.establishments SET status=''aprovado'',kyc_status=''approved'',score_mensal=999 WHERE id=%L',current_setting('test.store')));
UPDATE public.establishments SET descricao='Legitimate owner edit' WHERE id=current_setting('test.store')::uuid;
SELECT pg_temp.denied(format('SELECT public.get_order_delivery_code(%L)',current_setting('test.order')));
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.order_chats WHERE order_id=current_setting('test.order')::uuid),'Owner must see exactly client_store and store_courier');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM storage.objects WHERE bucket_id='chat-attachments'),'Owner can sign authorized scoped and legacy paths');
SELECT pg_temp.denied(format('UPDATE public.orders SET status=''delivered'' WHERE id=%L',current_setting('test.pickup')));
SELECT pg_temp.denied(format('SELECT public.confirm_pickup_order(%L,''bad'')',current_setting('test.pickup')));
SELECT public.confirm_pickup_order(current_setting('test.pickup')::uuid,'4321');
SELECT pg_temp.assert_true((SELECT status='delivered' FROM public.orders WHERE id=current_setting('test.pickup')::uuid),'Correct pickup proof must finish pickup');

SELECT set_config('request.jwt.claim.sub',current_setting('test.courier'),true);
SELECT pg_temp.denied('UPDATE public.courier_profiles SET aprovacao=''approved'',kyc_status=''approved'',score_mensal=999 WHERE user_id=auth.uid()');
SELECT pg_temp.denied('INSERT INTO public.courier_documents(courier_id,tipo,status) VALUES(auth.uid(),''selfie'',''aprovado'')');
INSERT INTO public.courier_documents(courier_id,tipo,status,url) VALUES(auth.uid(),'selfie','em_analise','https://example.invalid/document');
SELECT pg_temp.denied('UPDATE public.courier_documents SET status=''aprovado'' WHERE courier_id=auth.uid()');
SELECT pg_temp.denied(format('SELECT public.get_order_delivery_code(%L)',current_setting('test.order')));
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.order_chats WHERE order_id=current_setting('test.order')::uuid),'Courier must see exactly client_courier and store_courier');
SELECT pg_temp.denied(format('UPDATE public.orders SET status=''delivered'' WHERE id=%L',current_setting('test.order')));
SELECT pg_temp.denied(format('UPDATE public.deliveries SET status=''delivered'' WHERE order_id=%L',current_setting('test.order')));
SELECT pg_temp.denied(format('UPDATE public.deliveries SET valor_entrega_cents=999999 WHERE order_id=%L',current_setting('test.order')));
SELECT set_config('app.order_write_context','confirm_delivery',true);
SELECT pg_temp.denied(format('UPDATE public.orders SET status=''delivered'' WHERE id=%L',current_setting('test.order')));
SELECT set_config('app.order_write_context','',true);
SELECT pg_temp.denied(format('SELECT public.courier_confirm_delivery(%L,''bad'')',current_setting('test.order')));
SELECT public.courier_confirm_delivery(current_setting('test.order')::uuid,'1234');
SELECT pg_temp.assert_true((SELECT status='delivered' FROM public.orders WHERE id=current_setting('test.order')::uuid),'Correct courier proof must complete delivery');
SELECT pg_temp.assert_true(current_setting('app.order_write_context',true) IS DISTINCT FROM 'confirm_delivery','Privileged proof context must not leak to next operation');

SELECT set_config('request.jwt.claim.sub',current_setting('test.outsider'),true);
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.order_chats WHERE order_id=current_setting('test.order')::uuid),'Outsider cannot read chats');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.order_messages WHERE conteudo LIKE 'private-%'),'Outsider cannot read messages');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='chat-attachments'),'Outsider cannot sign attachments');
SELECT pg_temp.denied('INSERT INTO public.courier_profiles(user_id,status,aprovacao) VALUES(auth.uid(),''online'',''approved'')');
SELECT pg_temp.denied('INSERT INTO public.establishments(owner_id,nome,status) VALUES(auth.uid(),''Unreviewed'',''aprovado'')');

SELECT set_config('request.jwt.claim.sub',current_setting('test.admin'),true);
UPDATE public.courier_profiles SET aprovacao='approved',kyc_status='approved' WHERE user_id=current_setting('test.courier')::uuid;
UPDATE public.courier_documents SET status='aprovado' WHERE courier_id=current_setting('test.courier')::uuid;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.courier_documents WHERE courier_id=current_setting('test.courier')::uuid AND status='aprovado'),'Admin can approve submitted document');
UPDATE public.establishments SET kyc_status='approved' WHERE id=current_setting('test.store')::uuid;
SELECT pg_temp.assert_true(public.get_establishment_private(current_setting('test.store')::uuid)->>'banco_conta'='TEST-SECRET-BANK','Admin retains financial review');
RESET ROLE;
ROLLBACK;
SELECT 'Access controls contracts passed; fixtures rolled back' AS result;
