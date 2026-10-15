BEGIN;
INSERT INTO public.establishments(id,owner_id,nome,status,is_open) VALUES
('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Loja','aprovado',true);
INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque) VALUES
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Produto',1000,10);
INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Produto',1,1);
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
-- A real PostgreSQL exception in item insertion must roll back all prior writes.
CREATE FUNCTION public.test_reject_items() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test item failure'; END $$;
CREATE TRIGGER test_reject_items BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.test_reject_items();
DO $$ DECLARE q jsonb; BEGIN
  q:=public.quote_checkout('10000000-0000-4000-8000-000000000001','pickup',NULL);
  BEGIN
    PERFORM public.submit_checkout('10000000-0000-4000-8000-000000000001','dinheiro','pickup',NULL,NULL,NULL,'60000000-0000-4000-8000-000000000001',q->>'fingerprint');
    RAISE EXCEPTION 'FAIL injected failure';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'test item failure' THEN RAISE; END IF; END;
  IF EXISTS(SELECT FROM public.orders) OR (SELECT estoque FROM public.products LIMIT 1)<>10
    OR (SELECT count(*) FROM public.cart_items)<>1 THEN RAISE EXCEPTION 'FAIL atomic rollback'; END IF;
END $$;
DROP TRIGGER test_reject_items ON public.order_items;
DROP FUNCTION public.test_reject_items();
-- Required groups, canonical extras, stock aggregated across custom lines.
INSERT INTO public.addon_groups(id,establishment_id,nome,obrigatorio,minimo,maximo) VALUES
('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Opção',true,1,1);
INSERT INTO public.product_addon_groups(product_id,addon_group_id) VALUES
('20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001');
INSERT INTO public.addons(id,addon_group_id,nome,preco_extra_cents,estoque) VALUES
('80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','Extra',500,1);
DO $$ BEGIN
  BEGIN PERFORM public.quote_checkout('10000000-0000-4000-8000-000000000001','pickup',NULL); RAISE EXCEPTION 'FAIL missing required extra';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
END $$;
UPDATE public.cart_items SET addons='[{"id":"80000000-0000-4000-8000-000000000001","preco_extra_cents":1}]';
DO $$ DECLARE q jsonb; BEGIN
  q:=public.quote_checkout('10000000-0000-4000-8000-000000000001','pickup',NULL);
  IF (q->>'total_cents')::integer<>1500 THEN RAISE EXCEPTION 'FAIL authoritative addon'; END IF;
END $$;
UPDATE public.cart_items SET addons=addons||addons;
DO $$ BEGIN
  BEGIN PERFORM public.quote_checkout('10000000-0000-4000-8000-000000000001','pickup',NULL); RAISE EXCEPTION 'FAIL duplicate extra';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
END $$;
UPDATE public.cart_items SET addons='[{"id":"80000000-0000-4000-8000-000000000001"}]',quantidade=2;
DO $$ BEGIN
  BEGIN PERFORM public.quote_checkout('10000000-0000-4000-8000-000000000001','pickup',NULL); RAISE EXCEPTION 'FAIL extra stock';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
END $$;
UPDATE public.cart_items SET quantidade=1;
INSERT INTO public.coupons(code,type,value_cents,usage_limit,used_count) VALUES('EXHAUSTED','fixed',100,1,1);
DO $$ BEGIN
  BEGIN PERFORM public.quote_checkout('10000000-0000-4000-8000-000000000001','pickup','EXHAUSTED'); RAISE EXCEPTION 'FAIL exhausted coupon';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
END $$;
-- Purchase with canonical extras, then cancel and restore both reservations.
DO $$ DECLARE q jsonb; result jsonb; oid uuid; BEGIN
  q:=public.quote_checkout('10000000-0000-4000-8000-000000000001','pickup',NULL);
  result:=public.submit_checkout('10000000-0000-4000-8000-000000000001','dinheiro','pickup',NULL,NULL,NULL,
    '60000000-0000-4000-8000-000000000002',q->>'fingerprint');
  oid:=(result->>'order_id')::uuid;
  IF (SELECT estoque FROM public.addons LIMIT 1)<>0 OR
    (SELECT preco_unit_cents FROM public.order_items WHERE order_id=oid)<>1500 THEN RAISE EXCEPTION 'FAIL extra reservation'; END IF;
  UPDATE public.orders SET status='cancelled' WHERE id=oid;
  IF (SELECT estoque FROM public.addons LIMIT 1)<>1 OR (SELECT estoque FROM public.products LIMIT 1)<>10 THEN RAISE EXCEPTION 'FAIL extra reservation release'; END IF;
END $$;
-- Reconcile a platform-funded discount with an actual courier on delivery.
INSERT INTO public.orders(id,cliente_id,establishment_id,status,subtotal_cents,frete_cents,desconto_cents,total_cents,discount_funder)
VALUES('90000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','on_the_way',1000,500,500,1000,'platform');
INSERT INTO public.deliveries(order_id,entregador_id,status) VALUES
('90000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','to_customer');
UPDATE public.orders SET status='delivered' WHERE id='90000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.platform_ledger)<>1 OR EXISTS(SELECT FROM public.platform_ledger
    WHERE gross_cents<>merchant_payout_cents+courier_payout_cents+platform_revenue_cents OR discount_cents<>500)
  THEN RAISE EXCEPTION 'FAIL discounted financial reconciliation'; END IF;
END $$;
-- A refund after physical delivery must never put consumed inventory back on sale.
UPDATE public.orders SET checkout_key='60000000-0000-4000-8000-000000000003' WHERE id='90000000-0000-4000-8000-000000000001';
INSERT INTO public.order_items(order_id,product_id,nome_snapshot,preco_unit_cents,quantidade)
VALUES('90000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Produto',1000,1);
UPDATE public.orders SET status='refunded' WHERE id='90000000-0000-4000-8000-000000000001';
DO $$ BEGIN IF (SELECT estoque FROM public.products LIMIT 1)<>10 THEN RAISE EXCEPTION 'FAIL refunded delivered inventory'; END IF; END $$;
-- Financial columns remain immutable to authenticated callers.
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN UPDATE public.orders SET total_cents=1 WHERE id='90000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'FAIL mutable financial amount';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
-- Team invitation identity comes from auth.users, never user-editable metadata.
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('40000000-0000-4000-8000-000000000001','member@example.test',now()),
('40000000-0000-4000-8000-000000000003','other@example.test',now());
INSERT INTO public.team_members(id,establishment_id,email,papel) VALUES
('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','member@example.test','atendente');
DO $$ DECLARE w jsonb; BEGIN
  w:=public.my_team_workspace();
  IF jsonb_array_length(w->'invites')<>1 OR jsonb_array_length(w->'orders')<>0 THEN RAISE EXCEPTION 'FAIL invitation privacy'; END IF;
  PERFORM public.accept_team_invitation('a0000000-0000-4000-8000-000000000001');
  w:=public.my_team_workspace();
  IF jsonb_array_length(w->'memberships')<>1 OR jsonb_array_length(w->'orders')<>2 THEN RAISE EXCEPTION 'FAIL accepted workspace'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000003',true);
DO $$ DECLARE w jsonb; BEGIN
  w:=public.my_team_workspace();
  IF jsonb_array_length(w->'orders')<>0 OR jsonb_array_length(w->'invites')<>0 THEN RAISE EXCEPTION 'FAIL cross-user privacy'; END IF;
  BEGIN PERFORM public.accept_team_invitation('a0000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'FAIL wrong recipient';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
  BEGIN PERFORM public.my_team_workspace(); RAISE EXCEPTION 'FAIL anonymous workspace';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
