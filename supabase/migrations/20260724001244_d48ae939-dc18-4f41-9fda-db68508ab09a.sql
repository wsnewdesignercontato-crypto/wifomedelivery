
-- 1) Colunas de score
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS score_mensal INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS score_ym TEXT NOT NULL DEFAULT to_char(now(),'YYYY-MM');

ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS score_mensal INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS score_ym TEXT NOT NULL DEFAULT to_char(now(),'YYYY-MM');

-- 2) Histórico de penalidades
CREATE TABLE IF NOT EXISTS public.score_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('establishment','courier')),
  entity_id UUID NOT NULL,
  ym TEXT NOT NULL,
  penalty INT NOT NULL,
  motivo TEXT NOT NULL,
  order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_events_entity ON public.score_events(entity_type, entity_id, ym DESC);

GRANT SELECT ON public.score_events TO authenticated;
GRANT ALL ON public.score_events TO service_role;

ALTER TABLE public.score_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "score_events_admin_all" ON public.score_events;
CREATE POLICY "score_events_admin_all" ON public.score_events
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "score_events_estab_owner_read" ON public.score_events;
CREATE POLICY "score_events_estab_owner_read" ON public.score_events
  FOR SELECT TO authenticated
  USING (
    entity_type = 'establishment'
    AND EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = entity_id AND e.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "score_events_courier_own_read" ON public.score_events;
CREATE POLICY "score_events_courier_own_read" ON public.score_events
  FOR SELECT TO authenticated
  USING (entity_type = 'courier' AND entity_id = auth.uid());

-- 3) Função de penalidade (reseta mês se mudou)
CREATE OR REPLACE FUNCTION public.apply_score_penalty(
  _entity_type TEXT,
  _entity_id UUID,
  _penalty INT,
  _motivo TEXT,
  _order_id UUID DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_ym TEXT := to_char(now(),'YYYY-MM');
BEGIN
  IF _penalty <= 0 THEN RETURN; END IF;

  IF _entity_type = 'establishment' THEN
    UPDATE public.establishments
      SET score_mensal = GREATEST(0, CASE WHEN score_ym <> cur_ym THEN 100 ELSE score_mensal END - _penalty),
          score_ym = cur_ym
      WHERE id = _entity_id;
  ELSIF _entity_type = 'courier' THEN
    UPDATE public.courier_profiles
      SET score_mensal = GREATEST(0, CASE WHEN score_ym <> cur_ym THEN 100 ELSE score_mensal END - _penalty),
          score_ym = cur_ym
      WHERE user_id = _entity_id;
  ELSE
    RETURN;
  END IF;

  INSERT INTO public.score_events(entity_type, entity_id, ym, penalty, motivo, order_id)
  VALUES (_entity_type, _entity_id, cur_ym, _penalty, _motivo, _order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_score_penalty(TEXT, UUID, INT, TEXT, UUID) FROM public;

-- 4) Trigger em reviews: penaliza por má avaliação
CREATE OR REPLACE FUNCTION public.trg_reviews_score_penalty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE courier_uid UUID;
BEGIN
  IF NEW.establishment_id IS NOT NULL AND NEW.rating_loja IS NOT NULL THEN
    IF NEW.rating_loja <= 2 THEN
      PERFORM public.apply_score_penalty('establishment', NEW.establishment_id, 10, 'Avaliação baixa da loja ('||NEW.rating_loja||'★)', NEW.order_id);
    ELSIF NEW.rating_loja = 3 THEN
      PERFORM public.apply_score_penalty('establishment', NEW.establishment_id, 3, 'Avaliação regular da loja (3★)', NEW.order_id);
    END IF;
  END IF;

  IF NEW.rating_entregador IS NOT NULL AND NEW.order_id IS NOT NULL THEN
    SELECT entregador_id INTO courier_uid FROM public.deliveries WHERE order_id = NEW.order_id;
    IF courier_uid IS NOT NULL THEN
      IF NEW.rating_entregador <= 2 THEN
        PERFORM public.apply_score_penalty('courier', courier_uid, 10, 'Avaliação baixa do entregador ('||NEW.rating_entregador||'★)', NEW.order_id);
      ELSIF NEW.rating_entregador = 3 THEN
        PERFORM public.apply_score_penalty('courier', courier_uid, 3, 'Avaliação regular do entregador (3★)', NEW.order_id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_score ON public.reviews;
CREATE TRIGGER trg_reviews_score
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_reviews_score_penalty();

-- 5) Trigger em orders: penaliza por atraso na entrega
CREATE OR REPLACE FUNCTION public.trg_orders_delay_penalty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected INT;
  actual NUMERIC;
  ratio NUMERIC;
  courier_uid UUID;
  penalty INT := 0;
  motivo TEXT;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    SELECT COALESCE(NEW.tempo_estimado_min, e.tempo_medio_min, 60)
      INTO expected FROM public.establishments e WHERE e.id = NEW.establishment_id;
    IF expected IS NULL OR expected <= 0 THEN expected := 60; END IF;

    actual := EXTRACT(EPOCH FROM (now() - NEW.created_at))/60.0;
    ratio := actual / expected;

    IF ratio > 1.5 THEN
      penalty := 10;
      motivo := 'Atraso severo (' || round(actual)::text || 'min de ' || expected || 'min)';
    ELSIF ratio > 1.25 THEN
      penalty := 5;
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
$$;

DROP TRIGGER IF EXISTS trg_orders_delay_score ON public.orders;
CREATE TRIGGER trg_orders_delay_score
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_delay_penalty();
