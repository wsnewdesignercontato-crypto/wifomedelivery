
CREATE TABLE public.ad_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  preco_cents INT NOT NULL DEFAULT 0,
  duracao_dias INT NOT NULL DEFAULT 7,
  prioridade INT NOT NULL DEFAULT 0,
  max_anuncios INT NOT NULL DEFAULT 1,
  destaque_home BOOLEAN NOT NULL DEFAULT false,
  destaque_categoria BOOLEAN NOT NULL DEFAULT false,
  destaque_busca BOOLEAN NOT NULL DEFAULT false,
  impressoes_estimadas INT,
  cor TEXT DEFAULT '#FF6B00',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ad_plans TO anon, authenticated;
GRANT ALL ON public.ad_plans TO service_role;
ALTER TABLE public.ad_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_plans read active" ON public.ad_plans FOR SELECT USING (ativo OR private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "ad_plans admin manage" ON public.ad_plans FOR ALL USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_ad_plans_updated BEFORE UPDATE ON public.ad_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.estab_ad_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.ad_plans(id),
  status TEXT NOT NULL DEFAULT 'pending',
  preco_pago_cents INT NOT NULL DEFAULT 0,
  inicio_em TIMESTAMPTZ,
  fim_em TIMESTAMPTZ,
  metodo_pagamento TEXT,
  observacao TEXT,
  aprovado_por UUID,
  aprovado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_estab_ad_sub_estab ON public.estab_ad_subscriptions(establishment_id);
CREATE INDEX idx_estab_ad_sub_status ON public.estab_ad_subscriptions(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estab_ad_subscriptions TO authenticated;
GRANT ALL ON public.estab_ad_subscriptions TO service_role;
ALTER TABLE public.estab_ad_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub owner read" ON public.estab_ad_subscriptions FOR SELECT USING (
  private.has_role(auth.uid(),'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid())
);
CREATE POLICY "sub owner create" ON public.estab_ad_subscriptions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid())
);
CREATE POLICY "sub owner update" ON public.estab_ad_subscriptions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid())
);
CREATE POLICY "sub admin manage" ON public.estab_ad_subscriptions FOR ALL USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_estab_ad_sub_updated BEFORE UPDATE ON public.estab_ad_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.notify_estab_ad_sub_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner UUID; plan_name TEXT; t TEXT; m TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT owner_id INTO owner FROM public.establishments WHERE id = NEW.establishment_id;
    SELECT nome INTO plan_name FROM public.ad_plans WHERE id = NEW.plan_id;
    IF NEW.status = 'active' THEN
      t := 'Plano de anúncio ativo ✅';
      m := 'Seu plano "' || COALESCE(plan_name,'') || '" está ativo até ' || to_char(NEW.fim_em, 'DD/MM/YYYY') || '.';
    ELSIF NEW.status = 'rejected' THEN
      t := 'Plano de anúncio recusado';
      m := 'O plano "' || COALESCE(plan_name,'') || '" foi recusado. ' || COALESCE(NEW.observacao,'');
    ELSIF NEW.status = 'expired' THEN
      t := 'Plano de anúncio expirado';
      m := 'Seu plano "' || COALESCE(plan_name,'') || '" expirou. Renove para continuar em destaque.';
    ELSE RETURN NEW;
    END IF;
    INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
    VALUES (owner, t, m, '/estabelecimento/anuncios', 'estabelecimento');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_estab_ad_sub AFTER UPDATE ON public.estab_ad_subscriptions FOR EACH ROW EXECUTE FUNCTION public.notify_estab_ad_sub_status();
