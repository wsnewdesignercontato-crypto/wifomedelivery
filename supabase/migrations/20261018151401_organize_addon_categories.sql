ALTER TABLE public.addon_groups ADD COLUMN menu_category_id uuid REFERENCES public.menu_categories(id) ON DELETE SET NULL;
CREATE INDEX addon_groups_category_idx ON public.addon_groups(menu_category_id) WHERE menu_category_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_addon_group_category()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.menu_category_id IS NOT NULL AND NOT EXISTS (
 SELECT FROM public.menu_categories WHERE id=NEW.menu_category_id AND establishment_id=NEW.establishment_id
 ) THEN RAISE EXCEPTION 'A categoria deve pertencer à mesma loja' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_addon_group_category() FROM PUBLIC,anon;
CREATE TRIGGER validate_addon_group_category BEFORE INSERT OR UPDATE OF menu_category_id,establishment_id
 ON public.addon_groups FOR EACH ROW EXECUTE FUNCTION public.validate_addon_group_category();

CREATE OR REPLACE FUNCTION public.save_addon_group_configuration(
 p_establishment_id uuid,p_group_id uuid,p_category_id uuid,p_group jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 saved_id uuid; option_id uuid; entry jsonb; retained uuid[]:='{}';
 group_name text:=btrim(p_group->>'nome'); required boolean;
 minimum integer; maximum integer; amount integer; ordinal integer:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT FROM public.establishments WHERE id=p_establishment_id AND owner_id=auth.uid()) THEN
 RAISE EXCEPTION 'Loja não autorizada' USING ERRCODE='42501'; END IF;
 IF p_category_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.menu_categories WHERE id=p_category_id AND establishment_id=p_establishment_id) THEN
 RAISE EXCEPTION 'Categoria não autorizada' USING ERRCODE='42501'; END IF;
 IF p_group_id IS NOT NULL THEN
  PERFORM 1 FROM public.addon_groups WHERE id=p_group_id AND establishment_id=p_establishment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Grupo não autorizado' USING ERRCODE='42501'; END IF;
 END IF;
 required:=coalesce((p_group->>'obrigatorio')::boolean,false);
 minimum:=coalesce((p_group->>'minimo')::integer,0); maximum:=coalesce((p_group->>'maximo')::integer,1);
 IF jsonb_typeof(p_group) IS DISTINCT FROM 'object' OR group_name IS NULL OR length(group_name)<1 OR length(group_name)>100
 OR minimum<0 OR maximum<0 OR (required AND minimum<1) OR (maximum>0 AND minimum>maximum)
 OR jsonb_typeof(p_group->'itens') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Revise o nome e os limites do grupo'; END IF;
 IF jsonb_array_length(p_group->'itens')<greatest(1,minimum) OR jsonb_array_length(p_group->'itens')>100 THEN
 RAISE EXCEPTION 'Adicione opções suficientes para o mínimo de escolhas'; END IF;
 IF p_group_id IS NULL THEN
  INSERT INTO public.addon_groups(establishment_id,menu_category_id,nome,obrigatorio,minimo,maximo,selecao_multipla)
  VALUES(p_establishment_id,p_category_id,group_name,required,minimum,maximum,maximum<>1) RETURNING id INTO saved_id;
 ELSE
  UPDATE public.addon_groups SET menu_category_id=p_category_id,nome=group_name,obrigatorio=required,minimo=minimum,maximo=maximum,selecao_multipla=maximum<>1
  WHERE id=p_group_id AND establishment_id=p_establishment_id RETURNING id INTO saved_id;
 END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_group->'itens') LOOP
  amount:=(entry->>'preco_extra_cents')::integer;
  IF nullif(btrim(entry->>'nome'),'') IS NULL OR amount IS NULL OR amount<0 THEN RAISE EXCEPTION 'Revise o nome e o preço das opções'; END IF;
  option_id:=nullif(entry->>'id','')::uuid;
  IF option_id IS NULL THEN
   INSERT INTO public.addons(addon_group_id,nome,preco_extra_cents,ordem) VALUES(saved_id,btrim(entry->>'nome'),amount,ordinal) RETURNING id INTO option_id;
  ELSE
   UPDATE public.addons SET nome=btrim(entry->>'nome'),preco_extra_cents=amount,ordem=ordinal WHERE id=option_id AND addon_group_id=saved_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Opção não pertence ao grupo' USING ERRCODE='42501'; END IF;
  END IF;
  retained:=array_append(retained,option_id);ordinal:=ordinal+1;
 END LOOP;
 DELETE FROM public.addons WHERE addon_group_id=saved_id AND NOT(id=ANY(retained));
 RETURN saved_id;
END $$;
REVOKE ALL ON FUNCTION public.save_addon_group_configuration(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_addon_group_configuration(uuid,uuid,uuid,jsonb) TO authenticated;
