-- A new-order snapshot preserves all existing financial agreements.
ALTER TABLE public.platform_settings ADD COLUMN courier_commission_pct numeric(5,2) NOT NULL DEFAULT 8
  CHECK (courier_commission_pct BETWEEN 0 AND 100);
GRANT UPDATE (courier_commission_pct) ON public.platform_settings TO authenticated;
ALTER TABLE public.orders
  ADD COLUMN courier_commission_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (courier_commission_pct BETWEEN 0 AND 100),
  ADD COLUMN courier_commission_cents integer NOT NULL DEFAULT 0 CHECK (courier_commission_cents>=0 AND courier_commission_cents<=frete_cents);
ALTER TABLE public.platform_ledger ADD COLUMN courier_commission_cents integer NOT NULL DEFAULT 0 CHECK (courier_commission_cents>=0);

CREATE FUNCTION private.snapshot_courier_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.courier_commission_pct:=CASE WHEN NEW.tipo_entrega='pickup' THEN 0
      ELSE coalesce((SELECT courier_commission_pct FROM public.platform_settings WHERE id=1),8) END;
    NEW.courier_commission_cents:=CASE WHEN NEW.tipo_entrega='pickup' THEN 0
      ELSE round(NEW.frete_cents::numeric*NEW.courier_commission_pct/100)::integer END;
  ELSIF ROW(NEW.courier_commission_pct,NEW.courier_commission_cents)
    IS DISTINCT FROM ROW(OLD.courier_commission_pct,OLD.courier_commission_cents) THEN
    RAISE EXCEPTION 'Confirmed courier commission is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.snapshot_courier_commission() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER snapshot_courier_commission BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.snapshot_courier_commission();

-- Every dispatch path, including the admin simulator, gets the same net amount.
-- Re-dispatch recomputes from gross and snapshot, never from an already-net value.
CREATE FUNCTION private.normalize_courier_payout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=NEW.order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery order missing' USING ERRCODE='23503'; END IF;
  NEW.valor_entrega_cents:=CASE WHEN o.tipo_entrega='pickup' THEN 0 ELSE o.frete_cents-o.courier_commission_cents END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.normalize_courier_payout() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER normalize_courier_payout BEFORE INSERT OR UPDATE OF order_id,valor_entrega_cents
  ON public.deliveries FOR EACH ROW EXECUTE FUNCTION private.normalize_courier_payout();

CREATE OR REPLACE FUNCTION public.create_ledger_on_delivered() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE commission integer; courier uuid; merchant integer; platform integer; courier_amount integer;
BEGIN
 IF NEW.status IN ('refunded','cancelled') AND OLD.status='delivered' THEN
  UPDATE public.platform_ledger SET status='reversed' WHERE order_id=NEW.id;
 ELSIF NEW.status='delivered' AND OLD.status<>'delivered' THEN
  commission:=coalesce(NEW.commission_cents,round(NEW.subtotal_cents*coalesce((SELECT commission_pct FROM public.platform_settings WHERE id=1),15)/100)::integer);
  SELECT entregador_id INTO courier FROM public.deliveries WHERE order_id=NEW.id LIMIT 1;
  courier_amount:=CASE WHEN NEW.tipo_entrega='pickup' THEN 0 ELSE NEW.frete_cents-NEW.courier_commission_cents END;
  merchant:=NEW.subtotal_cents-commission-CASE WHEN coalesce(NEW.coupon_funder,CASE WHEN NEW.discount_funder='establishment' THEN 'merchant' ELSE 'platform' END)='merchant' THEN NEW.desconto_cents ELSE 0 END;
  platform:=NEW.total_cents-merchant-courier_amount;
  IF NOT EXISTS(SELECT 1 FROM public.platform_ledger WHERE order_id=NEW.id) THEN
   INSERT INTO public.platform_ledger(order_id,establishment_id,courier_id,gross_cents,commission_cents,delivery_fee_cents,courier_payout_cents,merchant_payout_cents,platform_revenue_cents,status,discount_cents,discount_funder,courier_commission_cents)
   VALUES(NEW.id,NEW.establishment_id,courier,NEW.total_cents,commission,NEW.frete_cents,courier_amount,merchant,platform,'pending',NEW.desconto_cents,NEW.discount_funder,NEW.courier_commission_cents);
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.create_ledger_on_delivered() FROM PUBLIC,anon,authenticated;

-- Keep the simulator's displayed distribution consistent with its generated order.
DO $$ DECLARE definition text; anchor text:='s.subtotal_cents,s.freight_cents,s.commission_cents,'; BEGIN
  SELECT pg_get_functiondef('private.payment_test_state()'::regprocedure) INTO definition;
  IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Unexpected payment simulator definition'; END IF;
  definition:=replace(definition,anchor,anchor||E'\n CASE WHEN s.order_id IS NOT NULL THEN coalesce(o.courier_commission_cents,0) ELSE round(s.freight_cents::numeric*coalesce((SELECT courier_commission_pct FROM public.platform_settings WHERE id=1),8)/100)::integer END AS courier_commission_cents,');
  EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
