-- Only new orders receive a response deadline; existing live orders are preserved.
ALTER TABLE public.orders ADD COLUMN acceptance_deadline timestamptz;
GRANT SELECT (acceptance_deadline) ON public.orders TO authenticated;
CREATE INDEX orders_pending_acceptance_deadline_idx ON public.orders(acceptance_deadline)
 WHERE status='placed' AND acceptance_deadline IS NOT NULL;

CREATE FUNCTION private.guard_order_acceptance_deadline() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.acceptance_deadline:=clock_timestamp()+interval '60 seconds';
 ELSE
  IF NEW.acceptance_deadline IS DISTINCT FROM OLD.acceptance_deadline THEN
   RAISE EXCEPTION 'O prazo de resposta é controlado pelo servidor' USING ERRCODE='42501';
  END IF;
  IF OLD.status='placed' AND NEW.status='accepted' AND OLD.acceptance_deadline<=clock_timestamp() THEN
   RAISE EXCEPTION 'O prazo para aceitar este pedido expirou. Atualize a lista.' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_order_acceptance_deadline() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_order_acceptance_deadline BEFORE INSERT OR UPDATE ON public.orders
 FOR EACH ROW EXECUTE FUNCTION private.guard_order_acceptance_deadline();

-- Internal-only commands: no customer, merchant or courier may expire arbitrary orders.
CREATE FUNCTION private.expire_unaccepted_order(p_order_id uuid,p_now timestamptz DEFAULT clock_timestamp())
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.status<>'placed' OR o.acceptance_deadline IS NULL OR o.acceptance_deadline>p_now THEN RETURN false; END IF;
 UPDATE public.orders SET status='cancelled',
  cancellation_reason='O estabelecimento não respondeu ao pedido dentro de 1 minuto.',
  cancelled_role='sistema',cancelled_by=NULL,cancelled_at=clock_timestamp()
 WHERE id=o.id;
 -- Existing cancellation triggers restore inventory/coupon usage and notify the customer.
 RETURN true;
END $$;
CREATE FUNCTION private.expire_unaccepted_orders() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record; expired integer:=0;
BEGIN
 FOR candidate IN SELECT id FROM public.orders
  WHERE status='placed' AND acceptance_deadline<=clock_timestamp()
  ORDER BY acceptance_deadline FOR UPDATE SKIP LOCKED LIMIT 100
 LOOP
  IF private.expire_unaccepted_order(candidate.id) THEN expired:=expired+1; END IF;
 END LOOP;
 RETURN expired;
END $$;
REVOKE ALL ON FUNCTION private.expire_unaccepted_order(uuid,timestamptz),private.expire_unaccepted_orders() FROM PUBLIC,anon,authenticated,service_role;

-- Include the reason in the existing status notification, without creating a second notice.
CREATE OR REPLACE FUNCTION public.notify_client_on_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE msg text;
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  msg:=CASE NEW.status
   WHEN 'accepted' THEN 'Sua loja aceitou o pedido!'
   WHEN 'preparing' THEN 'Seu pedido está em preparo.'
   WHEN 'ready' THEN 'Seu pedido está pronto.'
   WHEN 'courier_assigned' THEN 'Um entregador aceitou seu pedido.'
   WHEN 'picked_up' THEN 'Pedido coletado pelo entregador.'
   WHEN 'on_the_way' THEN 'Seu pedido está a caminho!'
   WHEN 'arriving' THEN 'O entregador está chegando.'
   WHEN 'delivered' THEN 'Pedido entregue. Bom apetite!'
   WHEN 'cancelled' THEN coalesce(nullif(NEW.cancellation_reason,''),'Pedido cancelado.')
   WHEN 'refunded' THEN 'Pedido reembolsado.' ELSE NULL END;
  IF msg IS NOT NULL THEN
   INSERT INTO public.notifications(user_id,titulo,mensagem,link_url,audience)
   VALUES(NEW.cliente_id,'Atualização do pedido',msg,'/cliente/pedido/'||NEW.id::text,'cliente');
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_client_on_status() FROM PUBLIC,anon,authenticated;

-- Notify each approved, online, available courier in the existing service area.
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
 AND (city IS NULL OR cp.cidade_atuacao IS NULL OR lower(btrim(cp.cidade_atuacao))=lower(btrim(city))
  OR EXISTS(SELECT FROM unnest(coalesce(cp.cidades_atuacao,ARRAY[]::text[])) c WHERE lower(btrim(c))=lower(btrim(city))));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_couriers_new_ride() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_notify_couriers_new_ride ON public.deliveries;
CREATE TRIGGER trg_notify_couriers_new_ride AFTER INSERT OR UPDATE OF status ON public.deliveries
 FOR EACH ROW EXECUTE FUNCTION public.notify_couriers_new_ride();

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('pedetrem-expire-unaccepted-orders','10 seconds','SELECT private.expire_unaccepted_orders()');
NOTIFY pgrst,'reload schema';
