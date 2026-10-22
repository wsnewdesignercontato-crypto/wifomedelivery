-- Compare the same municipality/neighborhood consistently across saved addresses,
-- storefront search and checkout. Radius and configured-area gates still apply.
CREATE OR REPLACE FUNCTION private.checkout_freight(p_store_id uuid,p_tipo_entrega text,p_endereco jsonb)
RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE store public.establishments%ROWTYPE; freight integer; distance_km double precision;
BEGIN
 IF p_tipo_entrega IS NULL OR p_tipo_entrega NOT IN ('delivery','pickup') THEN RAISE EXCEPTION 'Invalid fulfillment' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_settings WHERE maintenance_mode) THEN RAISE EXCEPTION 'Platform under maintenance' USING ERRCODE='22023'; END IF;
 SELECT * INTO store FROM public.establishments WHERE id=p_store_id FOR SHARE;
 IF NOT FOUND OR store.status <> 'aprovado' OR NOT store.is_open THEN RAISE EXCEPTION 'Store closed or unavailable' USING ERRCODE='22023'; END IF;
 freight := CASE WHEN p_tipo_entrega='pickup' THEN 0 ELSE store.taxa_entrega_cents END;
 IF freight < 0 THEN RAISE EXCEPTION 'Invalid delivery fee' USING ERRCODE='22023'; END IF;
 IF p_tipo_entrega='delivery' THEN
  IF p_endereco IS NULL OR jsonb_typeof(p_endereco)<>'object' OR coalesce(btrim(p_endereco->>'rua'),'')='' OR coalesce(btrim(p_endereco->>'cidade'),'')='' THEN RAISE EXCEPTION 'Delivery address required' USING ERRCODE='22023'; END IF;
  IF nullif(btrim(store.cidade),'') IS NOT NULL AND regexp_replace(public.normalize_delivery_text(btrim(store.cidade)), '[[:space:]]+', ' ', 'g') <> regexp_replace(public.normalize_delivery_text(btrim(p_endereco->>'cidade')), '[[:space:]]+', ' ', 'g') THEN RAISE EXCEPTION 'Address outside delivery city' USING ERRCODE='22023'; END IF;
  IF store.lat IS NOT NULL AND store.lng IS NOT NULL AND p_endereco->>'lat' IS NOT NULL AND p_endereco->>'lng' IS NOT NULL THEN
   IF abs((p_endereco->>'lat')::numeric)>90 OR abs((p_endereco->>'lng')::numeric)>180 THEN RAISE EXCEPTION 'Invalid coordinates' USING ERRCODE='22023'; END IF;
   distance_km := 6371*acos(least(1.0,greatest(-1.0,sin(radians(store.lat))*sin(radians((p_endereco->>'lat')::float8))+cos(radians(store.lat))*cos(radians((p_endereco->>'lat')::float8))*cos(radians((p_endereco->>'lng')::float8-store.lng)))));
   IF distance_km > store.raio_entrega_km THEN RAISE EXCEPTION 'Address outside delivery radius' USING ERRCODE='22023'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.establishment_delivery_zones WHERE establishment_id=store.id AND ativo) THEN
   SELECT z.taxa_cents INTO freight FROM public.establishment_delivery_zones z WHERE z.establishment_id=store.id AND z.ativo
    AND ((nullif(btrim(z.bairro),'') IS NOT NULL AND regexp_replace(public.normalize_delivery_text(btrim(z.bairro)), '[[:space:]]+', ' ', 'g')=regexp_replace(public.normalize_delivery_text(btrim(p_endereco->>'bairro')), '[[:space:]]+', ' ', 'g')) OR (z.bairro IS NULL AND z.raio_km IS NOT NULL AND distance_km IS NOT NULL AND distance_km <= z.raio_km)) ORDER BY z.taxa_cents,z.id LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'Address outside configured delivery areas' USING ERRCODE='22023'; END IF;
  END IF;
 END IF;
 RETURN freight;
END $$;
REVOKE ALL ON FUNCTION private.checkout_freight(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
