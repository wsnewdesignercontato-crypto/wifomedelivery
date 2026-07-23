
-- 1) Reviews: restrict raw read to authenticated
DROP POLICY IF EXISTS "Reviews are publicly readable" ON public.reviews;
CREATE POLICY "reviews_authenticated_read" ON public.reviews
  FOR SELECT TO authenticated USING (true);

-- 2) Storage: chat-attachments participant-only read
DROP POLICY IF EXISTS "chat read auth" ON storage.objects;
CREATE POLICY "chat read participants" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments' AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.orders o
      LEFT JOIN public.deliveries d ON d.order_id = o.id
      LEFT JOIN public.establishments e ON e.id = o.establishment_id
      WHERE o.id::text = (storage.foldername(name))[2]
        AND (o.cliente_id = auth.uid() OR d.entregador_id = auth.uid() OR e.owner_id = auth.uid())
    )
  )
);

-- 3) Storage: delivery-proofs participant-only read
DROP POLICY IF EXISTS "proof read auth" ON storage.objects;
CREATE POLICY "proof read participants" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'delivery-proofs' AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.orders o
      LEFT JOIN public.deliveries d ON d.order_id = o.id
      LEFT JOIN public.establishments e ON e.id = o.establishment_id
      WHERE o.id::text = (storage.foldername(name))[2]
        AND (o.cliente_id = auth.uid() OR d.entregador_id = auth.uid() OR e.owner_id = auth.uid())
    )
  )
);

-- 4) Replace public SECURITY DEFINER function with a safe view
DROP FUNCTION IF EXISTS public.get_public_platform_settings();
CREATE OR REPLACE VIEW public.public_platform_settings
WITH (security_invoker = false) AS
SELECT bestseller_threshold, ad_default_seconds
FROM public.platform_settings
WHERE id = 1;
GRANT SELECT ON public.public_platform_settings TO anon, authenticated;

-- 5) Move list_available_couriers out of exposed API
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.list_available_couriers()
RETURNS TABLE(user_id uuid, veiculo text, avaliacao numeric, lat double precision, lng double precision, last_seen timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.user_id, cp.veiculo, cp.avaliacao, cp.lat, cp.lng, cp.last_seen
  FROM public.courier_profiles cp
  WHERE cp.status = 'online' AND cp.aprovacao = 'approved';
$$;
REVOKE ALL ON FUNCTION private.list_available_couriers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.list_available_couriers() TO service_role;
DROP FUNCTION IF EXISTS public.list_available_couriers();
