-- Explicit admin activation readiness; selecting an environment never enables checkout.
CREATE OR REPLACE FUNCTION public.asaas_online_status() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',asaas_private.online_available(),'requestedEnabled',s.online_enabled,'canEnable',s.tested AND s.api_key_secret_id IS NOT NULL AND s.webhook_token_secret_id IS NOT NULL AND s.webhook_revision=s.revision AND s.webhook_id IS NOT NULL AND s.registered_payment_contract=1) FROM asaas_private.settings s WHERE environment='production'
$$;
REVOKE ALL ON FUNCTION public.asaas_online_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_online_status() TO service_role;
NOTIFY pgrst,'reload schema';
