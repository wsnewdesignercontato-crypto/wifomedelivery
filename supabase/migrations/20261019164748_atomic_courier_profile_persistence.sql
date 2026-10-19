-- Own-account registration patches are atomic and never accept approval/score/availability fields.
CREATE FUNCTION private.save_courier_registration(p_patch jsonb,p_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); person public.profiles%ROWTYPE; driver public.courier_profiles%ROWTYPE;
 current_data jsonb; field text; completion jsonb;
 allowed text[]:=ARRAY['nome','foto_url','telefone','whatsapp','cpf','rg','nascimento','cnh','cnh_categoria','cnh_validade','pix_key','pix_tipo','banco_nome','banco_agencia','banco_conta','banco_tipo','banco_titular','contato_emergencia_nome','contato_emergencia_tel','cidade_atuacao','endereco'];
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Entre novamente para salvar seu cadastro.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' OR length(p_patch::text)>16384 THEN RAISE EXCEPTION 'Dados de cadastro inválidos.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT FROM jsonb_object_keys(p_patch) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'Somente seus dados pessoais podem ser alterados neste formulário.' USING ERRCODE='42501'; END IF;
 FOREACH field IN ARRAY allowed LOOP
  IF p_patch ? field THEN
   IF NOT p_expected ? field THEN RAISE EXCEPTION 'Recarregue os dados antes de salvar.' USING ERRCODE='22023'; END IF;
   IF field<>'endereco' AND (jsonb_typeof(p_patch->field) NOT IN('string','null') OR length(coalesce(p_patch->>field,''))>2000) THEN RAISE EXCEPTION 'Campo inválido: %',field USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
 IF p_patch ? 'nome' AND (nullif(btrim(p_patch->>'nome'),'') IS NULL OR length(p_patch->>'nome')>150) THEN RAISE EXCEPTION 'Informe seu nome completo.' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'telefone' AND nullif(btrim(p_patch->>'telefone'),'') IS NOT NULL AND regexp_replace(p_patch->>'telefone','[^0-9]','','g') !~ '^[0-9]{10,15}$' THEN RAISE EXCEPTION 'Informe um telefone com DDD.' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'endereco' AND (jsonb_typeof(p_patch->'endereco') IS DISTINCT FROM 'object' OR length((p_patch->'endereco')::text)>4000) THEN RAISE EXCEPTION 'Endereço inválido.' USING ERRCODE='22023'; END IF;
 -- Stable lock order for every registration/payment save belonging to this account.
 SELECT * INTO person FROM public.profiles WHERE id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Seu cadastro não foi encontrado. Entre novamente.' USING ERRCODE='22023'; END IF;
 SELECT * INTO driver FROM public.courier_profiles WHERE user_id=uid FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO public.courier_profiles(user_id) VALUES(uid) RETURNING * INTO driver;
 END IF;
 current_data:=to_jsonb(driver)||jsonb_build_object('nome',person.nome,'telefone',coalesce(nullif(btrim(driver.telefone),''),person.telefone),'foto_url',coalesce(driver.foto_url,person.foto_url));
 FOR field IN SELECT jsonb_object_keys(p_patch) LOOP
  IF field='endereco' THEN
   IF coalesce(current_data->field,'{}'::jsonb) IS DISTINCT FROM coalesce(p_expected->field,'{}'::jsonb) AND NOT (coalesce(current_data->field,'null'::jsonb)='null'::jsonb AND p_expected->field='{}'::jsonb) THEN
    RAISE EXCEPTION 'Seu endereço foi atualizado em outra tela. Confira os dados atuais antes de salvar.' USING ERRCODE='40001'; END IF;
  ELSIF nullif(btrim(current_data->>field),'') IS DISTINCT FROM nullif(btrim(p_expected->>field),'') THEN
   RAISE EXCEPTION 'Seu cadastro foi atualizado em outra tela. Confira os dados atuais antes de salvar.' USING ERRCODE='40001';
  END IF;
 END LOOP;
 person:=jsonb_populate_record(person,p_patch - ARRAY['whatsapp','cpf','rg','nascimento','cnh','cnh_categoria','cnh_validade','pix_key','pix_tipo','banco_nome','banco_agencia','banco_conta','banco_tipo','banco_titular','contato_emergencia_nome','contato_emergencia_tel','cidade_atuacao','endereco']);
 driver:=jsonb_populate_record(driver,p_patch-'nome');
 UPDATE public.profiles SET nome=person.nome,telefone=person.telefone,foto_url=person.foto_url WHERE id=uid;
 UPDATE public.courier_profiles SET foto_url=driver.foto_url,telefone=driver.telefone,whatsapp=driver.whatsapp,cpf=driver.cpf,rg=driver.rg,nascimento=driver.nascimento,
 cnh=driver.cnh,cnh_categoria=driver.cnh_categoria,cnh_validade=driver.cnh_validade,pix_key=driver.pix_key,pix_tipo=driver.pix_tipo,
 banco_nome=driver.banco_nome,banco_agencia=driver.banco_agencia,banco_conta=driver.banco_conta,banco_tipo=driver.banco_tipo,banco_titular=driver.banco_titular,
 contato_emergencia_nome=driver.contato_emergencia_nome,contato_emergencia_tel=driver.contato_emergencia_tel,cidade_atuacao=driver.cidade_atuacao,endereco=driver.endereco
 WHERE user_id=uid;
 completion:=public.check_profile_complete(uid,'entregador');
 UPDATE public.courier_profiles SET onboarding_completed=(completion->>'complete')::boolean WHERE user_id=uid RETURNING * INTO driver;
 RETURN jsonb_build_object('profile',jsonb_build_object('id',person.id,'nome',person.nome,'telefone',person.telefone,'foto_url',person.foto_url),'courier',to_jsonb(driver),'completion',completion);
END $$;
CREATE FUNCTION public.save_courier_registration(p_patch jsonb,p_expected jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.save_courier_registration(p_patch,p_expected) $$;
REVOKE ALL ON FUNCTION private.save_courier_registration(jsonb,jsonb),public.save_courier_registration(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.save_courier_registration(jsonb,jsonb),public.save_courier_registration(jsonb,jsonb) TO authenticated;

-- Switching vehicles must not leave all vehicles inactive if the second write fails.
CREATE FUNCTION public.activate_my_courier_vehicle(p_vehicle uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); item public.courier_vehicles%ROWTYPE;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Entre novamente.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.courier_profiles WHERE user_id=uid FOR UPDATE;
 SELECT * INTO item FROM public.courier_vehicles WHERE id=p_vehicle AND courier_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Veículo não encontrado no seu cadastro.' USING ERRCODE='42501'; END IF;
 UPDATE public.courier_vehicles SET ativo=false WHERE courier_id=uid AND ativo AND id<>p_vehicle;
 UPDATE public.courier_vehicles SET ativo=true WHERE id=p_vehicle AND courier_id=uid RETURNING * INTO item;
 RETURN to_jsonb(item);
END $$;
REVOKE ALL ON FUNCTION public.activate_my_courier_vehicle(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_my_courier_vehicle(uuid) TO authenticated;
