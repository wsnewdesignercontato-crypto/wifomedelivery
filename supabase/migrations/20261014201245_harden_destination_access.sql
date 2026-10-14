-- Keep administrative audit reads subject to the underlying admin-only RLS.
ALTER VIEW public.vw_admin_audit_logs SET (security_invoker = true);

-- The app uses the authenticated two-argument city RPC. This unused legacy
-- overload accepts an arbitrary user ID and has no ownership check.
REVOKE ALL ON FUNCTION public.set_active_city(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_city(uuid, text, text) TO service_role;

-- Trigger functions are invoked by PostgreSQL, never by browser RPC clients.
REVOKE ALL ON FUNCTION public.notify_couriers_new_ride() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_estab_new_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_courier_vehicle_to_profile() FROM PUBLIC, anon, authenticated;

-- Delivery confirmation already checks courier/admin ownership in its body.
REVOKE ALL ON FUNCTION public.confirm_delivery_code(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_delivery_code(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
