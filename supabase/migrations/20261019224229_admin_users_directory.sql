-- The existing search RPC stays available to older installed clients.
-- Filtering and totals run before LIMIT; auth.users is never directly exposed.
CREATE OR REPLACE FUNCTION public.admin_users_directory(
  p_search text DEFAULT '', p_page integer DEFAULT 1, p_per_page integer DEFAULT 20,
  p_role text DEFAULT 'all', p_status text DEFAULT 'all'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  term text := lower(btrim(coalesce(p_search,'')));
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.current_account_is_active()
    OR NOT private.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE='42501';
  END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_per_page IS NULL OR p_per_page NOT BETWEEN 1 AND 100 OR length(term)>254
    OR p_role IS NULL OR p_role NOT IN ('all','cliente','estabelecimento','entregador','admin')
    OR p_status IS NULL OR p_status NOT IN ('all','active','blocked','pending') THEN
    RAISE EXCEPTION 'Invalid directory filters' USING ERRCODE='22023';
  END IF;

  WITH accounts AS MATERIALIZED (
    SELECT u.id,u.email,u.created_at,u.last_sign_in_at,
      u.email_confirmed_at IS NOT NULL AS confirmed,
      coalesce(u.banned_until>now(),false) AS blocked,
      ARRAY(SELECT r.role::text FROM public.user_roles r WHERE r.user_id=u.id ORDER BY r.role) AS roles
    FROM auth.users u WHERE u.deleted_at IS NULL
  ), filtered AS MATERIALIZED (
    SELECT * FROM accounts a
    WHERE (term='' OR position(term IN lower(coalesce(a.email,'')))>0)
      AND (p_role='all' OR p_role=ANY(a.roles))
      AND (p_status='all' OR (p_status='blocked' AND a.blocked)
        OR (p_status='active' AND NOT a.blocked AND a.confirmed)
        OR (p_status='pending' AND NOT a.blocked AND NOT a.confirmed))
  ), totals AS (
    SELECT count(*) AS total,
      greatest(1,ceil(count(*)::numeric/p_per_page)::int) AS pages FROM filtered
  ), page AS (
    SELECT * FROM filtered ORDER BY created_at DESC NULLS LAST,id
    LIMIT p_per_page OFFSET (least(p_page,(SELECT pages FROM totals))-1)*p_per_page
  )
  SELECT jsonb_build_object(
    'users',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC NULLS LAST,p.id) FROM page p),'[]'::jsonb),
    'page',least(p_page,t.pages),'total',t.total,'totalPages',t.pages,
    'summary',(SELECT jsonb_build_object(
      'total',count(*),'active',count(*) FILTER(WHERE NOT blocked AND confirmed),
      'pending',count(*) FILTER(WHERE NOT blocked AND NOT confirmed),
      'blocked',count(*) FILTER(WHERE blocked),
      'cliente',count(*) FILTER(WHERE 'cliente'=ANY(roles)),
      'estabelecimento',count(*) FILTER(WHERE 'estabelecimento'=ANY(roles)),
      'entregador',count(*) FILTER(WHERE 'entregador'=ANY(roles)),
      'admin',count(*) FILTER(WHERE 'admin'=ANY(roles))) FROM accounts)
  ) INTO result FROM totals t;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_users_directory(text,integer,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_users_directory(text,integer,integer,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
