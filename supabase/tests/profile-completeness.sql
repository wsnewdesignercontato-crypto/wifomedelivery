BEGIN;
DO $$
DECLARE
  test_user uuid := gen_random_uuid();
  result jsonb;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data)
  VALUES(test_user, 'profile-contract-' || test_user || '@example.invalid', '{"nome":"Contrato temporário"}');
  UPDATE public.profiles SET nome='Contrato temporário', telefone='00000000000' WHERE id=test_user;

  result := public.check_profile_complete(test_user, 'entregador');
  IF result->>'complete' <> 'false' OR NOT (result->'missing' ? 'cpf')
    OR NOT (result->'missing' ? 'cidade_atuacao') THEN
    RAISE EXCEPTION 'Missing courier must return incomplete CPF/city instead of failing';
  END IF;

  INSERT INTO public.courier_profiles(user_id, cpf, cidade_atuacao, status)
  VALUES(test_user, '00000000000', 'Cidade fictícia de teste', 'offline');
  result := public.check_profile_complete(test_user, 'entregador');
  IF result->>'complete' <> 'true' OR jsonb_array_length(result->'missing') <> 0
    OR result->>'redirect' <> '/entregador/perfil/dados' THEN
    RAISE EXCEPTION 'Courier with required fields must be complete';
  END IF;

  UPDATE public.courier_profiles SET cpf=NULL WHERE user_id=test_user;
  result := public.check_profile_complete(test_user, 'entregador');
  IF result->>'complete' <> 'false' OR NOT (result->'missing' ? 'cpf') THEN
    RAISE EXCEPTION 'Courier without CPF must remain incomplete';
  END IF;

  result := public.check_profile_complete(test_user, 'cliente');
  IF result->>'complete' <> 'false' OR NOT (result->'missing' ? 'endereco') THEN
    RAISE EXCEPTION 'Customer address requirement must remain unchanged';
  END IF;
END $$;
ROLLBACK;
SELECT 'Courier profile completeness contracts passed; fixtures rolled back' AS result;
