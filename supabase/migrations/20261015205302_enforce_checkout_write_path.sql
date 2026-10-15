-- Apply only after the RPC-based frontend has been deployed and verified.
-- New checkout functions already run as a checked, transactional entry point.
REVOKE INSERT ON public.orders FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated, anon;
NOTIFY pgrst, 'reload schema';
