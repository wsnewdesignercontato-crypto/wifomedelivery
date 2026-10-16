-- Configure real support contacts; unset contacts are omitted by the application.
ALTER TABLE public.platform_settings ADD COLUMN support_email text;
ALTER TABLE public.platform_settings ADD COLUMN support_whatsapp text;
ALTER TABLE public.platform_settings ADD COLUMN support_phone text;
ALTER TABLE public.platform_settings ADD CONSTRAINT support_email_valid CHECK(support_email IS NULL OR (length(support_email)<=254 AND support_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
ALTER TABLE public.platform_settings ADD CONSTRAINT support_whatsapp_valid CHECK(support_whatsapp IS NULL OR support_whatsapp ~ '^[1-9][0-9]{9,14}$');
ALTER TABLE public.platform_settings ADD CONSTRAINT support_phone_valid CHECK(support_phone IS NULL OR support_phone ~ '^\+?[1-9][0-9]{9,14}$');
CREATE OR REPLACE FUNCTION public.get_support_contacts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('email',support_email,'whatsapp',support_whatsapp,'phone',support_phone) FROM public.platform_settings WHERE id=1
$$;
REVOKE ALL ON FUNCTION public.get_support_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_support_contacts() TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_support_ticket(p_assunto text,p_mensagem text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_assunto,''))) NOT BETWEEN 3 AND 160 OR length(btrim(coalesce(p_mensagem,''))) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Assunto e mensagem obrigatórios' USING ERRCODE='22023'; END IF;
 INSERT INTO public.support_tickets(user_id,assunto,status,priority) VALUES(uid,btrim(p_assunto),'open','normal') RETURNING id INTO result;
 INSERT INTO public.support_messages(ticket_id,sender_id,mensagem) VALUES(result,uid,btrim(p_mensagem));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_support_ticket(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION private.guard_support_message() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF length(btrim(NEW.mensagem)) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Mensagem deve ter de 1 a 5000 caracteres' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_support_message() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_support_message BEFORE INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION private.guard_support_message();

-- Search before pagination, inside a narrow admin-only RPC; never expose auth.users itself.
CREATE OR REPLACE FUNCTION public.admin_search_users(p_search text DEFAULT '',p_page integer DEFAULT 1,p_per_page integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE term text:=lower(btrim(coalesce(p_search,''))); total bigint; entries jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 IF p_page IS NULL OR p_page<1 OR p_page>100000 OR p_per_page IS NULL OR p_per_page NOT BETWEEN 1 AND 100 OR length(term)>254 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT count(*) INTO total FROM auth.users u WHERE position(term IN lower(coalesce(u.email,'')))>0 OR term='';
 SELECT coalesce(jsonb_agg(to_jsonb(page)),'[]'::jsonb) INTO entries FROM (
  SELECT u.id,u.email,u.created_at,u.last_sign_in_at,(u.email_confirmed_at IS NOT NULL) AS confirmed,
   ARRAY(SELECT r.role::text FROM public.user_roles r WHERE r.user_id=u.id ORDER BY r.role) AS roles
  FROM auth.users u WHERE position(term IN lower(coalesce(u.email,'')))>0 OR term=''
  ORDER BY u.created_at DESC,u.id LIMIT p_per_page OFFSET (p_page-1)*p_per_page
 ) page;
 RETURN jsonb_build_object('users',entries,'page',p_page,'total',total,'totalPages',greatest(1,ceil(total::numeric/p_per_page)::int));
END $$;
REVOKE ALL ON FUNCTION public.admin_search_users(text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text,integer,integer) TO authenticated;
