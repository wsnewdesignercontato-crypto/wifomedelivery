-- The Auth ban/deleted state is authoritative; no second, divergent block flag.
CREATE OR REPLACE FUNCTION private.current_account_is_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid()
   AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()));
$$;
REVOKE ALL ON FUNCTION private.current_account_is_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.current_account_is_active() TO authenticated;

CREATE OR REPLACE FUNCTION public.check_account_access()
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RETURN; END IF;
 IF NOT private.current_account_is_active() THEN
  RAISE EXCEPTION 'Esta conta está bloqueada ou foi excluída. Entre em contato com o suporte.' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.check_account_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_account_access() TO anon,authenticated,service_role;
-- Public requests have no uid and return without accessing the private helper.
-- Service-role server requests have no user uid and retain their current access.

DO $$ DECLARE r record; existing text; BEGIN
 SELECT substring(setting FROM length('pgrst.db_pre_request=')+1) INTO existing
 FROM pg_roles p CROSS JOIN LATERAL unnest(coalesce(p.rolconfig,ARRAY[]::text[])) setting
 WHERE p.rolname='authenticator' AND setting LIKE 'pgrst.db_pre_request=%';
 IF coalesce(existing,'') NOT IN ('','public.check_account_access') THEN
  RAISE EXCEPTION 'An existing pre-request hook must be composed before installing account controls';
 END IF;
 -- RLS also covers Realtime and Storage, which do not execute the Data API hook.
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND c.relrowsecurity AND
   (n.nspname='public' OR (n.nspname='storage' AND c.relname='objects'))
 LOOP
  EXECUTE format('DROP POLICY IF EXISTS account_must_be_active ON %I.%I',r.nspname,r.relname);
  EXECUTE format('CREATE POLICY account_must_be_active ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.current_account_is_active())) WITH CHECK ((SELECT private.current_account_is_active()))',r.nspname,r.relname);
 END LOOP;
END $$;
ALTER ROLE authenticator SET pgrst.db_pre_request='public.check_account_access';
NOTIFY pgrst,'reload config';

CREATE OR REPLACE FUNCTION public.admin_search_users(p_search text DEFAULT '',p_page integer DEFAULT 1,p_per_page integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE term text:=lower(btrim(coalesce(p_search,''))); total bigint; entries jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.current_account_is_active() OR NOT private.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 IF p_page IS NULL OR p_page<1 OR p_page>100000 OR p_per_page IS NULL OR p_per_page NOT BETWEEN 1 AND 100 OR length(term)>254 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT count(*) INTO total FROM auth.users u WHERE u.deleted_at IS NULL AND (position(term IN lower(coalesce(u.email,'')))>0 OR term='');
 SELECT coalesce(jsonb_agg(to_jsonb(page)),'[]'::jsonb) INTO entries FROM (
  SELECT u.id,u.email,u.created_at,u.last_sign_in_at,(u.email_confirmed_at IS NOT NULL) AS confirmed,
   (u.banned_until IS NOT NULL AND u.banned_until>now()) AS blocked,
   ARRAY(SELECT r.role::text FROM public.user_roles r WHERE r.user_id=u.id ORDER BY r.role) AS roles
  FROM auth.users u WHERE u.deleted_at IS NULL AND (position(term IN lower(coalesce(u.email,'')))>0 OR term='')
  ORDER BY u.created_at DESC,u.id LIMIT p_per_page OFFSET (p_page-1)*p_per_page
 ) page;
 RETURN jsonb_build_object('users',entries,'page',p_page,'total',total,'totalPages',greatest(1,ceil(total::numeric/p_per_page)::int));
END $$;
REVOKE ALL ON FUNCTION public.admin_search_users(text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text,integer,integer) TO authenticated;
