-- Explicit courier-only rehearsal: existing store-first tests remain unchanged.
ALTER TABLE private.payment_test_sales ADD COLUMN dispatch_immediately boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.admin_generate_test_ride(
 p_request_key uuid,p_customer_id uuid,p_store_id uuid,p_courier_id uuid,
 p_subtotal_cents integer DEFAULT 2900
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); sale private.payment_test_sales%ROWTYPE;
BEGIN
 IF uid IS NULL OR NOT private.has_role(uid,'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 IF p_courier_id IS NULL THEN RAISE EXCEPTION 'Selecione o entregador para gerar a corrida de teste.' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payment-test-administration',0));
 SELECT * INTO sale FROM private.payment_test_sales WHERE request_key=p_request_key;
 IF FOUND THEN
  IF sale.created_by<>uid THEN RAISE EXCEPTION 'Test request already used' USING ERRCODE='42501'; END IF;
  IF NOT sale.dispatch_immediately THEN
   RAISE EXCEPTION 'A tentativa pertence a outro modo de teste. Inicie uma nova corrida.' USING ERRCODE='22023'; END IF;
  -- The order generator also validates every immutable input on replay.
  RETURN public.admin_generate_test_order(p_request_key,p_customer_id,p_store_id,p_courier_id,p_subtotal_cents);
 END IF;
 -- Serialize with ride acceptance; do not offer a rehearsal to a busy courier.
 PERFORM 1 FROM public.courier_profiles WHERE user_id=p_courier_id FOR UPDATE;
 IF NOT FOUND OR NOT private.is_courier_dispatch_approved(p_courier_id)
  OR NOT EXISTS(SELECT FROM public.courier_profiles WHERE user_id=p_courier_id AND status='online')
  OR EXISTS(SELECT FROM public.deliveries WHERE entregador_id=p_courier_id
    AND status IN('accepted','to_store','at_store','picked_up','to_customer','at_customer')) THEN
  RAISE EXCEPTION 'Escolha um entregador aprovado, online e livre para testar a corrida.' USING ERRCODE='22023'; END IF;
 PERFORM public.admin_generate_test_order(p_request_key,p_customer_id,p_store_id,p_courier_id,p_subtotal_cents);
 SELECT * INTO STRICT sale FROM private.payment_test_sales WHERE request_key=p_request_key;
 IF sale.status<>'approved' OR sale.fulfillment<>'delivery' OR sale.courier_id IS NULL
  OR NOT EXISTS(SELECT FROM public.orders WHERE id=sale.order_id AND test_sale_id=sale.id AND status='placed') THEN
  RAISE EXCEPTION 'O pedido de teste não está disponível para simular o preparo.' USING ERRCODE='22023'; END IF;
 UPDATE private.payment_test_sales SET dispatch_immediately=true WHERE id=sale.id;
 -- This bounded admin operation can advance only the freshly generated simulated order.
 -- Normal dispatch still requires store ownership; no real-order permission is changed.
 UPDATE public.orders SET status='accepted' WHERE id=sale.order_id AND test_sale_id=sale.id;
 UPDATE public.orders SET status='preparing' WHERE id=sale.order_id AND test_sale_id=sale.id;
 UPDATE public.orders SET status='ready' WHERE id=sale.order_id AND test_sale_id=sale.id;
 INSERT INTO public.deliveries(order_id,status,entregador_id,valor_entrega_cents)
  VALUES(sale.order_id,'broadcasting',sale.courier_id,sale.freight_cents);
 UPDATE public.orders SET status='waiting_courier' WHERE id=sale.order_id AND test_sale_id=sale.id;
 RETURN private.payment_test_state();
END $$;
REVOKE ALL ON FUNCTION public.admin_generate_test_ride(uuid,uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_test_ride(uuid,uuid,uuid,uuid,integer) TO authenticated;
