
DROP FUNCTION IF EXISTS public.available_couriers();

CREATE OR REPLACE FUNCTION private.available_couriers()
RETURNS TABLE(user_id uuid, nome text, veiculo text, avaliacao numeric, lat double precision, lng double precision, last_seen timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  SELECT cp.user_id, COALESCE(p.nome, 'Entregador'), cp.veiculo, cp.avaliacao, cp.lat, cp.lng, cp.last_seen
  FROM public.courier_profiles cp
  LEFT JOIN public.profiles p ON p.id = cp.user_id
  WHERE cp.status = 'online'
    AND cp.aprovacao = 'approved'
    AND (private.has_role(auth.uid(), 'estabelecimento') OR private.has_role(auth.uid(), 'admin'))
  ORDER BY cp.avaliacao DESC NULLS LAST, cp.last_seen DESC NULLS LAST;
$$;

CREATE OR REPLACE VIEW public.available_couriers AS
  SELECT * FROM private.available_couriers();

GRANT SELECT ON public.available_couriers TO authenticated;
