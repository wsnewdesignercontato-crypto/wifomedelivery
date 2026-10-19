-- Service-role-only PostgREST regression. Install only for an authorized live rehearsal.
-- Invoke through the Data API to retain its safeupdate guard. Cleanup effects roll back.
-- Remove qa_payment_cleanup_rollback_probe() immediately after the rehearsal.
CREATE OR REPLACE FUNCTION public.qa_payment_cleanup_rollback_probe() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; before_real bigint; before_tests bigint; r jsonb;
BEGIN
 SELECT u.id INTO actor FROM auth.users u WHERE u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND private.has_role(u.id,'admin') LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'No active test actor';END IF;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  SELECT count(*) INTO before_real FROM public.orders WHERE NOT is_test;
  SELECT count(*) INTO before_tests FROM private.payment_test_sales;
  r:=public.admin_payment_test('cleanup','{"confirmation":"LIMPAR TESTES"}'::jsonb);
  r:=public.admin_payment_test('cleanup','{"confirmation":"LIMPAR TESTES"}'::jsonb);
  IF (r->>'count')::int<>0 OR jsonb_array_length(r->'testers')<>0 OR EXISTS(SELECT FROM public.orders WHERE is_test) OR (SELECT count(*) FROM public.orders WHERE NOT is_test)<>before_real THEN RAISE EXCEPTION 'Cleanup isolation contract failed';END IF;
  RAISE EXCEPTION 'All cleanup assertions passed' USING ERRCODE='PZ001';
 EXCEPTION WHEN SQLSTATE 'PZ001' THEN
  IF (SELECT count(*) FROM private.payment_test_sales)<>before_tests THEN RAISE EXCEPTION 'Rollback failed';END IF;
  RETURN jsonb_build_object('passed',true,'rolledBack',true);
 END;
END $$;
REVOKE ALL ON FUNCTION public.qa_payment_cleanup_rollback_probe() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qa_payment_cleanup_rollback_probe() TO service_role;
NOTIFY pgrst,'reload schema';
