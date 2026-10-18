-- Public discovery data only. Keep caller privileges/RLS and approval checks.
CREATE OR REPLACE FUNCTION public.customer_store_directory(p_city text DEFAULT NULL, p_state text DEFAULT NULL)
RETURNS TABLE(id uuid,nome text,descricao text,categoria_id uuid,logo_url text,capa_url text,
 taxa_entrega_cents integer,tempo_medio_min integer,avaliacao numeric,is_open boolean,cidade text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH location AS (
  SELECT regexp_replace(public.normalize_delivery_text(btrim(p_city)), '[[:space:]]+', ' ', 'g') AS city,
    upper(btrim(coalesce(p_state,''))) AS state
 )
 SELECT e.id,e.nome,e.descricao,e.categoria_id,e.logo_url,e.capa_url,
   e.taxa_entrega_cents::integer,e.tempo_medio_min::integer,e.avaliacao::numeric,e.is_open,e.cidade
 FROM public.establishments e CROSS JOIN location l
 WHERE e.status='aprovado'
   AND (l.city='' OR regexp_replace(public.normalize_delivery_text(btrim(e.cidade)), '[[:space:]]+', ' ', 'g')=l.city)
   AND (l.state='' OR upper(btrim(e.estado))=l.state)
 ORDER BY e.is_open DESC,e.avaliacao DESC NULLS LAST,e.nome,e.id
$$;
REVOKE ALL ON FUNCTION public.customer_store_directory(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_store_directory(text,text) TO anon,authenticated;
