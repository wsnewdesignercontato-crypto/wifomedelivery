-- Checkout and finance are server-authorized transactions; cart snapshots are display data only.
ALTER TABLE public.orders ADD COLUMN checkout_key uuid;
ALTER TABLE public.orders ADD COLUMN checkout_request jsonb;
ALTER TABLE public.orders ADD COLUMN coupon_id uuid REFERENCES public.coupons(id) ON DELETE RESTRICT;
ALTER TABLE public.orders ADD COLUMN coupon_funder text;
ALTER TABLE public.orders ADD COLUMN commission_cents integer;
ALTER TABLE public.orders ADD COLUMN payment_received_at timestamptz;
ALTER TABLE public.orders ADD COLUMN payment_received_by uuid REFERENCES auth.users(id);
ALTER TABLE public.orders ADD COLUMN payment_reference text;
CREATE UNIQUE INDEX orders_checkout_key_unique ON public.orders(cliente_id,checkout_key) WHERE checkout_key IS NOT NULL;
ALTER TABLE public.establishment_withdrawals ADD COLUMN request_key uuid;
ALTER TABLE public.courier_withdrawals ADD COLUMN request_key uuid;
CREATE UNIQUE INDEX establishment_withdrawals_request_key ON public.establishment_withdrawals(establishment_id,request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX courier_withdrawals_request_key ON public.courier_withdrawals(courier_id,request_key) WHERE request_key IS NOT NULL;

REVOKE INSERT,DELETE ON public.orders FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.order_items FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.platform_ledger FROM anon,authenticated;
REVOKE INSERT,DELETE ON public.establishment_withdrawals, public.courier_withdrawals FROM anon,authenticated;

CREATE OR REPLACE FUNCTION private.guard_order_finance() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF current_user='postgres' AND auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF current_user <> 'postgres' OR current_setting('app.order_write_context',true) IS DISTINCT FROM 'checkout' THEN
   RAISE EXCEPTION 'Use checkout_order to create orders' USING ERRCODE='42501';
  END IF;
  IF NEW.status <> 'placed' THEN RAISE EXCEPTION 'Invalid initial status' USING ERRCODE='42501'; END IF;
 ELSIF ROW(NEW.cliente_id,NEW.establishment_id,NEW.subtotal_cents,NEW.frete_cents,NEW.desconto_cents,NEW.total_cents,NEW.forma_pagamento,NEW.tipo_entrega,NEW.endereco_entrega,NEW.checkout_key,NEW.checkout_request,NEW.coupon_id,NEW.coupon_funder,NEW.commission_cents)
  IS DISTINCT FROM ROW(OLD.cliente_id,OLD.establishment_id,OLD.subtotal_cents,OLD.frete_cents,OLD.desconto_cents,OLD.total_cents,OLD.forma_pagamento,OLD.tipo_entrega,OLD.endereco_entrega,OLD.checkout_key,OLD.checkout_request,OLD.coupon_id,OLD.coupon_funder,OLD.commission_cents) THEN
  RAISE EXCEPTION 'Confirmed order financial fields are immutable' USING ERRCODE='42501';
 END IF;
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
REVOKE ALL ON FUNCTION private.guard_order_finance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_order_finance BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.guard_order_finance();

CREATE OR REPLACE FUNCTION private.guard_order_items() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' AND (current_user='postgres' AND auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.orders WHERE id=OLD.order_id)) THEN RETURN OLD; END IF;
 IF current_user='postgres' AND auth.uid() IS NULL THEN RETURN NEW; END IF;
 -- The product FK may clear its reference on deletion; the receipt snapshot stays immutable.
 IF TG_OP='UPDATE' AND NEW.product_id IS NULL AND OLD.product_id IS NOT NULL AND (to_jsonb(NEW)-'product_id')=(to_jsonb(OLD)-'product_id') AND NOT EXISTS(SELECT 1 FROM public.products WHERE id=OLD.product_id) THEN RETURN NEW; END IF;
 IF TG_OP <> 'INSERT' OR current_user <> 'postgres' OR current_setting('app.order_write_context',true) IS DISTINCT FROM 'checkout' THEN
  RAISE EXCEPTION 'Confirmed order items are immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_order_items() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_order_items BEFORE INSERT OR UPDATE OR DELETE ON public.order_items FOR EACH ROW EXECUTE FUNCTION private.guard_order_items();

CREATE OR REPLACE FUNCTION public.checkout_order(p_establishment_id uuid,p_idempotency_key uuid,p_forma_pagamento text,p_tipo_entrega text,p_endereco jsonb DEFAULT NULL,p_observacoes text DEFAULT NULL,p_coupon_code text DEFAULT NULL,p_expected_total_cents integer DEFAULT NULL,p_quote boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 uid uuid := auth.uid(); store public.establishments%ROWTYPE; item record; product public.products%ROWTYPE;
 addon public.addons%ROWTYPE; grp record; choice jsonb; options jsonb; snapshots jsonb := '[]';
 unit_price integer; subtotal bigint := 0; freight integer; discount integer := 0; total integer;
 coupon public.coupons%ROWTYPE; coupon_code text := nullif(upper(btrim(p_coupon_code)),'');
 request jsonb; existing public.orders%ROWTYPE; order_id uuid; commission integer; pct numeric;
 previous_context text := current_setting('app.order_write_context',true); distance_km double precision;
 needed_products jsonb:='{}'; needed_addons jsonb:='{}'; needed integer; stock record;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_idempotency_key IS NULL OR p_forma_pagamento IS NULL OR p_forma_pagamento NOT IN ('pix','cartao','dinheiro') OR p_tipo_entrega IS NULL OR p_tipo_entrega NOT IN ('delivery','pickup') THEN
  RAISE EXCEPTION 'Invalid checkout or unsupported payment method' USING ERRCODE='22023'; END IF;
 IF length(coalesce(p_observacoes,'')) > 500 THEN RAISE EXCEPTION 'Observation too long' USING ERRCODE='22023'; END IF;
 request := jsonb_build_object('store',p_establishment_id,'payment',p_forma_pagamento,'fulfillment',p_tipo_entrega,'address',CASE WHEN p_tipo_entrega='pickup' THEN NULL ELSE p_endereco END,'notes',p_observacoes,'coupon',coupon_code);
 -- Serialize retries before reading the cart; retries after a successful commit return the same order.
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_idempotency_key::text,0));
 SELECT * INTO existing FROM public.orders WHERE cliente_id=uid AND checkout_key=p_idempotency_key;
 IF FOUND THEN
  IF existing.checkout_request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Idempotency key belongs to another checkout' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('order_id',existing.id,'total_cents',existing.total_cents,'desconto_cents',existing.desconto_cents);
 END IF;
 -- Lock the customer's cart across different keys too.
 PERFORM pg_advisory_xact_lock(hashtextextended('cart:'||uid::text,0));
 IF EXISTS(SELECT 1 FROM public.platform_settings WHERE maintenance_mode) THEN RAISE EXCEPTION 'Platform under maintenance' USING ERRCODE='22023'; END IF;
 SELECT * INTO store FROM public.establishments WHERE id=p_establishment_id FOR SHARE;
 IF NOT FOUND OR store.status <> 'aprovado' OR NOT store.is_open THEN RAISE EXCEPTION 'Store closed or unavailable' USING ERRCODE='22023'; END IF;
 freight := CASE WHEN p_tipo_entrega='pickup' THEN 0 ELSE store.taxa_entrega_cents END;
 IF freight < 0 THEN RAISE EXCEPTION 'Invalid delivery fee' USING ERRCODE='22023'; END IF;
 IF p_tipo_entrega='delivery' THEN
  IF p_endereco IS NULL OR jsonb_typeof(p_endereco)<>'object' OR coalesce(btrim(p_endereco->>'rua'),'')='' OR coalesce(btrim(p_endereco->>'cidade'),'')='' THEN RAISE EXCEPTION 'Delivery address required' USING ERRCODE='22023'; END IF;
  IF nullif(btrim(store.cidade),'') IS NOT NULL AND lower(btrim(store.cidade)) <> lower(btrim(p_endereco->>'cidade')) THEN RAISE EXCEPTION 'Address outside delivery city' USING ERRCODE='22023'; END IF;
  IF store.lat IS NOT NULL AND store.lng IS NOT NULL AND p_endereco->>'lat' IS NOT NULL AND p_endereco->>'lng' IS NOT NULL THEN
   IF abs((p_endereco->>'lat')::numeric)>90 OR abs((p_endereco->>'lng')::numeric)>180 THEN RAISE EXCEPTION 'Invalid coordinates' USING ERRCODE='22023'; END IF;
   distance_km := 6371*acos(least(1.0,greatest(-1.0,sin(radians(store.lat))*sin(radians((p_endereco->>'lat')::float8))+cos(radians(store.lat))*cos(radians((p_endereco->>'lat')::float8))*cos(radians((p_endereco->>'lng')::float8-store.lng)))));
   IF distance_km > store.raio_entrega_km THEN RAISE EXCEPTION 'Address outside delivery radius' USING ERRCODE='22023'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.establishment_delivery_zones WHERE establishment_id=store.id AND ativo) THEN
   SELECT z.taxa_cents INTO freight FROM public.establishment_delivery_zones z WHERE z.establishment_id=store.id AND z.ativo
    AND ((nullif(btrim(z.bairro),'') IS NOT NULL AND lower(btrim(z.bairro))=lower(btrim(p_endereco->>'bairro'))) OR (z.bairro IS NULL AND z.raio_km IS NOT NULL AND distance_km IS NOT NULL AND distance_km <= z.raio_km)) ORDER BY z.taxa_cents,z.id LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'Address outside configured delivery areas' USING ERRCODE='22023'; END IF;
  END IF;
 END IF;
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
  snapshots := snapshots||jsonb_build_array(jsonb_build_object('product_id',product.id,'nome',product.nome,'price',unit_price,'quantity',item.quantidade,'notes',item.observacoes,'addons',options));
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
 FOR stock IN SELECT key::uuid AS id,value::int AS quantity FROM jsonb_each_text(needed_products) LOOP
  UPDATE public.products SET estoque=estoque-stock.quantity WHERE id=stock.id AND estoque IS NOT NULL;
 END LOOP;
 FOR stock IN SELECT key::uuid AS id,value::int AS quantity FROM jsonb_each_text(needed_addons) LOOP
  UPDATE public.addons SET estoque=estoque-stock.quantity WHERE id=stock.id AND estoque IS NOT NULL;
 END LOOP;
 PERFORM set_config('app.order_write_context','checkout',true);
 INSERT INTO public.orders(cliente_id,establishment_id,status,subtotal_cents,frete_cents,desconto_cents,total_cents,forma_pagamento,tipo_entrega,endereco_entrega,observacoes,checkout_key,checkout_request,coupon_id,coupon_funder,commission_cents)
 VALUES(uid,store.id,'placed',subtotal,freight,discount,total,p_forma_pagamento::public.payment_method,p_tipo_entrega,CASE WHEN p_tipo_entrega='pickup' THEN NULL ELSE p_endereco END,p_observacoes,p_idempotency_key,request,coupon.id,CASE WHEN coupon.id IS NULL THEN NULL WHEN coupon.establishment_id IS NULL THEN 'platform' ELSE 'merchant' END,commission) RETURNING id INTO order_id;
 INSERT INTO public.order_items(order_id,product_id,nome_snapshot,preco_unit_cents,quantidade,observacoes,addons)
 SELECT order_id,(x->>'product_id')::uuid,x->>'nome',(x->>'price')::integer,(x->>'quantity')::integer,x->>'notes',x->'addons' FROM jsonb_array_elements(snapshots) x;
 IF coupon.id IS NOT NULL THEN UPDATE public.coupons SET used_count=used_count+1 WHERE id=coupon.id; END IF;
 DELETE FROM public.cart_items WHERE user_id=uid AND establishment_id=store.id;
 PERFORM set_config('app.order_write_context',coalesce(previous_context,''),true);
 RETURN jsonb_build_object('order_id',order_id,'total_cents',total,'desconto_cents',discount);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.order_write_context',coalesce(previous_context,''),true); RAISE;
END $$;
REVOKE ALL ON FUNCTION public.checkout_order(uuid,uuid,text,text,jsonb,text,text,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.checkout_order(uuid,uuid,text,text,jsonb,text,text,integer,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.quote_order(p_establishment_id uuid,p_idempotency_key uuid,p_forma_pagamento text,p_tipo_entrega text,p_endereco jsonb DEFAULT NULL,p_observacoes text DEFAULT NULL,p_coupon_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.checkout_order(p_establishment_id,p_idempotency_key,p_forma_pagamento,p_tipo_entrega,p_endereco,p_observacoes,p_coupon_code,NULL,true)
$$;
REVOKE ALL ON FUNCTION public.quote_order(uuid,uuid,text,text,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quote_order(uuid,uuid,text,text,jsonb,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.release_cancelled_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item record; choice jsonb;
BEGIN
 IF NEW.status<>'cancelled' OR OLD.status=NEW.status OR NEW.checkout_key IS NULL THEN RETURN NEW; END IF;
 FOR item IN SELECT * FROM public.order_items WHERE order_id=NEW.id ORDER BY product_id,id LOOP
  UPDATE public.products SET estoque=estoque+item.quantidade WHERE id=item.product_id AND estoque IS NOT NULL;
  FOR choice IN SELECT value FROM jsonb_array_elements(item.addons) ORDER BY value->>'id' LOOP
   UPDATE public.addons SET estoque=estoque+item.quantidade WHERE id=(choice->>'id')::uuid AND estoque IS NOT NULL;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.release_cancelled_stock() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_release_cancelled_stock AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.release_cancelled_stock();

-- A08/A12: who issued the coupon pays for it; credits wait for manual receipt confirmation.
CREATE OR REPLACE FUNCTION public.create_ledger_on_delivered() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE commission integer; courier uuid; merchant integer; platform integer; courier_amount integer;
BEGIN
 IF NEW.status IN ('refunded','cancelled') AND OLD.status='delivered' THEN
  UPDATE public.platform_ledger SET status='reversed' WHERE order_id=NEW.id;
 ELSIF NEW.status='delivered' AND OLD.status<>'delivered' THEN
  commission:=coalesce(NEW.commission_cents,round(NEW.subtotal_cents*coalesce((SELECT commission_pct FROM public.platform_settings WHERE id=1),15)/100)::integer);
  SELECT entregador_id INTO courier FROM public.deliveries WHERE order_id=NEW.id LIMIT 1;
  courier_amount:=CASE WHEN NEW.tipo_entrega='pickup' THEN 0 ELSE NEW.frete_cents END;
  merchant:=NEW.subtotal_cents-commission-CASE WHEN NEW.coupon_funder='merchant' THEN NEW.desconto_cents ELSE 0 END;
  platform:=NEW.total_cents-merchant-courier_amount;
  IF NOT EXISTS(SELECT 1 FROM public.platform_ledger WHERE order_id=NEW.id) THEN
   INSERT INTO public.platform_ledger(order_id,establishment_id,courier_id,gross_cents,commission_cents,delivery_fee_cents,courier_payout_cents,merchant_payout_cents,platform_revenue_cents,status)
   VALUES(NEW.id,NEW.establishment_id,courier,NEW.total_cents,commission,NEW.frete_cents,courier_amount,merchant,platform,'pending');
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_summary(p_kind text,p_establishment_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); paid bigint; pending bigint; earned bigint; reserved bigint;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_kind='merchant' THEN
  IF NOT EXISTS(SELECT 1 FROM public.establishments WHERE id=p_establishment_id AND owner_id=uid) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT coalesce(sum(merchant_payout_cents) FILTER(WHERE status='paid'),0),coalesce(sum(merchant_payout_cents) FILTER(WHERE status='pending'),0),coalesce(sum(merchant_payout_cents) FILTER(WHERE status<>'reversed'),0) INTO paid,pending,earned FROM public.platform_ledger WHERE establishment_id=p_establishment_id;
  SELECT coalesce(sum(valor_cents),0) INTO reserved FROM public.establishment_withdrawals WHERE establishment_id=p_establishment_id AND status NOT IN ('recusado','cancelado','rejected','cancelled');
 ELSIF p_kind='courier' THEN
  SELECT coalesce(sum(courier_payout_cents) FILTER(WHERE status='paid'),0),coalesce(sum(courier_payout_cents) FILTER(WHERE status='pending'),0),coalesce(sum(courier_payout_cents) FILTER(WHERE status<>'reversed'),0) INTO paid,pending,earned FROM public.platform_ledger WHERE courier_id=uid;
  SELECT coalesce(sum(valor_cents),0) INTO reserved FROM public.courier_withdrawals WHERE courier_id=uid AND status NOT IN ('recusado','cancelado','rejected','cancelled');
 ELSE RAISE EXCEPTION 'Invalid wallet' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('available_cents',greatest(0,paid-reserved),'pending_cents',pending,'total_cents',earned,'reserved_cents',reserved);
END $$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(p_kind text,p_valor_cents integer,p_establishment_id uuid DEFAULT NULL,p_idempotency_key uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); profile jsonb; balance jsonb; result uuid; owner_key text; existing_amount integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_valor_cents IS NULL OR p_valor_cents<500 OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Minimum withdrawal R$ 5,00 and request key required' USING ERRCODE='22023'; END IF;
 IF p_kind='merchant' THEN
  SELECT to_jsonb(e) INTO profile FROM public.establishments e WHERE id=p_establishment_id AND owner_id=uid FOR UPDATE;
  owner_key:='merchant:'||p_establishment_id::text;
 ELSIF p_kind='courier' THEN
  SELECT to_jsonb(c) INTO profile FROM public.courier_profiles c WHERE user_id=uid FOR UPDATE;
  owner_key:='courier:'||uid::text;
 ELSE RAISE EXCEPTION 'Invalid wallet' USING ERRCODE='22023'; END IF;
 IF profile IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF coalesce(profile->>'kyc_status','') NOT IN ('approved','aprovado') OR nullif(btrim(profile->>'pix_key'),'') IS NULL THEN RAISE EXCEPTION 'Approved identity and PIX required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||owner_key,0));
 IF p_kind='merchant' THEN
  SELECT id,valor_cents INTO result,existing_amount FROM public.establishment_withdrawals WHERE establishment_id=p_establishment_id AND request_key=p_idempotency_key;
 ELSE
  SELECT id,valor_cents INTO result,existing_amount FROM public.courier_withdrawals WHERE courier_id=uid AND request_key=p_idempotency_key;
 END IF;
 IF result IS NOT NULL THEN
  IF existing_amount<>p_valor_cents THEN RAISE EXCEPTION 'Request key belongs to another withdrawal' USING ERRCODE='22023'; END IF;
  RETURN result;
 END IF;
 balance:=public.wallet_summary(p_kind,p_establishment_id);
 IF p_valor_cents>(balance->>'available_cents')::bigint THEN RAISE EXCEPTION 'Insufficient available balance' USING ERRCODE='22023'; END IF;
 IF p_kind='merchant' THEN
  INSERT INTO public.establishment_withdrawals(establishment_id,requested_by,valor_cents,metodo,pix_key,titular_nome,titular_documento,liquido_cents,status,request_key)
  VALUES(p_establishment_id,uid,p_valor_cents,'pix',profile->>'pix_key',profile->>'banco_titular',coalesce(profile->>'banco_documento',profile->>'cnpj'),p_valor_cents,'solicitado',p_idempotency_key) RETURNING id INTO result;
 ELSE
  INSERT INTO public.courier_withdrawals(courier_id,valor_cents,metodo,pix_key,status,request_key) VALUES(uid,p_valor_cents,'pix',profile->>'pix_key','solicitado',p_idempotency_key) RETURNING id INTO result;
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.settle_order_payment(p_order_id uuid,p_reference text) RETURNS void
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
CREATE OR REPLACE FUNCTION private.guard_withdrawal_update() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user='postgres' THEN RETURN NEW; END IF;
 IF NOT private.has_role(auth.uid(),'admin') OR (to_jsonb(NEW)-ARRAY['status','motivo_recusa','processado_em','comprovante_url','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','motivo_recusa','processado_em','comprovante_url','updated_at']) THEN RAISE EXCEPTION 'Withdrawal request is immutable' USING ERRCODE='42501'; END IF;
 IF NEW.status NOT IN ('solicitado','em_analise','aprovado','pago','recusado','cancelado') OR (OLD.status IN ('pago','recusado','cancelado') AND NEW.status<>OLD.status) THEN RAISE EXCEPTION 'Invalid withdrawal transition' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_withdrawal_update BEFORE UPDATE ON public.courier_withdrawals FOR EACH ROW EXECUTE FUNCTION private.guard_withdrawal_update();
CREATE TRIGGER audit_withdrawal_update BEFORE UPDATE ON public.establishment_withdrawals FOR EACH ROW EXECUTE FUNCTION private.guard_withdrawal_update();

CREATE POLICY coupons_merchant_write ON public.coupons FOR ALL TO authenticated USING(establishment_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.establishments e WHERE e.id=establishment_id AND e.owner_id=auth.uid())) WITH CHECK(establishment_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.establishments e WHERE e.id=establishment_id AND e.owner_id=auth.uid()));
CREATE OR REPLACE FUNCTION private.guard_coupon() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.used_count<>OLD.used_count OR NEW.establishment_id IS DISTINCT FROM OLD.establishment_id) AND current_user<>'postgres' THEN RAISE EXCEPTION 'Coupon usage and issuer are immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' AND current_user<>'postgres' THEN NEW.used_count:=0; NEW.created_by:=auth.uid(); END IF;
 NEW.code:=upper(btrim(NEW.code));
 IF length(NEW.code) NOT BETWEEN 1 AND 50 OR NEW.type NOT IN ('percent','fixed','free_delivery') OR NEW.value_cents<0 OR NEW.percent<0 OR NEW.percent>100 OR NEW.min_order_cents<0 OR NEW.used_count<0 OR NEW.usage_limit<0 OR NEW.max_discount_cents<0 OR (NEW.starts_at IS NOT NULL AND NEW.expires_at IS NOT NULL AND NEW.expires_at<=NEW.starts_at) THEN RAISE EXCEPTION 'Invalid coupon' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_coupon BEFORE INSERT OR UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION private.guard_coupon();
REVOKE ALL ON FUNCTION public.wallet_summary(text,uuid),public.request_withdrawal(text,integer,uuid,uuid),public.settle_order_payment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wallet_summary(text,uuid),public.request_withdrawal(text,integer,uuid,uuid),public.settle_order_payment(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION private.guard_order_finance(),private.guard_order_items(),private.guard_withdrawal_update(),private.guard_coupon() FROM PUBLIC,anon,authenticated;

-- Record a full refund that the admin has already completed manually; no money is sent here.
CREATE OR REPLACE FUNCTION public.record_order_refund(p_order_id uuid,p_reference text) RETURNS void
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
REVOKE ALL ON FUNCTION public.record_order_refund(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_order_refund(uuid,text) TO authenticated;
