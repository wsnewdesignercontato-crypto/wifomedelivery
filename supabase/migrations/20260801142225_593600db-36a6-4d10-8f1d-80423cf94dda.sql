CREATE OR REPLACE FUNCTION public.sync_courier_vehicle_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
BEGIN
  SELECT tipo, placa INTO v
  FROM public.courier_vehicles
  WHERE courier_id = COALESCE(NEW.courier_id, OLD.courier_id)
  ORDER BY ativo DESC, created_at DESC
  LIMIT 1;

  IF v IS NOT NULL THEN
    UPDATE public.courier_profiles
      SET veiculo = COALESCE(NULLIF(v.tipo,''), veiculo),
          placa = COALESCE(NULLIF(v.placa,''), placa),
          updated_at = now()
      WHERE user_id = COALESCE(NEW.courier_id, OLD.courier_id);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_courier_vehicle ON public.courier_vehicles;
CREATE TRIGGER trg_sync_courier_vehicle
AFTER INSERT OR UPDATE OR DELETE ON public.courier_vehicles
FOR EACH ROW EXECUTE FUNCTION public.sync_courier_vehicle_to_profile();

UPDATE public.courier_profiles cp
SET veiculo = COALESCE(NULLIF(cp.veiculo,''), v.tipo),
    placa = COALESCE(NULLIF(cp.placa,''), v.placa)
FROM (
  SELECT DISTINCT ON (courier_id) courier_id, tipo, placa
  FROM public.courier_vehicles
  ORDER BY courier_id, ativo DESC, created_at DESC
) v
WHERE v.courier_id = cp.user_id;