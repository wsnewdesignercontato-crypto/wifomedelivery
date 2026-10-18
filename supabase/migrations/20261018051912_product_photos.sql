-- Public catalog photos, with writes restricted to the establishment owner.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('product-photos','product-photos',true,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "product_photos_owner_insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
 bucket_id='product-photos' AND EXISTS (
 SELECT 1 FROM public.establishments e
 WHERE e.id::text=(storage.foldername(name))[1] AND e.owner_id=(SELECT auth.uid())
 )
);
CREATE POLICY "product_photos_owner_select" ON storage.objects
FOR SELECT TO authenticated USING (
 bucket_id='product-photos' AND EXISTS (
 SELECT 1 FROM public.establishments e
 WHERE e.id::text=(storage.foldername(name))[1] AND e.owner_id=(SELECT auth.uid())
 )
);
CREATE POLICY "product_photos_owner_delete" ON storage.objects
FOR DELETE TO authenticated USING (
 bucket_id='product-photos' AND EXISTS (
 SELECT 1 FROM public.establishments e
 WHERE e.id::text=(storage.foldername(name))[1] AND e.owner_id=(SELECT auth.uid())
 )
);
