BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('ef000000-0000-4000-8000-000000000001','freight-owner@example.invalid',now()),
 ('ef000000-0000-4000-8000-000000000002','freight-client@example.invalid',now()),
 ('ef000000-0000-4000-8000-000000000003','freight-courier@example.invalid',now());
SELECT set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000001',true);
INSERT INTO public.establishments(id,owner_id,nome,status,is_open) VALUES
 ('ef000000-0000-4000-8000-000000000004','ef000000-0000-4000-8000-000000000001','Freight rollback fixture','aprovado',true);
SELECT set_config('request.jwt.claim.sub','',true);
INSERT INTO public.orders(id,cliente_id,establishment_id,status,subtotal_cents,frete_cents,total_cents,commission_cents,tipo_entrega)
 VALUES('ef000000-0000-4000-8000-000000000005','ef000000-0000-4000-8000-000000000002','ef000000-0000-4000-8000-000000000004','ready',10000,1000,11000,800,'delivery');
INSERT INTO public.deliveries(order_id,status,entregador_id,valor_entrega_cents)
 VALUES('ef000000-0000-4000-8000-000000000005','accepted','ef000000-0000-4000-8000-000000000003',1000);
DO $$BEGIN
 IF (SELECT courier_commission_cents FROM public.orders WHERE id='ef000000-0000-4000-8000-000000000005')<>80
 OR (SELECT valor_entrega_cents FROM public.deliveries WHERE order_id='ef000000-0000-4000-8000-000000000005')<>920 THEN
   RAISE EXCEPTION 'Freight split mismatch'; END IF;
END $$;
UPDATE public.orders SET status='waiting_courier' WHERE id='ef000000-0000-4000-8000-000000000005';
UPDATE public.orders SET status='courier_assigned' WHERE id='ef000000-0000-4000-8000-000000000005';
UPDATE public.orders SET status='picked_up' WHERE id='ef000000-0000-4000-8000-000000000005';
UPDATE public.orders SET status='on_the_way' WHERE id='ef000000-0000-4000-8000-000000000005';
UPDATE public.orders SET status='delivered' WHERE id='ef000000-0000-4000-8000-000000000005';
DO $$BEGIN
 IF NOT EXISTS(SELECT FROM public.platform_ledger WHERE order_id='ef000000-0000-4000-8000-000000000005'
   AND gross_cents=11000 AND merchant_payout_cents=9200 AND courier_payout_cents=920
   AND courier_commission_cents=80 AND platform_revenue_cents=880 AND status='pending') THEN
   RAISE EXCEPTION 'Freight ledger mismatch'; END IF;
END $$;
SELECT 'courier freight rollback contracts passed' AS result;
ROLLBACK;
