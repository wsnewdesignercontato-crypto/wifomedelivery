
-- 1) Colunas novas
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cidade_ativa text,
  ADD COLUMN IF NOT EXISTS estado_ativo text;

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- 2) Função de verificação — retorna { complete, missing, redirect }
CREATE OR REPLACE FUNCTION public.check_profile_complete(_user_id uuid, _role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  missing text[] := ARRAY[]::text[];
  p RECORD;
  addr RECORD;
  e RECORD;
  c RECORD;
BEGIN
  SELECT nome, telefone INTO p FROM public.profiles WHERE id = _user_id;
  IF p IS NULL OR COALESCE(p.nome,'') = '' THEN missing := array_append(missing, 'nome'); END IF;
  IF p IS NULL OR COALESCE(p.telefone,'') = '' THEN missing := array_append(missing, 'telefone'); END IF;

  IF _role = 'cliente' THEN
    SELECT cep, rua, numero, bairro, cidade, estado INTO addr
      FROM public.addresses WHERE user_id = _user_id AND is_default = true LIMIT 1;
    IF addr IS NULL THEN
      SELECT cep, rua, numero, bairro, cidade, estado INTO addr
        FROM public.addresses WHERE user_id = _user_id ORDER BY created_at LIMIT 1;
    END IF;
    IF addr IS NULL THEN
      missing := missing || ARRAY['cep','rua','numero','bairro','cidade','estado'];
    ELSE
      IF COALESCE(addr.cep,'') = '' THEN missing := array_append(missing, 'cep'); END IF;
      IF COALESCE(addr.rua,'') = '' THEN missing := array_append(missing, 'rua'); END IF;
      IF COALESCE(addr.numero,'') = '' THEN missing := array_append(missing, 'numero'); END IF;
      IF COALESCE(addr.bairro,'') = '' THEN missing := array_append(missing, 'bairro'); END IF;
      IF COALESCE(addr.cidade,'') = '' THEN missing := array_append(missing, 'cidade'); END IF;
      IF COALESCE(addr.estado,'') = '' THEN missing := array_append(missing, 'estado'); END IF;
    END IF;
    RETURN jsonb_build_object(
      'complete', array_length(missing,1) IS NULL,
      'missing', to_jsonb(missing),
      'redirect', '/cliente/perfil/enderecos'
    );

  ELSIF _role = 'estabelecimento' THEN
    SELECT nome, telefone, cnpj, cidade, estado, endereco INTO e
      FROM public.establishments WHERE owner_id = _user_id LIMIT 1;
    IF e IS NULL THEN
      missing := missing || ARRAY['nome_loja','telefone_loja','cnpj','endereco','cidade','estado'];
    ELSE
      IF COALESCE(e.nome,'') = '' THEN missing := array_append(missing, 'nome_loja'); END IF;
      IF COALESCE(e.telefone,'') = '' THEN missing := array_append(missing, 'telefone_loja'); END IF;
      IF COALESCE(e.cnpj,'') = '' THEN missing := array_append(missing, 'cnpj'); END IF;
      IF COALESCE(e.endereco,'') = '' THEN missing := array_append(missing, 'endereco'); END IF;
      IF COALESCE(e.cidade,'') = '' THEN missing := array_append(missing, 'cidade'); END IF;
      IF COALESCE(e.estado,'') = '' THEN missing := array_append(missing, 'estado'); END IF;
    END IF;
    RETURN jsonb_build_object(
      'complete', array_length(missing,1) IS NULL,
      'missing', to_jsonb(missing),
      'redirect', '/estabelecimento/configuracoes'
    );

  ELSIF _role = 'entregador' THEN
    SELECT veiculo, placa, cidade_atuacao, cpf INTO c
      FROM public.courier_profiles WHERE user_id = _user_id LIMIT 1;
    IF c IS NULL THEN
      missing := missing || ARRAY['veiculo','placa','cpf','cidade_atuacao'];
    ELSE
      IF COALESCE(c.veiculo,'') = '' THEN missing := array_append(missing, 'veiculo'); END IF;
      IF COALESCE(c.placa,'') = '' THEN missing := array_append(missing, 'placa'); END IF;
      IF COALESCE(c.cpf,'') = '' THEN missing := array_append(missing, 'cpf'); END IF;
      IF COALESCE(c.cidade_atuacao,'') = '' THEN missing := array_append(missing, 'cidade_atuacao'); END IF;
    END IF;
    RETURN jsonb_build_object(
      'complete', array_length(missing,1) IS NULL,
      'missing', to_jsonb(missing),
      'redirect', '/entregador/perfil/dados'
    );
  END IF;

  RETURN jsonb_build_object('complete', true, 'missing', '[]'::jsonb, 'redirect', '/');
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_profile_complete(uuid, text) TO authenticated;

-- 3) Trigger no addresses: quando cliente cadastra endereço com cidade, seta cidade_ativa/onboarding
CREATE OR REPLACE FUNCTION public.sync_client_onboarding_from_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_client boolean;
  chk jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'cliente'
  ) INTO is_client;

  IF is_client THEN
    -- Cidade ativa vem do endereço default (ou do mais recente, se ainda não houver default)
    IF NEW.is_default = true OR NOT EXISTS (
      SELECT 1 FROM public.addresses WHERE user_id = NEW.user_id AND is_default = true AND id <> NEW.id
    ) THEN
      UPDATE public.profiles
        SET cidade_ativa = NEW.cidade,
            estado_ativo = NEW.estado
        WHERE id = NEW.user_id;
    END IF;

    chk := public.check_profile_complete(NEW.user_id, 'cliente');
    UPDATE public.profiles
      SET onboarding_completed = COALESCE((chk->>'complete')::boolean, false)
      WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_client_onboarding_address ON public.addresses;
CREATE TRIGGER trg_sync_client_onboarding_address
AFTER INSERT OR UPDATE ON public.addresses
FOR EACH ROW EXECUTE FUNCTION public.sync_client_onboarding_from_address();

-- 4) Trigger em profiles: recomputa após alteração de nome/telefone
CREATE OR REPLACE FUNCTION public.sync_client_onboarding_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_client boolean;
  chk jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id AND role = 'cliente'
  ) INTO is_client;
  IF is_client THEN
    chk := public.check_profile_complete(NEW.id, 'cliente');
    NEW.onboarding_completed := COALESCE((chk->>'complete')::boolean, false);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_client_onboarding_profile ON public.profiles;
CREATE TRIGGER trg_sync_client_onboarding_profile
BEFORE UPDATE OF nome, telefone ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_client_onboarding_from_profile();

-- 5) Trigger em establishments
CREATE OR REPLACE FUNCTION public.sync_estab_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chk jsonb;
BEGIN
  chk := public.check_profile_complete(NEW.owner_id, 'estabelecimento');
  NEW.onboarding_completed := COALESCE((chk->>'complete')::boolean, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_estab_onboarding ON public.establishments;
CREATE TRIGGER trg_sync_estab_onboarding
BEFORE INSERT OR UPDATE ON public.establishments
FOR EACH ROW EXECUTE FUNCTION public.sync_estab_onboarding();

-- 6) Trigger em courier_profiles
CREATE OR REPLACE FUNCTION public.sync_courier_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chk jsonb;
BEGIN
  chk := public.check_profile_complete(NEW.user_id, 'entregador');
  NEW.onboarding_completed := COALESCE((chk->>'complete')::boolean, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_courier_onboarding ON public.courier_profiles;
CREATE TRIGGER trg_sync_courier_onboarding
BEFORE INSERT OR UPDATE ON public.courier_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_courier_onboarding();

-- 7) Recomputa retroativamente para dados já existentes
UPDATE public.profiles p
  SET cidade_ativa = a.cidade, estado_ativo = a.estado
  FROM public.addresses a
  WHERE a.user_id = p.id
    AND a.is_default = true
    AND p.cidade_ativa IS NULL;

UPDATE public.profiles p
  SET onboarding_completed = COALESCE(
    (public.check_profile_complete(p.id, 'cliente')->>'complete')::boolean, false)
  WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'cliente');

UPDATE public.establishments e
  SET onboarding_completed = COALESCE(
    (public.check_profile_complete(e.owner_id, 'estabelecimento')->>'complete')::boolean, false);

UPDATE public.courier_profiles c
  SET onboarding_completed = COALESCE(
    (public.check_profile_complete(c.user_id, 'entregador')->>'complete')::boolean, false);

-- 8) RPC para atualizar cidade ativa manualmente
CREATE OR REPLACE FUNCTION public.set_active_city(_cidade text, _estado text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.profiles
    SET cidade_ativa = _cidade, estado_ativo = _estado
    WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_city(text, text) TO authenticated;
