
-- 1. Extend sponsored_ads
ALTER TABLE public.sponsored_ads
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.estab_ad_subscriptions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS banner_path TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS destino_url TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS motivo_recusa TEXT;

-- Existing admin-created rows stay approved by default; new estab uploads default to pending via app.
ALTER TABLE public.sponsored_ads ALTER COLUMN imagem_url DROP NOT NULL;

-- 2. Public read: only approved ads within window
DROP POLICY IF EXISTS "Public can view active ads within window" ON public.sponsored_ads;
CREATE POLICY "Public can view approved active ads"
  ON public.sponsored_ads FOR SELECT
  USING (
    ativo = true
    AND status = 'approved'
    AND (inicio_em IS NULL OR inicio_em <= now())
    AND (fim_em IS NULL OR fim_em >= now())
  );

-- 3. Owner (establishment) policies
CREATE POLICY "Estab owner can view own ads"
  ON public.sponsored_ads FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.establishments e
            WHERE e.id = sponsored_ads.establishment_id AND e.owner_id = auth.uid())
  );

CREATE POLICY "Estab owner can insert own ads with active subscription"
  ON public.sponsored_ads FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.establishments e
            WHERE e.id = sponsored_ads.establishment_id AND e.owner_id = auth.uid())
    AND (
      subscription_id IS NULL
      OR EXISTS (SELECT 1 FROM public.estab_ad_subscriptions s
                 WHERE s.id = sponsored_ads.subscription_id
                   AND s.establishment_id = sponsored_ads.establishment_id
                   AND s.status = 'active')
    )
  );

CREATE POLICY "Estab owner can update own ads"
  ON public.sponsored_ads FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.establishments e
            WHERE e.id = sponsored_ads.establishment_id AND e.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.establishments e
            WHERE e.id = sponsored_ads.establishment_id AND e.owner_id = auth.uid())
  );

CREATE POLICY "Estab owner can delete own ads"
  ON public.sponsored_ads FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.establishments e
            WHERE e.id = sponsored_ads.establishment_id AND e.owner_id = auth.uid())
  );

-- 4. Notification when campaign is approved/rejected
CREATE OR REPLACE FUNCTION public.notify_estab_ad_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner UUID; t TEXT; m TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT owner_id INTO owner FROM public.establishments WHERE id = NEW.establishment_id;
    IF owner IS NULL THEN RETURN NEW; END IF;
    IF NEW.status = 'approved' THEN
      t := 'Campanha aprovada ✅';
      m := 'Sua campanha "' || COALESCE(NEW.titulo,'') || '" foi aprovada e já está no ar.';
    ELSIF NEW.status = 'rejected' THEN
      t := 'Campanha recusada';
      m := 'Sua campanha "' || COALESCE(NEW.titulo,'') || '" foi recusada. ' || COALESCE(NEW.motivo_recusa,'');
    ELSE RETURN NEW;
    END IF;
    INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
    VALUES (owner, t, m, '/estabelecimento/anuncios', 'estabelecimento');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_estab_ad_status ON public.sponsored_ads;
CREATE TRIGGER trg_notify_estab_ad_status
  AFTER UPDATE ON public.sponsored_ads
  FOR EACH ROW EXECUTE FUNCTION public.notify_estab_ad_status();

-- 5. Platform-wide ad rotation seconds
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS ad_default_seconds INTEGER NOT NULL DEFAULT 8;

-- 6. Storage policies for ad-banners bucket
-- Path layout: <establishment_id>/<filename>
CREATE POLICY "Estab owner uploads own ad banners"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ad-banners'
    AND EXISTS (
      SELECT 1 FROM public.establishments e
      WHERE e.id::text = (storage.foldername(name))[1]
        AND e.owner_id = auth.uid()
    )
  );

CREATE POLICY "Estab owner reads own ad banners"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'ad-banners'
    AND EXISTS (
      SELECT 1 FROM public.establishments e
      WHERE e.id::text = (storage.foldername(name))[1]
        AND e.owner_id = auth.uid()
    )
  );

CREATE POLICY "Estab owner updates own ad banners"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'ad-banners'
    AND EXISTS (
      SELECT 1 FROM public.establishments e
      WHERE e.id::text = (storage.foldername(name))[1]
        AND e.owner_id = auth.uid()
    )
  );

CREATE POLICY "Estab owner deletes own ad banners"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'ad-banners'
    AND EXISTS (
      SELECT 1 FROM public.establishments e
      WHERE e.id::text = (storage.foldername(name))[1]
        AND e.owner_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage ad banners"
  ON storage.objects FOR ALL
  USING (bucket_id = 'ad-banners' AND private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'ad-banners' AND private.has_role(auth.uid(), 'admin'::app_role));

-- Read access for authenticated clients to view approved ad banners (needed since bucket is private)
CREATE POLICY "Authenticated can read approved ad banners"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'ad-banners'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.sponsored_ads a
      WHERE a.banner_path = storage.objects.name
        AND a.status = 'approved'
        AND a.ativo = true
        AND (a.inicio_em IS NULL OR a.inicio_em <= now())
        AND (a.fim_em   IS NULL OR a.fim_em   >= now())
    )
  );
