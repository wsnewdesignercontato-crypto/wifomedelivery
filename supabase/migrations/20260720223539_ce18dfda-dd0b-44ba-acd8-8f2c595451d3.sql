
CREATE TABLE public.sponsored_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  subtitulo text,
  imagem_url text NOT NULL,
  cta_texto text NOT NULL DEFAULT 'Ver mais',
  ativo boolean NOT NULL DEFAULT true,
  patrocinado boolean NOT NULL DEFAULT true,
  prioridade int NOT NULL DEFAULT 0,
  duracao_segundos int NOT NULL DEFAULT 6,
  inicio_em timestamptz,
  fim_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sponsored_ads TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sponsored_ads TO authenticated;
GRANT ALL ON public.sponsored_ads TO service_role;

ALTER TABLE public.sponsored_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active ads within window"
  ON public.sponsored_ads FOR SELECT
  USING (
    ativo = true
    AND (inicio_em IS NULL OR inicio_em <= now())
    AND (fim_em IS NULL OR fim_em >= now())
  );

CREATE POLICY "Admins manage ads (select)" ON public.sponsored_ads FOR SELECT
  TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage ads (insert)" ON public.sponsored_ads FOR INSERT
  TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage ads (update)" ON public.sponsored_ads FOR UPDATE
  TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage ads (delete)" ON public.sponsored_ads FOR DELETE
  TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_sponsored_ads_ativo_prioridade ON public.sponsored_ads (ativo, prioridade DESC, created_at DESC);

CREATE TRIGGER trg_sponsored_ads_updated_at
  BEFORE UPDATE ON public.sponsored_ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
