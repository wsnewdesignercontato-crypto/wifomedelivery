
-- ============ FASE 2..5 SCHEMA ============

-- Enums
DO $$ BEGIN CREATE TYPE public.coupon_type AS ENUM ('percent','fixed','free_delivery'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.campaign_status AS ENUM ('draft','scheduled','active','paused','ended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ticket_status AS ENUM ('open','pending','resolved','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ticket_priority AS ENUM ('low','normal','high','urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Coupons
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  descricao TEXT,
  type public.coupon_type NOT NULL DEFAULT 'percent',
  value_cents INT NOT NULL DEFAULT 0,
  percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  min_order_cents INT NOT NULL DEFAULT 0,
  max_discount_cents INT,
  usage_limit INT,
  used_count INT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY coupons_read_active ON public.coupons FOR SELECT USING (ativo = true OR private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY coupons_admin_all ON public.coupons FOR ALL USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

-- Campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  audience TEXT NOT NULL DEFAULT 'all',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  banner_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
  metrics JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.campaigns TO anon, authenticated;
GRANT ALL ON public.campaigns TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaigns_read_active ON public.campaigns FOR SELECT USING (status IN ('active','scheduled') OR private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY campaigns_admin_all ON public.campaigns FOR ALL USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

-- Banners
CREATE TABLE IF NOT EXISTS public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  image_url TEXT NOT NULL,
  link_url TEXT,
  posicao INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.banners TO anon, authenticated;
GRANT ALL ON public.banners TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.banners TO authenticated;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY banners_read_active ON public.banners FOR SELECT USING (ativo = true OR private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY banners_admin_all ON public.banners FOR ALL USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  audience TEXT,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  link_url TEXT,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_self ON public.notifications FOR SELECT USING (user_id = auth.uid() OR private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY notifications_update_self ON public.notifications FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_admin_all ON public.notifications FOR ALL USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

-- Support tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assunto TEXT NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority public.ticket_priority NOT NULL DEFAULT 'normal',
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tickets_self ON public.support_tickets FOR SELECT USING (user_id = auth.uid() OR private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY tickets_insert_self ON public.support_tickets FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY tickets_admin_all ON public.support_tickets FOR ALL USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  mensagem TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY smsg_read ON public.support_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR private.has_role(auth.uid(),'admin'::app_role)))
);
CREATE POLICY smsg_insert ON public.support_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR private.has_role(auth.uid(),'admin'::app_role)))
);

-- Tracking points (courier live location)
CREATE TABLE IF NOT EXISTS public.tracking_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tracking_points_courier_idx ON public.tracking_points(courier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tracking_points_order_idx ON public.tracking_points(order_id, created_at DESC);
GRANT SELECT, INSERT ON public.tracking_points TO authenticated;
GRANT ALL ON public.tracking_points TO service_role;
ALTER TABLE public.tracking_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY track_insert_self ON public.tracking_points FOR INSERT WITH CHECK (courier_id = auth.uid());
CREATE POLICY track_read_admin ON public.tracking_points FOR SELECT USING (private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY track_read_related ON public.tracking_points FOR SELECT USING (
  courier_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = tracking_points.order_id
      AND (o.cliente_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.establishments e WHERE e.id = o.establishment_id AND e.owner_id = auth.uid()
      ))
  )
);

-- Financeiro: ledger de repasses
CREATE TABLE IF NOT EXISTS public.platform_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  courier_id UUID REFERENCES auth.users(id),
  gross_cents INT NOT NULL DEFAULT 0,
  commission_cents INT NOT NULL DEFAULT 0,
  delivery_fee_cents INT NOT NULL DEFAULT 0,
  courier_payout_cents INT NOT NULL DEFAULT 0,
  merchant_payout_cents INT NOT NULL DEFAULT 0,
  platform_revenue_cents INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_estab_idx ON public.platform_ledger(establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_order_idx ON public.platform_ledger(order_id);
GRANT SELECT ON public.platform_ledger TO authenticated;
GRANT ALL ON public.platform_ledger TO service_role;
ALTER TABLE public.platform_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_admin_all ON public.platform_ledger FOR ALL USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY ledger_estab_read ON public.platform_ledger FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = platform_ledger.establishment_id AND e.owner_id = auth.uid())
);
CREATE POLICY ledger_courier_read ON public.platform_ledger FOR SELECT USING (courier_id = auth.uid());

-- Trigger: gerar entrada de ledger quando pedido é entregue
CREATE OR REPLACE FUNCTION public.create_ledger_on_delivered()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    INSERT INTO public.platform_ledger(order_id, establishment_id, courier_id, gross_cents, commission_cents, delivery_fee_cents, courier_payout_cents, merchant_payout_cents, platform_revenue_cents, status)
    VALUES (NEW.id, NEW.establishment_id, courier_uid, NEW.total_cents, commission,
      COALESCE(NEW.delivery_fee_cents,0),
      COALESCE(NEW.delivery_fee_cents,0),
      NEW.subtotal_cents - commission,
      commission,
      'pending');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ledger_on_delivered ON public.orders;
CREATE TRIGGER trg_ledger_on_delivered AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.create_ledger_on_delivered();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tracking_points;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
