BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
('cf000000-0000-4000-8000-000000000001','checkout-customer@example.invalid',now(),'{}'),
('cf000000-0000-4000-8000-000000000002','checkout-owner@example.invalid',now(),'{}');
INSERT INTO public.establishments(id,owner_id,nome,status,is_open) VALUES
('cf000000-0000-4000-8000-000000000003','cf000000-0000-4000-8000-000000000002','AUDIT ROLLBACK ONLY','aprovado',true);
INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque) VALUES
('cf000000-0000-4000-8000-000000000004','cf000000-0000-4000-8000-000000000003','AUDIT ROLLBACK ONLY',1000,10);
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES
('cf000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000003','cf000000-0000-4000-8000-000000000004','Altered price',1,2);
INSERT INTO public.coupons(code,type,value_cents,usage_limit) VALUES('AUDIT-ROLLBACK-20261015','fixed',500,1);
SELECT set_config('request.jwt.claim.sub','cf000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE q jsonb; r jsonb; repeated jsonb; BEGIN
 q:=public.quote_checkout('cf000000-0000-4000-8000-000000000003','pickup','AUDIT-ROLLBACK-20261015');
 IF (q->>'subtotal_cents')::int<>2000 OR (q->>'total_cents')::int<>1500 THEN RAISE EXCEPTION 'FAIL canonical price/discount'; END IF;
 BEGIN
  PERFORM public.submit_checkout('cf000000-0000-4000-8000-000000000003','carteira','pickup',NULL,NULL,'AUDIT-ROLLBACK-20261015','cf000000-0000-4000-8000-000000000005',q->>'fingerprint');
  RAISE EXCEPTION 'FAIL wallet accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 r:=public.submit_checkout('cf000000-0000-4000-8000-000000000003','dinheiro','pickup',NULL,NULL,'AUDIT-ROLLBACK-20261015','cf000000-0000-4000-8000-000000000005',q->>'fingerprint');
 repeated:=public.submit_checkout('cf000000-0000-4000-8000-000000000003','dinheiro','pickup',NULL,NULL,'AUDIT-ROLLBACK-20261015','cf000000-0000-4000-8000-000000000005',q->>'fingerprint');
 IF r<>repeated THEN RAISE EXCEPTION 'FAIL idempotency'; END IF;
 PERFORM set_config('audit.order_id',r->>'order_id',true);
END $$;
RESET ROLE;
DO $$ DECLARE oid uuid:=current_setting('audit.order_id')::uuid; BEGIN
 IF (SELECT count(*) FROM public.orders WHERE cliente_id='cf000000-0000-4000-8000-000000000001')<>1
 OR (SELECT estoque FROM public.products WHERE id='cf000000-0000-4000-8000-000000000004')<>8
 OR (SELECT used_count FROM public.coupons WHERE code='AUDIT-ROLLBACK-20261015')<>1
 OR EXISTS(SELECT FROM public.cart_items WHERE user_id='cf000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'FAIL checkout persistence'; END IF;
 UPDATE public.orders SET status='cancelled' WHERE id=oid;
 UPDATE public.orders SET status='refunded' WHERE id=oid;
 IF (SELECT estoque FROM public.products WHERE id='cf000000-0000-4000-8000-000000000004')<>10
 OR (SELECT used_count FROM public.coupons WHERE code='AUDIT-ROLLBACK-20261015')<>0 THEN RAISE EXCEPTION 'FAIL reservation restoration'; END IF;
END $$;
ROLLBACK;
SELECT jsonb_build_object('smoke','passed','test_users_remaining',(SELECT count(*) FROM auth.users WHERE id IN ('cf000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000002')),'test_orders_remaining',(SELECT count(*) FROM public.orders WHERE cliente_id='cf000000-0000-4000-8000-000000000001')) AS result;