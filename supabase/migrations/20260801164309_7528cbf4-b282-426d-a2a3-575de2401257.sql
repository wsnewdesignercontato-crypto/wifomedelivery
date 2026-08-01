CREATE OR REPLACE FUNCTION public.notify_estab_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_total text;
BEGIN
  SELECT owner_id INTO v_owner FROM public.establishments WHERE id = NEW.establishment_id;
  IF v_owner IS NULL THEN RETURN NEW; END IF;
  v_total := to_char(NEW.total_cents / 100.0, 'FM999999990.00');
  INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
  VALUES (
    v_owner,
    '🛎️ Novo pedido recebido!',
    'Você recebeu um novo pedido de R$ ' || v_total || '. Toque para aceitar e começar o preparo.',
    '/estabelecimento/pedidos',
    'estabelecimento'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_estab_new_order ON public.orders;
CREATE TRIGGER trg_notify_estab_new_order
AFTER INSERT ON public.orders
FOR EACH ROW
WHEN (NEW.status = 'placed')
EXECUTE FUNCTION public.notify_estab_new_order();