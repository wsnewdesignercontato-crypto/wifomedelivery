CREATE OR REPLACE FUNCTION public.notify_couriers_new_ride()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cidade text;
  v_valor text;
BEGIN
  IF NEW.status NOT IN ('created','broadcasting') THEN RETURN NEW; END IF;

  SELECT e.cidade INTO v_cidade
  FROM public.orders o
  JOIN public.establishments e ON e.id = o.establishment_id
  WHERE o.id = NEW.order_id;

  v_valor := to_char(COALESCE(NEW.valor_entrega_cents,0) / 100.0, 'FM999999990.00');

  INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
  SELECT cp.user_id,
         '🛵 Nova corrida disponível!',
         'Corrida de R$ ' || v_valor || ' disponível agora. Toque para aceitar antes de outro entregador.',
         '/entregador/corridas',
         'entregador'
  FROM public.courier_profiles cp
  WHERE cp.status = 'online'
    AND cp.kyc_status = 'approved'
    AND (
      v_cidade IS NULL
      OR cp.cidade_atuacao IS NULL
      OR lower(btrim(cp.cidade_atuacao)) = lower(btrim(v_cidade))
      OR EXISTS (
        SELECT 1 FROM unnest(COALESCE(cp.cidades_atuacao, ARRAY[]::text[])) c
        WHERE lower(btrim(c)) = lower(btrim(v_cidade))
      )
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_couriers_new_ride ON public.deliveries;
CREATE TRIGGER trg_notify_couriers_new_ride
AFTER INSERT ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.notify_couriers_new_ride();