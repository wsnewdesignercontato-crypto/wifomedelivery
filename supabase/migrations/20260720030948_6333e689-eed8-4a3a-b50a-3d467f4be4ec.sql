
-- FAVORITES
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, establishment_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "favorites_own" ON public.favorites;
CREATE POLICY "favorites_own" ON public.favorites
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON public.favorites(user_id);

-- CART ITEMS (persistente)
CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  nome_snapshot TEXT NOT NULL,
  preco_unit_cents INTEGER NOT NULL CHECK (preco_unit_cents >= 0),
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cart_items_own" ON public.cart_items;
CREATE POLICY "cart_items_own" ON public.cart_items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_user ON public.cart_items(user_id);
DROP TRIGGER IF EXISTS trg_cart_items_updated_at ON public.cart_items;
CREATE TRIGGER trg_cart_items_updated_at BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- NOTIFICATIONS from order status changes (para o cliente)
CREATE OR REPLACE FUNCTION public.notify_client_on_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  msg TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    msg := CASE NEW.status
      WHEN 'accepted' THEN 'Sua loja aceitou o pedido!'
      WHEN 'preparing' THEN 'Seu pedido está em preparo.'
      WHEN 'ready' THEN 'Seu pedido está pronto.'
      WHEN 'courier_assigned' THEN 'Um entregador aceitou seu pedido.'
      WHEN 'picked_up' THEN 'Pedido coletado pelo entregador.'
      WHEN 'on_the_way' THEN 'Seu pedido está a caminho!'
      WHEN 'arriving' THEN 'O entregador está chegando.'
      WHEN 'delivered' THEN 'Pedido entregue. Bom apetite!'
      WHEN 'cancelled' THEN 'Pedido cancelado.'
      WHEN 'refunded' THEN 'Pedido reembolsado.'
      ELSE NULL
    END;
    IF msg IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, titulo, mensagem, link_url)
      VALUES (NEW.cliente_id, 'Atualização do pedido', msg, '/cliente/pedido/' || NEW.id::text);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_client_status ON public.orders;
CREATE TRIGGER trg_notify_client_status
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_on_status();

-- Realtime para carrinho (opcional, ajuda UX multi-device)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_items;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
