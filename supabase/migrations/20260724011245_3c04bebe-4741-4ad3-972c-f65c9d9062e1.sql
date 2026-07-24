
-- 1) Trigger passa a liberar o dinheiro imediatamente (status = 'paid')
CREATE OR REPLACE FUNCTION public.create_ledger_on_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  commission_pct NUMERIC := 12.0;
  commission INT;
  courier_uid UUID;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    SELECT (value)::numeric INTO commission_pct FROM public.platform_settings WHERE key = 'commission_percent' LIMIT 1;
    commission_pct := COALESCE(commission_pct, 12.0);
    commission := ROUND((NEW.subtotal_cents * commission_pct / 100.0))::INT;
    SELECT entregador_id INTO courier_uid FROM public.deliveries WHERE order_id = NEW.id LIMIT 1;

    -- Evita duplicidade caso a RPC já tenha criado
    IF NOT EXISTS (SELECT 1 FROM public.platform_ledger WHERE order_id = NEW.id) THEN
      INSERT INTO public.platform_ledger(order_id, establishment_id, courier_id, gross_cents, commission_cents, delivery_fee_cents, courier_payout_cents, merchant_payout_cents, platform_revenue_cents, status)
      VALUES (NEW.id, NEW.establishment_id, courier_uid, NEW.total_cents, commission,
        COALESCE(NEW.delivery_fee_cents,0),
        COALESCE(NEW.delivery_fee_cents,0),
        NEW.subtotal_cents - commission,
        commission,
        'paid');
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- 2) Libera repasses antigos que ficaram 'pending' de pedidos já entregues
UPDATE public.platform_ledger
SET status = 'paid'
WHERE status = 'pending'
  AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = platform_ledger.order_id AND o.status = 'delivered');

-- 3) RPC atômica para o entregador confirmar entrega
CREATE OR REPLACE FUNCTION public.courier_confirm_delivery(
  _order_id uuid,
  _codigo text,
  _prova_url text DEFAULT NULL,
  _metodo text DEFAULT 'code'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  ord public.orders%ROWTYPE;
  del public.deliveries%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sem autenticação'; END IF;

  SELECT * INTO del FROM public.deliveries WHERE order_id = _order_id AND entregador_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Você não é o entregador deste pedido'; END IF;

  SELECT * INTO ord FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

  IF ord.status = 'delivered' THEN RETURN; END IF;

  IF ord.codigo_entrega IS NULL OR ord.codigo_entrega <> _codigo THEN
    RAISE EXCEPTION 'Código incorreto';
  END IF;

  UPDATE public.deliveries
    SET status = 'delivered', entregue_em = now()
    WHERE id = del.id;

  UPDATE public.orders
    SET status = 'delivered',
        entrega_metodo_prova = _metodo,
        dinheiro_recebido = (ord.forma_pagamento = 'dinheiro'),
        prova_url = COALESCE(_prova_url, prova_url)
    WHERE id = _order_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.courier_confirm_delivery(uuid, text, text, text) TO authenticated;
