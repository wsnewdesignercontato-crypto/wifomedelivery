
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('cliente', 'estabelecimento', 'entregador', 'admin');
CREATE TYPE public.establishment_status AS ENUM ('pendente', 'aprovado', 'bloqueado', 'rejeitado');
CREATE TYPE public.courier_status AS ENUM ('pendente', 'aprovado', 'online', 'offline', 'ocupado', 'bloqueado');
CREATE TYPE public.order_status AS ENUM (
  'pending_payment','placed','accepted','preparing','ready',
  'waiting_courier','courier_assigned','picked_up','on_the_way',
  'arriving','delivered','cancelled','refunded'
);
CREATE TYPE public.delivery_status AS ENUM (
  'created','broadcasting','accepted','to_store','at_store',
  'picked_up','to_customer','at_customer','delivered','cancelled'
);
CREATE TYPE public.payment_method AS ENUM ('pix','cartao','dinheiro','carteira');

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =========================================================
-- TABLES (created first, policies later)
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  foto_url TEXT,
  telefone TEXT,
  cpf TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE TABLE public.addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Casa',
  cep TEXT, rua TEXT NOT NULL, numero TEXT, complemento TEXT, bairro TEXT,
  cidade TEXT NOT NULL, estado TEXT,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_addresses_updated_at BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.global_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, icone TEXT,
  ordem INT NOT NULL DEFAULT 0, ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.global_categories TO anon, authenticated;
GRANT ALL ON public.global_categories TO service_role;
ALTER TABLE public.global_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.establishments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, cnpj TEXT, telefone TEXT, whatsapp TEXT,
  categoria_id UUID REFERENCES public.global_categories(id),
  logo_url TEXT, capa_url TEXT, descricao TEXT,
  endereco TEXT, cidade TEXT, estado TEXT,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  taxa_entrega_cents INT NOT NULL DEFAULT 0,
  raio_entrega_km NUMERIC(5,2) NOT NULL DEFAULT 5,
  tempo_medio_min INT NOT NULL DEFAULT 40,
  pedido_minimo_cents INT NOT NULL DEFAULT 0,
  pix_key TEXT,
  status public.establishment_status NOT NULL DEFAULT 'pendente',
  is_open BOOLEAN NOT NULL DEFAULT false,
  avaliacao NUMERIC(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.establishments TO authenticated;
GRANT SELECT ON public.establishments TO anon;
GRANT ALL ON public.establishments TO service_role;
ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_establishments_categoria ON public.establishments(categoria_id);
CREATE INDEX idx_establishments_status ON public.establishments(status);
CREATE INDEX idx_establishments_owner ON public.establishments(owner_id);
CREATE TRIGGER trg_establishments_updated_at BEFORE UPDATE ON public.establishments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, ordem INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_categories TO authenticated;
GRANT SELECT ON public.menu_categories TO anon;
GRANT ALL ON public.menu_categories TO service_role;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  menu_category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  nome TEXT NOT NULL, descricao TEXT, foto_url TEXT,
  preco_cents INT NOT NULL CHECK (preco_cents >= 0),
  preco_promo_cents INT CHECK (preco_promo_cents IS NULL OR preco_promo_cents >= 0),
  tempo_preparo_min INT DEFAULT 20, estoque INT,
  disponivel BOOLEAN NOT NULL DEFAULT true,
  destaque BOOLEAN NOT NULL DEFAULT false,
  ordem INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT ON public.products TO anon;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_products_estab ON public.products(establishment_id);
CREATE INDEX idx_products_categoria ON public.products(menu_category_id);
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.courier_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cnh TEXT, veiculo TEXT, placa TEXT, pix_key TEXT,
  selfie_url TEXT, doc_frente_url TEXT, doc_verso_url TEXT,
  status public.courier_status NOT NULL DEFAULT 'pendente',
  lat DOUBLE PRECISION, lng DOUBLE PRECISION, last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_profiles TO authenticated;
GRANT ALL ON public.courier_profiles TO service_role;
ALTER TABLE public.courier_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_courier_profiles_updated_at BEFORE UPDATE ON public.courier_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  status public.order_status NOT NULL DEFAULT 'placed',
  subtotal_cents INT NOT NULL DEFAULT 0,
  frete_cents INT NOT NULL DEFAULT 0,
  desconto_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL DEFAULT 0,
  forma_pagamento public.payment_method NOT NULL DEFAULT 'pix',
  endereco_entrega JSONB, observacoes TEXT, tempo_estimado_min INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_orders_cliente ON public.orders(cliente_id);
CREATE INDEX idx_orders_estab ON public.orders(establishment_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  nome_snapshot TEXT NOT NULL,
  preco_unit_cents INT NOT NULL,
  quantidade INT NOT NULL CHECK (quantidade > 0),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_order_items_order ON public.order_items(order_id);

CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  entregador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.delivery_status NOT NULL DEFAULT 'created',
  valor_entrega_cents INT NOT NULL DEFAULT 0,
  aceito_em TIMESTAMPTZ, coletado_em TIMESTAMPTZ, entregue_em TIMESTAMPTZ,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_deliveries_order ON public.deliveries(order_id);
CREATE INDEX idx_deliveries_entregador ON public.deliveries(entregador_id);
CREATE INDEX idx_deliveries_status ON public.deliveries(status);
CREATE TRIGGER trg_deliveries_updated_at BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- POLICIES (all tables exist now)
-- =========================================================
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_insert_self_nonadmin" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role <> 'admin');
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "addresses_own" ON public.addresses FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "global_categories_public_read" ON public.global_categories FOR SELECT TO anon, authenticated
  USING (ativo = true);
CREATE POLICY "global_categories_admin_all" ON public.global_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "establishments_public_read_approved" ON public.establishments FOR SELECT TO anon, authenticated
  USING (status = 'aprovado');
CREATE POLICY "establishments_owner_read" ON public.establishments FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);
CREATE POLICY "establishments_owner_insert" ON public.establishments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "establishments_owner_update" ON public.establishments FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "establishments_admin_all" ON public.establishments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "menu_categories_public_read" ON public.menu_categories FOR SELECT TO anon, authenticated
  USING (ativo = true AND EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.status = 'aprovado'));
CREATE POLICY "menu_categories_owner_all" ON public.menu_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid()));
CREATE POLICY "menu_categories_admin_all" ON public.menu_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "products_public_read" ON public.products FOR SELECT TO anon, authenticated
  USING (disponivel = true AND EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.status = 'aprovado'));
CREATE POLICY "products_owner_all" ON public.products FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid()));
CREATE POLICY "products_admin_all" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "courier_profiles_own" ON public.courier_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "courier_profiles_admin_all" ON public.courier_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "orders_cliente_read" ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = cliente_id);
CREATE POLICY "orders_cliente_insert" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = cliente_id);
CREATE POLICY "orders_estab_read" ON public.orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid()));
CREATE POLICY "orders_estab_update" ON public.orders FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid()));
CREATE POLICY "orders_courier_read" ON public.orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deliveries d WHERE d.order_id = orders.id AND d.entregador_id = auth.uid()));
CREATE POLICY "orders_admin_all" ON public.orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "order_items_visible" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id AND (
      o.cliente_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = o.establishment_id AND e.owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.deliveries d WHERE d.order_id = o.id AND d.entregador_id = auth.uid())
      OR public.has_role(auth.uid(),'admin')
    )
  ));
CREATE POLICY "order_items_cliente_insert" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.cliente_id = auth.uid()));
CREATE POLICY "order_items_admin_all" ON public.order_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "deliveries_cliente_read" ON public.deliveries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.cliente_id = auth.uid()));
CREATE POLICY "deliveries_estab_read" ON public.deliveries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o JOIN public.establishments e ON e.id = o.establishment_id
    WHERE o.id = order_id AND e.owner_id = auth.uid()
  ));
CREATE POLICY "deliveries_courier_assigned_read" ON public.deliveries FOR SELECT TO authenticated
  USING (entregador_id = auth.uid());
CREATE POLICY "deliveries_courier_broadcast_read" ON public.deliveries FOR SELECT TO authenticated
  USING (status = 'broadcasting' AND EXISTS (
    SELECT 1 FROM public.courier_profiles cp WHERE cp.user_id = auth.uid() AND cp.status IN ('aprovado','online','ocupado')
  ));
CREATE POLICY "deliveries_courier_update" ON public.deliveries FOR UPDATE TO authenticated
  USING (
    entregador_id = auth.uid()
    OR (status = 'broadcasting' AND EXISTS (
      SELECT 1 FROM public.courier_profiles cp WHERE cp.user_id = auth.uid() AND cp.status IN ('aprovado','online')
    ))
  ) WITH CHECK (entregador_id = auth.uid());
CREATE POLICY "deliveries_admin_all" ON public.deliveries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- SIGNUP TRIGGER
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, foto_url, telefone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'telefone'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cliente')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- SEED CATEGORIES
-- =========================================================
INSERT INTO public.global_categories (slug, nome, icone, ordem) VALUES
  ('pizza','Pizza','🍕',1),
  ('hamburguer','Hambúrguer','🍔',2),
  ('marmita','Marmita','🍱',3),
  ('acai','Açaí','🍧',4),
  ('sorvete','Sorvete','🍨',5),
  ('pastel','Pastel','🥟',6),
  ('lanches','Lanches','🥪',7),
  ('bebidas','Bebidas','🥤',8),
  ('mercado','Mercado','🛒',9),
  ('farmacia','Farmácia','💊',10);
