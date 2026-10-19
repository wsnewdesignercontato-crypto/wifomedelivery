-- Keep recipient rules, accepting equivalent accented city spellings.
CREATE OR REPLACE FUNCTION public.notify_couriers_new_ride()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE city text; amount text;
BEGIN
 IF NEW.status<>'broadcasting' OR (TG_OP='UPDATE' AND OLD.status=NEW.status) THEN RETURN NEW; END IF;
 SELECT e.cidade INTO city FROM public.orders o JOIN public.establishments e ON e.id=o.establishment_id WHERE o.id=NEW.order_id;
 amount:=to_char(coalesce(NEW.valor_entrega_cents,0)/100.0,'FM999999990.00');
 INSERT INTO public.notifications(user_id,titulo,mensagem,link_url,audience)
 SELECT cp.user_id,'Nova corrida disponível!','Corrida de R$ '||amount||' disponível. O primeiro entregador a aceitar fica com a corrida.','/entregador/corridas','entregador'
 FROM public.courier_profiles cp
 WHERE cp.status='online' AND private.is_courier_dispatch_approved(cp.user_id)
 AND (NEW.entregador_id IS NULL OR NEW.entregador_id=cp.user_id)
 AND NOT EXISTS(SELECT FROM public.deliveries d WHERE d.entregador_id=cp.user_id AND d.status IN ('accepted','to_store','at_store','picked_up','to_customer','at_customer'))
 AND (city IS NULL OR cp.cidade_atuacao IS NULL OR public.normalize_delivery_text(btrim(cp.cidade_atuacao))=public.normalize_delivery_text(btrim(city))
  OR EXISTS(SELECT FROM unnest(coalesce(cp.cidades_atuacao,ARRAY[]::text[])) c WHERE public.normalize_delivery_text(btrim(c))=public.normalize_delivery_text(btrim(city))));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_couriers_new_ride() FROM PUBLIC,anon,authenticated;
