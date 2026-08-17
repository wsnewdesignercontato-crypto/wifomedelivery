
-- 1. Sincronizar o Ledger e repasses quando o status mudar para delivered
CREATE OR REPLACE FUNCTION public.create_ledger_on_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission_pct NUMERIC;
  v_commission_cents INT;
  v_courier_uid UUID;
BEGIN
  -- Só processa se o status mudou para delivered
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status <> 'delivered') THEN
    
    -- Pega a comissão da plataforma
    SELECT commission_pct INTO v_commission_pct FROM public.platform_settings ORDER BY id LIMIT 1;
    v_commission_pct := COALESCE(v_commission_pct, 12.0);
    
    -- Calcula comissão (sobre o subtotal dos produtos)
    v_commission_cents := ROUND((NEW.subtotal_cents * v_commission_pct / 100.0))::INT;
    
    -- Tenta encontrar o entregador (se houver delivery associado)
    SELECT entregador_id INTO v_courier_uid FROM public.deliveries WHERE order_id = NEW.id LIMIT 1;

    -- Evita duplicidade se já houver registro no ledger para este pedido
    IF NOT EXISTS (SELECT 1 FROM public.platform_ledger WHERE order_id = NEW.id) THEN
      INSERT INTO public.platform_ledger(
        order_id, 
        establishment_id, 
        courier_id, 
        gross_cents, 
        commission_cents, 
        delivery_fee_cents, 
        courier_payout_cents, 
        merchant_payout_cents, 
        platform_revenue_cents, 
        status
      )
      VALUES (
        NEW.id, 
        NEW.establishment_id, 
        v_courier_uid, 
        NEW.total_cents, 
        v_commission_cents,
        COALESCE(NEW.frete_cents, 0),
        COALESCE(NEW.frete_cents, 0), -- Entregador ganha 100% da taxa de entrega por padrão
        NEW.subtotal_cents - v_commission_cents, -- Loja ganha subtotal menos comissão
        v_commission_cents, -- Plataforma ganha a comissão
        'pending'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_ledger_on_delivered ON public.orders;
CREATE TRIGGER trg_create_ledger_on_delivered
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.create_ledger_on_delivered();

-- 2. Implementar confirm_delivery_code robusto (Substitui lógica de frontend do entregador)
CREATE OR REPLACE FUNCTION public.confirm_delivery_code(p_order_id uuid, p_code text, p_prova_url text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_delivery record;
  v_uid uuid := auth.uid();
BEGIN
  -- Segurança: Apenas o entregador atribuído ou admin pode confirmar
  SELECT * INTO v_delivery FROM public.deliveries WHERE order_id = p_order_id AND entregador_id = v_uid;
  
  IF NOT FOUND AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  
  IF v_order.codigo_entrega IS NULL OR v_order.codigo_entrega <> trim(p_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  -- Atualiza o pedido
  UPDATE public.orders 
  SET status = 'delivered', 
      prova_url = COALESCE(p_prova_url, prova_url),
      updated_at = now()
  WHERE id = p_order_id;

  -- Atualiza a entrega
  UPDATE public.deliveries
  SET status = 'delivered',
      entregue_em = now(),
      updated_at = now()
  WHERE order_id = p_order_id;

  -- Libera o entregador para ficar online novamente
  UPDATE public.courier_profiles
  SET status = 'online'
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_delivery_code(uuid, text, text) TO authenticated;

-- 3. Grants de segurança para RPCs existentes
GRANT EXECUTE ON FUNCTION public.get_order_client_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_profile_complete(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_city(uuid, text, text) TO authenticated;
