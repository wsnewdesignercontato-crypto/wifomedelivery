-- These bounded cross-row commands preserve RLS and proof-only completion.
-- Private definers need full order reads / cancelled-delivery resets; every call
-- checks auth.uid(), ownership or approval and assignment before any write.
CREATE FUNCTION private.dispatch_order_delivery(p_order_id uuid,p_fee_cents integer,p_courier_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; d public.deliveries%ROWTYPE; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT FROM public.establishments WHERE id=o.establishment_id AND owner_id=uid) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 SELECT * INTO d FROM public.deliveries WHERE order_id=o.id FOR UPDATE;
 IF FOUND AND d.status<>'cancelled' THEN RETURN 'exists'; END IF;
 IF o.tipo_entrega='pickup' OR o.status NOT IN ('ready','waiting_courier') THEN
  RAISE EXCEPTION 'order_not_ready' USING ERRCODE='22023';
 END IF;
 -- Keep p_fee_cents for deployed-client compatibility; the confirmed checkout
 -- freight is also the payout basis used by create_ledger_on_delivered.
 IF p_courier_id IS NOT NULL THEN
  PERFORM 1 FROM public.courier_profiles WHERE user_id=p_courier_id FOR UPDATE;
  IF NOT FOUND OR NOT private.is_courier_dispatch_approved(p_courier_id) THEN RAISE EXCEPTION 'courier_not_approved' USING ERRCODE='42501'; END IF;
 END IF;
 IF d.id IS NULL THEN
  INSERT INTO public.deliveries(order_id,status,entregador_id,valor_entrega_cents)
  VALUES(o.id,'broadcasting',p_courier_id,o.frete_cents);
 ELSE
  UPDATE public.deliveries SET status='broadcasting',entregador_id=p_courier_id,valor_entrega_cents=o.frete_cents,
   aceito_em=NULL,coletado_em=NULL,entregue_em=NULL,lat=NULL,lng=NULL,updated_at=now() WHERE id=d.id;
 END IF;
 UPDATE public.orders SET status='waiting_courier',updated_at=now() WHERE id=o.id;
 RETURN 'dispatched';
END $$;

CREATE FUNCTION private.transition_courier_delivery(p_delivery_id uuid,p_next_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; d public.deliveries%ROWTYPE; oid uuid; uid uuid:=auth.uid();
 target_order public.order_status; expected_delivery text; expected_order public.order_status;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 IF p_next_status IS NULL OR p_next_status NOT IN ('accepted','to_store','at_store','picked_up','to_customer','at_customer') THEN
  RAISE EXCEPTION 'invalid_delivery_transition' USING ERRCODE='22023';
 END IF;
 -- Match confirm_delivery_code's order-before-delivery lock order.
 SELECT order_id INTO oid FROM public.deliveries WHERE id=p_delivery_id;
 SELECT * INTO o FROM public.orders WHERE id=oid FOR UPDATE;
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery_id AND order_id=o.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 -- Serializes separate orders accepted by the same courier, not only this ride.
 PERFORM 1 FROM public.courier_profiles WHERE user_id=uid FOR UPDATE;
 IF NOT FOUND OR NOT private.is_courier_dispatch_approved(uid) THEN RAISE EXCEPTION 'courier_not_approved' USING ERRCODE='42501'; END IF;
 IF d.entregador_id IS DISTINCT FROM uid AND (p_next_status<>'accepted' OR d.status<>'broadcasting' OR d.entregador_id IS NOT NULL) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 IF o.tipo_entrega='pickup' OR o.status IN ('cancelled','refunded','delivered') THEN RAISE EXCEPTION 'order_not_ready' USING ERRCODE='22023'; END IF;
 target_order:=CASE p_next_status WHEN 'accepted' THEN 'courier_assigned' WHEN 'to_store' THEN 'courier_assigned'
  WHEN 'at_store' THEN 'courier_assigned' WHEN 'picked_up' THEN 'picked_up' WHEN 'to_customer' THEN 'on_the_way' ELSE 'arriving' END;
 -- Lost HTTP responses may safely retry the same completed command.
 IF d.status::text=p_next_status AND d.entregador_id=uid AND o.status=target_order THEN RETURN; END IF;
 expected_delivery:=CASE p_next_status WHEN 'accepted' THEN 'broadcasting' WHEN 'to_store' THEN 'accepted'
  WHEN 'at_store' THEN 'to_store' WHEN 'picked_up' THEN 'at_store' WHEN 'to_customer' THEN 'picked_up' ELSE 'to_customer' END;
 expected_order:=CASE p_next_status WHEN 'accepted' THEN 'waiting_courier' WHEN 'to_store' THEN 'courier_assigned'
  WHEN 'at_store' THEN 'courier_assigned' WHEN 'picked_up' THEN 'courier_assigned' WHEN 'to_customer' THEN 'picked_up' ELSE 'on_the_way' END;
 IF d.status::text<>expected_delivery OR o.status<>expected_order THEN RAISE EXCEPTION 'invalid_delivery_transition' USING ERRCODE='22023'; END IF;
 IF p_next_status='accepted' AND EXISTS(SELECT FROM public.deliveries WHERE entregador_id=uid AND id<>d.id AND status IN ('accepted','to_store','at_store','picked_up','to_customer','at_customer')) THEN
  RAISE EXCEPTION 'courier_has_active_delivery' USING ERRCODE='22023';
 END IF;
 UPDATE public.deliveries SET status=p_next_status::public.delivery_status,entregador_id=uid,
  aceito_em=CASE WHEN p_next_status='accepted' THEN coalesce(aceito_em,now()) ELSE aceito_em END,
  coletado_em=CASE WHEN p_next_status='picked_up' THEN coalesce(coletado_em,now()) ELSE coletado_em END,
  updated_at=now() WHERE id=d.id;
 UPDATE public.orders SET status=target_order,updated_at=now() WHERE id=o.id;
 IF p_next_status='accepted' THEN UPDATE public.courier_profiles SET status='ocupado',updated_at=now() WHERE user_id=uid; END IF;
END $$;

CREATE FUNCTION public.dispatch_order_delivery(p_order_id uuid,p_fee_cents integer,p_courier_id uuid DEFAULT NULL)
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.dispatch_order_delivery(p_order_id,p_fee_cents,p_courier_id);
$$;
CREATE FUNCTION public.transition_courier_delivery(p_delivery_id uuid,p_next_status text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.transition_courier_delivery(p_delivery_id,p_next_status);
$$;
REVOKE ALL ON FUNCTION private.dispatch_order_delivery(uuid,integer,uuid),private.transition_courier_delivery(uuid,text),
 public.dispatch_order_delivery(uuid,integer,uuid),public.transition_courier_delivery(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dispatch_order_delivery(uuid,integer,uuid),private.transition_courier_delivery(uuid,text),
 public.dispatch_order_delivery(uuid,integer,uuid),public.transition_courier_delivery(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
