BEGIN;
INSERT INTO public.establishments(id,owner_id,nome,status,is_open,taxa_entrega_cents,pedido_minimo_cents)
VALUES('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Teste','aprovado',true,500,0);
INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque) VALUES
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Produto',3000,10);
INSERT INTO public.cart_items(id,user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade)
VALUES('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
'20000000-0000-4000-8000-000000000001','Preço adulterado',1,2);
INSERT INTO public.coupons(id,code,type,value_cents,usage_limit) VALUES('50000000-0000-4000-8000-000000000001','TEST','fixed',500,1);
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
DO $$
DECLARE q jsonb; res jsonb; same jsonb; oid uuid;
BEGIN
  q:=public.quote_checkout('10000000-0000-4000-8000-000000000001','pickup','TEST');
  IF (q->>'subtotal_cents')::integer<>6000 OR (q->>'total_cents')::integer<>5500 THEN RAISE EXCEPTION 'FAIL authoritative pricing/coupon'; END IF;
  BEGIN
    PERFORM public.submit_checkout('10000000-0000-4000-8000-000000000001','carteira','pickup',NULL,NULL,'TEST','60000000-0000-4000-8000-000000000001',q->>'fingerprint');
    RAISE EXCEPTION 'FAIL wallet accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.submit_checkout('10000000-0000-4000-8000-000000000001','dinheiro','pickup',NULL,NULL,'TEST','60000000-0000-4000-8000-000000000001','wrong');
    RAISE EXCEPTION 'FAIL stale quote accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  res:=public.submit_checkout('10000000-0000-4000-8000-000000000001','dinheiro','pickup',NULL,NULL,'TEST','60000000-0000-4000-8000-000000000001',q->>'fingerprint');
  same:=public.submit_checkout('10000000-0000-4000-8000-000000000001','dinheiro','pickup',NULL,NULL,'TEST','60000000-0000-4000-8000-000000000001',q->>'fingerprint');
  IF res<>same OR (SELECT count(*) FROM public.orders)<>1 THEN RAISE EXCEPTION 'FAIL idempotency'; END IF;
  oid:=(res->>'order_id')::uuid;
  IF (SELECT count(*) FROM public.cart_items)<>0 OR (SELECT count(*) FROM public.order_items WHERE order_id=oid)<>1
    OR (SELECT estoque FROM public.products LIMIT 1)<>8 OR (SELECT used_count FROM public.coupons LIMIT 1)<>1 THEN RAISE EXCEPTION 'FAIL transaction'; END IF;
  -- Cancelling returns the reservation; refund must not return it twice.
  UPDATE public.orders SET status='cancelled' WHERE id=oid;
  UPDATE public.orders SET status='refunded' WHERE id=oid;
  IF (SELECT estoque FROM public.products LIMIT 1)<>10 OR (SELECT used_count FROM public.coupons LIMIT 1)<>0 THEN RAISE EXCEPTION 'FAIL reservation release'; END IF;
END $$;
-- Refill cart and prove aggregate stock / unavailable store handling.
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade)
VALUES('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Produto',1,11);
DO $$ BEGIN
  BEGIN PERFORM public.quote_checkout('10000000-0000-4000-8000-000000000001','pickup',NULL); RAISE EXCEPTION 'FAIL insufficient stock';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
END $$;
UPDATE public.cart_items SET quantidade=1;
UPDATE public.establishments SET is_open=false;
DO $$ BEGIN
  BEGIN PERFORM public.quote_checkout('10000000-0000-4000-8000-000000000001','pickup',NULL); RAISE EXCEPTION 'FAIL closed shop';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
END $$;
UPDATE public.establishments SET is_open=true;
-- Verify permissions as an actual browser role, not the migration owner.
INSERT INTO public.courier_profiles(user_id,status,aprovacao,kyc_status)
VALUES('40000000-0000-4000-8000-000000000001','pendente','em_analise','pending');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN UPDATE public.courier_profiles SET aprovacao='approved'; RAISE EXCEPTION 'FAIL self approval';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  BEGIN INSERT INTO public.orders(cliente_id,establishment_id,total_cents)
    VALUES(auth.uid(),'10000000-0000-4000-8000-000000000001',1); RAISE EXCEPTION 'FAIL direct insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN UPDATE public.establishments SET status='aprovado',kyc_status='approved'; RAISE EXCEPTION 'FAIL owner review change';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
ROLLBACK;
