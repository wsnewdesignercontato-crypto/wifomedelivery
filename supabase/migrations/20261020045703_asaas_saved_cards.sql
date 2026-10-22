-- Opaque provider tokens only. The server derives _user_id from authenticated
-- request context and calls save only after explicit customer opt-in.
CREATE TABLE asaas_private.saved_cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 environment text NOT NULL REFERENCES asaas_private.settings(environment),
 config_revision uuid NOT NULL,
 customer_id text NOT NULL CHECK(customer_id ~ '^cus_[A-Za-z0-9_-]{1,120}$'),
 token_secret_id uuid NOT NULL UNIQUE REFERENCES vault.secrets(id) ON DELETE CASCADE,
 token_fingerprint bytea NOT NULL CHECK(octet_length(token_fingerprint)=32),
 brand text NOT NULL CHECK(brand ~ '^[A-Za-z][A-Za-z0-9 _-]{0,31}$'),
 last4 text NOT NULL CHECK(last4 ~ '^[0-9]{4}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(user_id,environment,config_revision,token_fingerprint)
);
ALTER TABLE asaas_private.saved_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON asaas_private.saved_cards FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SCHEMA asaas_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA asaas_private TO service_role;
GRANT SELECT,INSERT,DELETE ON asaas_private.saved_cards TO service_role;
GRANT SELECT(user_id,environment,customer_id) ON asaas_private.customers TO service_role;
GRANT SELECT(environment,revision,online_enabled,tested,api_key_secret_id,webhook_token_secret_id,webhook_id,webhook_revision,registered_payment_contract) ON asaas_private.settings TO service_role;
GRANT SELECT(id,email_confirmed_at,deleted_at,banned_until) ON auth.users TO service_role;
-- Vault's existing service-role grants provide create_secret, decrypted SELECT,
-- and secrets access. No new access to unrelated Vault secrets is granted here.

-- Auth-user cascades run as the auth deletion role, which should not receive
-- broad Vault privileges. This private trigger deletes only the associated
-- token secret after its saved-card row has been removed.
CREATE FUNCTION asaas_private.delete_saved_card_secret()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM vault.secrets WHERE id=OLD.token_secret_id;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION asaas_private.delete_saved_card_secret() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER delete_saved_card_secret AFTER DELETE ON asaas_private.saved_cards
FOR EACH ROW EXECUTE FUNCTION asaas_private.delete_saved_card_secret();

CREATE FUNCTION public.asaas_saved_cards_list(_user_id uuid,_environment text,_revision uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',card.id,'brand',card.brand,'last4',card.last4) ORDER BY card.created_at DESC,card.id),'[]'::jsonb)
 FROM asaas_private.saved_cards card
 JOIN asaas_private.customers customer ON customer.user_id=card.user_id AND customer.environment=card.environment AND customer.customer_id=card.customer_id
 JOIN asaas_private.settings settings ON settings.environment=card.environment AND settings.revision=card.config_revision
 JOIN auth.users account ON account.id=card.user_id
 WHERE card.user_id=_user_id AND card.environment=_environment AND card.config_revision=_revision
 AND account.email_confirmed_at IS NOT NULL AND account.deleted_at IS NULL AND (account.banned_until IS NULL OR account.banned_until<=now())
 AND settings.online_enabled AND settings.tested AND settings.api_key_secret_id IS NOT NULL AND settings.webhook_token_secret_id IS NOT NULL
 AND settings.webhook_id IS NOT NULL AND settings.webhook_revision=settings.revision AND settings.registered_payment_contract=1
$$;

CREATE FUNCTION public.asaas_saved_card_get(_user_id uuid,_environment text,_revision uuid,_card_id uuid,_customer_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('token',secret.decrypted_secret)
 FROM asaas_private.saved_cards card
 JOIN asaas_private.customers customer ON customer.user_id=card.user_id AND customer.environment=card.environment AND customer.customer_id=card.customer_id
 JOIN asaas_private.settings settings ON settings.environment=card.environment AND settings.revision=card.config_revision
 JOIN auth.users account ON account.id=card.user_id
 JOIN vault.decrypted_secrets secret ON secret.id=card.token_secret_id
 WHERE card.id=_card_id AND card.user_id=_user_id AND card.environment=_environment AND card.config_revision=_revision AND card.customer_id=_customer_id
 AND account.email_confirmed_at IS NOT NULL AND account.deleted_at IS NULL AND (account.banned_until IS NULL OR account.banned_until<=now())
 AND settings.online_enabled AND settings.tested AND settings.api_key_secret_id IS NOT NULL AND settings.webhook_token_secret_id IS NOT NULL
 AND settings.webhook_id IS NOT NULL AND settings.webhook_revision=settings.revision AND settings.registered_payment_contract=1
$$;

CREATE FUNCTION public.asaas_saved_card_save(_user_id uuid,_environment text,_revision uuid,_customer_id text,_token text,_brand text,_last4 text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE card_id uuid; secret_id uuid; fingerprint bytea;
BEGIN
 IF _user_id IS NULL OR _revision IS NULL OR _environment IS NULL OR _environment NOT IN('sandbox','production')
  OR _customer_id IS NULL OR _customer_id !~ '^cus_[A-Za-z0-9_-]{1,120}$'
  OR _token IS NULL OR length(_token) NOT BETWEEN 16 AND 256 OR _token !~ '^[A-Za-z0-9_-]+$' OR _token !~ '[A-Za-z_-]'
  OR _brand IS NULL OR _brand !~ '^[A-Za-z][A-Za-z0-9 _-]{0,31}$' OR _last4 IS NULL OR _last4 !~ '^[0-9]{4}$' THEN
  RAISE EXCEPTION 'Invalid saved card metadata' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT FROM auth.users WHERE id=_user_id AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now())) THEN
  RAISE EXCEPTION 'Confirmed active account required' USING ERRCODE='42501';
 END IF;
 -- Bind the token to this exact config/customer snapshot. A concurrent rotation
 -- makes this row inaccessible through list/get; no UPDATE grant is needed.
 PERFORM environment FROM asaas_private.settings WHERE environment=_environment AND revision=_revision
  AND online_enabled AND tested AND api_key_secret_id IS NOT NULL AND webhook_token_secret_id IS NOT NULL
  AND webhook_id IS NOT NULL AND webhook_revision=revision AND registered_payment_contract=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current online configuration required' USING ERRCODE='55000'; END IF;
 PERFORM user_id FROM asaas_private.customers WHERE user_id=_user_id AND environment=_environment AND customer_id=_customer_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer does not belong to account' USING ERRCODE='42501'; END IF;
 fingerprint:=extensions.digest(_token,'sha256');
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_user_id::text||':'||_environment||':'||_revision::text||':'||encode(fingerprint,'hex'),0));
 SELECT id INTO card_id FROM asaas_private.saved_cards WHERE user_id=_user_id AND environment=_environment AND config_revision=_revision AND token_fingerprint=fingerprint AND customer_id=_customer_id;
 IF card_id IS NOT NULL THEN RETURN card_id; END IF;
 secret_id:=vault.create_secret(_token,NULL,'Asaas saved card opaque token');
 INSERT INTO asaas_private.saved_cards(user_id,environment,config_revision,customer_id,token_secret_id,token_fingerprint,brand,last4)
 VALUES(_user_id,_environment,_revision,_customer_id,secret_id,fingerprint,_brand,_last4) RETURNING id INTO card_id;
 RETURN card_id;
END $$;

CREATE FUNCTION public.asaas_saved_card_remove(_user_id uuid,_card_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 DELETE FROM asaas_private.saved_cards WHERE id=_card_id AND user_id=_user_id;
 RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.asaas_saved_cards_list(uuid,text,uuid),public.asaas_saved_card_get(uuid,text,uuid,uuid,text),public.asaas_saved_card_save(uuid,text,uuid,text,text,text,text),public.asaas_saved_card_remove(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_saved_cards_list(uuid,text,uuid),public.asaas_saved_card_get(uuid,text,uuid,uuid,text),public.asaas_saved_card_save(uuid,text,uuid,text,text,text,text),public.asaas_saved_card_remove(uuid,uuid) TO service_role;
