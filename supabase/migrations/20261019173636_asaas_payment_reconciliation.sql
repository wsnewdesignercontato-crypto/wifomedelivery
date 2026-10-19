-- Cancellation, late payment and background reconciliation.
CREATE FUNCTION private.expire_unpaid_asaas_orders() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE;n integer:=0;prior text:=current_setting('app.order_write_context',true);
BEGIN
 PERFORM set_config('app.order_write_context','asaas_payment',true);
 FOR o IN SELECT * FROM public.orders WHERE payment_channel='asaas' AND status='pending_payment' AND created_at+interval '10 minutes'<=clock_timestamp() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 100 LOOP
  UPDATE public.orders SET status='cancelled',online_payment_state='cancel_pending',cancellation_reason='O prazo para pagar terminou. Conferindo a cobrança antes de concluir o cancelamento.',cancelled_role='sistema',cancelled_at=clock_timestamp() WHERE id=o.id;
  n:=n+1;
 END LOOP;
 PERFORM set_config('app.order_write_context',coalesce(prior,''),true);RETURN n;
END $$;
REVOKE ALL ON FUNCTION private.expire_unpaid_asaas_orders() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.request_asaas_reconciliation() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text;
BEGIN
 PERFORM private.expire_unpaid_asaas_orders();
 IF NOT EXISTS(SELECT FROM asaas_private.payment_attempts WHERE next_check_at<=clock_timestamp() AND state NOT IN('refunded','cancelled','expired','declined')) AND NOT EXISTS(SELECT FROM asaas_private.webhook_events WHERE processed_at IS NULL AND next_check_at<=clock_timestamp()) THEN RETURN;END IF;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='asaas_reconcile_secret' LIMIT 1;
 IF coalesce(length(secret),0)<32 THEN RETURN;END IF;
 PERFORM net.http_post(url:='https://pedetrem.vercel.app/api/internal/asaas-reconcile',headers:=jsonb_build_object('Content-Type','application/json','x-asaas-reconcile-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=75000);
END $$;
REVOKE ALL ON FUNCTION private.request_asaas_reconciliation() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.asaas_payment_cancel_request(_user_id uuid,_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a asaas_private.payment_attempts%ROWTYPE;o public.orders%ROWTYPE;prior text:=current_setting('app.order_write_context',true);
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id AND cliente_id=_user_id FOR UPDATE;
 IF NOT FOUND OR o.payment_channel<>'asaas' OR o.status NOT IN('pending_payment','placed','accepted') THEN RAISE EXCEPTION 'Payment cannot be cancelled here' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE order_id=o.id ORDER BY attempt_no DESC LIMIT 1 FOR UPDATE;
 IF a.id IS NULL THEN
  UPDATE public.orders SET status='cancelled',cancellation_reason='Cancelado pelo cliente antes do pagamento.',cancelled_role='cliente',cancelled_by=_user_id,cancelled_at=clock_timestamp() WHERE id=o.id;
 ELSE
  UPDATE asaas_private.payment_attempts SET cancel_requested_at=clock_timestamp(),next_check_at=clock_timestamp() WHERE id=a.id;
  IF o.status IN('pending_payment','placed','accepted') THEN
   UPDATE public.orders SET status='cancelled',cancellation_reason='Cancelado pelo cliente. Reembolso em análise.',cancelled_role='cliente',cancelled_by=_user_id,cancelled_at=clock_timestamp() WHERE id=o.id;
  ELSE
   PERFORM set_config('app.order_write_context','asaas_payment',true);
   UPDATE public.orders SET online_payment_state='cancel_pending' WHERE id=o.id;
   PERFORM set_config('app.order_write_context',coalesce(prior,''),true);
  END IF;
 END IF;
 RETURN public.asaas_payment_view(_user_id,_order_id);
END $$;
CREATE OR REPLACE FUNCTION public.asaas_payment_apply(_attempt_id uuid,_snapshot jsonb,_source_event_id text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<payment_update>>
DECLARE a asaas_private.payment_attempts%ROWTYPE;other_paid asaas_private.payment_attempts%ROWTYPE;o public.orders%ROWTYPE;oid uuid;state text;paid boolean;prior text:=current_setting('app.order_write_context',true);refund integer;
BEGIN
 SELECT order_id INTO oid FROM asaas_private.payment_attempts WHERE id=_attempt_id;
 SELECT * INTO o FROM public.orders WHERE id=oid FOR UPDATE;
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE id=_attempt_id FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Unknown attempt' USING ERRCODE='22023'; END IF;
 PERFORM asaas_private.validate_snapshot(a,_snapshot);
 IF a.payment_id IS NULL THEN
  UPDATE asaas_private.payment_attempts SET payment_id=_snapshot->>'id',customer_id=_snapshot->>'customerId' WHERE id=a.id;
 END IF;
 refund:=(_snapshot->>'refundedValueCents')::integer;
 state:=CASE
 WHEN _snapshot->>'status' LIKE '%CHARGEBACK%' THEN 'disputed'
 WHEN refund>=a.value_cents OR _snapshot->>'status'='REFUNDED' THEN 'refunded'
 WHEN refund>0 THEN 'partially_refunded'
 WHEN _snapshot->>'status' IN('REFUND_REQUESTED','REFUND_IN_PROGRESS') THEN 'refund_pending'
 WHEN _snapshot->>'status'='RECEIVED' THEN 'received'
 WHEN _snapshot->>'status'='CONFIRMED' THEN 'confirmed'
 WHEN _snapshot->>'status' IN('AWAITING_RISK_ANALYSIS','PENDING_RISK_ANALYSIS') THEN 'risk_analysis'
 WHEN _snapshot->>'status' IN('REPROVED_BY_RISK_ANALYSIS','CREDIT_CARD_CAPTURE_REFUSED') THEN 'declined'
 WHEN _snapshot->>'status'='DELETED' THEN 'cancelled'
 WHEN _snapshot->>'status'='AUTHORIZED' THEN 'processing'
 ELSE 'pending' END;
 -- Do not regress terminal or paid states due to an older notification/API race.
 IF a.state='refunded' THEN state:='refunded';
 ELSIF a.state IN('partially_refunded','disputed') AND state NOT IN('partially_refunded','refunded','disputed') THEN state:=a.state;
 ELSIF a.state IN('confirmed','received','refund_pending') AND state IN('pending','processing','risk_analysis','declined','cancelled') THEN state:=a.state;
 ELSIF a.state='received' AND state='confirmed' THEN state:='received'; END IF;
 IF a.cancel_requested_at IS NOT NULL AND state IN('pending','processing','risk_analysis','declined') THEN state:='cancel_pending'; END IF;
 paid:=state IN('confirmed','received','refund_pending','partially_refunded','refunded','disputed');
 PERFORM set_config('app.order_write_context','asaas_payment',true);
 SELECT p.* INTO other_paid FROM asaas_private.payment_attempts p WHERE p.order_id=o.id AND p.id<>a.id AND p.paid_at IS NOT NULL AND p.state<>'refunded' ORDER BY p.attempt_no DESC LIMIT 1;
 IF paid AND other_paid.id IS NOT NULL AND (a.attempt_no<other_paid.attempt_no OR EXISTS(SELECT FROM asaas_private.payment_issues WHERE order_id=o.id AND attempt_id=a.id AND kind='duplicate_payment' AND resolved_at IS NULL)) THEN
  -- A late older charge must not replace or refund the valid order's primary payment.
  IF state='refunded' THEN
   UPDATE asaas_private.payment_issues SET resolved_at=clock_timestamp() WHERE order_id=o.id AND attempt_id=a.id AND kind='duplicate_payment';
  ELSE
   state:='refund_pending';
   INSERT INTO asaas_private.payment_issues(order_id,attempt_id,kind) VALUES(o.id,a.id,'duplicate_payment') ON CONFLICT(order_id,kind) DO UPDATE SET resolved_at=NULL,attempt_id=excluded.attempt_id;
   UPDATE public.platform_ledger SET status='reversed' WHERE order_id=o.id;
  END IF;
  UPDATE asaas_private.payment_attempts SET state=payment_update.state,provider_status=_snapshot->>'status',refunded_value_cents=greatest(refunded_value_cents,refund),paid_at=coalesce(paid_at,clock_timestamp()),operation_id=NULL,operation_expires_at=NULL,next_check_at=clock_timestamp()+interval '1 minute',updated_at=clock_timestamp() WHERE id=a.id;
  UPDATE public.orders SET online_payment_state=CASE WHEN payment_update.state='refunded' THEN other_paid.state ELSE 'refund_pending' END WHERE id=o.id;
  IF _source_event_id IS NOT NULL THEN UPDATE asaas_private.webhook_events SET processed_at=clock_timestamp(),operation_id=NULL,operation_expires_at=NULL WHERE environment=a.environment AND event_id=_source_event_id;END IF;
  PERFORM set_config('app.order_write_context',coalesce(prior,''),true);
  RETURN public.asaas_payment_view(a.user_id,o.id);
 END IF;
 IF paid AND o.status='pending_payment' THEN
  IF state IN('confirmed','received') AND o.created_at+interval '10 minutes'>clock_timestamp() AND a.cancel_requested_at IS NULL AND EXISTS(SELECT FROM public.establishments WHERE id=o.establishment_id AND status='aprovado' AND is_open) THEN
   UPDATE public.orders SET status='placed' WHERE id=o.id;
  ELSE
   UPDATE public.orders SET status='cancelled',cancellation_reason='Pagamento recebido, mas o pedido não pode ser atendido. Reembolso em análise.',cancelled_role='sistema',cancelled_at=clock_timestamp() WHERE id=o.id;
   o.status:='cancelled';
  END IF;
 END IF;
 IF paid AND o.status='cancelled' AND state<>'refunded' THEN
  state:='refund_pending';
  INSERT INTO asaas_private.payment_issues(order_id,attempt_id,kind) VALUES(o.id,a.id,'refund_required') ON CONFLICT(order_id,kind) DO UPDATE SET resolved_at=NULL;
 END IF;
 IF state IN('partially_refunded','disputed') THEN
  INSERT INTO asaas_private.payment_issues(order_id,attempt_id,kind) VALUES(o.id,a.id,state) ON CONFLICT(order_id,kind) DO UPDATE SET resolved_at=NULL;
 END IF;
 IF state IN('refunded','partially_refunded','disputed','refund_pending') THEN
  UPDATE public.platform_ledger SET status='reversed' WHERE order_id=o.id;
 END IF;
 IF state='refunded' THEN
  IF (SELECT status FROM public.orders WHERE id=o.id) NOT IN('cancelled','refunded','delivered') THEN UPDATE public.orders SET status='cancelled',cancellation_reason='Pagamento reembolsado na Asaas.',cancelled_role='sistema',cancelled_at=clock_timestamp() WHERE id=o.id; END IF;
  UPDATE public.orders SET status='refunded',refund_status='completed',refund_amount_cents=a.value_cents,refunded_at=coalesce(refunded_at,clock_timestamp()) WHERE id=o.id;
  UPDATE asaas_private.payment_issues SET resolved_at=clock_timestamp() WHERE order_id=o.id AND resolved_at IS NULL;
 ELSIF state='cancelled' AND o.status='pending_payment' THEN
  UPDATE public.orders SET status='cancelled',cancellation_reason='Pagamento cancelado ou expirado.',cancelled_role='sistema',cancelled_at=clock_timestamp() WHERE id=o.id;
 END IF;
 UPDATE asaas_private.payment_attempts SET state=payment_update.state,provider_status=_snapshot->>'status',
  net_value_cents=CASE WHEN jsonb_typeof(_snapshot->'netValueCents')='number' THEN (_snapshot->>'netValueCents')::integer ELSE NULL END,
  refunded_value_cents=greatest(refunded_value_cents,refund),paid_at=CASE WHEN paid THEN coalesce(paid_at,clock_timestamp()) ELSE paid_at END,
  operation_id=NULL,operation_expires_at=NULL,next_check_at=clock_timestamp()+interval '1 minute',updated_at=clock_timestamp()
 WHERE id=a.id;
 UPDATE public.orders SET online_payment_state=CASE WHEN EXISTS(SELECT FROM asaas_private.payment_issues WHERE order_id=o.id AND kind='duplicate_payment' AND resolved_at IS NULL) THEN 'refund_pending' ELSE payment_update.state END,online_paid_at=CASE WHEN paid THEN coalesce(online_paid_at,clock_timestamp()) ELSE online_paid_at END WHERE id=o.id;
 IF _source_event_id IS NOT NULL THEN UPDATE asaas_private.webhook_events SET processed_at=clock_timestamp(),operation_id=NULL,operation_expires_at=NULL WHERE environment=a.environment AND event_id=_source_event_id; END IF;
 PERFORM set_config('app.order_write_context',coalesce(prior,''),true);
 RETURN public.asaas_payment_view(a.user_id,o.id);
END $$;

-- Hosted scheduling; the contract harness omits only this extension boundary.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
SELECT cron.schedule('pedetrem-asaas-reconcile','* * * * *','SELECT private.request_asaas_reconciliation()');
NOTIFY pgrst,'reload schema';
