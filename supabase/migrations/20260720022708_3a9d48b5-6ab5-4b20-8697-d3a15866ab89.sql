
REVOKE EXECUTE ON FUNCTION public.create_ledger_on_delivered() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ledger_on_delivered() TO service_role;
