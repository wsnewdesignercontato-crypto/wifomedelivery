-- Support conversations and global user search, including accounts beyond the first page.
BEGIN;
CREATE TEMP TABLE support_ids(kind text PRIMARY KEY,id uuid DEFAULT gen_random_uuid());
GRANT SELECT,INSERT ON support_ids TO authenticated;
INSERT INTO support_ids(kind) VALUES('customer'),('outsider'),('admin');
INSERT INTO auth.users(id,email,raw_user_meta_data)
 SELECT id,'support-'||id||'@example.invalid','{"nome":"Support contract"}'::jsonb FROM support_ids;
INSERT INTO public.user_roles(user_id,role) SELECT id,'admin' FROM support_ids WHERE kind='admin';
INSERT INTO auth.users(id,email,raw_user_meta_data,created_at)
 SELECT gen_random_uuid(),'search-contract-'||lpad(n::text,3,'0')||'@example.invalid','{}',now()-n*interval '1 day' FROM generate_series(1,151) n;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM support_ids WHERE kind='customer'),'role','authenticated')::text,true);
INSERT INTO support_ids(kind,id) VALUES('ticket',public.create_support_ticket('Delivery question','First message'));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.support_messages WHERE ticket_id=(SELECT id FROM support_ids WHERE kind='ticket') AND mensagem='First message') THEN RAISE EXCEPTION 'First message lost'; END IF;
 BEGIN
  PERFORM public.create_support_ticket('Empty',' ');
  RAISE EXCEPTION 'Empty message accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.admin_search_users('',1,50);
  RAISE EXCEPTION 'Customer listed auth accounts';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM support_ids WHERE kind='admin'),'role','authenticated')::text,true);
INSERT INTO public.support_messages(ticket_id,sender_id,mensagem) VALUES((SELECT id FROM support_ids WHERE kind='ticket'),auth.uid(),'Admin reply');
DO $$ DECLARE result jsonb; BEGIN
 result:=public.admin_search_users('search-contract-151',1,50);
 IF (result->>'total')::int<>1 OR result->'users'->0->>'email'<>'search-contract-151@example.invalid' THEN RAISE EXCEPTION 'Search misses account beyond first 100'; END IF;
 result:=public.admin_search_users('search-contract-',2,50);
 IF (result->>'total')::int<>151 OR jsonb_array_length(result->'users')<>50 OR (result->>'totalPages')::int<>4 THEN RAISE EXCEPTION 'Incorrect pagination'; END IF;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM support_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.support_messages WHERE ticket_id=(SELECT id FROM support_ids WHERE kind='ticket') AND mensagem='Admin reply') THEN RAISE EXCEPTION 'Customer cannot read admin reply'; END IF;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM support_ids WHERE kind='outsider'),'role','authenticated')::text,true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.support_messages WHERE ticket_id=(SELECT id FROM support_ids WHERE kind='ticket')) THEN RAISE EXCEPTION 'Outsider can read conversation'; END IF;
 BEGIN
  INSERT INTO public.support_messages(ticket_id,sender_id,mensagem) VALUES((SELECT id FROM support_ids WHERE kind='ticket'),auth.uid(),'Intrusion');
  RAISE EXCEPTION 'Outsider can reply';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Support/admin contracts passed; fixtures rolled back' AS result;
