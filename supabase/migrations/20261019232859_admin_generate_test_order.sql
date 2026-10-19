-- Generate and approve a demonstration order in one transaction. No gateway or real balance.
CREATE FUNCTION public.admin_generate_test_order(
 p_request_key uuid,p_customer_id uuid,p_store_id uuid,p_courier_id uuid DEFAULT NULL,
 p_subtotal_cents integer DEFAULT 2900
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); sale private.payment_test_sales%ROWTYPE; destination jsonb;
 fulfillment text:=CASE WHEN p_courier_id IS NULL THEN 'pickup' ELSE 'delivery' END;
BEGIN
 IF uid IS NULL OR NOT private.has_role(uid,'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 IF p_request_key IS NULL OR p_customer_id IS NULL OR p_store_id IS NULL THEN
  RAISE EXCEPTION 'Escolha a conta do cliente e a loja do teste.' USING ERRCODE='22023'; END IF;
 IF p_subtotal_cents IS NULL OR p_subtotal_cents NOT BETWEEN 100 AND 1000000 THEN
  RAISE EXCEPTION 'Informe um valor de teste entre R$ 1,00 e R$ 10.000,00.' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payment-test-administration',0));
 SELECT * INTO sale FROM private.payment_test_sales WHERE request_key=p_request_key;
 IF FOUND THEN
  IF sale.created_by<>uid THEN RAISE EXCEPTION 'Test request already used' USING ERRCODE='42501'; END IF;
  IF sale.customer_id IS DISTINCT FROM p_customer_id OR sale.establishment_id IS DISTINCT FROM p_store_id
   OR sale.courier_id IS DISTINCT FROM p_courier_id OR sale.subtotal_cents<>p_subtotal_cents
   OR sale.fulfillment<>fulfillment OR sale.payment_method<>'pix' THEN
   RAISE EXCEPTION 'Este teste já foi solicitado com outros dados. Inicie um novo teste.' USING ERRCODE='22023'; END IF;
  RETURN private.payment_test_state();
 END IF;
 IF NOT (SELECT enabled FROM private.payment_test_settings WHERE id) THEN
  RAISE EXCEPTION 'Ative o modo de teste primeiro.' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT FROM public.establishments WHERE id=p_store_id AND status='aprovado' AND is_open) THEN
  RAISE EXCEPTION 'Escolha uma loja aprovada e aberta para receber o teste.' USING ERRCODE='22023'; END IF;
 IF p_courier_id IS NOT NULL THEN
  SELECT jsonb_build_object('rua',a.rua,'numero',a.numero,'bairro',a.bairro,'cidade',a.cidade,
   'estado',a.estado,'cep',a.cep,'complemento',a.complemento,'lat',a.lat,'lng',a.lng)
   INTO destination FROM public.addresses a WHERE a.user_id=p_customer_id
   ORDER BY a.is_default DESC,a.created_at DESC,a.id LIMIT 1;
  IF destination IS NULL OR nullif(btrim(destination->>'rua'),'') IS NULL
   OR nullif(btrim(destination->>'cidade'),'') IS NULL THEN
   RAISE EXCEPTION 'Cadastre um endereço de entrega na conta do cliente selecionado ou escolha somente retirada.' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM private.payment_test_command('create',jsonb_build_object('request_key',p_request_key,
  'customer_id',p_customer_id,'store_id',p_store_id,'courier_id',p_courier_id,
  'subtotal_cents',p_subtotal_cents,'fulfillment',fulfillment,'payment_method','pix','address',destination));
 SELECT * INTO STRICT sale FROM private.payment_test_sales WHERE request_key=p_request_key;
 RETURN private.payment_test_command('approve',jsonb_build_object('sale_id',sale.id));
END $$;
REVOKE ALL ON FUNCTION public.admin_generate_test_order(uuid,uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_test_order(uuid,uuid,uuid,uuid,integer) TO authenticated;

-- Keep the online-payment placed transition guard while preserving test labeling/cleanup.
CREATE OR REPLACE FUNCTION public.notify_estab_new_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid;
BEGIN
 IF NEW.status<>'placed' OR TG_OP='UPDATE' AND OLD.status='placed' THEN RETURN NEW; END IF;
 SELECT owner_id INTO owner FROM public.establishments WHERE id=NEW.establishment_id;
 IF owner IS NOT NULL THEN
  INSERT INTO public.notifications(user_id,titulo,mensagem,link_url,audience,test_sale_id)
  VALUES(owner,CASE WHEN NEW.test_sale_id IS NULL THEN 'Novo pedido recebido!' ELSE '[TESTE] Novo pedido simulado' END,
   CASE WHEN NEW.test_sale_id IS NULL THEN 'Você recebeu um novo pedido. Toque para aceitar e começar o preparo.'
    ELSE 'Pagamento simulado. Não preparar produtos nem cobrar. Aceite para testar o fluxo.' END,
   '/estabelecimento/pedidos','estabelecimento',NEW.test_sale_id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_estab_new_order() FROM PUBLIC,anon,authenticated;
