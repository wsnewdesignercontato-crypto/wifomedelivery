
-- Refund status enum
DO $$ BEGIN
  CREATE TYPE public.refund_status AS ENUM ('none','pending','completed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cancellation / refund fields on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_role text,
  ADD COLUMN IF NOT EXISTS refund_status public.refund_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS refund_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Order status history
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status public.order_status,
  to_status public.order_status NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_osh_order_id ON public.order_status_history(order_id);

GRANT SELECT ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS osh_cliente_read ON public.order_status_history;
CREATE POLICY osh_cliente_read ON public.order_status_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.cliente_id = auth.uid()));

DROP POLICY IF EXISTS osh_estab_read ON public.order_status_history;
CREATE POLICY osh_estab_read ON public.order_status_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.orders o JOIN public.establishments e ON e.id = o.establishment_id
    WHERE o.id = order_id AND e.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS osh_courier_read ON public.order_status_history;
CREATE POLICY osh_courier_read ON public.order_status_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.deliveries d WHERE d.order_id = order_status_history.order_id AND d.entregador_id = auth.uid()));

DROP POLICY IF EXISTS osh_admin_all ON public.order_status_history;
CREATE POLICY osh_admin_all ON public.order_status_history FOR ALL
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Cliente can update own order only to cancel, and only in early statuses
DROP POLICY IF EXISTS orders_cliente_cancel ON public.orders;
CREATE POLICY orders_cliente_cancel ON public.orders FOR UPDATE
  USING (auth.uid() = cliente_id AND status IN ('placed','accepted'))
  WITH CHECK (auth.uid() = cliente_id AND status = 'cancelled');

-- Status transition validation + side-effects
CREATE OR REPLACE FUNCTION public.orders_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states cannot move (except cancelled -> refunded)
  IF OLD.status = 'delivered' AND NEW.status NOT IN ('refunded') THEN
    RAISE EXCEPTION 'Cannot change delivered order to %', NEW.status;
  END IF;
  IF OLD.status = 'refunded' THEN
    RAISE EXCEPTION 'Order already refunded';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status NOT IN ('refunded') THEN
    RAISE EXCEPTION 'Cancelled order can only be refunded';
  END IF;

  -- Cancel allowed from any non-terminal status
  IF NEW.status = 'cancelled' THEN
    allowed := true;
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
  ELSIF NEW.status = 'refunded' THEN
    allowed := OLD.status IN ('cancelled','delivered');
    NEW.refunded_at := COALESCE(NEW.refunded_at, now());
    IF NEW.refund_status = 'none' THEN NEW.refund_status := 'completed'; END IF;
    IF NEW.refund_amount_cents = 0 THEN NEW.refund_amount_cents := NEW.total_cents; END IF;
  ELSE
    -- Forward flow
    allowed := (OLD.status,NEW.status) IN (
      ('placed','accepted'),
      ('accepted','preparing'),
      ('preparing','ready'),
      ('ready','waiting_courier'),
      ('waiting_courier','courier_assigned'),
      ('courier_assigned','picked_up'),
      ('picked_up','on_the_way'),
      ('on_the_way','arriving'),
      ('arriving','delivered'),
      ('on_the_way','delivered'),
      ('picked_up','delivered')
    );
  END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_status_guard_trg ON public.orders;
CREATE TRIGGER orders_status_guard_trg
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_status_guard();

-- After update: log + cascade cancel delivery
CREATE OR REPLACE FUNCTION public.orders_status_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history(order_id, from_status, to_status, changed_by, reason)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), NEW.cancellation_reason);

    IF NEW.status = 'cancelled' THEN
      UPDATE public.deliveries
        SET status = 'cancelled', updated_at = now()
        WHERE order_id = NEW.id AND status NOT IN ('delivered','cancelled');
      UPDATE public.courier_profiles cp
        SET status = 'online'
        WHERE cp.status = 'ocupado'
          AND cp.user_id IN (SELECT entregador_id FROM public.deliveries WHERE order_id = NEW.id AND entregador_id IS NOT NULL);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_status_after_trg ON public.orders;
CREATE TRIGGER orders_status_after_trg
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_status_after();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.deliveries REPLICA IDENTITY FULL;
