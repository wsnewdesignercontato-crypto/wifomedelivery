-- Run after the fixture prefix from order-acceptance-flow.sql. Roll back all data.
INSERT INTO public.tracking_points(courier_id,lat,lng,created_at)
 SELECT (SELECT id FROM atomic_delivery_ids WHERE kind='courier'),-20,-46,now()-interval '20 minutes';
INSERT INTO public.tracking_points(courier_id,lat,lng,created_at)
 SELECT (SELECT id FROM atomic_delivery_ids WHERE kind='other_courier'),-21,-47,now()-interval '5 minutes'+i*interval '0.1 second' FROM generate_series(1,510)i;
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; point jsonb; BEGIN
 result:=public.admin_live_couriers();
 SELECT value INTO point FROM jsonb_array_elements(result) WHERE value->>'courier_id'=(SELECT id::text FROM atomic_delivery_ids WHERE kind='courier');
 IF point IS NULL OR (point->>'lat')::numeric<>-20 THEN RAISE EXCEPTION 'FAIL sparse courier hidden behind 500 other points'; END IF;
 SELECT value INTO point FROM jsonb_array_elements(result) WHERE value->>'courier_id'=(SELECT id::text FROM atomic_delivery_ids WHERE kind='other_courier');
 IF point IS NULL OR (point->>'lng')::numeric<>-47 THEN RAISE EXCEPTION 'FAIL second driver missing'; END IF;
END $$;

SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='courier'),'role','authenticated')::text,true);
INSERT INTO public.tracking_points(courier_id,lat,lng,accuracy) SELECT id,-22,-48,10 FROM atomic_delivery_ids WHERE kind='courier';
UPDATE public.courier_profiles SET lat=-22,lng=-48,last_seen=now() WHERE user_id=(SELECT id FROM atomic_delivery_ids WHERE kind='courier');
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='admin'),'role','authenticated')::text,true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(public.admin_live_couriers()) WHERE value->>'courier_id'=(SELECT id::text FROM atomic_delivery_ids WHERE kind='courier') AND (value->>'lat')::numeric=-22) THEN RAISE EXCEPTION 'FAIL new courier point not visible to admin'; END IF;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='customer'),'role','authenticated')::text,true);
DO $$ BEGIN
 BEGIN PERFORM public.admin_live_couriers(); RAISE EXCEPTION 'FAIL customer read admin GPS'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='owner'),'role','authenticated')::text,true);
UPDATE public.establishments SET lat=-20,lng=-46 WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='store');
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM public.establishments WHERE id=(SELECT id FROM atomic_delivery_ids WHERE kind='store') AND lat=-20 AND lng=-46) THEN RAISE EXCEPTION 'FAIL owner location not persisted'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM atomic_delivery_ids WHERE kind='admin'),'role','authenticated')::text,true);
UPDATE public.courier_profiles SET status='offline' WHERE user_id=(SELECT id FROM atomic_delivery_ids WHERE kind='courier');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT FROM jsonb_array_elements(public.admin_live_couriers()) WHERE value->>'courier_id'=(SELECT id::text FROM atomic_delivery_ids WHERE kind='courier')) THEN RAISE EXCEPTION 'FAIL offline driver still shown online'; END IF;
 IF has_function_privilege('anon','public.admin_live_couriers()','EXECUTE') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
END $$;
RESET ROLE;
