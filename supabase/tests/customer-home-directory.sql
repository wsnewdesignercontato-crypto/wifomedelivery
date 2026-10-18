BEGIN;
SELECT set_config('test.expected_stores',(SELECT count(*)::text FROM public.establishments WHERE status='aprovado'),true);
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.customer_store_directory(NULL,NULL)) <> current_setting('test.expected_stores')::integer THEN RAISE EXCEPTION 'Anonymous directory hid approved stores'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.customer_store_directory(NULL,NULL)) <> current_setting('test.expected_stores')::integer THEN RAISE EXCEPTION 'Authenticated directory hid approved stores'; END IF;
END $$;
RESET ROLE;
SELECT 'accented_city' as kind,(SELECT count(*) FROM public.establishments WHERE status='aprovado' AND is_open AND cidade ILIKE 'São Sebastião do Paraíso') AS old_count,(SELECT count(*) FROM public.customer_store_directory('São Sebastião do Paraíso','MG')) AS fixed_count
UNION ALL SELECT 'trailing_spaces_and_closed',(SELECT count(*) FROM public.establishments WHERE status='aprovado' AND is_open AND cidade ILIKE 'Ribeirão Preto'),(SELECT count(*) FROM public.customer_store_directory('Ribeirão Preto','SP'));
ROLLBACK;