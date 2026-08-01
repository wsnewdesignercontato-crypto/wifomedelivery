CREATE OR REPLACE FUNCTION public.check_profile_complete(_user_id uuid, _role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  missing text[] := ARRAY[]::text[];
  p RECORD;
  addr RECORD;
  e RECORD;
  c RECORD;
  needs_plate boolean;
BEGIN
  IF auth.uid() IS NOT NULL
     AND _user_id <> auth.uid()
     AND NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

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
      missing := missing || ARRAY['veiculo','cpf','cidade_atuacao'];
    ELSE
      IF COALESCE(c.veiculo,'') = '' THEN missing := array_append(missing, 'veiculo'); END IF;
      needs_plate := public.vehicle_requires_plate(c.veiculo);
      IF needs_plate AND COALESCE(c.placa,'') = '' THEN missing := array_append(missing, 'placa'); END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.vehicle_requires_plate(_tipo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(lower(btrim(_tipo)), '') NOT IN (
    'bicicleta','bicicleta_eletrica','bike','bike_eletrica','patinete','patinete_eletrico','a_pe','pe'
  ) AND COALESCE(btrim(_tipo),'') <> ''
$$;