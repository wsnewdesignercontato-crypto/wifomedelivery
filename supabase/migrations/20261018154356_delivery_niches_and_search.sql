ALTER TABLE public.global_categories ADD COLUMN search_terms text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.normalize_delivery_text(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
 SELECT translate(lower(coalesce(value,'')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
$$;
REVOKE ALL ON FUNCTION public.normalize_delivery_text(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_delivery_text(text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.ensure_menu_categories(p_establishment_id uuid,p_names text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE category jsonb; result jsonb:='[]'; label text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT FROM public.establishments WHERE id=p_establishment_id AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Loja não autorizada' USING ERRCODE='42501'; END IF;
 IF p_names IS NULL OR cardinality(p_names)<1 OR cardinality(p_names)>100 THEN RAISE EXCEPTION 'Escolha de 1 a 100 categorias'; END IF;
 FOR label IN SELECT DISTINCT btrim(value) FROM unnest(p_names) value LOOP
  category:=public.ensure_menu_category(p_establishment_id,label);
  result:=result||jsonb_build_array(category);
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.ensure_menu_categories(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ensure_menu_categories(uuid,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_delivery_catalog(p_query text,p_city text DEFAULT NULL,p_offset integer DEFAULT 0,p_limit integer DEFAULT 24)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH input AS (
 SELECT left(btrim(public.normalize_delivery_text(p_query)),120) AS query,
 public.normalize_delivery_text(btrim(p_city)) AS city,
 greatest(0,least(coalesce(p_offset,0),100000)) AS skip,
 greatest(1,least(coalesce(p_limit,24),50)) AS take
 ), tokens AS (
 SELECT regexp_replace(token,'s$','') AS token FROM input,regexp_split_to_table(input.query,'\s+') token WHERE token<>''
 ), eligible AS (
 SELECT e.id,e.nome,e.descricao,e.capa_url,e.taxa_entrega_cents,e.tempo_medio_min,e.avaliacao,e.is_open,e.categoria_id,
 c.nome AS categoria_nome,
 public.normalize_delivery_text(concat_ws(' ',e.nome,e.descricao,c.nome,c.slug,array_to_string(c.search_terms,' '),array_to_string(e.tipos,' '))) AS searchable
 FROM public.establishments e LEFT JOIN public.global_categories c ON c.id=e.categoria_id CROSS JOIN input i
 WHERE e.status='aprovado' AND length(i.query)>=2 AND (i.city='' OR public.normalize_delivery_text(btrim(e.cidade))=i.city)
 ), stores AS (
 SELECT * FROM eligible WHERE NOT EXISTS(SELECT FROM tokens WHERE strpos(eligible.searchable,tokens.token)=0)
 ), store_page AS (
 SELECT * FROM stores ORDER BY is_open DESC,avaliacao DESC NULLS LAST,nome,id
 LIMIT (SELECT take FROM input) OFFSET (SELECT skip FROM input)
 ), matching_products AS (
 SELECT p.id,p.nome,p.descricao,p.foto_url,p.preco_cents,p.preco_promo_cents,p.establishment_id
 FROM public.products p JOIN eligible e ON e.id=p.establishment_id
 LEFT JOIN public.menu_categories c ON c.id=p.menu_category_id AND c.establishment_id=e.id
 WHERE p.disponivel AND NOT EXISTS (
 SELECT FROM tokens WHERE strpos(public.normalize_delivery_text(concat_ws(' ',p.nome,p.descricao,c.nome)),tokens.token)=0
 )
 ), product_page AS (
 SELECT * FROM matching_products ORDER BY nome,id LIMIT (SELECT take FROM input) OFFSET (SELECT skip FROM input)
 )
 SELECT jsonb_build_object(
 'establishments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'nome',s.nome,'descricao',s.descricao,'capa_url',s.capa_url,'taxa_entrega_cents',s.taxa_entrega_cents,'tempo_medio_min',s.tempo_medio_min,'avaliacao',s.avaliacao,'is_open',s.is_open,'categoria_nome',s.categoria_nome)) FROM store_page s),'[]'::jsonb),
 'products',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM product_page p),'[]'::jsonb),
 'establishment_total',(SELECT count(*) FROM stores),
 'product_total',(SELECT count(*) FROM matching_products)
 )
$$;
REVOKE ALL ON FUNCTION public.search_delivery_catalog(text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_delivery_catalog(text,text,integer,integer) TO anon,authenticated;

-- Shared delivery segments and search synonyms. Existing IDs and labels are preserved.
INSERT INTO public.global_categories(nome,slug,icone,ordem,ativo) VALUES
('Hamburgueria','hamburguer','🍔',1,true),
('Pizza','pizza','🍕',2,true),
('Sushi','sushi','🍣',3,true),
('Marmitaria','marmita','🍱',4,true),
('Frango','frango','🍗',5,true),
('Churrasco','churrasco','🍖',6,true),
('Saudável','saudavel','🥗',7,true),
('Mexicana','mexicana','🌮',8,true),
('Massas','massas','🍝',9,true),
('Padaria','padaria','🥐',10,true),
('Salgaderia','pastel','🥟',11,true),
('Lanchonete','lanches','🥪',12,true),
('Doces','doces','🍰',13,true),
('Chocolates','chocolates','🍫',14,true),
('Sorvetes','sorvete','🍨',15,true),
('Açaí','acai','🍧',16,true),
('Bebidas','bebidas','🥤',17,true),
('Cafeteria','cafeteria','☕',18,true),
('Porções','porcoes','🍟',19,true),
('Mercado','mercado','🛒',20,true),
('Farmácia','farmacia','💊',21,true),
('Restaurante','restaurante','🍽️',22,true),
('Floricultura','floricultura','💐',23,true),
('Pet shop','petshop','🐾',24,true),
('Hortifruti','hortifruti','🥬',25,true),
('Açougue','acougue','🥩',26,true),
('Peixaria','peixaria','🐟',27,true),
('Conveniência','conveniencia','🏪',28,true),
('Cosméticos e perfumaria','cosmeticos','🧴',29,true),
('Presentes','presentes','🎁',30,true),
('Despachos e encomendas','encomendas','📦',31,true)
ON CONFLICT (slug) DO NOTHING;
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['hamburgueria','hamburguerias','hamburguer','hamburgueres','burger','lanchonete','lanchonetes']::text[])) WHERE slug='hamburguer';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['pizzaria','pizzarias','pizzas']::text[])) WHERE slug='pizza';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['japones','japonesa','oriental']::text[])) WHERE slug='sushi';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['marmitex','marmitas','restaurante','restaurantes']::text[])) WHERE slug='marmita';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['frangaria','frango assado']::text[])) WHERE slug='frango';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['churrascaria','churrascarias']::text[])) WHERE slug='churrasco';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['fitness','vegano','vegetariano','saladas']::text[])) WHERE slug='saudavel';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['mexicano','tacos','burritos']::text[])) WHERE slug='mexicana';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['italiana','italiano','macarrao']::text[])) WHERE slug='massas';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['padarias','panificadora','panificadoras','pao','paes']::text[])) WHERE slug='padaria';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['pastelaria','pastelarias','salgados','salgaderias']::text[])) WHERE slug='pastel';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['lanchonetes','lanches','sanduiche','sanduiches','fast food']::text[])) WHERE slug='lanches';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['doceria','docerias','confeitaria','confeitarias','bolos']::text[])) WHERE slug='doces';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['chocolateria','chocolate']::text[])) WHERE slug='chocolates';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['sorveteria','sorveterias','picole','gelato']::text[])) WHERE slug='sorvete';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['acaiteria','acaiterias']::text[])) WHERE slug='acai';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['distribuidora','distribuidoras','adega','adegas','refrigerantes','cervejas']::text[])) WHERE slug='bebidas';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['cafeterias','cafe','coffee']::text[])) WHERE slug='cafeteria';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['petiscos','porcao','bar','bares']::text[])) WHERE slug='porcoes';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['mercados','supermercado','supermercados','mercearia','mercearias','secos e molhados']::text[])) WHERE slug='mercado';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['farmacias','drogaria','drogarias','perfumaria','medicamentos']::text[])) WHERE slug='farmacia';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['restaurantes','comida','almoco','jantar']::text[])) WHERE slug='restaurante';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['floriculturas','flores','buques','florista']::text[])) WHERE slug='floricultura';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['pet shops','petshop','petshops','racao','racoes','animais']::text[])) WHERE slug='petshop';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['hortifrútis','sacolao','sacoloes','verduras','frutas','legumes']::text[])) WHERE slug='hortifruti';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['acougues','carnes','casa de carnes']::text[])) WHERE slug='acougue';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['peixarias','peixes','frutos do mar']::text[])) WHERE slug='peixaria';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['conveniencias','loja de conveniencia']::text[])) WHERE slug='conveniencia';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['cosmetico','cosmeticos','perfumaria','perfumes','beleza']::text[])) WHERE slug='cosmeticos';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['presente','cestas','lembrancas']::text[])) WHERE slug='presentes';
UPDATE public.global_categories SET search_terms=ARRAY(SELECT DISTINCT unnest(search_terms || ARRAY['despacho','despachos','encomenda','encomendas','documentos','coleta']::text[])) WHERE slug='encomendas';
