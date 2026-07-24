
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
    SELECT commission_pct INTO commission_pct FROM public.platform_settings ORDER BY id LIMIT 1;
    commission_pct := COALESCE(commission_pct, 12.0);
    commission := ROUND((NEW.subtotal_cents * commission_pct / 100.0))::INT;
    SELECT entregador_id INTO courier_uid FROM public.deliveries WHERE order_id = NEW.id LIMIT 1;

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
