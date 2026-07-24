
CREATE OR REPLACE FUNCTION public.create_ledger_on_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_commission_pct NUMERIC := 12.0;
  v_commission INT;
  v_courier_uid UUID;
  v_frete INT;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    SELECT ps.commission_pct INTO v_commission_pct FROM public.platform_settings ps ORDER BY ps.id LIMIT 1;
    v_commission_pct := COALESCE(v_commission_pct, 12.0);
    v_commission := ROUND((NEW.subtotal_cents * v_commission_pct / 100.0))::INT;
    v_frete := COALESCE(NEW.frete_cents, 0);
    SELECT entregador_id INTO v_courier_uid FROM public.deliveries WHERE order_id = NEW.id LIMIT 1;

    IF NOT EXISTS (SELECT 1 FROM public.platform_ledger WHERE order_id = NEW.id) THEN
      INSERT INTO public.platform_ledger(order_id, establishment_id, courier_id, gross_cents, commission_cents, delivery_fee_cents, courier_payout_cents, merchant_payout_cents, platform_revenue_cents, status)
      VALUES (NEW.id, NEW.establishment_id, v_courier_uid, NEW.total_cents, v_commission,
        v_frete, v_frete,
        NEW.subtotal_cents - v_commission,
        v_commission,
        'paid');
    END IF;
  END IF;
  RETURN NEW;
END $function$;
