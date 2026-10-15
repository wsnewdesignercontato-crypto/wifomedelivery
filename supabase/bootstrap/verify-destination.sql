-- Read-only deployment contracts. The initializer is intentionally not replayable.
DO $$
BEGIN
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) <> 51 THEN
  RAISE EXCEPTION 'Expected 51 application tables';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity) THEN
  RAISE EXCEPTION 'Application table without RLS';
 END IF;
 IF has_function_privilege('anon','public.apply_score_penalty(text,uuid,integer,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.apply_score_penalty(text,uuid,integer,text,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.trg_notifications_ping_push()','EXECUTE')
 OR has_function_privilege('authenticated','public.trg_notifications_ping_push()','EXECUTE') THEN
  RAISE EXCEPTION 'Internal function exposed';
 END IF;
 IF has_table_privilege('anon','public.profiles','SELECT') OR has_column_privilege('anon','public.profiles','id','SELECT') THEN
  RAISE EXCEPTION 'Anonymous profile data exposed';
 END IF;
 IF (SELECT count(*) FROM storage.buckets WHERE id IN ('avatars','chat-attachments','delivery-proofs','ad-banners') AND NOT public) <> 4 THEN
  RAISE EXCEPTION 'Expected four private upload buckets';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created' AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'Signup trigger missing';
 END IF;
 IF (SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public') <> 17 THEN
  RAISE EXCEPTION 'Realtime table publication incomplete';
 END IF;
END $$;
SELECT 'destination contracts passed' AS result;
