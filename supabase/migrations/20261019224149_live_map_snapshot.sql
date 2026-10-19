-- One indexed latest point per driver, without a global 500-row history cap.
CREATE FUNCTION public.admin_live_couriers() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.current_account_is_active() OR NOT private.has_role(auth.uid(),'admin') THEN
  RAISE EXCEPTION 'Acesso restrito ao administrador.' USING ERRCODE='42501';
 END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
  'courier_id', c.user_id,'nome',coalesce(nullif(p.nome,''),'Entregador'),
  'status',c.status,'veiculo',c.veiculo,
  'lat',t.lat,'lng',t.lng,'created_at',t.created_at,'order_id',t.order_id
 ) ORDER BY p.nome,c.user_id),'[]'::jsonb)
 FROM public.courier_profiles c
 LEFT JOIN public.profiles p ON p.id=c.user_id
 LEFT JOIN LATERAL (
  SELECT lat,lng,created_at,order_id FROM public.tracking_points
  WHERE courier_id=c.user_id ORDER BY created_at DESC,id DESC LIMIT 1
 ) t ON true
 WHERE c.status IN ('online','ocupado') AND private.is_courier_dispatch_approved(c.user_id));
END $$;
REVOKE ALL ON FUNCTION public.admin_live_couriers() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_live_couriers() TO authenticated;
