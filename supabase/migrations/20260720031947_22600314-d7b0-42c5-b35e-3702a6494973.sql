
-- ============ ESTABLISHMENTS: novas colunas ============
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS razao_social TEXT,
  ADD COLUMN IF NOT EXISTS slogan TEXT,
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS site TEXT,
  ADD COLUMN IF NOT EXISTS cor_destaque TEXT,
  ADD COLUMN IF NOT EXISTS tipos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS banco_nome TEXT,
  ADD COLUMN IF NOT EXISTS banco_agencia TEXT,
  ADD COLUMN IF NOT EXISTS banco_conta TEXT,
  ADD COLUMN IF NOT EXISTS banco_tipo TEXT,
  ADD COLUMN IF NOT EXISTS banco_titular TEXT,
  ADD COLUMN IF NOT EXISTS banco_documento TEXT;

-- ============ REVIEWS: resposta do estabelecimento ============
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS resposta TEXT,
  ADD COLUMN IF NOT EXISTS respondido_em TIMESTAMPTZ;

-- ============ PRODUCT_VARIANTS ============
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  preco_cents INTEGER NOT NULL CHECK (preco_cents >= 0),
  preco_promo_cents INTEGER CHECK (preco_promo_cents IS NULL OR preco_promo_cents >= 0),
  estoque INTEGER,
  tempo_extra_min INTEGER,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON public.product_variants(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT SELECT ON public.product_variants TO anon;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "variants_public_read" ON public.product_variants FOR SELECT TO anon, authenticated
  USING (ativo AND EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.establishments e ON e.id = p.establishment_id
    WHERE p.id = product_variants.product_id AND e.status = 'aprovado'
  ));
CREATE POLICY "variants_owner_all" ON public.product_variants FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.establishments e ON e.id = p.establishment_id
    WHERE p.id = product_variants.product_id AND e.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.establishments e ON e.id = p.establishment_id
    WHERE p.id = product_variants.product_id AND e.owner_id = auth.uid()
  ));
CREATE POLICY "variants_admin_all" ON public.product_variants FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_variants_updated BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ADDON_GROUPS ============
CREATE TABLE IF NOT EXISTS public.addon_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  obrigatorio BOOLEAN NOT NULL DEFAULT FALSE,
  minimo INTEGER NOT NULL DEFAULT 0,
  maximo INTEGER NOT NULL DEFAULT 1,
  selecao_multipla BOOLEAN NOT NULL DEFAULT FALSE,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_addon_groups_estab ON public.addon_groups(establishment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addon_groups TO authenticated;
GRANT SELECT ON public.addon_groups TO anon;
GRANT ALL ON public.addon_groups TO service_role;
ALTER TABLE public.addon_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addon_groups_public_read" ON public.addon_groups FOR SELECT TO anon, authenticated
  USING (ativo AND EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = addon_groups.establishment_id AND e.status = 'aprovado'));
CREATE POLICY "addon_groups_owner_all" ON public.addon_groups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = addon_groups.establishment_id AND e.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = addon_groups.establishment_id AND e.owner_id = auth.uid()));
CREATE POLICY "addon_groups_admin_all" ON public.addon_groups FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_addon_groups_updated BEFORE UPDATE ON public.addon_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ADDONS (itens dos grupos) ============
CREATE TABLE IF NOT EXISTS public.addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_group_id UUID NOT NULL REFERENCES public.addon_groups(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  foto_url TEXT,
  preco_extra_cents INTEGER NOT NULL DEFAULT 0 CHECK (preco_extra_cents >= 0),
  estoque INTEGER,
  qtd_maxima INTEGER,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_addons_group ON public.addons(addon_group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addons TO authenticated;
GRANT SELECT ON public.addons TO anon;
GRANT ALL ON public.addons TO service_role;
ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addons_public_read" ON public.addons FOR SELECT TO anon, authenticated
  USING (ativo AND EXISTS (
    SELECT 1 FROM public.addon_groups g
    JOIN public.establishments e ON e.id = g.establishment_id
    WHERE g.id = addons.addon_group_id AND e.status = 'aprovado'
  ));
CREATE POLICY "addons_owner_all" ON public.addons FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.addon_groups g
    JOIN public.establishments e ON e.id = g.establishment_id
    WHERE g.id = addons.addon_group_id AND e.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.addon_groups g
    JOIN public.establishments e ON e.id = g.establishment_id
    WHERE g.id = addons.addon_group_id AND e.owner_id = auth.uid()
  ));
CREATE POLICY "addons_admin_all" ON public.addons FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_addons_updated BEFORE UPDATE ON public.addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PRODUCT_ADDON_GROUPS (vínculo) ============
CREATE TABLE IF NOT EXISTS public.product_addon_groups (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  addon_group_id UUID NOT NULL REFERENCES public.addon_groups(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, addon_group_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_addon_groups TO authenticated;
GRANT SELECT ON public.product_addon_groups TO anon;
GRANT ALL ON public.product_addon_groups TO service_role;
ALTER TABLE public.product_addon_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pag_public_read" ON public.product_addon_groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "pag_owner_all" ON public.product_addon_groups FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p JOIN public.establishments e ON e.id = p.establishment_id
    WHERE p.id = product_addon_groups.product_id AND e.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p JOIN public.establishments e ON e.id = p.establishment_id
    WHERE p.id = product_addon_groups.product_id AND e.owner_id = auth.uid()
  ));

-- ============ ESTABLISHMENT_HOURS ============
CREATE TABLE IF NOT EXISTS public.establishment_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  abre TIME NOT NULL,
  fecha TIME NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hours_estab ON public.establishment_hours(establishment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.establishment_hours TO authenticated;
GRANT SELECT ON public.establishment_hours TO anon;
GRANT ALL ON public.establishment_hours TO service_role;
ALTER TABLE public.establishment_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hours_public_read" ON public.establishment_hours FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_hours.establishment_id AND e.status = 'aprovado'));
CREATE POLICY "hours_owner_all" ON public.establishment_hours FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_hours.establishment_id AND e.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_hours.establishment_id AND e.owner_id = auth.uid()));

-- ============ ESTABLISHMENT_DELIVERY_ZONES ============
CREATE TABLE IF NOT EXISTS public.establishment_delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  bairro TEXT,
  raio_km NUMERIC(5,2),
  taxa_cents INTEGER NOT NULL DEFAULT 0 CHECK (taxa_cents >= 0),
  tempo_min INTEGER,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dz_estab ON public.establishment_delivery_zones(establishment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.establishment_delivery_zones TO authenticated;
GRANT SELECT ON public.establishment_delivery_zones TO anon;
GRANT ALL ON public.establishment_delivery_zones TO service_role;
ALTER TABLE public.establishment_delivery_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dz_public_read" ON public.establishment_delivery_zones FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "dz_owner_all" ON public.establishment_delivery_zones FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_delivery_zones.establishment_id AND e.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_delivery_zones.establishment_id AND e.owner_id = auth.uid()));

-- ============ ESTAB_BANNERS ============
CREATE TABLE IF NOT EXISTS public.estab_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  subtitulo TEXT,
  imagem_url TEXT,
  link_produto UUID REFERENCES public.products(id) ON DELETE SET NULL,
  link_categoria UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  cta_texto TEXT,
  cta_link TEXT,
  data_inicial TIMESTAMPTZ,
  data_final TIMESTAMPTZ,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_estab_banners_estab ON public.estab_banners(establishment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estab_banners TO authenticated;
GRANT SELECT ON public.estab_banners TO anon;
GRANT ALL ON public.estab_banners TO service_role;
ALTER TABLE public.estab_banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estab_banners_public_read" ON public.estab_banners FOR SELECT TO anon, authenticated
  USING (ativo AND EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = estab_banners.establishment_id AND e.status = 'aprovado'));
CREATE POLICY "estab_banners_owner_all" ON public.estab_banners FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = estab_banners.establishment_id AND e.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = estab_banners.establishment_id AND e.owner_id = auth.uid()));
CREATE TRIGGER trg_estab_banners_updated BEFORE UPDATE ON public.estab_banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ STOCK_MOVEMENTS ============
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida','ajuste','perda','venda')),
  quantidade INTEGER NOT NULL,
  motivo TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_mov_estab ON public.stock_movements(establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_mov_prod ON public.stock_movements(product_id, created_at DESC);
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_owner_all" ON public.stock_movements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = stock_movements.establishment_id AND e.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = stock_movements.establishment_id AND e.owner_id = auth.uid()));

-- ============ TEAM_MEMBERS (equipe da loja) ============
DO $$ BEGIN
  CREATE TYPE public.team_role AS ENUM ('proprietario','gerente','atendente','cozinha','financeiro','estoque','marketing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nome TEXT,
  papel team_role NOT NULL DEFAULT 'atendente',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  convidado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  aceito_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(establishment_id, email)
);
CREATE INDEX IF NOT EXISTS idx_team_estab ON public.team_members(establishment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_owner_all" ON public.team_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = team_members.establishment_id AND e.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = team_members.establishment_id AND e.owner_id = auth.uid()));
CREATE POLICY "team_self_read" ON public.team_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE TRIGGER trg_team_updated BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Realtime já habilitado para orders? Garantir ============
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ Trigger: auto-desativar produto quando estoque zera ============
CREATE OR REPLACE FUNCTION public.auto_disable_product_on_zero_stock()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.estoque IS NOT NULL AND NEW.estoque <= 0 THEN
    NEW.disponivel := FALSE;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_disable_on_zero ON public.products;
CREATE TRIGGER trg_auto_disable_on_zero
  BEFORE UPDATE OF estoque ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.auto_disable_product_on_zero_stock();
