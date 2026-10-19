-- Keep safeupdate enabled: capture test authorization IDs under the existing administration lock.
-- Empty arrays/NULL intentionally delete no authorizations; real accounts are never removed.
CREATE OR REPLACE FUNCTION private.payment_test_command(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); sale private.payment_test_sales%ROWTYPE; shop public.establishments%ROWTYPE;
 oid uuid; count_sales integer; deleted_orders integer; ids uuid[]; tester_ids uuid[]; drivers uuid[]; amount integer; freight integer; pct numeric; target uuid;
BEGIN
 IF uid IS NULL OR NOT private.has_role(uid,'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payment-test-administration',0));
 IF p_action='state' THEN RETURN private.payment_test_state(); END IF;
 IF p_action='toggle' THEN
  IF jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid test setting' USING ERRCODE='22023'; END IF;
  UPDATE private.payment_test_settings SET enabled=(p_payload->>'enabled')::boolean WHERE id;
 ELSIF p_action IN('enroll','revoke') THEN
  IF p_action='revoke' THEN
   DELETE FROM private.payment_test_customers WHERE customer_id=(p_payload->>'customer_id')::uuid;
  ELSE
   IF NOT (SELECT enabled FROM private.payment_test_settings WHERE id) THEN RAISE EXCEPTION 'Ative o modo de teste primeiro.' USING ERRCODE='22023'; END IF;
   IF NOT EXISTS(SELECT FROM public.profiles WHERE id=(p_payload->>'customer_id')::uuid) THEN RAISE EXCEPTION 'Escolha o cliente do teste.' USING ERRCODE='22023'; END IF;
   SELECT * INTO shop FROM public.establishments WHERE id=(p_payload->>'store_id')::uuid AND status='aprovado';
   IF NOT FOUND THEN RAISE EXCEPTION 'Escolha uma loja aprovada.' USING ERRCODE='22023'; END IF;
   target:=(p_payload->>'courier_id')::uuid;
   IF target IS NOT NULL AND NOT private.is_courier_dispatch_approved(target) THEN RAISE EXCEPTION 'Escolha um entregador aprovado.' USING ERRCODE='22023'; END IF;
   INSERT INTO private.payment_test_customers(customer_id,establishment_id,courier_id,created_by,expires_at)
   VALUES((p_payload->>'customer_id')::uuid,shop.id,target,uid,now()+interval '24 hours')
   ON CONFLICT(customer_id) DO UPDATE SET establishment_id=excluded.establishment_id,courier_id=excluded.courier_id,created_by=excluded.created_by,expires_at=excluded.expires_at;
  END IF;
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
  SELECT array_agg(customer_id) INTO tester_ids FROM private.payment_test_customers;
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
  DELETE FROM private.payment_test_customers WHERE customer_id=ANY(tester_ids);
  UPDATE public.courier_profiles c SET status='online' WHERE user_id=ANY(drivers) AND status='ocupado'
   AND NOT EXISTS(SELECT FROM public.deliveries d WHERE d.entregador_id=c.user_id AND d.status IN('accepted','to_store','at_store','picked_up','to_customer','at_customer'));
  INSERT INTO public.admin_audit_log(admin_id,action,entity_type,metadata) VALUES(uid,'cleanup_payment_tests','payment_simulator',jsonb_build_object('sales',count_sales,'orders',deleted_orders));
 ELSE RAISE EXCEPTION 'Invalid test command' USING ERRCODE='22023';
 END IF;
 IF p_action<>'cleanup' THEN INSERT INTO public.admin_audit_log(admin_id,action,entity_type,metadata)
  VALUES(uid,'payment_test_'||p_action,'payment_simulator',jsonb_build_object('sale_id',p_payload->>'sale_id','enabled',p_payload->'enabled')); END IF;
 RETURN private.payment_test_state();
END $$;
