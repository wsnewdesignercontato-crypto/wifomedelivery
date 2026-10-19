-- Real Asaas payments. Disabled until the admin configures and validates production.
ALTER TABLE asaas_private.settings ADD COLUMN online_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN registered_payment_contract integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN payment_channel text NOT NULL DEFAULT 'delivery' CHECK(payment_channel IN('delivery','asaas','free')),
 ADD COLUMN online_payment_state text,
 ADD COLUMN online_paid_at timestamptz;
GRANT SELECT(payment_channel,online_payment_state,online_paid_at) ON public.orders TO authenticated;

CREATE TABLE asaas_private.customers(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 environment text NOT NULL REFERENCES asaas_private.settings(environment),
 customer_id text,operation_id uuid,operation_expires_at timestamptz,
 PRIMARY KEY(user_id,environment),UNIQUE(environment,customer_id)
);
CREATE TABLE asaas_private.payment_attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES auth.users(id),environment text NOT NULL REFERENCES asaas_private.settings(environment),
 config_revision uuid NOT NULL,attempt_no integer NOT NULL,
 external_reference text NOT NULL UNIQUE,customer_id text,payment_id text,
 billing_type text NOT NULL CHECK(billing_type IN('PIX','CREDIT_CARD')),
 value_cents integer NOT NULL CHECK(value_cents>0),net_value_cents integer,refunded_value_cents integer NOT NULL DEFAULT 0,
 state text NOT NULL DEFAULT 'creating' CHECK(state IN('creating','pending','processing','risk_analysis','confirmed','received','declined','uncertain','cancel_pending','cancelled','expired','refund_pending','partially_refunded','refunded','disputed')),
 provider_status text,operation_id uuid,operation_expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,paid_at timestamptz,next_check_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 cancel_requested_at timestamptz,pix_image text,pix_payload text,pix_expiration text,
 UNIQUE(order_id,attempt_no),UNIQUE(environment,payment_id)
);
CREATE INDEX ON asaas_private.payment_attempts(next_check_at) WHERE state NOT IN('refunded','cancelled','expired','declined');
CREATE TABLE asaas_private.payment_issues(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.orders(id),
 attempt_id uuid REFERENCES asaas_private.payment_attempts(id),kind text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),resolved_at timestamptz,
 UNIQUE(order_id,kind)
);
ALTER TABLE asaas_private.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE asaas_private.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE asaas_private.payment_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON asaas_private.customers,asaas_private.payment_attempts,asaas_private.payment_issues FROM PUBLIC,anon,authenticated;
ALTER TABLE asaas_private.webhook_events ADD COLUMN work_id uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN processed_at timestamptz,ADD COLUMN operation_id uuid,ADD COLUMN operation_expires_at timestamptz,
 ADD COLUMN next_check_at timestamptz NOT NULL DEFAULT clock_timestamp(),ADD COLUMN attempts integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX ON asaas_private.webhook_events(work_id);
ALTER TABLE asaas_private.webhook_events DROP CONSTRAINT webhook_events_event_id_check;
ALTER TABLE asaas_private.webhook_events ADD CONSTRAINT webhook_events_event_id_check CHECK(length(event_id) BETWEEN 1 AND 240 AND event_id ~ '^[A-Za-z0-9_&-]+$');

CREATE FUNCTION asaas_private.online_available() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT online_enabled AND tested AND api_key_secret_id IS NOT NULL AND webhook_token_secret_id IS NOT NULL
 AND webhook_revision=revision AND webhook_id IS NOT NULL AND registered_payment_contract=1 FROM asaas_private.settings WHERE environment='production'),false)
$$;
REVOKE ALL ON FUNCTION asaas_private.online_available() FROM PUBLIC,anon,authenticated;

-- Protect financial fields even when the browser has legacy UPDATE grants.
CREATE FUNCTION private.guard_online_order() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.payment_channel,NEW.online_payment_state,NEW.online_paid_at) IS DISTINCT FROM ROW(OLD.payment_channel,OLD.online_payment_state,OLD.online_paid_at)
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
REVOKE ALL ON FUNCTION private.guard_online_order() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aaa_guard_online_order BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.guard_online_order();

CREATE OR REPLACE FUNCTION private.guard_order_acceptance_deadline() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.acceptance_deadline:=CASE WHEN NEW.status='placed' THEN clock_timestamp()+interval '60 seconds' ELSE NULL END;
 ELSIF OLD.status='pending_payment' AND NEW.status='placed' AND current_user='postgres' AND current_setting('app.order_write_context',true)='asaas_payment' THEN
  NEW.acceptance_deadline:=clock_timestamp()+interval '60 seconds';
 ELSIF NEW.acceptance_deadline IS DISTINCT FROM OLD.acceptance_deadline THEN
  RAISE EXCEPTION 'Response deadline is server controlled' USING ERRCODE='42501';
 ELSIF OLD.status='placed' AND NEW.status='accepted' AND OLD.acceptance_deadline<=clock_timestamp() THEN
  RAISE EXCEPTION 'O prazo para aceitar este pedido expirou. Atualize a lista.' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_estab_new_order ON public.orders;
CREATE TRIGGER trg_notify_estab_new_order AFTER INSERT OR UPDATE OF status ON public.orders
 FOR EACH ROW WHEN(NEW.status='placed') EXECUTE FUNCTION public.notify_estab_new_order();
-- Function suppresses updates that do not enter placed, including reconciliation retries.
CREATE OR REPLACE FUNCTION public.notify_estab_new_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid;
BEGIN
 IF NEW.status<>'placed' OR TG_OP='UPDATE' AND OLD.status='placed' THEN RETURN NEW; END IF;
 SELECT owner_id INTO owner FROM public.establishments WHERE id=NEW.establishment_id;
 IF owner IS NOT NULL THEN
  INSERT INTO public.notifications(user_id,titulo,mensagem,link_url,audience)
  VALUES(owner,'Novo pedido recebido!','Você recebeu um novo pedido. Toque para aceitar e começar o preparo.','/estabelecimento/pedidos','estabelecimento');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_estab_new_order() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION asaas_private.attempt_context(a asaas_private.payment_attempts,mode text) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('attemptId',a.id,'orderId',a.order_id,'userId',a.user_id,'environment',a.environment,'revision',a.config_revision,
 'externalReference',a.external_reference,'operationId',a.operation_id,'customerId',coalesce(a.customer_id,(SELECT customer_id FROM asaas_private.customers WHERE user_id=a.user_id AND environment=a.environment)),
 'paymentId',a.payment_id,'billingType',a.billing_type,'valueCents',a.value_cents,'state',a.state,'expiresAt',a.expires_at,'mode',mode)
$$;
REVOKE ALL ON FUNCTION asaas_private.attempt_context(asaas_private.payment_attempts,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.asaas_online_set_enabled(_enabled boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s asaas_private.settings%ROWTYPE;
BEGIN
 IF _enabled IS NULL THEN RAISE EXCEPTION 'Missing enable state' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM asaas_private.settings WHERE environment='production' FOR UPDATE;
 IF _enabled AND (NOT s.tested OR s.webhook_revision IS DISTINCT FROM s.revision OR s.webhook_id IS NULL OR s.registered_payment_contract<>1) THEN
  RAISE EXCEPTION 'Test and register the current webhook first' USING ERRCODE='22023';
 END IF;
 UPDATE asaas_private.settings SET online_enabled=_enabled WHERE environment='production';
 RETURN _enabled;
END $$;
CREATE FUNCTION public.asaas_online_status() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',asaas_private.online_available(),'requestedEnabled',(SELECT online_enabled FROM asaas_private.settings WHERE environment='production'))
$$;

CREATE FUNCTION public.asaas_customer_claim(_user_id uuid,_environment text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c asaas_private.customers%ROWTYPE;
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 IF NOT EXISTS(SELECT FROM auth.users WHERE id=_user_id AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Invalid user' USING ERRCODE='42501'; END IF;
 INSERT INTO asaas_private.customers(user_id,environment) VALUES(_user_id,_environment) ON CONFLICT DO NOTHING;
 SELECT * INTO c FROM asaas_private.customers WHERE user_id=_user_id AND environment=_environment FOR UPDATE;
 IF c.customer_id IS NULL AND (c.operation_id IS NULL OR c.operation_expires_at<clock_timestamp()) THEN
  UPDATE asaas_private.customers SET operation_id=gen_random_uuid(),operation_expires_at=clock_timestamp()+interval '180 seconds' WHERE user_id=_user_id AND environment=_environment RETURNING * INTO c;
 ELSE c.operation_id:=NULL; END IF;
 RETURN jsonb_build_object('customerId',c.customer_id,'operationId',c.operation_id,'externalReference','pedetrem-user-'||_user_id::text||'-'||_environment);
END $$;
CREATE FUNCTION public.asaas_customer_complete(_user_id uuid,_environment text,_operation_id uuid,_customer_id text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
 IF _customer_id IS NULL OR _customer_id !~ '^[A-Za-z0-9_-]{1,128}$' THEN RAISE EXCEPTION 'Invalid customer' USING ERRCODE='22023'; END IF;
 UPDATE asaas_private.customers SET customer_id=_customer_id,operation_id=NULL,operation_expires_at=NULL
 WHERE user_id=_user_id AND environment=_environment AND operation_id=_operation_id AND operation_expires_at>clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed=1;
END $$;

CREATE FUNCTION public.asaas_payment_claim(_user_id uuid,_order_id uuid,_retry boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE;a asaas_private.payment_attempts%ROWTYPE;s asaas_private.settings%ROWTYPE;n integer;mode text;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id AND cliente_id=_user_id FOR UPDATE;
 IF NOT FOUND OR o.payment_channel<>'asaas' OR o.is_test THEN RAISE EXCEPTION 'Forbidden payment' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE order_id=o.id ORDER BY attempt_no DESC LIMIT 1 FOR UPDATE;
 IF FOUND AND a.operation_id IS NOT NULL AND a.operation_expires_at>clock_timestamp() THEN RETURN asaas_private.attempt_context(a,'reuse'); END IF;
 IF a.id IS NOT NULL AND a.state='declined' AND NOT _retry THEN RETURN asaas_private.attempt_context(a,'reuse'); END IF;
 IF a.id IS NULL OR a.state='declined' AND _retry THEN
  IF a.cancel_requested_at IS NOT NULL OR EXISTS(SELECT FROM asaas_private.payment_attempts WHERE order_id=o.id AND paid_at IS NOT NULL AND state<>'refunded') THEN RAISE EXCEPTION 'Reconcile the existing payment first' USING ERRCODE='55000'; END IF;
  IF o.status<>'pending_payment' OR o.created_at+interval '10 minutes'<=clock_timestamp() OR NOT asaas_private.online_available() THEN RAISE EXCEPTION 'Online payment unavailable' USING ERRCODE='55000'; END IF;
  SELECT * INTO s FROM asaas_private.settings WHERE environment='production' FOR SHARE;
  n:=coalesce(a.attempt_no,0)+1;
  INSERT INTO asaas_private.payment_attempts(order_id,user_id,environment,config_revision,attempt_no,external_reference,billing_type,value_cents,expires_at,operation_id,operation_expires_at)
  VALUES(o.id,_user_id,'production',s.revision,n,'pedetrem-'||gen_random_uuid()::text,CASE o.forma_pagamento WHEN 'pix' THEN 'PIX' ELSE 'CREDIT_CARD' END,o.total_cents,o.created_at+interval '10 minutes',gen_random_uuid(),clock_timestamp()+interval '180 seconds') RETURNING * INTO a;
  mode:='create';
 ELSE
  IF a.state IN('declined','refunded','cancelled','expired') THEN RETURN asaas_private.attempt_context(a,'reuse'); END IF;
  UPDATE asaas_private.payment_attempts SET operation_id=gen_random_uuid(),operation_expires_at=clock_timestamp()+interval '180 seconds'
  WHERE id=a.id RETURNING * INTO a;mode:=CASE WHEN a.payment_id IS NULL THEN 'reconcile' ELSE 'reuse' END;
 END IF;
 RETURN asaas_private.attempt_context(a,mode);
END $$;

CREATE FUNCTION asaas_private.validate_snapshot(a asaas_private.payment_attempts,s jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cid text;
BEGIN
 SELECT customer_id INTO cid FROM asaas_private.customers WHERE user_id=a.user_id AND environment=a.environment;
 IF s IS NULL OR jsonb_typeof(s)<>'object' OR s->>'id' IS NULL OR s->>'id' !~ '^[A-Za-z0-9_-]{1,128}$'
  OR coalesce(s->>'customerId','') IS DISTINCT FROM coalesce(cid,'!missing') OR s->>'externalReference' IS DISTINCT FROM a.external_reference
  OR s->>'billingType' IS DISTINCT FROM a.billing_type OR jsonb_typeof(s->'valueCents') IS DISTINCT FROM 'number' OR (s->>'valueCents')::numeric IS DISTINCT FROM a.value_cents
  OR coalesce(s->>'status','') !~ '^[A-Z][A-Z0-9_]{1,63}$' OR coalesce((s->>'refundedValueCents')::numeric,-1) NOT BETWEEN 0 AND a.value_cents
  OR a.payment_id IS NOT NULL AND s->>'id' IS DISTINCT FROM a.payment_id THEN
  RAISE EXCEPTION 'Payment identity or amount mismatch' USING ERRCODE='22023';
 END IF;
END $$;
REVOKE ALL ON FUNCTION asaas_private.validate_snapshot(asaas_private.payment_attempts,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.asaas_payment_attach(_attempt_id uuid,_operation_id uuid,_snapshot jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a asaas_private.payment_attempts%ROWTYPE;
BEGIN
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE id=_attempt_id FOR UPDATE;
 IF NOT FOUND OR _operation_id IS NULL OR a.operation_id IS DISTINCT FROM _operation_id OR a.operation_expires_at IS NULL OR a.operation_expires_at<clock_timestamp() THEN RETURN false; END IF;
 PERFORM asaas_private.validate_snapshot(a,_snapshot);
 UPDATE asaas_private.payment_attempts SET payment_id=_snapshot->>'id',customer_id=_snapshot->>'customerId',updated_at=clock_timestamp() WHERE id=a.id;
 RETURN true;
END $$;
CREATE FUNCTION public.asaas_payment_view(_user_id uuid,_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE;a asaas_private.payment_attempts%ROWTYPE;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id AND cliente_id=_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden payment' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE order_id=o.id ORDER BY attempt_no DESC LIMIT 1;
 RETURN jsonb_build_object('orderId',o.id,'channel',o.payment_channel,'state',coalesce(o.online_payment_state,a.state,'confirmed'),'totalCents',o.total_cents,
 'expiresAt',coalesce(a.expires_at,CASE WHEN o.payment_channel='asaas' THEN o.created_at+interval '10 minutes' END),'paidAt',o.online_paid_at,
 'canRetry',coalesce(a.state='declined' AND a.cancel_requested_at IS NULL AND o.status='pending_payment' AND a.expires_at>clock_timestamp() AND asaas_private.online_available(),false),
 'pix',CASE WHEN a.pix_payload IS NOT NULL AND a.state='pending' AND a.expires_at>clock_timestamp() AND o.status='pending_payment' THEN jsonb_build_object('encodedImage',a.pix_image,'payload',a.pix_payload,'expirationDate',a.pix_expiration) ELSE NULL END,'message','');
END $$;
CREATE FUNCTION public.asaas_payment_fail(_attempt_id uuid,_operation_id uuid,_kind text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a asaas_private.payment_attempts%ROWTYPE;oid uuid;prior text:=current_setting('app.order_write_context',true);
BEGIN
 IF _kind IS NULL OR _kind NOT IN('declined','uncertain') THEN RAISE EXCEPTION 'Invalid failure' USING ERRCODE='22023'; END IF;
 SELECT order_id INTO oid FROM asaas_private.payment_attempts WHERE id=_attempt_id;
 PERFORM 1 FROM public.orders WHERE id=oid FOR UPDATE;
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE id=_attempt_id FOR UPDATE;
 IF NOT FOUND OR _operation_id IS NULL OR a.operation_id IS DISTINCT FROM _operation_id OR a.state NOT IN('creating','uncertain') THEN RETURN false; END IF;
 UPDATE asaas_private.payment_attempts SET state=_kind,operation_id=NULL,operation_expires_at=NULL,updated_at=clock_timestamp(),next_check_at=clock_timestamp()+interval '20 seconds' WHERE id=a.id;
 PERFORM set_config('app.order_write_context','asaas_payment',true);
 UPDATE public.orders SET online_payment_state=_kind WHERE id=a.order_id AND status='pending_payment';
 PERFORM set_config('app.order_write_context',coalesce(prior,''),true);RETURN true;
END $$;
CREATE FUNCTION public.asaas_payment_pix_save(_attempt_id uuid,_pix jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF length(_pix->>'encodedImage') NOT BETWEEN 1 AND 200000 OR (_pix->>'encodedImage') !~ '^[A-Za-z0-9+/=]+$'
 OR length(_pix->>'payload') NOT BETWEEN 6 AND 4096 OR left(_pix->>'payload',6)<>'000201' OR _pix->>'expirationDate' IS NULL THEN RAISE EXCEPTION 'Invalid Pix data' USING ERRCODE='22023'; END IF;
 UPDATE asaas_private.payment_attempts SET pix_image=_pix->>'encodedImage',pix_payload=_pix->>'payload',pix_expiration=_pix->>'expirationDate' WHERE id=_attempt_id AND billing_type='PIX' AND state='pending';
 RETURN FOUND;
END $$;

-- Preserve the canonical price/reservation engine and legacy public signatures.
CREATE OR REPLACE FUNCTION private.guard_order_finance() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF current_user='postgres' AND auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF current_user <> 'postgres' THEN
   RAISE EXCEPTION 'Use checkout_order to create orders' USING ERRCODE='42501';
  END IF;
  IF NEW.status <> 'placed' AND NOT(NEW.status='pending_payment' AND NEW.payment_channel='asaas' AND NEW.online_payment_state='creating') THEN RAISE EXCEPTION 'Invalid initial status' USING ERRCODE='42501'; END IF;
  IF NEW.checkout_key IS NOT NULL AND auth.uid() IS NOT NULL AND NEW.frete_cents IS DISTINCT FROM private.checkout_freight(NEW.establishment_id,NEW.tipo_entrega,NEW.endereco_entrega) THEN
   RAISE EXCEPTION 'CHECKOUT_QUOTE_CHANGED: Atualize a pagina para conferir a taxa de entrega.' USING ERRCODE='22023';
  END IF;
  NEW.coupon_funder:=coalesce(NEW.coupon_funder,CASE WHEN NEW.discount_funder='establishment' THEN 'merchant' ELSE 'platform' END);
  NEW.discount_funder:=CASE WHEN NEW.coupon_funder='merchant' THEN 'establishment' ELSE 'platform' END;
  IF NEW.commission_cents IS NULL THEN NEW.commission_cents:=round(NEW.subtotal_cents*least(100,greatest(0,coalesce((SELECT commission_pct FROM public.platform_settings WHERE id=1),15)))/100)::integer; END IF;
 ELSIF ROW(NEW.id,NEW.created_at,NEW.quote_fingerprint,NEW.discount_funder,NEW.cliente_id,NEW.establishment_id,NEW.subtotal_cents,NEW.frete_cents,NEW.desconto_cents,NEW.total_cents,NEW.forma_pagamento,NEW.tipo_entrega,NEW.endereco_entrega,NEW.checkout_key,NEW.checkout_request,NEW.coupon_id,NEW.coupon_funder,NEW.commission_cents)
  IS DISTINCT FROM ROW(OLD.id,OLD.created_at,OLD.quote_fingerprint,OLD.discount_funder,OLD.cliente_id,OLD.establishment_id,OLD.subtotal_cents,OLD.frete_cents,OLD.desconto_cents,OLD.total_cents,OLD.forma_pagamento,OLD.tipo_entrega,OLD.endereco_entrega,OLD.checkout_key,OLD.checkout_request,OLD.coupon_id,OLD.coupon_funder,OLD.commission_cents) THEN
  RAISE EXCEPTION 'Confirmed order financial fields are immutable' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND NEW.inventory_released_at IS DISTINCT FROM OLD.inventory_released_at AND current_user<>'postgres' THEN RAISE EXCEPTION 'Inventory restoration is managed by the server' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.payment_received_at,NEW.payment_received_by,NEW.payment_reference,NEW.dinheiro_recebido)
  IS DISTINCT FROM ROW(OLD.payment_received_at,OLD.payment_received_by,OLD.payment_reference,OLD.dinheiro_recebido)
  AND (current_user <> 'postgres' OR current_setting('app.order_write_context',true) IS DISTINCT FROM 'settlement') THEN
  RAISE EXCEPTION 'Use administrative payment confirmation' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.status='refunded' AND NEW.status IS DISTINCT FROM OLD.status OR ROW(NEW.refund_status,NEW.refund_amount_cents,NEW.refunded_at) IS DISTINCT FROM ROW(OLD.refund_status,OLD.refund_amount_cents,OLD.refunded_at))
  AND current_user<>'postgres' AND NOT private.has_role(auth.uid(),'admin') THEN
  RAISE EXCEPTION 'Refund review is administrative' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.orders_status_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  allowed boolean := false;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'delivered' AND NEW.status NOT IN ('refunded') THEN
    RAISE EXCEPTION 'Cannot change delivered order to %', NEW.status;
  END IF;
  IF OLD.status = 'refunded' THEN
    RAISE EXCEPTION 'Order already refunded';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status NOT IN ('refunded') THEN
    RAISE EXCEPTION 'Cancelled order can only be refunded';
  END IF;

  IF NEW.status = 'cancelled' THEN
    allowed := true;
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
  ELSIF NEW.status = 'refunded' THEN
    allowed := OLD.status IN ('cancelled', 'delivered');
    NEW.refunded_at := COALESCE(NEW.refunded_at, now());
    IF NEW.refund_status = 'none' THEN
      NEW.refund_status := 'completed';
    END IF;
    IF NEW.refund_amount_cents = 0 THEN
      NEW.refund_amount_cents := NEW.total_cents;
    END IF;
  ELSIF OLD.status='pending_payment' AND NEW.status='placed' AND current_setting('app.order_write_context',true)='asaas_payment' THEN
    allowed := true;
  ELSE
    allowed := (OLD.status, NEW.status) IN (
      ('placed', 'accepted'),
      ('accepted', 'preparing'),
      ('preparing', 'ready'),
      ('waiting_courier', 'courier_assigned'),
      ('courier_assigned', 'picked_up'),
      ('picked_up', 'on_the_way'),
      ('on_the_way', 'arriving'),
      ('arriving', 'delivered'),
      ('on_the_way', 'delivered'),
      ('picked_up', 'delivered')
    );

    IF OLD.status = 'ready' AND NEW.status = 'waiting_courier' THEN
      allowed := COALESCE(OLD.tipo_entrega, 'delivery') <> 'pickup';
    ELSIF OLD.status = 'ready' AND NEW.status = 'delivered' THEN
      allowed := COALESCE(OLD.tipo_entrega, 'delivery') = 'pickup';
    END IF;
  END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION private.checkout_order_core(p_establishment_id uuid,p_idempotency_key uuid,p_forma_pagamento text,p_tipo_entrega text,p_endereco jsonb DEFAULT NULL,p_observacoes text DEFAULT NULL,p_coupon_code text DEFAULT NULL,p_expected_total_cents integer DEFAULT NULL,p_quote boolean DEFAULT false,p_test boolean DEFAULT false,p_channel text DEFAULT 'delivery')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 uid uuid := auth.uid(); store public.establishments%ROWTYPE; item record; product public.products%ROWTYPE;
 addon public.addons%ROWTYPE; grp record; choice jsonb; options jsonb; snapshots jsonb := '[]';
 unit_price integer; subtotal bigint := 0; freight integer; discount integer := 0; total integer;
 coupon public.coupons%ROWTYPE; coupon_code text := nullif(upper(btrim(p_coupon_code)),'');
 request jsonb; existing public.orders%ROWTYPE; order_id uuid; commission integer; pct numeric;
 test_id uuid; created_order_id uuid; enrollment private.payment_test_customers%ROWTYPE;
 previous_context text := current_setting('app.order_write_context',true);
 needed_products jsonb:='{}'; needed_addons jsonb:='{}'; needed integer; stock record;
BEGIN
 IF p_channel IS NULL OR p_channel NOT IN('delivery','asaas') OR p_test AND p_channel='asaas' THEN RAISE EXCEPTION 'Invalid channel' USING ERRCODE='22023'; END IF;
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_test THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('payment-test-administration',0));
  SELECT e.* INTO enrollment FROM private.payment_test_customers e JOIN private.payment_test_settings s ON s.id AND s.enabled
   WHERE e.customer_id=uid AND e.establishment_id=p_establishment_id AND e.expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'O teste foi desligado ou a autorização expirou. Nenhuma cobrança foi feita.' USING ERRCODE='42501'; END IF;
  IF p_forma_pagamento NOT IN('pix','cartao') THEN RAISE EXCEPTION 'Escolha Pix ou cartão para o teste.' USING ERRCODE='22023'; END IF;
  IF p_tipo_entrega='delivery' AND (enrollment.courier_id IS NULL OR NOT private.is_courier_dispatch_approved(enrollment.courier_id)) THEN RAISE EXCEPTION 'Selecione um entregador aprovado no administrador.' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_idempotency_key IS NULL OR p_forma_pagamento IS NULL OR p_forma_pagamento NOT IN ('pix','cartao','dinheiro') OR p_tipo_entrega IS NULL OR p_tipo_entrega NOT IN ('delivery','pickup') THEN
  RAISE EXCEPTION 'Invalid checkout or unsupported payment method' USING ERRCODE='22023'; END IF;
 IF length(coalesce(p_observacoes,'')) > 500 THEN RAISE EXCEPTION 'Observation too long' USING ERRCODE='22023'; END IF;
 request := jsonb_build_object('store',p_establishment_id,'payment',p_forma_pagamento,'fulfillment',p_tipo_entrega,'address',CASE WHEN p_tipo_entrega='pickup' THEN NULL ELSE p_endereco END,'notes',p_observacoes,'coupon',coupon_code,'channel',p_channel);
 -- Serialize retries before reading the cart; retries after a successful commit return the same order.
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_idempotency_key::text,0));
 SELECT * INTO existing FROM public.orders WHERE cliente_id=uid AND checkout_key=p_idempotency_key;
 IF FOUND THEN
  IF existing.is_test IS DISTINCT FROM p_test THEN RAISE EXCEPTION 'A tentativa pertence a outro modo de pagamento.' USING ERRCODE='22023'; END IF;
  IF (existing.checkout_request||jsonb_build_object('channel',coalesce(existing.checkout_request->>'channel','delivery'))) IS DISTINCT FROM request THEN RAISE EXCEPTION 'Idempotency key belongs to another checkout' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('order_id',existing.id,'total_cents',existing.total_cents,'desconto_cents',existing.desconto_cents);
 END IF;
 -- Lock the customer's cart across different keys too.
 PERFORM pg_advisory_xact_lock(hashtextextended('cart:'||uid::text,0));
 SELECT * INTO store FROM public.establishments WHERE id=p_establishment_id FOR SHARE;
 freight:=private.checkout_freight(p_establishment_id,p_tipo_entrega,p_endereco);
 IF p_test AND p_tipo_entrega='delivery' AND NOT EXISTS(SELECT FROM public.courier_profiles c WHERE c.user_id=enrollment.courier_id AND c.status='online'
  AND (store.cidade IS NULL OR c.cidade_atuacao IS NULL OR public.normalize_delivery_text(btrim(c.cidade_atuacao))=public.normalize_delivery_text(btrim(store.cidade))
   OR EXISTS(SELECT FROM unnest(coalesce(c.cidades_atuacao,ARRAY[]::text[])) city WHERE public.normalize_delivery_text(btrim(city))=public.normalize_delivery_text(btrim(store.cidade))))
  AND NOT EXISTS(SELECT FROM public.deliveries d WHERE d.entregador_id=c.user_id AND d.status IN('accepted','to_store','at_store','picked_up','to_customer','at_customer')))
 THEN RAISE EXCEPTION 'O entregador do teste precisa estar online, livre e atuar na cidade da loja.' USING ERRCODE='22023'; END IF;

 FOR item IN SELECT * FROM public.cart_items WHERE user_id=uid AND establishment_id=store.id ORDER BY product_id,id FOR UPDATE LOOP
  IF item.quantidade NOT BETWEEN 1 AND 99 OR length(coalesce(item.observacoes,''))>500 OR jsonb_typeof(item.addons)<>'array' OR jsonb_array_length(item.addons)>100 THEN RAISE EXCEPTION 'Invalid cart item' USING ERRCODE='22023'; END IF;
  SELECT * INTO product FROM public.products WHERE id=item.product_id FOR UPDATE;
  IF NOT FOUND OR product.establishment_id<>store.id OR NOT product.disponivel THEN RAISE EXCEPTION 'Product unavailable for this store' USING ERRCODE='22023'; END IF;
  needed:=coalesce((needed_products->>product.id::text)::int,0)+item.quantidade;
  needed_products:=jsonb_set(needed_products,ARRAY[product.id::text],to_jsonb(needed));
  IF product.estoque IS NOT NULL AND product.estoque < needed THEN RAISE EXCEPTION 'Product stock insufficient' USING ERRCODE='22023'; END IF;
  unit_price := coalesce(product.preco_promo_cents,product.preco_cents); options := '[]';
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(item.addons) a GROUP BY a->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate addon' USING ERRCODE='22023'; END IF;
  FOR choice IN SELECT value FROM jsonb_array_elements(item.addons) LOOP
   IF choice->>'id' IS NULL OR choice ? 'quantidade' OR choice ? 'variant_id' THEN RAISE EXCEPTION 'Invalid addon selection' USING ERRCODE='22023'; END IF;
   SELECT a.* INTO addon FROM public.addons a JOIN public.addon_groups g ON g.id=a.addon_group_id JOIN public.product_addon_groups pg ON pg.addon_group_id=g.id AND pg.product_id=product.id WHERE a.id=(choice->>'id')::uuid AND a.ativo AND g.ativo AND g.establishment_id=store.id FOR UPDATE OF a;
   IF NOT FOUND THEN RAISE EXCEPTION 'Addon unavailable for product' USING ERRCODE='22023'; END IF;
   needed:=coalesce((needed_addons->>addon.id::text)::int,0)+item.quantidade;
   needed_addons:=jsonb_set(needed_addons,ARRAY[addon.id::text],to_jsonb(needed));
   IF addon.estoque IS NOT NULL AND addon.estoque < needed THEN RAISE EXCEPTION 'Addon stock insufficient' USING ERRCODE='22023'; END IF;
   IF addon.qtd_maxima IS NOT NULL AND addon.qtd_maxima < 1 THEN RAISE EXCEPTION 'Addon quantity unavailable' USING ERRCODE='22023'; END IF;
   unit_price := unit_price+addon.preco_extra_cents;
   options := options||jsonb_build_array(jsonb_build_object('id',addon.id,'nome',addon.nome,'preco_extra_cents',addon.preco_extra_cents,'group_id',addon.addon_group_id,'group_nome',(SELECT nome FROM public.addon_groups WHERE id=addon.addon_group_id)));
  END LOOP;
  FOR grp IN SELECT g.*, (SELECT count(*) FROM jsonb_array_elements(options) a WHERE a->>'group_id'=g.id::text) selected_count FROM public.addon_groups g JOIN public.product_addon_groups pg ON pg.addon_group_id=g.id WHERE pg.product_id=product.id AND g.ativo LOOP
   IF grp.establishment_id<>store.id OR grp.selected_count < greatest(grp.minimo,CASE WHEN grp.obrigatorio THEN 1 ELSE 0 END) OR grp.selected_count>grp.maximo OR (NOT grp.selecao_multipla AND grp.selected_count>1) THEN RAISE EXCEPTION 'Required addon group or selection limit not satisfied' USING ERRCODE='22023'; END IF;
  END LOOP;
  subtotal := subtotal+unit_price::bigint*item.quantidade;
  IF subtotal>2147480000 THEN RAISE EXCEPTION 'Order amount too large' USING ERRCODE='22023'; END IF;
  snapshots := snapshots||jsonb_build_array(jsonb_build_object('cart_id',item.id,'product_id',product.id,'nome',product.nome,'price',unit_price,'quantity',item.quantidade,'notes',item.observacoes,'addons',options));
 END LOOP;
 IF jsonb_array_length(snapshots)=0 THEN RAISE EXCEPTION 'Empty cart' USING ERRCODE='22023'; END IF;
 IF subtotal < store.pedido_minimo_cents THEN RAISE EXCEPTION 'Minimum order not reached' USING ERRCODE='22023'; END IF;
 IF coupon_code IS NOT NULL THEN
  SELECT * INTO coupon FROM public.coupons WHERE code=coupon_code FOR UPDATE;
  IF NOT FOUND OR NOT coupon.ativo OR (coupon.establishment_id IS NOT NULL AND coupon.establishment_id<>store.id) OR coupon.starts_at>now() OR coupon.expires_at<now() OR (coupon.usage_limit IS NOT NULL AND coupon.used_count>=coupon.usage_limit) OR subtotal<coupon.min_order_cents THEN RAISE EXCEPTION 'Coupon unavailable' USING ERRCODE='22023'; END IF;
  discount := CASE coupon.type WHEN 'percent' THEN floor(subtotal*coupon.percent/100)::integer WHEN 'fixed' THEN coupon.value_cents WHEN 'free_delivery' THEN freight ELSE 0 END;
  IF coupon.max_discount_cents IS NOT NULL THEN discount:=least(discount,coupon.max_discount_cents); END IF;
  discount:=greatest(0,least(discount,CASE WHEN coupon.type='free_delivery' THEN freight ELSE subtotal::integer END));
 END IF;
 total:=(subtotal+freight-discount)::integer;
 SELECT commission_pct INTO pct FROM public.platform_settings WHERE id=1;
 commission:=round(subtotal*least(100,greatest(0,coalesce(pct,15)))/100)::integer;
 IF p_quote THEN RETURN jsonb_build_object('subtotal_cents',subtotal,'frete_cents',freight,'desconto_cents',discount,'total_cents',total); END IF;
 IF p_expected_total_cents IS NOT NULL AND p_expected_total_cents<>total THEN RAISE EXCEPTION 'CHECKOUT_QUOTE_CHANGED: O total foi atualizado. Confira o novo valor antes de confirmar.' USING ERRCODE='22023'; END IF;
 IF NOT p_test THEN
 FOR stock IN SELECT key::uuid AS id,value::int AS quantity FROM jsonb_each_text(needed_products) LOOP
  UPDATE public.products SET estoque=estoque-stock.quantity WHERE id=stock.id AND estoque IS NOT NULL;
 END LOOP;
 FOR stock IN SELECT key::uuid AS id,value::int AS quantity FROM jsonb_each_text(needed_addons) LOOP
  UPDATE public.addons SET estoque=estoque-stock.quantity WHERE id=stock.id AND estoque IS NOT NULL;
 END LOOP;
 END IF;
 IF p_test THEN
  INSERT INTO private.payment_test_sales(request_key,created_by,customer_id,establishment_id,courier_id,fulfillment,payment_method,subtotal_cents,freight_cents,commission_cents,address)
  VALUES(p_idempotency_key,enrollment.created_by,uid,store.id,CASE WHEN p_tipo_entrega='delivery' THEN enrollment.courier_id END,p_tipo_entrega,p_forma_pagamento,subtotal,freight,commission,p_endereco) RETURNING id INTO test_id;
 END IF;
 PERFORM set_config('app.order_write_context','checkout',true);
 INSERT INTO public.orders(cliente_id,establishment_id,status,subtotal_cents,frete_cents,desconto_cents,total_cents,forma_pagamento,tipo_entrega,endereco_entrega,observacoes,checkout_key,checkout_request,coupon_id,coupon_funder,commission_cents,test_sale_id,inventory_released_at,payment_channel,online_payment_state)
 VALUES(uid,store.id,CASE WHEN p_channel='asaas' AND total>0 THEN 'pending_payment'::public.order_status ELSE 'placed'::public.order_status END,subtotal,freight,discount,total,p_forma_pagamento::public.payment_method,p_tipo_entrega,CASE WHEN p_tipo_entrega='pickup' THEN NULL ELSE p_endereco END,p_observacoes,p_idempotency_key,request,coupon.id,CASE WHEN coupon.id IS NULL THEN NULL WHEN coupon.establishment_id IS NULL THEN 'platform' ELSE 'merchant' END,commission,test_id,CASE WHEN p_test THEN now() END,CASE WHEN total=0 AND NOT p_test THEN 'free' ELSE p_channel END,CASE WHEN p_channel='asaas' AND total>0 THEN 'creating' ELSE NULL END) RETURNING id INTO order_id;
 INSERT INTO public.order_items(order_id,product_id,nome_snapshot,preco_unit_cents,quantidade,observacoes,addons)
 SELECT order_id,(x->>'product_id')::uuid,x->>'nome',(x->>'price')::integer,(x->>'quantity')::integer,x->>'notes',x->'addons' FROM jsonb_array_elements(snapshots) x;
 IF NOT p_test AND coupon.id IS NOT NULL THEN UPDATE public.coupons SET used_count=used_count+1 WHERE id=coupon.id; END IF;
 IF p_test THEN created_order_id:=order_id; UPDATE private.payment_test_sales SET status='approved',discount_cents=discount,order_id=created_order_id WHERE id=test_id; END IF;
 DELETE FROM public.cart_items WHERE user_id=uid AND id IN (SELECT (x->>'cart_id')::uuid FROM jsonb_array_elements(snapshots) x);
 PERFORM set_config('app.order_write_context',coalesce(previous_context,''),true);
 RETURN jsonb_build_object('order_id',order_id,'total_cents',total,'desconto_cents',discount);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.order_write_context',coalesce(previous_context,''),true); RAISE;
END $$;

CREATE OR REPLACE FUNCTION private.checkout_cart_transaction(p_establishment_id uuid,p_idempotency_key uuid,p_forma_pagamento text,p_tipo_entrega text,p_endereco jsonb DEFAULT NULL,p_observacoes text DEFAULT NULL,p_coupon_code text DEFAULT NULL,p_expected_total_cents integer DEFAULT NULL,p_quote boolean DEFAULT false,p_test boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT private.checkout_order_core(p_establishment_id,p_idempotency_key,p_forma_pagamento,p_tipo_entrega,p_endereco,p_observacoes,p_coupon_code,p_expected_total_cents,p_quote,p_test,'delivery') $$;
CREATE FUNCTION public.checkout_online_order(p_establishment_id uuid,p_idempotency_key uuid,p_forma_pagamento text,p_tipo_entrega text,p_endereco jsonb DEFAULT NULL,p_observacoes text DEFAULT NULL,p_coupon_code text DEFAULT NULL,p_expected_total_cents integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Confirmed authentication required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM asaas_private.settings WHERE environment='production' FOR SHARE;
 IF p_forma_pagamento IS NULL OR p_forma_pagamento NOT IN('pix','cartao') OR NOT asaas_private.online_available() THEN RAISE EXCEPTION 'Online payments unavailable' USING ERRCODE='55000'; END IF;
 RETURN private.checkout_order_core(p_establishment_id,p_idempotency_key,p_forma_pagamento,p_tipo_entrega,p_endereco,p_observacoes,p_coupon_code,p_expected_total_cents,false,false,'asaas');
END $$;
REVOKE ALL ON FUNCTION private.checkout_order_core(uuid,uuid,text,text,jsonb,text,text,integer,boolean,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.checkout_online_order(uuid,uuid,text,text,jsonb,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.checkout_online_order(uuid,uuid,text,text,jsonb,text,text,integer) TO authenticated;

CREATE FUNCTION private.settle_order_payment_legacy(p_order_id uuid,p_reference text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; prior text:=current_setting('app.order_write_context',true);
BEGIN
 IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_reference,''))) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'Payment reference required' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.status<>'delivered' THEN RAISE EXCEPTION 'Delivered order required' USING ERRCODE='22023'; END IF;
 IF o.payment_received_at IS NOT NULL THEN RETURN; END IF;
 PERFORM set_config('app.order_write_context','settlement',true);
 UPDATE public.orders SET payment_received_at=now(),payment_received_by=auth.uid(),payment_reference=btrim(p_reference),dinheiro_recebido=true WHERE id=p_order_id;
 UPDATE public.platform_ledger SET status='paid' WHERE order_id=p_order_id AND status='pending';
 INSERT INTO public.admin_audit_log(admin_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'confirm_payment_receipt','order',p_order_id,jsonb_build_object('reference',btrim(p_reference),'amount_cents',o.total_cents));
 PERFORM set_config('app.order_write_context',coalesce(prior,''),true);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.order_write_context',coalesce(prior,''),true); RAISE;
END $$;
CREATE FUNCTION private.record_order_refund_legacy(p_order_id uuid,p_reference text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_reference,''))) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'Refund reference required' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.status NOT IN ('delivered','cancelled','refunded') THEN RAISE EXCEPTION 'Completed or cancelled order required' USING ERRCODE='22023'; END IF;
 IF o.status='refunded' THEN RETURN; END IF;
 UPDATE public.orders SET status='refunded',refund_status='completed',refund_amount_cents=total_cents,refunded_at=now() WHERE id=p_order_id;
 UPDATE public.platform_ledger SET status='reversed' WHERE order_id=p_order_id;
 INSERT INTO public.admin_audit_log(admin_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'record_manual_full_refund','order',p_order_id,jsonb_build_object('reference',btrim(p_reference),'amount_cents',o.total_cents));
END $$;

CREATE OR REPLACE FUNCTION public.settle_order_payment(p_order_id uuid,p_reference text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF EXISTS(SELECT FROM public.orders WHERE id=p_order_id AND payment_channel='asaas' AND online_payment_state IS DISTINCT FROM 'received') THEN RAISE EXCEPTION 'Asaas receipt must be available and reconciled' USING ERRCODE='22023'; END IF;
 PERFORM private.settle_order_payment_legacy(p_order_id,p_reference);
END $$;
CREATE OR REPLACE FUNCTION public.record_order_refund(p_order_id uuid,p_reference text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM public.orders WHERE id=p_order_id AND payment_channel='asaas') THEN RAISE EXCEPTION 'Reconcile the real Asaas refund instead' USING ERRCODE='22023'; END IF;
 PERFORM private.record_order_refund_legacy(p_order_id,p_reference);
END $$;
REVOKE ALL ON FUNCTION private.settle_order_payment_legacy(uuid,text),private.record_order_refund_legacy(uuid,text),public.orders_status_guard() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.asaas_payment_apply(_attempt_id uuid,_snapshot jsonb,_source_event_id text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF paid AND other_paid.id IS NOT NULL THEN
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
  IF state IN('confirmed','received') AND a.cancel_requested_at IS NULL AND EXISTS(SELECT FROM public.establishments WHERE id=o.establishment_id AND status='aprovado' AND is_open) THEN
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
 UPDATE public.orders SET online_payment_state=payment_update.state,online_paid_at=CASE WHEN paid THEN coalesce(online_paid_at,clock_timestamp()) ELSE online_paid_at END WHERE id=o.id;
 IF _source_event_id IS NOT NULL THEN UPDATE asaas_private.webhook_events SET processed_at=clock_timestamp(),operation_id=NULL,operation_expires_at=NULL WHERE environment=a.environment AND event_id=_source_event_id; END IF;
 PERFORM set_config('app.order_write_context',coalesce(prior,''),true);
 RETURN public.asaas_payment_view(a.user_id,o.id);
END $$;

CREATE FUNCTION private.online_cancellation_issue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a asaas_private.payment_attempts%ROWTYPE;prior text:=current_setting('app.order_write_context',true);
BEGIN
 IF NEW.payment_channel<>'asaas' OR NEW.status<>'cancelled' OR OLD.status='cancelled' THEN RETURN NEW; END IF;
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE order_id=NEW.id ORDER BY attempt_no DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 UPDATE asaas_private.payment_attempts SET cancel_requested_at=clock_timestamp(),next_check_at=clock_timestamp() WHERE id=a.id;
 IF a.paid_at IS NOT NULL OR a.state IN('confirmed','received','partially_refunded','disputed') THEN
  INSERT INTO asaas_private.payment_issues(order_id,attempt_id,kind) VALUES(NEW.id,a.id,'refund_required') ON CONFLICT(order_id,kind) DO UPDATE SET resolved_at=NULL;
  UPDATE asaas_private.payment_attempts SET state='refund_pending' WHERE id=a.id AND state<>'refunded';
  PERFORM set_config('app.order_write_context','asaas_payment',true);
  UPDATE public.orders SET online_payment_state='refund_pending' WHERE id=NEW.id AND online_payment_state IS DISTINCT FROM 'refunded';
  UPDATE public.platform_ledger SET status='reversed' WHERE order_id=NEW.id;
  PERFORM set_config('app.order_write_context',coalesce(prior,''),true);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.online_cancellation_issue() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_online_cancellation AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION private.online_cancellation_issue();

-- Credential rotation cannot race active orders, provider requests or unsettled issues.
ALTER FUNCTION public.asaas_settings_save(text,text,text,text) SET SCHEMA asaas_private;
ALTER FUNCTION asaas_private.asaas_settings_save(text,text,text,text) RENAME TO settings_save_v1;
REVOKE ALL ON FUNCTION asaas_private.settings_save_v1(text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.asaas_settings_save(_environment text,_notification_email text,_api_key text DEFAULT NULL,_webhook_token text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 PERFORM 1 FROM asaas_private.settings WHERE environment=_environment FOR UPDATE;
 IF EXISTS(SELECT FROM asaas_private.payment_attempts a JOIN public.orders o ON o.id=a.order_id WHERE a.environment=_environment AND
  (a.state NOT IN('declined','expired','cancelled','refunded') AND (o.status NOT IN('delivered','cancelled','refunded') OR o.payment_received_at IS NULL)))
  OR _environment='production' AND EXISTS(SELECT FROM public.orders WHERE payment_channel='asaas' AND status='pending_payment')
  OR EXISTS(SELECT FROM asaas_private.payment_issues i JOIN asaas_private.payment_attempts a ON a.id=i.attempt_id WHERE a.environment=_environment AND i.resolved_at IS NULL) THEN
  RAISE EXCEPTION 'Reconcile active payments before changing configuration' USING ERRCODE='55000';
 END IF;
 PERFORM asaas_private.settings_save_v1(_environment,_notification_email,_api_key,_webhook_token);
 UPDATE asaas_private.settings SET online_enabled=false,registered_payment_contract=0 WHERE environment=_environment;
 RETURN public.asaas_settings_get(_environment);
END $$;
DROP FUNCTION public.asaas_webhook_complete(text,uuid,text);
CREATE FUNCTION public.asaas_webhook_complete(_environment text,_revision uuid,_webhook_id text,_payment_contract integer DEFAULT 0) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 IF _webhook_id IS NULL OR _webhook_id !~ '^[A-Za-z0-9_-]{1,128}$' OR _payment_contract NOT IN(0,1) THEN RAISE EXCEPTION 'Invalid webhook contract' USING ERRCODE='22023'; END IF;
 UPDATE asaas_private.settings SET webhook_id=_webhook_id,webhook_revision=_revision,registered_payment_contract=_payment_contract,updated_at=clock_timestamp()
 WHERE environment=_environment AND revision=_revision AND tested AND api_key_secret_id IS NOT NULL AND webhook_token_secret_id IS NOT NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.asaas_webhook_record(_environment text,_event_id text,_event_type text,_payment_id text DEFAULT NULL,_payment_status text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted integer;
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 IF _event_id IS NULL OR length(_event_id) NOT BETWEEN 1 AND 240 OR _event_id !~ '^[A-Za-z0-9_&-]+$'
 OR _event_type IS NULL OR _event_type !~ '^[A-Z][A-Z0-9_]{1,95}$'
 OR (_payment_id IS NOT NULL AND _payment_id !~ '^[A-Za-z0-9_-]{1,128}$') OR (_payment_status IS NOT NULL AND _payment_status !~ '^[A-Z][A-Z0-9_]{1,63}$') THEN RAISE EXCEPTION 'Invalid webhook metadata' USING ERRCODE='22023'; END IF;
 INSERT INTO asaas_private.webhook_events(environment,event_id,event_type,payment_id,payment_status) VALUES(_environment,_event_id,_event_type,_payment_id,_payment_status) ON CONFLICT(environment,event_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=1 THEN UPDATE asaas_private.settings SET last_webhook_at=clock_timestamp() WHERE environment=_environment; END IF;
 RETURN inserted=1;
END $$;

CREATE FUNCTION public.asaas_payments_admin(_before timestamptz DEFAULT NULL,_limit integer DEFAULT 50) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('payments',coalesce((SELECT jsonb_agg(x) FROM (
 SELECT a.id,a.order_id,a.environment,a.payment_id,a.external_reference,a.value_cents,a.net_value_cents,a.refunded_value_cents,a.state,a.provider_status,a.created_at,a.expires_at,a.paid_at,o.status AS order_status,o.payment_received_at,
 coalesce((SELECT jsonb_agg(jsonb_build_object('kind',i.kind,'createdAt',i.created_at)) FROM asaas_private.payment_issues i WHERE i.order_id=o.id AND i.resolved_at IS NULL),'[]'::jsonb) AS issues
 FROM asaas_private.payment_attempts a JOIN public.orders o ON o.id=a.order_id WHERE _before IS NULL OR a.created_at<_before ORDER BY a.created_at DESC,a.id LIMIT least(greatest(_limit,1),100)) x),'[]'::jsonb),
 'unresolvedCount',(SELECT count(*) FROM asaas_private.payment_issues WHERE resolved_at IS NULL))
$$;

-- Safe read context for reconciliation does not create another declined attempt.
CREATE FUNCTION public.asaas_payment_context(_user_id uuid,_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a asaas_private.payment_attempts%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT FROM public.orders WHERE id=_order_id AND cliente_id=_user_id AND payment_channel='asaas') THEN RAISE EXCEPTION 'Forbidden payment' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE order_id=_order_id ORDER BY attempt_no DESC LIMIT 1;
 RETURN CASE WHEN a.id IS NULL THEN NULL ELSE asaas_private.attempt_context(a,'reconcile') END;
END $$;
CREATE FUNCTION public.asaas_payment_match(_environment text,_snapshot jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a asaas_private.payment_attempts%ROWTYPE;
BEGIN
 PERFORM asaas_private.require_environment(_environment);
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE environment=_environment AND external_reference=_snapshot->>'externalReference';
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM asaas_private.validate_snapshot(a,_snapshot);
 RETURN asaas_private.attempt_context(a,'reconcile');
END $$;
CREATE FUNCTION public.asaas_payment_cancel_request(_user_id uuid,_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a asaas_private.payment_attempts%ROWTYPE;o public.orders%ROWTYPE;prior text:=current_setting('app.order_write_context',true);
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id AND cliente_id=_user_id FOR UPDATE;
 IF NOT FOUND OR o.payment_channel<>'asaas' OR o.status NOT IN('pending_payment','placed','accepted') THEN RAISE EXCEPTION 'Payment cannot be cancelled here' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM asaas_private.payment_attempts WHERE order_id=o.id ORDER BY attempt_no DESC LIMIT 1 FOR UPDATE;
 IF a.id IS NULL THEN
  UPDATE public.orders SET status='cancelled',cancellation_reason='Cancelado pelo cliente antes do pagamento.',cancelled_role='cliente',cancelled_by=_user_id,cancelled_at=clock_timestamp() WHERE id=o.id;
 ELSE
  UPDATE asaas_private.payment_attempts SET cancel_requested_at=clock_timestamp(),next_check_at=clock_timestamp() WHERE id=a.id;
  IF o.status IN('placed','accepted') THEN
   UPDATE public.orders SET status='cancelled',cancellation_reason='Cancelado pelo cliente. Reembolso em análise.',cancelled_role='cliente',cancelled_by=_user_id,cancelled_at=clock_timestamp() WHERE id=o.id;
  ELSE
   PERFORM set_config('app.order_write_context','asaas_payment',true);
   UPDATE public.orders SET online_payment_state='cancel_pending' WHERE id=o.id;
   PERFORM set_config('app.order_write_context',coalesce(prior,''),true);
  END IF;
 END IF;
 RETURN public.asaas_payment_view(_user_id,_order_id);
END $$;

ALTER TABLE asaas_private.webhook_events ADD COLUMN review_required boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.asaas_payment_work_claim(_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb:='[]'; e asaas_private.webhook_events%ROWTYPE;a asaas_private.payment_attempts%ROWTYPE;remain integer:=least(greatest(coalesce(_limit,10),1),10);
BEGIN
 FOR e IN SELECT * FROM asaas_private.webhook_events WHERE processed_at IS NULL AND next_check_at<=clock_timestamp()
  AND (operation_id IS NULL OR operation_expires_at<clock_timestamp()) ORDER BY received_at FOR UPDATE SKIP LOCKED LIMIT remain LOOP
  e.operation_id:=gen_random_uuid();
  UPDATE asaas_private.webhook_events SET operation_id=e.operation_id,operation_expires_at=clock_timestamp()+interval '180 seconds',attempts=attempts+1 WHERE work_id=e.work_id;
  result:=result||jsonb_build_array(jsonb_build_object('workId',e.work_id,'operationId',e.operation_id,'kind','event','environment',e.environment,'paymentId',e.payment_id,'eventId',e.event_id));remain:=remain-1;
 END LOOP;
 IF remain>0 THEN
  FOR a IN SELECT * FROM asaas_private.payment_attempts WHERE next_check_at<=clock_timestamp() AND state IN('creating','pending','processing','risk_analysis','uncertain','cancel_pending','confirmed','refund_pending')
   AND (operation_id IS NULL OR operation_expires_at<clock_timestamp()) ORDER BY next_check_at FOR UPDATE SKIP LOCKED LIMIT remain LOOP
   a.operation_id:=gen_random_uuid();
   UPDATE asaas_private.payment_attempts SET operation_id=a.operation_id,operation_expires_at=clock_timestamp()+interval '180 seconds' WHERE id=a.id;
   result:=result||jsonb_build_array(jsonb_build_object('workId',a.id,'operationId',a.operation_id,'kind','attempt','environment',a.environment,'paymentId',a.payment_id,
    'cancelRequested',a.cancel_requested_at IS NOT NULL,'attempt',asaas_private.attempt_context(a,'reconcile')));
  END LOOP;
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.asaas_payment_work_complete(_work_id uuid,_operation_id uuid,_outcome text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF _outcome='review' THEN INSERT INTO asaas_private.payment_issues(order_id,attempt_id,kind) VALUES(a.order_id,a.id,'reconciliation') ON CONFLICT(order_id,kind) DO UPDATE SET resolved_at=NULL; END IF;
 RETURN true;
END $$;

-- Service RPCs are not callable by browser roles, even authenticated administrators.
DO $$ DECLARE p regprocedure; BEGIN
 FOR p IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'asaas_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',p);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',p);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
