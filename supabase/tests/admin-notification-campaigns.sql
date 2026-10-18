BEGIN;
DO $$
DECLARE admin_id uuid; ordinary_id uuid; audience_name text;
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
 SELECT id INTO ordinary_id FROM auth.users u WHERE NOT EXISTS (SELECT FROM public.user_roles r WHERE r.user_id=u.id AND r.role='admin') LIMIT 1;
 IF admin_id IS NULL OR ordinary_id IS NULL THEN RAISE EXCEPTION 'Test requires existing admin and ordinary identities'; END IF;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 FOREACH audience_name IN ARRAY ARRAY['cliente','estabelecimento','entregador'] LOOP
  INSERT INTO public.notifications(user_id,titulo,mensagem,audience,tipo,banner,link_url)
   VALUES(ordinary_id,'Contrato de notificação (rollback)','Verificação sem envio real',audience_name,'promo',
    '{"titulo":"Teste","cta_texto":"Abrir"}'::jsonb,'/'||audience_name);
 END LOOP;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub',ordinary_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_id,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN
  INSERT INTO public.notifications(user_id,titulo,mensagem,audience) VALUES(ordinary_id,'Não autorizado','Deve falhar','cliente');
  RAISE EXCEPTION 'Ordinary user bypassed campaign authorization';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RESET ROLE;
 IF has_table_privilege('anon','public.notifications','INSERT') THEN RAISE EXCEPTION 'Anonymous inserts allowed'; END IF;
 IF has_function_privilege('authenticated','private.request_pending_push_dispatch()','EXECUTE') THEN RAISE EXCEPTION 'Private dispatch exposed'; END IF;
END $$;
ROLLBACK;