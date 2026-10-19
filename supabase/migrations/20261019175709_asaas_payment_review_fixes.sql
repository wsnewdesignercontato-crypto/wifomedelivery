-- Review: explicit funding, temporary settlement holds, immutable credentials, idempotent cancellation.
CREATE TABLE asaas_private.order_funding(order_id uuid PRIMARY KEY REFERENCES public.orders(id),attempt_id uuid NOT NULL UNIQUE REFERENCES asaas_private.payment_attempts(id),settlement_hold boolean NOT NULL DEFAULT false);
ALTER TABLE asaas_private.order_funding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON asaas_private.order_funding FROM PUBLIC,anon,authenticated;
ALTER TABLE asaas_private.payment_issues DROP CONSTRAINT payment_issues_order_id_kind_key;
ALTER TABLE asaas_private.payment_issues ADD UNIQUE(order_id,attempt_id,kind);
CREATE TABLE asaas_private.credential_versions(environment text NOT NULL,revision uuid NOT NULL,api_key_secret_id uuid NOT NULL,webhook_token_secret_id uuid,PRIMARY KEY(environment,revision));
ALTER TABLE asaas_private.credential_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON asaas_private.credential_versions FROM PUBLIC,anon,authenticated;
CREATE FUNCTION asaas_private.snapshot_credentials(_environment text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s asaas_private.settings%ROWTYPE;k text;t text;BEGIN
 SELECT * INTO s FROM asaas_private.settings WHERE environment=_environment FOR UPDATE;
 IF s.api_key_secret_id IS NULL OR EXISTS(SELECT FROM asaas_private.credential_versions WHERE environment=s.environment AND revision=s.revision) THEN RETURN;END IF;
 SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE id=s.api_key_secret_id;
 SELECT decrypted_secret INTO t FROM vault.decrypted_secrets WHERE id=s.webhook_token_secret_id;
 INSERT INTO asaas_private.credential_versions VALUES(s.environment,s.revision,vault.create_secret(k,NULL,'Immutable Asaas payment credential revision'),CASE WHEN t IS NOT NULL THEN vault.create_secret(t,NULL,'Historical Asaas webhook authentication') END);
END $$;
REVOKE ALL ON FUNCTION asaas_private.snapshot_credentials(text) FROM PUBLIC,anon,authenticated,service_role;
SELECT asaas_private.snapshot_credentials('production');SELECT asaas_private.snapshot_credentials('sandbox');
CREATE FUNCTION public.asaas_payment_credentials(_environment text,_revision uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 SELECT jsonb_build_object('environment',v.environment,'revision',v.revision,'apiKey',k.decrypted_secret) INTO result FROM asaas_private.credential_versions v JOIN vault.decrypted_secrets k ON k.id=v.api_key_secret_id WHERE v.environment=_environment AND v.revision=_revision;
 IF result IS NULL THEN RAISE EXCEPTION 'Historical payment credentials unavailable' USING ERRCODE='55000';END IF;RETURN result;
END $$;
CREATE FUNCTION public.asaas_webhook_tokens(_environment text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(DISTINCT t.decrypted_secret),'[]'::jsonb) FROM vault.decrypted_secrets t WHERE t.id IN(SELECT webhook_token_secret_id FROM asaas_private.settings WHERE environment=_environment UNION SELECT v.webhook_token_secret_id FROM asaas_private.credential_versions v WHERE v.environment=_environment AND EXISTS(SELECT FROM asaas_private.payment_attempts a WHERE a.environment=v.environment AND a.config_revision=v.revision))
$$;
CREATE OR REPLACE FUNCTION private.guard_online_order() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.payment_channel,NEW.online_payment_state,NEW.online_paid_at) IS DISTINCT FROM ROW(OLD.payment_channel,OLD.online_payment_state,OLD.online_paid_at)
 AND(current_user<>'postgres' OR current_setting('app.order_write_context',true) IS DISTINCT FROM 'asaas_payment') THEN RAISE EXCEPTION 'Payment channel is server controlled' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' THEN
  IF (OLD.payment_channel='asaas' OR NEW.payment_channel='asaas') AND ROW(NEW.payment_channel,NEW.online_payment_state,NEW.online_paid_at,NEW.refund_status,NEW.refund_amount_cents,NEW.refunded_at) IS DISTINCT FROM ROW(OLD.payment_channel,OLD.online_payment_state,OLD.online_paid_at,OLD.refund_status,OLD.refund_amount_cents,OLD.refunded_at)
   AND (current_user<>'postgres' OR current_setting('app.order_write_context',true) IS DISTINCT FROM 'asaas_payment') THEN
    RAISE EXCEPTION 'Online payment is server controlled' USING ERRCODE='42501';
  END IF;
  IF OLD.payment_channel='asaas' AND ((OLD.status='pending_payment' AND NEW.status NOT IN('pending_payment','cancelled')) OR NEW.status='refunded' AND NEW.status IS DISTINCT FROM OLD.status)
   AND (current_user<>'postgres' OR current_setting('app.order_write_context',true) IS DISTINCT FROM 'asaas_payment') THEN
    RAISE EXCEPTION 'Payment confirmation required' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION asaas_private.validate_snapshot(a asaas_private.payment_attempts,s jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cid text;
BEGIN
 cid:=a.customer_id; IF cid IS NULL THEN SELECT customer_id INTO cid FROM asaas_private.customers WHERE user_id=a.user_id AND environment=a.environment;END IF;
 IF s IS NULL OR jsonb_typeof(s)<>'object' OR s->>'id' IS NULL OR s->>'id' !~ '^[A-Za-z0-9_-]{1,128}$'
  OR coalesce(s->>'customerId','') IS DISTINCT FROM coalesce(cid,'!missing') OR s->>'externalReference' IS DISTINCT FROM a.external_reference
  OR s->>'billingType' IS DISTINCT FROM a.billing_type OR jsonb_typeof(s->'valueCents') IS DISTINCT FROM 'number' OR (s->>'valueCents')::numeric IS DISTINCT FROM a.value_cents
  OR coalesce(s->>'status','') !~ '^[A-Z][A-Z0-9_]{1,63}$' OR coalesce((s->>'refundedValueCents')::numeric,-1) NOT BETWEEN 0 AND a.value_cents
  OR a.payment_id IS NOT NULL AND s->>'id' IS DISTINCT FROM a.payment_id THEN
  RAISE EXCEPTION 'Payment identity or amount mismatch' USING ERRCODE='22023';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.asaas_settings_save(_environment text,_notification_email text,_api_key text DEFAULT NULL,_webhook_token text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_key text;new_key text;
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 PERFORM 1 FROM asaas_private.settings WHERE environment=_environment FOR UPDATE;
 IF EXISTS(SELECT FROM asaas_private.payment_attempts a JOIN public.orders o ON o.id=a.order_id WHERE a.environment=_environment AND
  (a.state NOT IN('declined','expired','cancelled','refunded') AND (o.status NOT IN('delivered','cancelled','refunded') OR o.payment_received_at IS NULL)))
  OR _environment='production' AND EXISTS(SELECT FROM public.orders WHERE payment_channel='asaas' AND status='pending_payment')
  OR EXISTS(SELECT FROM asaas_private.payment_issues i JOIN asaas_private.payment_attempts a ON a.id=i.attempt_id WHERE a.environment=_environment AND i.resolved_at IS NULL) THEN
  RAISE EXCEPTION 'Reconcile active payments before changing configuration' USING ERRCODE='55000';
 END IF;
 SELECT k.decrypted_secret INTO old_key FROM asaas_private.settings s JOIN vault.decrypted_secrets k ON k.id=s.api_key_secret_id WHERE s.environment=_environment;
 PERFORM asaas_private.snapshot_credentials(_environment);
 PERFORM asaas_private.settings_save_v1(_environment,_notification_email,_api_key,_webhook_token);
 SELECT k.decrypted_secret INTO new_key FROM asaas_private.settings s JOIN vault.decrypted_secrets k ON k.id=s.api_key_secret_id WHERE s.environment=_environment;
 IF old_key IS DISTINCT FROM new_key THEN DELETE FROM asaas_private.customers WHERE environment=_environment;END IF;
 PERFORM asaas_private.snapshot_credentials(_environment);
 UPDATE asaas_private.settings SET online_enabled=false,registered_payment_contract=0 WHERE environment=_environment;
 RETURN public.asaas_settings_get(_environment);
END $$;
CREATE OR REPLACE FUNCTION public.asaas_payment_work_complete(_work_id uuid,_operation_id uuid,_outcome text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a asaas_private.payment_attempts%ROWTYPE;changed integer;
BEGIN
 IF _outcome IS NULL OR _outcome NOT IN('done','retry','review') THEN RAISE EXCEPTION 'Invalid work outcome' USING ERRCODE='22023'; END IF;
 UPDATE asaas_private.webhook_events SET operation_id=NULL,operation_expires_at=NULL,
  processed_at=CASE WHEN _outcome IN('done','review') THEN clock_timestamp() ELSE processed_at END,
  review_required=_outcome='review',next_check_at=clock_timestamp()+least(900,greatest(30,attempts*30))*interval '1 second'
 WHERE work_id=_work_id AND operation_id=_operation_id;
 GET DIAGNOSTICS changed=ROW_COUNT;IF changed=1 THEN RETURN true; END IF;
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE id=_work_id AND operation_id=_operation_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE asaas_private.payment_attempts SET operation_id=NULL,operation_expires_at=NULL,next_check_at=clock_timestamp()+CASE WHEN _outcome='review' THEN interval '15 minutes' ELSE interval '1 minute' END WHERE id=a.id;
 IF _outcome='review' THEN INSERT INTO asaas_private.payment_issues(order_id,attempt_id,kind) VALUES(a.order_id,a.id,'reconciliation') ON CONFLICT(order_id,attempt_id,kind) DO UPDATE SET resolved_at=NULL; END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION private.online_cancellation_issue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a asaas_private.payment_attempts%ROWTYPE;paid boolean:=false;prior text:=current_setting('app.order_write_context',true);BEGIN
 IF NEW.payment_channel<>'asaas' OR NEW.status<>'cancelled' OR OLD.status='cancelled' THEN RETURN NEW;END IF;
 FOR a IN SELECT * FROM asaas_private.payment_attempts WHERE order_id=NEW.id ORDER BY attempt_no FOR UPDATE LOOP
  UPDATE asaas_private.payment_attempts SET cancel_requested_at=coalesce(cancel_requested_at,clock_timestamp()),next_check_at=clock_timestamp() WHERE id=a.id;
  IF a.paid_at IS NOT NULL AND a.state<>'refunded' THEN
   paid:=true;UPDATE asaas_private.payment_attempts SET state='refund_pending' WHERE id=a.id;
   INSERT INTO asaas_private.payment_issues(order_id,attempt_id,kind) VALUES(NEW.id,a.id,'refund_required') ON CONFLICT(order_id,attempt_id,kind) DO UPDATE SET resolved_at=NULL;
  END IF;
 END LOOP;
 IF paid THEN
  PERFORM set_config('app.order_write_context','asaas_payment',true);UPDATE public.orders SET online_payment_state='refund_pending' WHERE id=NEW.id;UPDATE public.platform_ledger SET status='reversed' WHERE order_id=NEW.id;PERFORM set_config('app.order_write_context',coalesce(prior,''),true);
 END IF;RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.asaas_payment_cancel_request(_user_id uuid,_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE;a asaas_private.payment_attempts%ROWTYPE;prior text:=current_setting('app.order_write_context',true);BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id AND cliente_id=_user_id FOR UPDATE;
 IF NOT FOUND OR o.payment_channel<>'asaas' OR o.status NOT IN('pending_payment','placed','accepted','cancelled') THEN RAISE EXCEPTION 'Payment cannot be cancelled here' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE order_id=o.id ORDER BY attempt_no DESC LIMIT 1 FOR UPDATE;
 PERFORM set_config('app.order_write_context','asaas_payment',true);
 IF a.id IS NULL THEN
  UPDATE public.orders SET status='cancelled',online_payment_state='cancelled',cancellation_reason='Cancelado antes de criar a cobrança.',cancelled_role='cliente',cancelled_by=_user_id,cancelled_at=coalesce(cancelled_at,clock_timestamp()) WHERE id=o.id;
 ELSE
  UPDATE asaas_private.payment_attempts SET cancel_requested_at=coalesce(cancel_requested_at,clock_timestamp()),next_check_at=clock_timestamp() WHERE order_id=o.id AND state<>'refunded';
  IF o.status<>'cancelled' THEN UPDATE public.orders SET status='cancelled',online_payment_state='cancel_pending',cancellation_reason='Cancelado pelo cliente. Conferindo a cobrança.',cancelled_role='cliente',cancelled_by=_user_id,cancelled_at=clock_timestamp() WHERE id=o.id;END IF;
  IF NOT EXISTS(SELECT FROM asaas_private.payment_attempts WHERE order_id=o.id AND state NOT IN('declined','refunded','cancelled','expired')) AND NOT EXISTS(SELECT FROM asaas_private.order_funding WHERE order_id=o.id) THEN UPDATE public.orders SET online_payment_state='cancelled' WHERE id=o.id;END IF;
 END IF;
 PERFORM set_config('app.order_write_context',coalesce(prior,''),true);RETURN public.asaas_payment_view(_user_id,_order_id);
END $$;
CREATE OR REPLACE FUNCTION public.asaas_payment_apply(_attempt_id uuid,_snapshot jsonb,_source_event_id text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<payment_update>>
DECLARE a asaas_private.payment_attempts%ROWTYPE;o public.orders%ROWTYPE;f asaas_private.order_funding%ROWTYPE;primary_attempt asaas_private.payment_attempts%ROWTYPE;oid uuid;state text;paid boolean;other_paid boolean;overall text;prior text:=current_setting('app.order_write_context',true);refund integer;
BEGIN
 SELECT order_id INTO oid FROM asaas_private.payment_attempts WHERE id=_attempt_id;
 SELECT * INTO o FROM public.orders WHERE id=oid FOR UPDATE;
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE id=_attempt_id FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Unknown attempt' USING ERRCODE='22023';END IF;
 PERFORM asaas_private.validate_snapshot(a,_snapshot);
 refund:=(_snapshot->>'refundedValueCents')::integer;
 state:=CASE WHEN _snapshot->>'status' LIKE '%CHARGEBACK%' THEN 'disputed' WHEN refund>=a.value_cents OR _snapshot->>'status'='REFUNDED' THEN 'refunded' WHEN refund>0 THEN 'partially_refunded' WHEN _snapshot->>'status' IN('REFUND_REQUESTED','REFUND_IN_PROGRESS') THEN 'refund_pending' WHEN _snapshot->>'status'='RECEIVED' THEN 'received' WHEN _snapshot->>'status'='CONFIRMED' THEN 'confirmed' WHEN _snapshot->>'status' IN('AWAITING_RISK_ANALYSIS','PENDING_RISK_ANALYSIS') THEN 'risk_analysis' WHEN _snapshot->>'status' IN('REPROVED_BY_RISK_ANALYSIS','CREDIT_CARD_CAPTURE_REFUSED') THEN 'declined' WHEN _snapshot->>'status'='DELETED' THEN 'cancelled' WHEN _snapshot->>'status'='AUTHORIZED' THEN 'processing' ELSE 'pending' END;
 IF a.state='refunded' THEN state:='refunded';
 ELSIF a.state IN('partially_refunded','disputed') AND state NOT IN('partially_refunded','refunded','disputed') THEN state:=a.state;
 ELSIF a.state IN('confirmed','received','refund_pending') AND state IN('pending','processing','risk_analysis','declined','cancelled') THEN state:=a.state;
 ELSIF a.state='received' AND state='confirmed' THEN state:='received';
 ELSIF a.state IN('cancelled','expired') AND state IN('pending','processing','risk_analysis','declined') THEN state:=a.state;END IF;
 IF a.cancel_requested_at IS NOT NULL AND state IN('pending','processing','risk_analysis','declined') THEN state:='cancel_pending';END IF;
 paid:=state IN('confirmed','received','refund_pending','partially_refunded','refunded','disputed');
 PERFORM set_config('app.order_write_context','asaas_payment',true);
 IF paid THEN INSERT INTO asaas_private.order_funding(order_id,attempt_id) VALUES(o.id,a.id) ON CONFLICT(order_id) DO NOTHING;END IF;
 SELECT * INTO f FROM asaas_private.order_funding WHERE order_id=o.id;
 IF paid AND f.attempt_id<>a.id THEN
  IF state='refunded' THEN UPDATE asaas_private.payment_issues SET resolved_at=clock_timestamp() WHERE order_id=o.id AND attempt_id=a.id AND resolved_at IS NULL;
  ELSE
   state:='refund_pending';UPDATE asaas_private.order_funding SET settlement_hold=true WHERE order_id=o.id;
   UPDATE public.platform_ledger SET status='pending' WHERE order_id=o.id AND status='paid';
   INSERT INTO asaas_private.payment_issues(order_id,attempt_id,kind) VALUES(o.id,a.id,'duplicate_payment') ON CONFLICT(order_id,attempt_id,kind) DO UPDATE SET resolved_at=NULL;
  END IF;
 ELSIF paid THEN
  IF o.status='pending_payment' THEN
   IF state IN('confirmed','received') AND o.created_at+interval '10 minutes'>clock_timestamp() AND a.cancel_requested_at IS NULL AND EXISTS(SELECT FROM public.establishments WHERE id=o.establishment_id AND status='aprovado' AND is_open) THEN UPDATE public.orders SET status='placed' WHERE id=o.id;
   ELSE UPDATE public.orders SET status='cancelled',cancellation_reason='Pagamento recebido sem possibilidade de atendimento. Reembolso em análise.',cancelled_role='sistema',cancelled_at=clock_timestamp() WHERE id=o.id;o.status:='cancelled';END IF;
  END IF;
  IF o.status='cancelled' AND state<>'refunded' THEN state:='refund_pending';END IF;
  IF state IN('refund_pending','partially_refunded','disputed') THEN
   INSERT INTO asaas_private.payment_issues(order_id,attempt_id,kind) VALUES(o.id,a.id,CASE WHEN state='refund_pending' THEN 'refund_required' ELSE state END) ON CONFLICT(order_id,attempt_id,kind) DO UPDATE SET resolved_at=NULL;
   UPDATE public.platform_ledger SET status='reversed' WHERE order_id=o.id;
  ELSIF state='refunded' THEN
   UPDATE asaas_private.payment_issues SET resolved_at=clock_timestamp() WHERE order_id=o.id AND attempt_id=a.id AND resolved_at IS NULL;
   UPDATE public.platform_ledger SET status='reversed' WHERE order_id=o.id;
   IF (SELECT status FROM public.orders WHERE id=o.id) NOT IN('cancelled','refunded','delivered') THEN UPDATE public.orders SET status='cancelled',cancellation_reason='Pagamento reembolsado na Asaas.',cancelled_role='sistema',cancelled_at=clock_timestamp() WHERE id=o.id;END IF;
  END IF;
 ELSIF state='cancelled' AND o.status='pending_payment' THEN
  UPDATE public.orders SET status='cancelled',cancellation_reason='Cobrança cancelada.',cancelled_role='sistema',cancelled_at=clock_timestamp() WHERE id=o.id;
 END IF;
 UPDATE asaas_private.payment_attempts SET payment_id=_snapshot->>'id',customer_id=_snapshot->>'customerId',state=payment_update.state,provider_status=_snapshot->>'status',net_value_cents=CASE WHEN jsonb_typeof(_snapshot->'netValueCents')='number' THEN (_snapshot->>'netValueCents')::integer ELSE NULL END,refunded_value_cents=greatest(refunded_value_cents,refund),paid_at=CASE WHEN paid THEN coalesce(paid_at,clock_timestamp()) ELSE paid_at END,operation_id=NULL,operation_expires_at=NULL,next_check_at=clock_timestamp()+interval '1 minute',updated_at=clock_timestamp() WHERE id=a.id;
 SELECT p.* INTO primary_attempt FROM asaas_private.order_funding funding JOIN asaas_private.payment_attempts p ON p.id=funding.attempt_id WHERE funding.order_id=o.id;
 SELECT EXISTS(SELECT FROM asaas_private.payment_attempts p WHERE p.order_id=o.id AND p.id<>primary_attempt.id AND p.paid_at IS NOT NULL AND p.state<>'refunded') INTO other_paid;
 overall:=coalesce(primary_attempt.state,payment_update.state);
 IF primary_attempt.state='refunded' AND NOT other_paid THEN
  UPDATE public.orders SET status='refunded',refund_status='completed',refund_amount_cents=primary_attempt.value_cents,refunded_at=coalesce(refunded_at,clock_timestamp()) WHERE id=o.id;
  UPDATE asaas_private.payment_issues SET resolved_at=clock_timestamp() WHERE order_id=o.id AND resolved_at IS NULL;
 ELSIF primary_attempt.state='refunded' AND other_paid OR primary_attempt.state IN('confirmed','received') AND EXISTS(SELECT FROM asaas_private.payment_issues WHERE order_id=o.id AND resolved_at IS NULL) THEN overall:='refund_pending';END IF;
 UPDATE public.orders SET online_payment_state=overall,online_paid_at=CASE WHEN paid THEN coalesce(online_paid_at,clock_timestamp()) ELSE online_paid_at END WHERE id=o.id;
 IF _source_event_id IS NOT NULL THEN UPDATE asaas_private.webhook_events SET processed_at=clock_timestamp(),operation_id=NULL,operation_expires_at=NULL WHERE environment=a.environment AND event_id=_source_event_id;END IF;
 PERFORM set_config('app.order_write_context',coalesce(prior,''),true);RETURN public.asaas_payment_view(a.user_id,o.id);
END $$;
CREATE OR REPLACE FUNCTION public.settle_order_payment(p_order_id uuid,p_reference text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE;f asaas_private.order_funding%ROWTYPE;BEGIN
 IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF o.payment_channel='asaas' AND(o.online_payment_state IS DISTINCT FROM 'received' OR EXISTS(SELECT FROM asaas_private.payment_issues WHERE order_id=o.id AND resolved_at IS NULL)) THEN RAISE EXCEPTION 'Reconcile payment and issues first' USING ERRCODE='22023';END IF;
 SELECT * INTO f FROM asaas_private.order_funding WHERE order_id=o.id;
 IF f.settlement_hold AND o.payment_received_at IS NOT NULL THEN
  IF o.status<>'delivered' OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'Review delivered payment with a reference' USING ERRCODE='22023';END IF;
  UPDATE public.platform_ledger SET status='paid' WHERE order_id=o.id AND status='pending';
  INSERT INTO public.admin_audit_log(admin_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'review_online_payment_hold','order',o.id,jsonb_build_object('reference',btrim(p_reference)));
 ELSE PERFORM private.settle_order_payment_legacy(p_order_id,p_reference);END IF;
 UPDATE asaas_private.order_funding SET settlement_hold=false WHERE order_id=o.id;
END $$;
CREATE FUNCTION public.asaas_payment_event_context(_environment text,_payment_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT asaas_private.attempt_context(a,'reconcile') FROM asaas_private.payment_attempts a WHERE environment=_environment AND payment_id=_payment_id
$$;
CREATE FUNCTION public.asaas_payment_admin_context(_order_id uuid,_attempt_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT asaas_private.attempt_context(a,'reconcile') FROM asaas_private.payment_attempts a WHERE order_id=_order_id AND(_attempt_id IS NULL OR a.id=_attempt_id) ORDER BY attempt_no DESC LIMIT 1
$$;
DO $$ DECLARE p regprocedure;BEGIN FOR p IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'asaas_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',p);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',p);END LOOP;END $$;
NOTIFY pgrst,'reload schema';
CREATE OR REPLACE FUNCTION public.asaas_payment_context(_user_id uuid,_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a asaas_private.payment_attempts%ROWTYPE;BEGIN
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=_order_id AND cliente_id=_user_id AND payment_channel='asaas') THEN RAISE EXCEPTION 'Forbidden payment' USING ERRCODE='42501';END IF;
 SELECT p.* INTO a FROM asaas_private.payment_attempts p LEFT JOIN asaas_private.order_funding f ON f.attempt_id=p.id WHERE p.order_id=_order_id ORDER BY (f.attempt_id IS NOT NULL) DESC,p.attempt_no DESC LIMIT 1;
 RETURN CASE WHEN a.id IS NOT NULL THEN asaas_private.attempt_context(a,'reconcile') ELSE NULL END;
END $$;
REVOKE ALL ON FUNCTION public.asaas_payment_context(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_payment_context(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.expire_unpaid_asaas_orders() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE;n integer:=0;prior text:=current_setting('app.order_write_context',true);
BEGIN
 PERFORM set_config('app.order_write_context','asaas_payment',true);
 FOR o IN SELECT * FROM public.orders WHERE payment_channel='asaas' AND status='pending_payment' AND created_at+interval '10 minutes'<=clock_timestamp() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 100 LOOP
  UPDATE public.orders SET status='cancelled',online_payment_state=CASE WHEN EXISTS(SELECT FROM asaas_private.payment_attempts WHERE order_id=o.id) THEN 'cancel_pending' ELSE 'expired' END,cancellation_reason='O prazo para pagar terminou. Conferindo a cobrança antes de concluir o cancelamento.',cancelled_role='sistema',cancelled_at=clock_timestamp() WHERE id=o.id;
  n:=n+1;
 END LOOP;
 PERFORM set_config('app.order_write_context',coalesce(prior,''),true);RETURN n;
END $$;
