-- Administrative simulator: never contacts a gateway or credits withdrawable balances.
CREATE TABLE private.payment_test_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.payment_test_settings(id) VALUES(true);
CREATE TABLE private.payment_test_sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_key uuid NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 customer_id uuid NOT NULL REFERENCES public.profiles(id),
 establishment_id uuid NOT NULL REFERENCES public.establishments(id),
 courier_id uuid REFERENCES public.courier_profiles(user_id),
 fulfillment text NOT NULL CHECK(fulfillment IN('delivery','pickup')),
 payment_method text NOT NULL CHECK(payment_method IN('pix','cartao')),
 subtotal_cents integer NOT NULL CHECK(subtotal_cents BETWEEN 100 AND 1000000),
 freight_cents integer NOT NULL CHECK(freight_cents>=0),
 commission_cents integer NOT NULL CHECK(commission_cents>=0),
 address jsonb, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','declined','refunded')),
 order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.payment_test_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.payment_test_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.payment_test_settings,private.payment_test_sales FROM PUBLIC,anon,authenticated;
ALTER TABLE public.orders ADD COLUMN test_sale_id uuid REFERENCES private.payment_test_sales(id) ON DELETE RESTRICT;
ALTER TABLE public.orders ADD COLUMN is_test boolean GENERATED ALWAYS AS(test_sale_id IS NOT NULL) STORED;
ALTER TABLE public.deliveries ADD COLUMN is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN test_sale_id uuid REFERENCES private.payment_test_sales(id) ON DELETE CASCADE;
GRANT SELECT(is_test,test_sale_id) ON public.orders TO authenticated;
GRANT SELECT(is_test) ON public.deliveries TO authenticated;
CREATE INDEX orders_test_sale_idx ON public.orders(test_sale_id) WHERE test_sale_id IS NOT NULL;
CREATE INDEX notifications_test_sale_idx ON public.notifications(test_sale_id) WHERE test_sale_id IS NOT NULL;

CREATE FUNCTION private.guard_test_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.test_sale_id IS DISTINCT FROM OLD.test_sale_id THEN
  RAISE EXCEPTION 'Test identity is immutable' USING ERRCODE='42501';
 END IF;
 IF NEW.test_sale_id IS NOT NULL THEN
  IF TG_OP='INSERT' AND (current_user<>'postgres' OR NOT private.has_role(auth.uid(),'admin')
   OR NOT EXISTS(SELECT FROM private.payment_test_sales s WHERE s.id=NEW.test_sale_id AND s.status='pending'
    AND s.created_by=auth.uid() AND s.customer_id=NEW.cliente_id AND s.establishment_id=NEW.establishment_id
    AND s.subtotal_cents=NEW.subtotal_cents AND s.freight_cents=NEW.frete_cents)) THEN
   RAISE EXCEPTION 'Use the administrative simulator' USING ERRCODE='42501';
  END IF;
  IF NEW.payment_received_at IS NOT NULL OR NEW.dinheiro_recebido THEN
   RAISE EXCEPTION 'Test payments cannot become real receipts' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aaa_guard_test_order BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.guard_test_order();
CREATE FUNCTION private.guard_test_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE test_id uuid; target uuid;
BEGIN
 SELECT o.test_sale_id,s.courier_id INTO test_id,target FROM public.orders o
 LEFT JOIN private.payment_test_sales s ON s.id=o.test_sale_id WHERE o.id=NEW.order_id;
 IF TG_OP='UPDATE' AND (NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.is_test IS DISTINCT FROM OLD.is_test) THEN
  RAISE EXCEPTION 'Delivery identity is immutable' USING ERRCODE='42501';
 END IF;
 NEW.is_test:=test_id IS NOT NULL;
 IF NEW.is_test THEN
  IF target IS NULL THEN RAISE EXCEPTION 'Test courier required' USING ERRCODE='22023'; END IF;
  NEW.entregador_id:=target;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aaa_guard_test_delivery BEFORE INSERT OR UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION private.guard_test_delivery();
CREATE FUNCTION private.can_access_test_order(p_order uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND (private.has_role(auth.uid(),'admin') OR EXISTS(
 SELECT FROM public.orders o JOIN public.establishments e ON e.id=o.establishment_id
 JOIN private.payment_test_sales s ON s.id=o.test_sale_id
 WHERE o.id=p_order AND auth.uid() IN(o.cliente_id,e.owner_id,s.courier_id)))
$$;
CREATE POLICY test_delivery_visibility ON public.deliveries AS RESTRICTIVE FOR SELECT TO authenticated
 USING(NOT is_test OR private.can_access_test_order(order_id));
CREATE POLICY test_order_visibility ON public.orders AS RESTRICTIVE FOR SELECT TO authenticated
 USING(NOT is_test OR private.can_access_test_order(id));

-- Existing business functions continue unchanged; financial and score triggers exclude test orders.
DROP TRIGGER trg_ledger_on_delivered ON public.orders;
CREATE TRIGGER trg_ledger_on_delivered AFTER UPDATE ON public.orders FOR EACH ROW WHEN(NOT NEW.is_test) EXECUTE FUNCTION public.create_ledger_on_delivered();
DROP TRIGGER trg_orders_delay_score ON public.orders;
CREATE TRIGGER trg_orders_delay_score AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN(NOT NEW.is_test) EXECUTE FUNCTION public.trg_orders_delay_penalty();
CREATE FUNCTION private.reject_test_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT FROM public.orders WHERE id=NEW.order_id AND is_test) THEN
  RAISE EXCEPTION 'Test orders do not create public reviews' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aaa_reject_test_review BEFORE INSERT OR UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION private.reject_test_review();
CREATE OR REPLACE FUNCTION public.public_store_sales() RETURNS TABLE(establishment_id uuid,order_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.id,count(o.id) FROM public.establishments e LEFT JOIN public.orders o
 ON o.establishment_id=e.id AND o.status='delivered' AND NOT o.is_test WHERE e.status='aprovado' GROUP BY e.id
$$;

CREATE FUNCTION private.payment_test_state() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
 'enabled',(SELECT enabled FROM private.payment_test_settings WHERE id),
 'admin_id',auth.uid(),'count',(SELECT count(*) FROM private.payment_test_sales),
 'customers',coalesce((SELECT jsonb_agg(x) FROM (SELECT id,nome FROM public.profiles ORDER BY (id=auth.uid()) DESC,nome,id LIMIT 500) x),'[]'::jsonb),
 'stores',coalesce((SELECT jsonb_agg(x) FROM (SELECT id,nome,cidade,estado,is_open FROM public.establishments WHERE status='aprovado' ORDER BY nome,id LIMIT 500) x),'[]'::jsonb),
 'couriers',coalesce((SELECT jsonb_agg(x) FROM (SELECT c.user_id AS id,p.nome,c.status,c.cidade_atuacao AS cidade
 FROM public.courier_profiles c JOIN public.profiles p ON p.id=c.user_id
 WHERE private.is_courier_dispatch_approved(c.user_id) ORDER BY p.nome,c.user_id LIMIT 500) x),'[]'::jsonb),
 'sales',coalesce((SELECT jsonb_agg(x) FROM (SELECT s.id,s.status,s.order_id,o.status AS order_status,s.created_at,
 p.nome AS customer,e.nome AS store,cp.nome AS courier,s.subtotal_cents,s.freight_cents,s.commission_cents,
 s.subtotal_cents+s.freight_cents AS total_cents
 FROM private.payment_test_sales s JOIN public.profiles p ON p.id=s.customer_id
 JOIN public.establishments e ON e.id=s.establishment_id LEFT JOIN public.profiles cp ON cp.id=s.courier_id
 LEFT JOIN public.orders o ON o.id=s.order_id ORDER BY s.created_at DESC,s.id DESC LIMIT 50) x),'[]'::jsonb))
$$;

CREATE FUNCTION private.payment_test_command(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); sale private.payment_test_sales%ROWTYPE; shop public.establishments%ROWTYPE;
 oid uuid; count_sales integer; deleted_orders integer; ids uuid[]; drivers uuid[]; amount integer; freight integer; pct numeric; target uuid;
BEGIN
 IF uid IS NULL OR NOT private.has_role(uid,'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payment-test-administration',0));
 IF p_action='state' THEN RETURN private.payment_test_state(); END IF;
 IF p_action='toggle' THEN
  IF jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid test setting' USING ERRCODE='22023'; END IF;
  UPDATE private.payment_test_settings SET enabled=(p_payload->>'enabled')::boolean WHERE id;
 ELSIF p_action='create' THEN
  IF NOT (SELECT enabled FROM private.payment_test_settings WHERE id) THEN RAISE EXCEPTION 'Ative o modo de teste primeiro.' USING ERRCODE='22023'; END IF;
  SELECT * INTO sale FROM private.payment_test_sales WHERE request_key=(p_payload->>'request_key')::uuid;
  IF FOUND THEN
   IF sale.created_by<>uid THEN RAISE EXCEPTION 'Test request already used' USING ERRCODE='42501'; END IF;
   RETURN private.payment_test_state();
  END IF;
  SELECT * INTO shop FROM public.establishments WHERE id=(p_payload->>'store_id')::uuid AND status='aprovado';
  IF NOT FOUND THEN RAISE EXCEPTION 'Escolha uma loja aprovada.' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT FROM public.profiles WHERE id=(p_payload->>'customer_id')::uuid) THEN RAISE EXCEPTION 'Escolha a conta do cliente de teste.' USING ERRCODE='22023'; END IF;
  IF p_payload->>'fulfillment' NOT IN('delivery','pickup') OR p_payload->>'payment_method' NOT IN('pix','cartao') THEN RAISE EXCEPTION 'Invalid test payment' USING ERRCODE='22023'; END IF;
  IF p_payload->>'fulfillment'='delivery' THEN
   target:=(p_payload->>'courier_id')::uuid;
   IF target IS NULL OR NOT private.is_courier_dispatch_approved(target) OR NOT EXISTS(SELECT FROM public.courier_profiles c WHERE c.user_id=target AND c.status='online'
    AND (shop.cidade IS NULL OR c.cidade_atuacao IS NULL OR public.normalize_delivery_text(btrim(c.cidade_atuacao))=public.normalize_delivery_text(btrim(shop.cidade))
    OR EXISTS(SELECT FROM unnest(coalesce(c.cidades_atuacao,ARRAY[]::text[])) city WHERE public.normalize_delivery_text(btrim(city))=public.normalize_delivery_text(btrim(shop.cidade)))))
    THEN RAISE EXCEPTION 'Escolha um entregador aprovado, online e que atue na cidade da loja.' USING ERRCODE='22023'; END IF;
   IF jsonb_typeof(p_payload->'address') IS DISTINCT FROM 'object' OR nullif(btrim(p_payload->'address'->>'rua'),'') IS NULL
    OR nullif(btrim(p_payload->'address'->>'cidade'),'') IS NULL OR length((p_payload->'address')::text)>2000 THEN RAISE EXCEPTION 'Informe o endereço de entrega do teste.' USING ERRCODE='22023'; END IF;
  END IF;
  amount:=(p_payload->>'subtotal_cents')::integer;
  freight:=CASE WHEN p_payload->>'fulfillment'='pickup' THEN 0 ELSE greatest(0,shop.taxa_entrega_cents) END;
  SELECT least(100,greatest(0,commission_pct)) INTO pct FROM public.platform_settings WHERE id=1;
  INSERT INTO private.payment_test_sales(request_key,created_by,customer_id,establishment_id,courier_id,fulfillment,payment_method,subtotal_cents,freight_cents,commission_cents,address)
  VALUES((p_payload->>'request_key')::uuid,uid,(p_payload->>'customer_id')::uuid,shop.id,target,p_payload->>'fulfillment',p_payload->>'payment_method',amount,freight,
   round(amount*coalesce(pct,15)/100)::integer,CASE WHEN p_payload->>'fulfillment'='delivery' THEN p_payload->'address' ELSE NULL END);
 ELSIF p_action IN('approve','decline','refund') THEN
  SELECT * INTO sale FROM private.payment_test_sales WHERE id=(p_payload->>'sale_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda de teste não encontrada.' USING ERRCODE='22023'; END IF;
  IF p_action IN('approve','decline') AND NOT (SELECT enabled FROM private.payment_test_settings WHERE id) THEN RAISE EXCEPTION 'O modo de teste está desligado.' USING ERRCODE='22023'; END IF;
  IF p_action='approve' AND sale.status='pending' THEN
   INSERT INTO public.orders(cliente_id,establishment_id,status,subtotal_cents,frete_cents,total_cents,desconto_cents,commission_cents,
    forma_pagamento,tipo_entrega,endereco_entrega,observacoes,test_sale_id)
   VALUES(sale.customer_id,sale.establishment_id,'placed',sale.subtotal_cents,sale.freight_cents,sale.subtotal_cents+sale.freight_cents,0,sale.commission_cents,
    sale.payment_method::public.payment_method,sale.fulfillment,sale.address,'[TESTE] Pagamento simulado. Não preparar produtos nem cobrar. Gerado pelo administrador.',sale.id) RETURNING id INTO oid;
   INSERT INTO public.order_items(order_id,nome_snapshot,preco_unit_cents,quantidade,addons)
   VALUES(oid,'[TESTE] Produto de demonstração',sale.subtotal_cents,1,'[]');
   UPDATE private.payment_test_sales SET status='approved',order_id=oid WHERE id=sale.id;
  ELSIF p_action='decline' AND sale.status='pending' THEN
   UPDATE private.payment_test_sales SET status='declined' WHERE id=sale.id;
  ELSIF p_action='refund' AND sale.status='approved' THEN
   PERFORM 1 FROM public.orders WHERE id=sale.order_id AND test_sale_id=sale.id FOR UPDATE;
   UPDATE public.orders SET status='cancelled',cancellation_reason='[TESTE] Simulação de estorno' WHERE id=sale.order_id AND status NOT IN('cancelled','delivered','refunded');
   UPDATE public.orders SET status='refunded',refund_status='completed',refund_amount_cents=total_cents,refunded_at=now() WHERE id=sale.order_id AND status IN('cancelled','delivered');
   UPDATE private.payment_test_sales SET status='refunded' WHERE id=sale.id;
  ELSIF NOT (p_action='approve' AND sale.status='approved' OR p_action='decline' AND sale.status='declined' OR p_action='refund' AND sale.status='refunded') THEN
   RAISE EXCEPTION 'Esta venda de teste já foi processada.' USING ERRCODE='22023';
  END IF;
 ELSIF p_action='cleanup' THEN
  IF p_payload->>'confirmation' IS DISTINCT FROM 'LIMPAR TESTES' THEN RAISE EXCEPTION 'Confirme a limpeza somente dos testes.' USING ERRCODE='22023'; END IF;
  SELECT array_agg(id),count(*) INTO ids,count_sales FROM private.payment_test_sales;
  PERFORM 1 FROM public.orders WHERE test_sale_id=ANY(ids) FOR UPDATE;
  SELECT array_agg(DISTINCT entregador_id) INTO drivers FROM public.deliveries WHERE is_test AND order_id IN(SELECT id FROM public.orders WHERE test_sale_id=ANY(ids));
  -- Serialize with ride acceptance before deciding whether a courier is free again.
  PERFORM 1 FROM public.courier_profiles WHERE user_id=ANY(drivers) ORDER BY user_id FOR UPDATE;
  -- Delete only records linked to server-created test IDs, including non-cascading children.
  DELETE FROM public.tracking_points WHERE order_id IN(SELECT id FROM public.orders WHERE test_sale_id=ANY(ids));
  DELETE FROM public.sos_events WHERE order_id IN(SELECT id FROM public.orders WHERE test_sale_id=ANY(ids));
  DELETE FROM public.support_tickets WHERE order_id IN(SELECT id FROM public.orders WHERE test_sale_id=ANY(ids));
  DELETE FROM public.platform_ledger WHERE order_id IN(SELECT id FROM public.orders WHERE test_sale_id=ANY(ids));
  DELETE FROM public.orders WHERE test_sale_id=ANY(ids);
  GET DIAGNOSTICS deleted_orders=ROW_COUNT;
  DELETE FROM private.payment_test_sales WHERE id=ANY(ids);
  UPDATE public.courier_profiles c SET status='online' WHERE user_id=ANY(drivers) AND status='ocupado'
   AND NOT EXISTS(SELECT FROM public.deliveries d WHERE d.entregador_id=c.user_id AND d.status IN('accepted','to_store','at_store','picked_up','to_customer','at_customer'));
  INSERT INTO public.admin_audit_log(admin_id,action,entity_type,metadata) VALUES(uid,'cleanup_payment_tests','payment_simulator',jsonb_build_object('sales',count_sales,'orders',deleted_orders));
 ELSE RAISE EXCEPTION 'Invalid test command' USING ERRCODE='22023';
 END IF;
 IF p_action<>'cleanup' THEN INSERT INTO public.admin_audit_log(admin_id,action,entity_type,metadata)
  VALUES(uid,'payment_test_'||p_action,'payment_simulator',jsonb_build_object('sale_id',p_payload->>'sale_id','enabled',p_payload->'enabled')); END IF;
 RETURN private.payment_test_state();
END $$;
CREATE FUNCTION public.admin_payment_test(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.payment_test_command(p_action,p_payload) $$;
REVOKE ALL ON FUNCTION private.payment_test_state(),private.guard_test_order(),private.guard_test_delivery(),private.reject_test_review() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.payment_test_command(text,jsonb),public.admin_payment_test(text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.can_access_test_order(uuid) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.payment_test_command(text,jsonb),public.admin_payment_test(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_test_order(uuid) TO authenticated;

-- Cancelling a targeted test offer must not free a courier working on another order.
CREATE OR REPLACE FUNCTION public.orders_status_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO public.order_status_history(order_id,from_status,to_status,changed_by,reason)
  VALUES(NEW.id,OLD.status,NEW.status,auth.uid(),NEW.cancellation_reason);
  IF NEW.status='cancelled' THEN
   UPDATE public.deliveries SET status='cancelled',updated_at=now() WHERE order_id=NEW.id AND status NOT IN('delivered','cancelled');
   PERFORM 1 FROM public.courier_profiles WHERE user_id IN(SELECT entregador_id FROM public.deliveries WHERE order_id=NEW.id AND entregador_id IS NOT NULL) ORDER BY user_id FOR UPDATE;
   UPDATE public.courier_profiles cp SET status='online' WHERE cp.status='ocupado'
    AND cp.user_id IN(SELECT entregador_id FROM public.deliveries WHERE order_id=NEW.id AND entregador_id IS NOT NULL)
    AND NOT EXISTS(SELECT FROM public.deliveries d WHERE d.entregador_id=cp.user_id AND d.status IN('accepted','to_store','at_store','picked_up','to_customer','at_customer'));
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.orders_status_after() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.notify_estab_new_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid;
BEGIN
 SELECT owner_id INTO owner FROM public.establishments WHERE id=NEW.establishment_id;
 IF owner IS NOT NULL THEN
 INSERT INTO public.notifications(user_id,titulo,mensagem,link_url,audience,test_sale_id)
 VALUES(owner,CASE WHEN NEW.test_sale_id IS NULL THEN '🛎️ Novo pedido recebido!' ELSE '[TESTE] Novo pedido simulado' END,
 CASE WHEN NEW.test_sale_id IS NULL THEN 'Você recebeu um novo pedido de R$ '||to_char(NEW.total_cents/100.0,'FM999999990.00')||'. Toque para aceitar e começar o preparo.'
 ELSE 'Pagamento simulado. Não preparar produtos nem cobrar. Aceite para testar o fluxo.' END,
 '/estabelecimento/pedidos','estabelecimento',NEW.test_sale_id);
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.notify_couriers_new_ride() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE city text; amount text; test_id uuid;
BEGIN
 IF NEW.status::text<>'broadcasting' OR TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
 SELECT e.cidade,o.test_sale_id INTO city,test_id FROM public.orders o JOIN public.establishments e ON e.id=o.establishment_id WHERE o.id=NEW.order_id;
 amount:=to_char(coalesce(NEW.valor_entrega_cents,0)/100.0,'FM999999990.00');
 INSERT INTO public.notifications(user_id,titulo,mensagem,link_url,audience,test_sale_id)
 SELECT cp.user_id,CASE WHEN test_id IS NULL THEN 'Nova corrida disponível!' ELSE '[TESTE] Corrida simulada' END,
 CASE WHEN test_id IS NULL THEN 'Corrida de R$ '||amount||' disponível. O primeiro entregador a aceitar fica com a corrida.'
 ELSE 'Corrida de teste, sem entrega ou pagamento real. Aceite para testar o fluxo.' END,'/entregador/corridas','entregador',test_id
 FROM public.courier_profiles cp
 WHERE cp.status='online' AND private.is_courier_dispatch_approved(cp.user_id)
 AND (NEW.entregador_id IS NULL OR NEW.entregador_id=cp.user_id)
 AND NOT EXISTS(SELECT FROM public.deliveries d WHERE d.entregador_id=cp.user_id AND d.status IN('accepted','to_store','at_store','picked_up','to_customer','at_customer'))
 AND (city IS NULL OR cp.cidade_atuacao IS NULL OR public.normalize_delivery_text(btrim(cp.cidade_atuacao))=public.normalize_delivery_text(btrim(city))
 OR EXISTS(SELECT FROM unnest(coalesce(cp.cidades_atuacao,ARRAY[]::text[])) c WHERE public.normalize_delivery_text(btrim(c))=public.normalize_delivery_text(btrim(city))));
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.notify_client_on_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE msg text;
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
 msg:=CASE NEW.status WHEN 'accepted' THEN 'Sua loja aceitou o pedido!' WHEN 'preparing' THEN 'Seu pedido está em preparo.'
 WHEN 'ready' THEN 'Seu pedido está pronto.' WHEN 'courier_assigned' THEN 'Um entregador aceitou seu pedido.'
 WHEN 'picked_up' THEN 'Pedido coletado pelo entregador.' WHEN 'on_the_way' THEN 'Seu pedido está a caminho!'
 WHEN 'arriving' THEN 'O entregador está chegando.' WHEN 'delivered' THEN 'Pedido entregue. Bom apetite!'
 WHEN 'cancelled' THEN coalesce(nullif(NEW.cancellation_reason,''),'Pedido cancelado.') WHEN 'refunded' THEN 'Pedido reembolsado.' ELSE NULL END;
 IF msg IS NOT NULL THEN
 INSERT INTO public.notifications(user_id,titulo,mensagem,link_url,audience,test_sale_id)
 VALUES(NEW.cliente_id,CASE WHEN NEW.test_sale_id IS NULL THEN 'Atualização do pedido' ELSE '[TESTE] Atualização do pedido simulado' END,
 msg,'/cliente/pedido/'||NEW.id::text,'cliente',NEW.test_sale_id);
 END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_estab_new_order(),public.notify_couriers_new_ride(),public.notify_client_on_status() FROM PUBLIC,anon,authenticated;
