
-- Reviews table
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  entregador_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rating_loja smallint NOT NULL CHECK (rating_loja BETWEEN 1 AND 5),
  rating_entregador smallint CHECK (rating_entregador BETWEEN 1 AND 5),
  comentario text CHECK (char_length(comentario) <= 1000),
  problema_reportado boolean NOT NULL DEFAULT false,
  problema_descricao text CHECK (char_length(problema_descricao) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_establishment ON public.reviews(establishment_id);
CREATE INDEX idx_reviews_entregador ON public.reviews(entregador_id);

GRANT SELECT, INSERT ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT ALL ON public.reviews TO service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Public can read reviews (for aggregate/display on establishment pages)
CREATE POLICY "Reviews are publicly readable"
  ON public.reviews FOR SELECT
  USING (true);

-- Only the customer of a delivered order can insert their own review
CREATE POLICY "Customer can review own delivered order"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    cliente_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.cliente_id = auth.uid()
        AND o.status = 'delivered'
        AND o.establishment_id = reviews.establishment_id
    )
  );

-- Trigger: recompute establishments.avaliacao (average) on insert
CREATE OR REPLACE FUNCTION public.recompute_establishment_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.establishments e
    SET avaliacao = COALESCE((
      SELECT ROUND(AVG(rating_loja)::numeric, 2)
        FROM public.reviews r
       WHERE r.establishment_id = NEW.establishment_id
    ), 0)
   WHERE e.id = NEW.establishment_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_reviews_recompute
AFTER INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.recompute_establishment_rating();

-- Enable realtime for live rating updates in the establishment panel
ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
