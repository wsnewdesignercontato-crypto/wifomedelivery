-- Invoker preserves existing ownership RLS. One request either changes the
-- default address completely or rolls back both updates.
CREATE OR REPLACE FUNCTION public.set_my_default_address(p_address_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_address public.addresses;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Autenticação necessária' USING ERRCODE = '42501'; END IF;
  -- Serialize changes for the same account, including simultaneous app tabs.
  PERFORM 1 FROM public.profiles WHERE id = v_user FOR UPDATE;
  SELECT * INTO v_address FROM public.addresses WHERE id = p_address_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Endereço não encontrado' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.addresses SET is_default = false WHERE user_id = v_user AND is_default AND id <> p_address_id;
  UPDATE public.addresses SET is_default = true WHERE id = p_address_id AND user_id = v_user RETURNING * INTO v_address;
  IF NOT FOUND THEN RAISE EXCEPTION 'Endereço não atualizado' USING ERRCODE = 'P0002'; END IF;
  RETURN to_jsonb(v_address);
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_default_address(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_default_address(uuid) TO authenticated;
