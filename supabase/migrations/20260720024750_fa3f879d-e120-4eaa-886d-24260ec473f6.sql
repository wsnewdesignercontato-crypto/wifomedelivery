-- Bootstrap: set provisional password for the initial admin
UPDATE auth.users
   SET encrypted_password = crypt('WiFome@2025', gen_salt('bf')),
       email_confirmed_at = COALESCE(email_confirmed_at, now()),
       updated_at = now()
 WHERE email = 'equipemaguinata2019@gmail.com';

-- Grant/revoke admin RPCs (secure, admin-only)
CREATE OR REPLACE FUNCTION public.admin_grant_role(_target_user uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (_target_user, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.admin_audit_log(actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'grant_role', 'user', _target_user, jsonb_build_object('role', _role));
END $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_role(_target_user uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  -- prevent removing the last admin
  IF _role = 'admin' AND (SELECT COUNT(*) FROM public.user_roles WHERE role='admin') <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last admin';
  END IF;
  DELETE FROM public.user_roles WHERE user_id=_target_user AND role=_role;
  INSERT INTO public.admin_audit_log(actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'revoke_role', 'user', _target_user, jsonb_build_object('role', _role));
END $$;

GRANT EXECUTE ON FUNCTION public.admin_grant_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_role(uuid, app_role) TO authenticated;