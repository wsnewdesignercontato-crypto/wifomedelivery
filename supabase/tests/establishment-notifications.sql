-- Run inside a transaction and roll back. No real accounts or stores are approved.
CREATE TEMP TABLE approval_contract_ids(kind text PRIMARY KEY,id uuid DEFAULT gen_random_uuid());
GRANT SELECT ON approval_contract_ids TO authenticated;
INSERT INTO approval_contract_ids(kind) VALUES('owner'),('admin'),('store');
INSERT INTO auth.users(id,email,raw_user_meta_data)
SELECT id,'approval-contract-'||id||'@example.invalid','{}'::jsonb
FROM approval_contract_ids WHERE kind IN ('owner','admin');
INSERT INTO public.user_roles(user_id,role)
SELECT id,'admin' FROM approval_contract_ids WHERE kind='admin';
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM approval_contract_ids WHERE kind='owner'),true);
SET LOCAL ROLE authenticated;
INSERT INTO public.establishments(id,owner_id,nome,status,is_open)
VALUES((SELECT id FROM approval_contract_ids WHERE kind='store'),auth.uid(),'Approval contract rollback only','pendente',false);
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.notifications WHERE user_id=(SELECT id FROM approval_contract_ids WHERE kind='admin')
    AND audience='admin' AND link_url='/admin/estabelecimentos?loja='||(SELECT id::text FROM approval_contract_ids WHERE kind='store'))
  THEN RAISE EXCEPTION 'Admin did not receive registration notice'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM approval_contract_ids WHERE kind='admin'),true);
SET LOCAL ROLE authenticated;
UPDATE public.establishments SET status='aprovado',is_open=false WHERE id=(SELECT id FROM approval_contract_ids WHERE kind='store');
UPDATE public.establishments SET status='aprovado' WHERE id=(SELECT id FROM approval_contract_ids WHERE kind='store');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id=(SELECT id FROM approval_contract_ids WHERE kind='owner')
    AND audience='estabelecimento' AND titulo='Estabelecimento aprovado' AND link_url='/estabelecimento')<>1
  THEN RAISE EXCEPTION 'Owner approval notice missing or duplicated'; END IF;
  IF EXISTS(SELECT 1 FROM public.notifications WHERE audience='admin' AND NOT lida
    AND link_url='/admin/estabelecimentos?loja='||(SELECT id::text FROM approval_contract_ids WHERE kind='store'))
  THEN RAISE EXCEPTION 'Resolved admin registration notices remain unread'; END IF;
  IF has_function_privilege('anon','private.notify_establishment_registration()','EXECUTE')
    OR has_function_privilege('authenticated','private.notify_establishment_registration()','EXECUTE')
  THEN RAISE EXCEPTION 'Internal notification trigger is publicly executable'; END IF;
END $$;
