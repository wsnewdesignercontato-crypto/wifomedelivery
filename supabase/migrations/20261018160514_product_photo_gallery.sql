-- Preserve the existing cover and allow two optional extra photos.
ALTER TABLE public.products ADD COLUMN fotos_adicionais text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.products ADD CONSTRAINT products_two_extra_photos CHECK (
 cardinality(fotos_adicionais)<=2 AND (cardinality(fotos_adicionais)=0 OR array_ndims(fotos_adicionais)=1)
 AND array_position(fotos_adicionais,NULL) IS NULL AND array_position(fotos_adicionais,'') IS NULL
);
COMMENT ON COLUMN public.products.fotos_adicionais IS 'Up to two optional photos, displayed after foto_url. Existing clients preserve these when omitted.';

CREATE OR REPLACE FUNCTION public.save_product_configuration(
 p_product_id uuid,p_product jsonb,p_variant_changes jsonb,p_group_ids uuid[],p_new_groups jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 item public.products%ROWTYPE; saved_product_id uuid; shop_id uuid; category_id uuid;
 group_data jsonb; option_data jsonb; variant_data jsonb; group_id uuid;
 required boolean; min_choices integer; max_choices integer; amount integer; ordinal integer;
 linked uuid[]:=coalesce(p_group_ids,'{}'); variant_id uuid; changed integer;
BEGIN
 IF auth.uid() IS NULL OR jsonb_typeof(p_product) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Produto inválido'; END IF;
 shop_id:=(p_product->>'establishment_id')::uuid;
 IF NOT EXISTS(SELECT FROM public.establishments WHERE id=shop_id AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Loja não autorizada' USING ERRCODE='42501'; END IF;
 IF p_product_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.products WHERE id=p_product_id AND establishment_id=shop_id) THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
 item:=jsonb_populate_record(NULL::public.products,p_product);
 category_id:=item.menu_category_id;
 IF category_id IS NULL OR NOT EXISTS(SELECT FROM public.menu_categories WHERE id=category_id AND establishment_id=shop_id) THEN RAISE EXCEPTION 'Escolha uma categoria da sua loja'; END IF;
 IF nullif(btrim(item.nome),'') IS NULL OR length(item.nome)>200 OR item.preco_cents IS NULL OR item.preco_cents<0
 OR (item.preco_promo_cents IS NOT NULL AND (item.preco_promo_cents<0 OR item.preco_promo_cents>item.preco_cents))
 OR (item.estoque IS NOT NULL AND item.estoque<0) OR (item.tempo_preparo_min IS NOT NULL AND item.tempo_preparo_min<0) THEN RAISE EXCEPTION 'Revise o nome, preços, estoque e tempo de preparo'; END IF;
 IF jsonb_typeof(p_variant_changes) IS DISTINCT FROM 'array' OR jsonb_typeof(p_new_groups) IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_new_groups)>30 OR jsonb_array_length(p_variant_changes)>100 OR cardinality(linked)>100 THEN RAISE EXCEPTION 'Configuração inválida'; END IF;
 IF EXISTS(SELECT FROM unnest(linked) AS requested(group_id) WHERE NOT EXISTS(SELECT FROM public.addon_groups g WHERE g.id=requested.group_id AND g.establishment_id=shop_id)) THEN
 RAISE EXCEPTION 'Grupo de adicionais não pertence à loja' USING ERRCODE='42501'; END IF;
 IF p_product_id IS NULL THEN
 INSERT INTO public.products(establishment_id,nome,descricao,preco_cents,preco_promo_cents,foto_url,fotos_adicionais,menu_category_id,estoque,tempo_preparo_min,disponivel)
 VALUES(shop_id,btrim(item.nome),item.descricao,item.preco_cents,item.preco_promo_cents,item.foto_url,coalesce(item.fotos_adicionais,'{}'),category_id,item.estoque,item.tempo_preparo_min,coalesce(item.disponivel,true)) RETURNING id INTO saved_product_id;
 ELSE
 UPDATE public.products SET nome=btrim(item.nome),descricao=item.descricao,preco_cents=item.preco_cents,preco_promo_cents=item.preco_promo_cents,foto_url=item.foto_url,fotos_adicionais=CASE WHEN p_product ? 'fotos_adicionais' THEN coalesce(item.fotos_adicionais,'{}') ELSE fotos_adicionais END,menu_category_id=category_id,estoque=item.estoque,tempo_preparo_min=item.tempo_preparo_min,disponivel=coalesce(item.disponivel,true)
 WHERE id=p_product_id AND establishment_id=shop_id RETURNING id INTO saved_product_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum produto foi atualizado'; END IF;
 END IF;
 FOR group_data IN SELECT value FROM jsonb_array_elements(p_new_groups) LOOP
  required:=coalesce((group_data->>'obrigatorio')::boolean,false);
  min_choices:=coalesce((group_data->>'minimo')::integer,0);
  max_choices:=coalesce((group_data->>'maximo')::integer,1);
  IF nullif(btrim(group_data->>'nome'),'') IS NULL OR min_choices<0 OR max_choices<0
    OR (required AND min_choices<1) OR (max_choices>0 AND max_choices<min_choices)
    OR jsonb_typeof(group_data->'itens') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Revise os limites e o nome dos adicionais'; END IF;
  IF jsonb_array_length(group_data->'itens')<greatest(1,min_choices) OR jsonb_array_length(group_data->'itens')>100 THEN RAISE EXCEPTION 'Adicione opções suficientes para o mínimo de escolhas'; END IF;
  INSERT INTO public.addon_groups(establishment_id,nome,obrigatorio,minimo,maximo,selecao_multipla)
  VALUES(shop_id,btrim(group_data->>'nome'),required,min_choices,max_choices,max_choices<>1) RETURNING id INTO group_id;
  ordinal:=0;
  FOR option_data IN SELECT value FROM jsonb_array_elements(group_data->'itens') LOOP
   amount:=(option_data->>'preco_extra_cents')::integer;
   IF nullif(btrim(option_data->>'nome'),'') IS NULL OR amount IS NULL OR amount<0 THEN RAISE EXCEPTION 'Opção ou preço adicional inválido'; END IF;
   INSERT INTO public.addons(addon_group_id,nome,preco_extra_cents,ordem)
    VALUES(group_id,btrim(option_data->>'nome'),amount,ordinal);
   ordinal:=ordinal+1;
  END LOOP;
  linked:=array_append(linked,group_id);
 END LOOP;
 DELETE FROM public.product_addon_groups WHERE product_id=saved_product_id;
 INSERT INTO public.product_addon_groups(product_id,addon_group_id,ordem)
 SELECT saved_product_id,id,(row_number() OVER())::integer FROM (SELECT DISTINCT unnest(linked) AS id) chosen;
 FOR variant_data IN SELECT value FROM jsonb_array_elements(p_variant_changes) LOOP
  variant_id:=nullif(variant_data->>'id','')::uuid;
  IF variant_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.product_variants WHERE id=variant_id AND product_variants.product_id=saved_product_id) THEN RAISE EXCEPTION 'Variação não pertence ao produto' USING ERRCODE='42501'; END IF;
  IF coalesce((variant_data->>'_deleted')::boolean,false) THEN
   IF variant_id IS NOT NULL THEN DELETE FROM public.product_variants WHERE id=variant_id; END IF;
   CONTINUE;
  END IF;
  amount:=(variant_data->>'preco_cents')::integer;
  IF nullif(btrim(variant_data->>'nome'),'') IS NULL OR amount IS NULL OR amount<0 THEN RAISE EXCEPTION 'Revise o nome e preço das variações'; END IF;
  IF variant_id IS NULL THEN
   INSERT INTO public.product_variants(product_id,nome,preco_cents,ativo,ordem) VALUES(saved_product_id,btrim(variant_data->>'nome'),amount,coalesce((variant_data->>'ativo')::boolean,true),coalesce((variant_data->>'ordem')::integer,0));
  ELSE
   UPDATE public.product_variants SET nome=btrim(variant_data->>'nome'),preco_cents=amount,ativo=coalesce((variant_data->>'ativo')::boolean,true),ordem=coalesce((variant_data->>'ordem')::integer,0) WHERE id=variant_id;
   GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>1 THEN RAISE EXCEPTION 'A variação não foi atualizada'; END IF;
  END IF;
 END LOOP;
 RETURN saved_product_id;
END $$;
REVOKE ALL ON FUNCTION public.save_product_configuration(uuid,jsonb,jsonb,uuid[],jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_product_configuration(uuid,jsonb,jsonb,uuid[],jsonb) TO authenticated;
