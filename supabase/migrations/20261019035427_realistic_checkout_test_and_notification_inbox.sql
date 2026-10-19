-- Full catalog checkout for explicitly enrolled test customers; no gateway or inventory mutation.
CREATE TABLE private.payment_test_customers (
 customer_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
 courier_id uuid REFERENCES public.courier_profiles(user_id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES auth.users(id), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours'
);
ALTER TABLE private.payment_test_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.payment_test_customers FROM PUBLIC,anon,authenticated;
-- Totals now come from the same authoritative catalog calculation as normal checkout.
ALTER TABLE private.payment_test_sales DROP CONSTRAINT payment_test_sales_subtotal_cents_check;
ALTER TABLE private.payment_test_sales ADD CONSTRAINT payment_test_sales_subtotal_cents_check CHECK(subtotal_cents>=0);
ALTER TABLE private.payment_test_sales ADD COLUMN discount_cents integer NOT NULL DEFAULT 0 CHECK(discount_cents>=0);
CREATE OR REPLACE FUNCTION private.guard_test_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.test_sale_id IS DISTINCT FROM OLD.test_sale_id THEN
  RAISE EXCEPTION 'Test identity is immutable' USING ERRCODE='42501';
 END IF;
 IF NEW.test_sale_id IS NOT NULL THEN
  IF TG_OP='INSERT' AND (current_user<>'postgres' OR NOT EXISTS(SELECT FROM private.payment_test_sales s WHERE s.id=NEW.test_sale_id AND s.status='pending'
    AND (s.created_by=auth.uid() AND private.has_role(auth.uid(),'admin') OR s.customer_id=auth.uid() AND EXISTS(
     SELECT FROM private.payment_test_customers e JOIN private.payment_test_settings cfg ON cfg.id AND cfg.enabled
     WHERE e.customer_id=auth.uid() AND e.establishment_id=NEW.establishment_id AND e.created_by=s.created_by AND e.expires_at>now()
      AND (s.fulfillment='pickup' OR e.courier_id=s.courier_id))) AND s.customer_id=NEW.cliente_id AND s.establishment_id=NEW.establishment_id
    AND s.subtotal_cents=NEW.subtotal_cents AND s.freight_cents=NEW.frete_cents)) THEN
   RAISE EXCEPTION 'Use the administrative simulator' USING ERRCODE='42501';
  END IF;
  IF NEW.payment_received_at IS NOT NULL OR NEW.dinheiro_recebido THEN
   RAISE EXCEPTION 'Test payments cannot become real receipts' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION private.customer_payment_test_context(p_store uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',EXISTS(SELECT FROM private.payment_test_customers e JOIN private.payment_test_settings s ON s.id AND s.enabled
 WHERE auth.uid() IS NOT NULL AND e.customer_id=auth.uid() AND e.establishment_id=p_store AND e.expires_at>now()))
$$;
CREATE FUNCTION public.customer_payment_test_context(p_store uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.customer_payment_test_context(p_store) $$;
REVOKE ALL ON FUNCTION private.customer_payment_test_context(uuid),public.customer_payment_test_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.customer_payment_test_context(uuid),public.customer_payment_test_context(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.checkout_cart_transaction(p_establishment_id uuid,p_idempotency_key uuid,p_forma_pagamento text,p_tipo_entrega text,p_endereco jsonb DEFAULT NULL,p_observacoes text DEFAULT NULL,p_coupon_code text DEFAULT NULL,p_expected_total_cents integer DEFAULT NULL,p_quote boolean DEFAULT false,p_test boolean DEFAULT false)
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
 request := jsonb_build_object('store',p_establishment_id,'payment',p_forma_pagamento,'fulfillment',p_tipo_entrega,'address',CASE WHEN p_tipo_entrega='pickup' THEN NULL ELSE p_endereco END,'notes',p_observacoes,'coupon',coupon_code);
 -- Serialize retries before reading the cart; retries after a successful commit return the same order.
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_idempotency_key::text,0));
 SELECT * INTO existing FROM public.orders WHERE cliente_id=uid AND checkout_key=p_idempotency_key;
 IF FOUND THEN
  IF existing.is_test IS DISTINCT FROM p_test THEN RAISE EXCEPTION 'A tentativa pertence a outro modo de pagamento.' USING ERRCODE='22023'; END IF;
  IF existing.checkout_request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Idempotency key belongs to another checkout' USING ERRCODE='22023'; END IF;
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
 INSERT INTO public.orders(cliente_id,establishment_id,status,subtotal_cents,frete_cents,desconto_cents,total_cents,forma_pagamento,tipo_entrega,endereco_entrega,observacoes,checkout_key,checkout_request,coupon_id,coupon_funder,commission_cents,test_sale_id,inventory_released_at)
 VALUES(uid,store.id,'placed',subtotal,freight,discount,total,p_forma_pagamento::public.payment_method,p_tipo_entrega,CASE WHEN p_tipo_entrega='pickup' THEN NULL ELSE p_endereco END,p_observacoes,p_idempotency_key,request,coupon.id,CASE WHEN coupon.id IS NULL THEN NULL WHEN coupon.establishment_id IS NULL THEN 'platform' ELSE 'merchant' END,commission,test_id,CASE WHEN p_test THEN now() END) RETURNING id INTO order_id;
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

CREATE OR REPLACE FUNCTION public.checkout_order(p_establishment_id uuid,p_idempotency_key uuid,p_forma_pagamento text,p_tipo_entrega text,p_endereco jsonb DEFAULT NULL,p_observacoes text DEFAULT NULL,p_coupon_code text DEFAULT NULL,p_expected_total_cents integer DEFAULT NULL,p_quote boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.checkout_cart_transaction(p_establishment_id,p_idempotency_key,p_forma_pagamento,p_tipo_entrega,p_endereco,p_observacoes,p_coupon_code,p_expected_total_cents,p_quote,false) $$;
REVOKE ALL ON FUNCTION public.checkout_order(uuid,uuid,text,text,jsonb,text,text,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.checkout_order(uuid,uuid,text,text,jsonb,text,text,integer,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.checkout_test_order(p_establishment_id uuid,p_idempotency_key uuid,p_forma_pagamento text,p_tipo_entrega text,p_endereco jsonb DEFAULT NULL,p_observacoes text DEFAULT NULL,p_coupon_code text DEFAULT NULL,p_expected_total_cents integer DEFAULT NULL,p_quote boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.checkout_cart_transaction(p_establishment_id,p_idempotency_key,p_forma_pagamento,p_tipo_entrega,p_endereco,p_observacoes,p_coupon_code,p_expected_total_cents,p_quote,true) $$;
REVOKE ALL ON FUNCTION public.checkout_test_order(uuid,uuid,text,text,jsonb,text,text,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.checkout_test_order(uuid,uuid,text,text,jsonb,text,text,integer,boolean) TO authenticated;
REVOKE ALL ON FUNCTION private.checkout_cart_transaction(uuid,uuid,text,text,jsonb,text,text,integer,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.checkout_cart_transaction(uuid,uuid,text,text,jsonb,text,text,integer,boolean,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION private.payment_test_state() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
 'enabled',(SELECT enabled FROM private.payment_test_settings WHERE id),
 'testers',coalesce((SELECT jsonb_agg(jsonb_build_object('customer_id',t.customer_id,'customer',p.nome,'store',e.nome,'expires_at',t.expires_at)) FROM private.payment_test_customers t JOIN public.profiles p ON p.id=t.customer_id JOIN public.establishments e ON e.id=t.establishment_id WHERE t.expires_at>now()),'[]'::jsonb),
 'admin_id',auth.uid(),'count',(SELECT count(*) FROM private.payment_test_sales),
 'customers',coalesce((SELECT jsonb_agg(x) FROM (SELECT id,nome FROM public.profiles ORDER BY (id=auth.uid()) DESC,nome,id LIMIT 500) x),'[]'::jsonb),
 'stores',coalesce((SELECT jsonb_agg(x) FROM (SELECT id,nome,cidade,estado,is_open FROM public.establishments WHERE status='aprovado' ORDER BY nome,id LIMIT 500) x),'[]'::jsonb),
 'couriers',coalesce((SELECT jsonb_agg(x) FROM (SELECT c.user_id AS id,p.nome,c.status,c.cidade_atuacao AS cidade
 FROM public.courier_profiles c JOIN public.profiles p ON p.id=c.user_id
 WHERE private.is_courier_dispatch_approved(c.user_id) ORDER BY p.nome,c.user_id LIMIT 500) x),'[]'::jsonb),
 'sales',coalesce((SELECT jsonb_agg(x) FROM (SELECT s.id,s.status,s.order_id,o.status AS order_status,s.created_at,
 p.nome AS customer,e.nome AS store,cp.nome AS courier,s.subtotal_cents,s.freight_cents,s.commission_cents,
 s.subtotal_cents+s.freight_cents-s.discount_cents AS total_cents
 FROM private.payment_test_sales s JOIN public.profiles p ON p.id=s.customer_id
 JOIN public.establishments e ON e.id=s.establishment_id LEFT JOIN public.profiles cp ON cp.id=s.courier_id
 LEFT JOIN public.orders o ON o.id=s.order_id ORDER BY s.created_at DESC,s.id DESC LIMIT 50) x),'[]'::jsonb))
$$;

CREATE OR REPLACE FUNCTION private.payment_test_command(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
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
  DELETE FROM private.payment_test_customers;
  UPDATE public.courier_profiles c SET status='online' WHERE user_id=ANY(drivers) AND status='ocupado'
   AND NOT EXISTS(SELECT FROM public.deliveries d WHERE d.entregador_id=c.user_id AND d.status IN('accepted','to_store','at_store','picked_up','to_customer','at_customer'));
  INSERT INTO public.admin_audit_log(admin_id,action,entity_type,metadata) VALUES(uid,'cleanup_payment_tests','payment_simulator',jsonb_build_object('sales',count_sales,'orders',deleted_orders));
 ELSE RAISE EXCEPTION 'Invalid test command' USING ERRCODE='22023';
 END IF;
 IF p_action<>'cleanup' THEN INSERT INTO public.admin_audit_log(admin_id,action,entity_type,metadata)
  VALUES(uid,'payment_test_'||p_action,'payment_simulator',jsonb_build_object('sale_id',p_payload->>'sale_id','enabled',p_payload->'enabled')); END IF;
 RETURN private.payment_test_state();
END $$;
CREATE OR REPLACE FUNCTION public.notify_client_on_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE msg text;
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
 msg:=CASE NEW.status WHEN 'accepted' THEN 'Sua loja aceitou o pedido!' WHEN 'preparing' THEN 'Seu pedido está em preparo.'
 WHEN 'ready' THEN 'Seu pedido está pronto.' WHEN 'waiting_courier' THEN 'Seu pedido está pronto. Estamos procurando um entregador.' WHEN 'courier_assigned' THEN 'Um entregador aceitou seu pedido.'
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
-- A Web Push subscription does not imply the table is published for in-app updates.
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(SELECT FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS notifications_user_recent_idx ON public.notifications(user_id,created_at DESC);
