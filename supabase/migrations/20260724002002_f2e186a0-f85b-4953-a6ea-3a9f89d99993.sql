
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS score_delay_warn_ratio NUMERIC NOT NULL DEFAULT 1.25,
  ADD COLUMN IF NOT EXISTS score_delay_warn_penalty INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS score_delay_severe_ratio NUMERIC NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS score_delay_severe_penalty INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS score_review_bad_max INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS score_review_bad_penalty INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS score_review_regular_rating INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS score_review_regular_penalty INT NOT NULL DEFAULT 3;

CREATE OR REPLACE FUNCTION public.trg_orders_delay_penalty()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  expected INT;
  actual NUMERIC;
  ratio NUMERIC;
  courier_uid UUID;
  penalty INT := 0;
  motivo TEXT;
  cfg RECORD;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    SELECT score_delay_warn_ratio, score_delay_warn_penalty,
           score_delay_severe_ratio, score_delay_severe_penalty
      INTO cfg FROM public.platform_settings WHERE id = 1;

    SELECT COALESCE(NEW.tempo_estimado_min, e.tempo_medio_min, 60)
      INTO expected FROM public.establishments e WHERE e.id = NEW.establishment_id;
    IF expected IS NULL OR expected <= 0 THEN expected := 60; END IF;

    actual := EXTRACT(EPOCH FROM (now() - NEW.created_at))/60.0;
    ratio := actual / expected;

    IF ratio > COALESCE(cfg.score_delay_severe_ratio, 1.5) THEN
      penalty := COALESCE(cfg.score_delay_severe_penalty, 10);
      motivo := 'Atraso severo (' || round(actual)::text || 'min de ' || expected || 'min)';
    ELSIF ratio > COALESCE(cfg.score_delay_warn_ratio, 1.25) THEN
      penalty := COALESCE(cfg.score_delay_warn_penalty, 5);
      motivo := 'Atraso na entrega (' || round(actual)::text || 'min de ' || expected || 'min)';
    END IF;

    IF penalty > 0 THEN
      PERFORM public.apply_score_penalty('establishment', NEW.establishment_id, penalty, motivo, NEW.id);
      SELECT entregador_id INTO courier_uid FROM public.deliveries WHERE order_id = NEW.id;
      IF courier_uid IS NOT NULL THEN
        PERFORM public.apply_score_penalty('courier', courier_uid, penalty, motivo, NEW.id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_reviews_score_penalty()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  courier_uid UUID;
  cfg RECORD;
  bad_max INT;
  bad_pen INT;
  reg_rat INT;
  reg_pen INT;
BEGIN
  SELECT score_review_bad_max, score_review_bad_penalty,
         score_review_regular_rating, score_review_regular_penalty
    INTO cfg FROM public.platform_settings WHERE id = 1;
  bad_max := COALESCE(cfg.score_review_bad_max, 2);
  bad_pen := COALESCE(cfg.score_review_bad_penalty, 10);
  reg_rat := COALESCE(cfg.score_review_regular_rating, 3);
  reg_pen := COALESCE(cfg.score_review_regular_penalty, 3);

  IF NEW.establishment_id IS NOT NULL AND NEW.rating_loja IS NOT NULL THEN
    IF NEW.rating_loja <= bad_max THEN
      PERFORM public.apply_score_penalty('establishment', NEW.establishment_id, bad_pen, 'Avaliação baixa da loja ('||NEW.rating_loja||'★)', NEW.order_id);
    ELSIF NEW.rating_loja = reg_rat THEN
      PERFORM public.apply_score_penalty('establishment', NEW.establishment_id, reg_pen, 'Avaliação regular da loja ('||NEW.rating_loja||'★)', NEW.order_id);
    END IF;
  END IF;

  IF NEW.rating_entregador IS NOT NULL AND NEW.order_id IS NOT NULL THEN
    SELECT entregador_id INTO courier_uid FROM public.deliveries WHERE order_id = NEW.order_id;
    IF courier_uid IS NOT NULL THEN
      IF NEW.rating_entregador <= bad_max THEN
        PERFORM public.apply_score_penalty('courier', courier_uid, bad_pen, 'Avaliação baixa do entregador ('||NEW.rating_entregador||'★)', NEW.order_id);
      ELSIF NEW.rating_entregador = reg_rat THEN
        PERFORM public.apply_score_penalty('courier', courier_uid, reg_pen, 'Avaliação regular do entregador ('||NEW.rating_entregador||'★)', NEW.order_id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
