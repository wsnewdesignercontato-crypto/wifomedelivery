
CREATE OR REPLACE FUNCTION public.check_profile_complete(_user_id uuid, _role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing text[] := '{}';
  v_complete boolean := true;
  v_redirect text := '/';
  v_profile record;
  v_address record;
  v_courier record;
  v_estab record;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = _user_id;
  
  IF v_profile.nome IS NULL OR v_profile.nome = '' THEN
    v_missing := array_append(v_missing, 'nome');
  END IF;
  
  IF v_profile.telefone IS NULL OR v_profile.telefone = '' THEN
    v_missing := array_append(v_missing, 'telefone');
  END IF;

  IF _role = 'cliente' THEN
    SELECT * INTO v_address FROM public.addresses WHERE user_id = _user_id AND is_default = true LIMIT 1;
    IF v_address.id IS NULL THEN
      v_missing := array_append(v_missing, 'endereco');
    END IF;
    v_redirect := '/cliente/perfil/enderecos';
    
  ELSIF _role = 'entregador' THEN
    SELECT * INTO v_courier FROM public.courier_profiles WHERE user_id = _user_id;
    IF v_courier.id IS NULL OR v_courier.cpf IS NULL OR v_courier.cpf = '' THEN
      v_missing := array_append(v_missing, 'cpf');
    END IF;
    IF v_courier.cidade_atuacao IS NULL OR v_courier.cidade_atuacao = '' THEN
      v_missing := array_append(v_missing, 'cidade_atuacao');
    END IF;
    v_redirect := '/entregador/perfil/dados';
    
  ELSIF _role = 'estabelecimento' THEN
    SELECT * INTO v_estab FROM public.establishments WHERE owner_id = _user_id;
    IF v_estab.id IS NULL OR v_estab.nome IS NULL OR v_estab.nome = '' THEN
      v_missing := array_append(v_missing, 'nome_loja');
    END IF;
    IF v_estab.cnpj IS NULL OR v_estab.cnpj = '' THEN
      v_missing := array_append(v_missing, 'cnpj');
    END IF;
    v_redirect := '/estabelecimento/configuracoes';
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    v_complete := false;
  END IF;

  RETURN jsonb_build_object(
    'complete', v_complete,
    'missing', v_missing,
    'redirect', v_redirect
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_profile_complete(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_active_city(_user_id uuid, _city text, _state text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET cidade_ativa = _city,
      estado_ativo = _state,
      last_location_at = now()
  WHERE id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_city(uuid, text, text) TO authenticated;
