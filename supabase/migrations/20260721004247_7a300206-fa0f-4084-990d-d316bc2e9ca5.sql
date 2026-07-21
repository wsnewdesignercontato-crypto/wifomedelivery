-- Ensure client status notifications are tagged for cliente audience only
CREATE OR REPLACE FUNCTION public.notify_client_on_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  msg TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    msg := CASE NEW.status
      WHEN 'accepted' THEN 'Sua loja aceitou o pedido!'
      WHEN 'preparing' THEN 'Seu pedido está em preparo.'
      WHEN 'ready' THEN 'Seu pedido está pronto.'
      WHEN 'courier_assigned' THEN 'Um entregador aceitou seu pedido.'
      WHEN 'picked_up' THEN 'Pedido coletado pelo entregador.'
      WHEN 'on_the_way' THEN 'Seu pedido está a caminho!'
      WHEN 'arriving' THEN 'O entregador está chegando.'
      WHEN 'delivered' THEN 'Pedido entregue. Bom apetite!'
      WHEN 'cancelled' THEN 'Pedido cancelado.'
      WHEN 'refunded' THEN 'Pedido reembolsado.'
      ELSE NULL
    END;
    IF msg IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
      VALUES (NEW.cliente_id, 'Atualização do pedido', msg, '/cliente/pedido/' || NEW.id::text, 'cliente');
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Tag any existing untagged client order notifications so courier feeds stop showing them
UPDATE public.notifications
   SET audience = 'cliente'
 WHERE audience IS NULL
   AND link_url LIKE '/cliente/pedido/%';

-- Backfill delivery codes for any orders missing one so the courier flow can require it
UPDATE public.orders
   SET codigo_entrega = lpad((floor(random()*10000))::int::text, 4, '0')
 WHERE codigo_entrega IS NULL;