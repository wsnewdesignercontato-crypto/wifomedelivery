
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS codigo_entrega text;

CREATE OR REPLACE FUNCTION public.set_delivery_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.codigo_entrega IS NULL THEN
    NEW.codigo_entrega := lpad((floor(random()*10000))::int::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_delivery_code ON public.orders;
CREATE TRIGGER trg_set_delivery_code BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_delivery_code();

UPDATE public.orders SET codigo_entrega = lpad((floor(random()*10000))::int::text, 4, '0') WHERE codigo_entrega IS NULL;
