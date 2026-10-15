-- Keep approval and financial state under trusted database/server control.
CREATE OR REPLACE FUNCTION private.protect_profile_review_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, private AS $$
DECLARE protected text[];
BEGIN
  IF TG_OP='DELETE' THEN
    IF current_user IN ('authenticated','anon') AND NOT private.has_role(auth.uid(),'admin') THEN
      RAISE EXCEPTION 'A exclusão de um cadastro operacional exige análise administrativa';
    END IF;
    RETURN OLD;
  END IF;
  -- Internal SECURITY DEFINER workflows (scores/onboarding) retain their privileges.
  IF current_user NOT IN ('authenticated', 'anon') OR private.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'courier_profiles' THEN
    protected := ARRAY['aprovacao','kyc_status','kyc_motivo','score_mensal','score_ym','avaliacao','entregas_total','aceitacao_pct','cancelamento_pct'];
    IF TG_OP = 'INSERT' THEN
      IF NEW.status::text <> 'pendente' OR NEW.aprovacao NOT IN ('incompleto','em_analise','pending','pendente')
        OR NEW.kyc_status NOT IN ('pending','pendente') OR NEW.score_mensal <> 100
        OR coalesce(NEW.avaliacao,0) <> 0 OR coalesce(NEW.entregas_total,0) <> 0
        OR coalesce(NEW.aceitacao_pct,0) <> 0 OR coalesce(NEW.cancelamento_pct,0) <> 0
        OR NEW.kyc_motivo IS NOT NULL OR NEW.score_ym <> to_char(now(),'YYYY-MM') THEN
        RAISE EXCEPTION 'A aprovação do cadastro é exclusiva da administração';
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND
      (NEW.status::text NOT IN ('online','offline','ocupado') OR NOT private.is_courier_dispatch_approved(auth.uid())) THEN
      RAISE EXCEPTION 'Seu cadastro não está aprovado para alterar a disponibilidade';
    END IF;
  ELSE
    protected := ARRAY['status','kyc_status','kyc_motivo','score_mensal','score_ym','avaliacao'];
    IF TG_OP = 'INSERT' AND (NEW.status::text <> 'pendente' OR NEW.kyc_status NOT IN ('pending','pendente')
      OR NEW.score_mensal <> 100 OR coalesce(NEW.avaliacao,0) <> 0 OR NEW.kyc_motivo IS NOT NULL
      OR NEW.score_ym <> to_char(now(),'YYYY-MM')) THEN
      RAISE EXCEPTION 'A aprovação do cadastro é exclusiva da administração';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT FROM unnest(protected) k WHERE to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k
  ) THEN RAISE EXCEPTION 'Campos de análise e pontuação são exclusivos da administração'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.protect_profile_review_fields() FROM PUBLIC;
CREATE TRIGGER aaa_protect_courier_review BEFORE INSERT OR UPDATE OR DELETE ON public.courier_profiles
FOR EACH ROW EXECUTE FUNCTION private.protect_profile_review_fields();
CREATE TRIGGER aaa_protect_establishment_review BEFORE INSERT OR UPDATE OR DELETE ON public.establishments
FOR EACH ROW EXECUTE FUNCTION private.protect_profile_review_fields();

ALTER TABLE public.orders ADD COLUMN checkout_key uuid,
  ADD COLUMN quote_fingerprint text,
  ADD COLUMN coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  ADD COLUMN discount_funder text NOT NULL DEFAULT 'platform' CHECK (discount_funder IN ('platform','establishment')),
  ADD COLUMN inventory_released_at timestamptz;
CREATE UNIQUE INDEX orders_customer_checkout_key ON public.orders(cliente_id, checkout_key) WHERE checkout_key IS NOT NULL;
-- Direct-write privileges are revoked in the second migration after frontend cutover.

CREATE OR REPLACE FUNCTION private.protect_order_amounts() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND EXISTS (
    SELECT FROM unnest(ARRAY['id','cliente_id','establishment_id','subtotal_cents','frete_cents','desconto_cents',
      'total_cents','forma_pagamento','endereco_entrega','tipo_entrega','coupon_id','checkout_key','quote_fingerprint',
      'discount_funder','inventory_released_at','created_at']) k
    WHERE to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k
  ) THEN RAISE EXCEPTION 'Os dados financeiros do pedido são imutáveis'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.protect_order_amounts() FROM PUBLIC;
CREATE TRIGGER aaa_protect_order_amounts BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.protect_order_amounts();

-- Private engine; never callable directly by browser roles. Locks use a stable order.
CREATE OR REPLACE FUNCTION private.checkout_quote(p_user uuid, p_establishment uuid, p_type text, p_coupon text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  shop public.establishments%ROWTYPE; item public.cart_items%ROWTYPE; product public.products%ROWTYPE;
  extra public.addons%ROWTYPE; grp record; cp public.coupons%ROWTYPE; raw_extra jsonb;
  selected uuid[]; canonical_extras jsonb; lines jsonb := '[]'; line_price bigint;
  subtotal bigint := 0; fee integer; discount bigint := 0; n integer; required_min integer; result jsonb;
BEGIN
  IF p_user IS NULL OR p_type IS NULL OR p_type NOT IN ('delivery','pickup') THEN RAISE EXCEPTION 'Checkout inválido'; END IF;
  SELECT * INTO shop FROM public.establishments WHERE id=p_establishment FOR SHARE;
  IF NOT FOUND OR shop.status::text <> 'aprovado' THEN RAISE EXCEPTION 'Loja indisponível'; END IF;
  IF NOT shop.is_open THEN RAISE EXCEPTION 'A loja está fechada'; END IF;
  IF shop.taxa_entrega_cents < 0 OR shop.pedido_minimo_cents < 0 THEN RAISE EXCEPTION 'Configuração de preço inválida'; END IF;
  IF NOT EXISTS (SELECT FROM public.cart_items WHERE user_id=p_user AND establishment_id=p_establishment) THEN RAISE EXCEPTION 'Carrinho vazio'; END IF;
  PERFORM 1 FROM public.products WHERE id IN (SELECT product_id FROM public.cart_items WHERE user_id=p_user AND establishment_id=p_establishment) ORDER BY id FOR UPDATE;
  -- Lock all linked extras, not only untrusted IDs supplied by the cart.
  PERFORM 1 FROM public.addons WHERE addon_group_id IN (
    SELECT pag.addon_group_id FROM public.product_addon_groups pag JOIN public.cart_items c ON c.product_id=pag.product_id
    WHERE c.user_id=p_user AND c.establishment_id=p_establishment
  ) ORDER BY id FOR UPDATE;
  FOR item IN SELECT * FROM public.cart_items WHERE user_id=p_user AND establishment_id=p_establishment ORDER BY id FOR UPDATE LOOP
    IF item.quantidade < 1 OR item.quantidade > 100 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
    SELECT * INTO product FROM public.products WHERE id=item.product_id AND establishment_id=shop.id FOR UPDATE;
    IF NOT FOUND OR NOT product.disponivel THEN RAISE EXCEPTION 'Produto indisponível. Atualize o carrinho'; END IF;
    IF jsonb_typeof(item.addons) <> 'array' OR jsonb_array_length(item.addons)>100 THEN RAISE EXCEPTION 'Complementos inválidos'; END IF;
    selected := ARRAY[]::uuid[]; canonical_extras := '[]';
    line_price := coalesce(product.preco_promo_cents, product.preco_cents);
    FOR raw_extra IN SELECT value FROM jsonb_array_elements(item.addons) LOOP
      IF jsonb_typeof(raw_extra) <> 'object' OR coalesce(raw_extra->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Complemento inválido'; END IF;
      IF (raw_extra->>'id')::uuid = ANY(selected) THEN RAISE EXCEPTION 'Complemento repetido'; END IF;
      SELECT a.* INTO extra FROM public.addons a JOIN public.addon_groups g ON g.id=a.addon_group_id
      JOIN public.product_addon_groups pag ON pag.addon_group_id=g.id AND pag.product_id=product.id
      WHERE a.id=(raw_extra->>'id')::uuid AND a.ativo AND g.ativo AND g.establishment_id=shop.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Complemento indisponível para este produto'; END IF;
      selected := array_append(selected, extra.id);
      SELECT g.nome INTO grp FROM public.addon_groups g WHERE g.id=extra.addon_group_id;
      canonical_extras := canonical_extras || jsonb_build_array(jsonb_build_object('id',extra.id,'nome',extra.nome,
        'preco_extra_cents',extra.preco_extra_cents,'group_id',extra.addon_group_id,'group_nome',grp.nome));
      line_price := line_price + extra.preco_extra_cents;
    END LOOP;
    FOR grp IN SELECT g.* FROM public.addon_groups g JOIN public.product_addon_groups pag ON pag.addon_group_id=g.id
      WHERE pag.product_id=product.id AND g.ativo AND g.establishment_id=shop.id LOOP
      SELECT count(*) INTO n FROM public.addons a WHERE a.id=ANY(selected) AND a.addon_group_id=grp.id;
      required_min := greatest(grp.minimo, CASE WHEN grp.obrigatorio THEN 1 ELSE 0 END);
      IF n < required_min OR (grp.maximo>0 AND n>grp.maximo) OR (NOT grp.selecao_multipla AND n>1) THEN
        RAISE EXCEPTION 'Revise as opções do complemento %',grp.nome;
      END IF;
    END LOOP;
    SELECT coalesce(jsonb_agg(e ORDER BY e->>'id'),'[]') INTO canonical_extras FROM jsonb_array_elements(canonical_extras) e;
    lines := lines || jsonb_build_array(jsonb_build_object('cart_id',item.id,'product_id',product.id,'nome_snapshot',product.nome,
      'preco_unit_cents',line_price,'quantidade',item.quantidade,'observacoes',item.observacoes,'addons',canonical_extras));
    subtotal := subtotal + line_price*item.quantidade;
  END LOOP;
  IF jsonb_array_length(lines)>100 OR subtotal>100000000 OR subtotal<0 THEN RAISE EXCEPTION 'Carrinho acima do limite'; END IF;
  -- Aggregate across separate customizations of the same product/extra.
  IF EXISTS (SELECT FROM jsonb_array_elements(lines) l JOIN public.products p ON p.id=(l->>'product_id')::uuid
    GROUP BY p.id,p.estoque HAVING p.estoque IS NOT NULL AND sum((l->>'quantidade')::integer)>p.estoque) THEN RAISE EXCEPTION 'Estoque insuficiente para um produto'; END IF;
  IF EXISTS (SELECT FROM jsonb_array_elements(lines) l CROSS JOIN LATERAL jsonb_array_elements(l->'addons') e
    JOIN public.addons a ON a.id=(e->>'id')::uuid GROUP BY a.id,a.estoque
    HAVING a.estoque IS NOT NULL AND sum((l->>'quantidade')::integer)>a.estoque) THEN RAISE EXCEPTION 'Estoque insuficiente para um complemento'; END IF;
  IF subtotal<shop.pedido_minimo_cents THEN RAISE EXCEPTION 'Pedido abaixo do mínimo da loja'; END IF;
  fee := CASE WHEN p_type='pickup' THEN 0 ELSE shop.taxa_entrega_cents END;
  IF nullif(trim(p_coupon),'') IS NOT NULL THEN
    SELECT * INTO cp FROM public.coupons WHERE code=upper(trim(p_coupon)) FOR UPDATE;
    IF NOT FOUND OR NOT cp.ativo OR (cp.establishment_id IS NOT NULL AND cp.establishment_id<>shop.id)
      OR cp.starts_at>now() OR cp.expires_at<=now() OR (cp.usage_limit IS NOT NULL AND cp.used_count>=cp.usage_limit)
      OR subtotal<cp.min_order_cents THEN RAISE EXCEPTION 'Cupom inválido, expirado ou esgotado'; END IF;
    IF cp.type::text='percent' THEN
      IF cp.percent<0 OR cp.percent>100 THEN RAISE EXCEPTION 'Cupom inválido'; END IF;
      discount := floor(subtotal*cp.percent/100);
      IF cp.max_discount_cents IS NOT NULL THEN discount:=least(discount,cp.max_discount_cents); END IF;
    ELSIF cp.type::text='fixed' THEN discount:=cp.value_cents;
    ELSIF cp.type::text='free_delivery' THEN discount:=fee;
    END IF;
    discount:=greatest(0,least(discount,subtotal+fee));
  END IF;
  result:=jsonb_build_object('items',lines,'subtotal_cents',subtotal,'frete_cents',fee,'desconto_cents',discount,
    'total_cents',subtotal+fee-discount,'coupon_id',cp.id,'tipo_entrega',p_type,
    'discount_funder',CASE WHEN cp.establishment_id IS NULL THEN 'platform' ELSE 'establishment' END);
  RETURN result || jsonb_build_object('fingerprint',md5(result::text));
END $$;
REVOKE ALL ON FUNCTION private.checkout_quote(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.quote_checkout(p_establishment uuid,p_type text DEFAULT 'delivery',p_coupon text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE q jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  q:=private.checkout_quote(auth.uid(),p_establishment,p_type,p_coupon);
  -- Keep internal line snapshots private to the checkout engine.
  RETURN q - 'items';
END $$;
REVOKE ALL ON FUNCTION public.quote_checkout(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quote_checkout(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_checkout(p_establishment uuid,p_payment text,p_type text,p_address jsonb,
  p_notes text,p_coupon text,p_key uuid,p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE uid uuid:=auth.uid(); q jsonb; o public.orders%ROWTYPE; line_snapshot jsonb; r record; lat double precision; lng double precision;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF p_payment IS NULL OR p_payment NOT IN ('pix','cartao','dinheiro') THEN RAISE EXCEPTION 'Forma de pagamento indisponível'; END IF;
  IF p_key IS NULL OR p_fingerprint IS NULL OR length(p_notes)>500 THEN RAISE EXCEPTION 'Confirmação inválida'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
  SELECT * INTO o FROM public.orders WHERE cliente_id=uid AND checkout_key=p_key;
  IF FOUND THEN
    IF o.establishment_id<>p_establishment OR o.quote_fingerprint<>p_fingerprint OR o.forma_pagamento::text<>p_payment
      OR o.tipo_entrega<>p_type OR o.observacoes IS DISTINCT FROM p_notes
      OR o.endereco_entrega IS DISTINCT FROM (CASE WHEN p_type='pickup' THEN NULL ELSE p_address END) THEN
      RAISE EXCEPTION 'Esta confirmação já foi usada para outro pedido';
    END IF;
    RETURN jsonb_build_object('order_id',o.id,'total_cents',o.total_cents,'desconto_cents',o.desconto_cents);
  END IF;
  IF p_type='delivery' THEN
    IF jsonb_typeof(p_address) IS DISTINCT FROM 'object' OR nullif(trim(p_address->>'rua'),'') IS NULL
      OR nullif(trim(p_address->>'cidade'),'') IS NULL OR length(p_address::text)>5000 THEN RAISE EXCEPTION 'Endereço de entrega inválido'; END IF;
    lat:=(p_address->>'lat')::double precision; lng:=(p_address->>'lng')::double precision;
    IF (lat IS NOT NULL AND (lat NOT BETWEEN -90 AND 90 OR lat='NaN'::float8)) OR
      (lng IS NOT NULL AND (lng NOT BETWEEN -180 AND 180 OR lng='NaN'::float8)) THEN RAISE EXCEPTION 'Coordenadas inválidas'; END IF;
  END IF;
  q:=private.checkout_quote(uid,p_establishment,p_type,p_coupon);
  IF q->>'fingerprint'<>p_fingerprint THEN RAISE EXCEPTION 'Seu carrinho ou os preços mudaram. Revise o total antes de confirmar'; END IF;
  INSERT INTO public.orders(cliente_id,establishment_id,status,subtotal_cents,frete_cents,desconto_cents,total_cents,
    forma_pagamento,tipo_entrega,endereco_entrega,observacoes,checkout_key,quote_fingerprint,coupon_id,discount_funder)
  VALUES(uid,p_establishment,'placed',(q->>'subtotal_cents')::integer,(q->>'frete_cents')::integer,(q->>'desconto_cents')::integer,
    (q->>'total_cents')::integer,p_payment::public.payment_method,p_type,CASE WHEN p_type='pickup' THEN NULL ELSE p_address END,
    p_notes,p_key,p_fingerprint,(q->>'coupon_id')::uuid,q->>'discount_funder') RETURNING * INTO o;
  FOR line_snapshot IN SELECT value FROM jsonb_array_elements(q->'items') LOOP
    INSERT INTO public.order_items(order_id,product_id,nome_snapshot,preco_unit_cents,quantidade,observacoes,addons)
    VALUES(o.id,(line_snapshot->>'product_id')::uuid,line_snapshot->>'nome_snapshot',(line_snapshot->>'preco_unit_cents')::integer,(line_snapshot->>'quantidade')::integer,line_snapshot->>'observacoes',line_snapshot->'addons');
  END LOOP;
  FOR r IN SELECT (l->>'product_id')::uuid id,sum((l->>'quantidade')::integer)::integer qty
    FROM jsonb_array_elements(q->'items') l GROUP BY 1 ORDER BY 1 LOOP
    UPDATE public.products SET estoque=estoque-r.qty WHERE id=r.id AND estoque IS NOT NULL;
  END LOOP;
  FOR r IN SELECT (a->>'id')::uuid id,sum((l->>'quantidade')::integer)::integer qty FROM jsonb_array_elements(q->'items') l
    CROSS JOIN LATERAL jsonb_array_elements(l->'addons') a GROUP BY 1 ORDER BY 1 LOOP
    UPDATE public.addons SET estoque=estoque-r.qty WHERE id=r.id AND estoque IS NOT NULL;
  END LOOP;
  IF o.coupon_id IS NOT NULL THEN UPDATE public.coupons SET used_count=used_count+1 WHERE id=o.coupon_id; END IF;
  -- Delete only the rows that this transaction actually purchased.
  DELETE FROM public.cart_items WHERE user_id=uid AND id IN (SELECT (l->>'cart_id')::uuid FROM jsonb_array_elements(q->'items') l);
  RETURN jsonb_build_object('order_id',o.id,'total_cents',o.total_cents,'desconto_cents',o.desconto_cents);
END $$;
REVOKE ALL ON FUNCTION public.submit_checkout(uuid,text,text,jsonb,text,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_checkout(uuid,text,text,jsonb,text,text,uuid,text) TO authenticated;

-- Reservation is returned exactly once when a new-style order is cancelled/refunded.
CREATE OR REPLACE FUNCTION private.release_checkout_reservation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
  IF NEW.checkout_key IS NULL OR NEW.inventory_released_at IS NOT NULL OR NEW.status::text <> 'cancelled' THEN RETURN NEW; END IF;
  FOR r IN SELECT product_id id,sum(quantidade)::integer qty FROM public.order_items WHERE order_id=NEW.id
    AND product_id IS NOT NULL GROUP BY product_id ORDER BY product_id LOOP
    UPDATE public.products SET estoque=estoque+r.qty
      WHERE id=r.id AND estoque IS NOT NULL;
  END LOOP;
  FOR r IN SELECT (a->>'id')::uuid id,sum(i.quantidade)::integer qty FROM public.order_items i
    CROSS JOIN LATERAL jsonb_array_elements(i.addons) a WHERE i.order_id=NEW.id GROUP BY 1 ORDER BY 1 LOOP
    UPDATE public.addons SET estoque=estoque+r.qty WHERE id=r.id AND estoque IS NOT NULL;
  END LOOP;
  IF NEW.coupon_id IS NOT NULL THEN UPDATE public.coupons SET used_count=greatest(0,used_count-1) WHERE id=NEW.coupon_id; END IF;
  UPDATE public.orders SET inventory_released_at=now() WHERE id=NEW.id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.release_checkout_reservation() FROM PUBLIC;
CREATE TRIGGER release_checkout_reservation AFTER UPDATE OF status ON public.orders FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION private.release_checkout_reservation();

ALTER TABLE public.platform_ledger ADD COLUMN discount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN discount_funder text;
CREATE OR REPLACE FUNCTION public.create_ledger_on_delivered() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pct numeric; commission integer; courier uuid; courier_pay integer; merchant_pay integer;
BEGIN
  IF NEW.status::text='delivered' AND OLD.status::text IS DISTINCT FROM 'delivered' THEN
    SELECT commission_pct INTO pct FROM public.platform_settings WHERE id=1;
    commission:=round(NEW.subtotal_cents*least(100,greatest(0,coalesce(pct,12)))/100.0)::integer;
    SELECT entregador_id INTO courier FROM public.deliveries WHERE order_id=NEW.id LIMIT 1;
    courier_pay:=CASE WHEN courier IS NULL THEN 0 ELSE NEW.frete_cents END;
    merchant_pay:=greatest(0,NEW.subtotal_cents-commission-CASE WHEN NEW.discount_funder='establishment' THEN NEW.desconto_cents ELSE 0 END);
    IF NOT EXISTS(SELECT FROM public.platform_ledger WHERE order_id=NEW.id) THEN
      INSERT INTO public.platform_ledger(order_id,establishment_id,courier_id,gross_cents,commission_cents,delivery_fee_cents,
        courier_payout_cents,merchant_payout_cents,platform_revenue_cents,status,discount_cents,discount_funder)
      VALUES(NEW.id,NEW.establishment_id,courier,NEW.total_cents,commission,NEW.frete_cents,courier_pay,merchant_pay,
        NEW.total_cents-merchant_pay-courier_pay,'pending',NEW.desconto_cents,NEW.discount_funder);
    END IF;
  END IF;
  RETURN NEW;
END $$;
-- Both legacy triggers called the same routine. Preserve a single trigger.
DROP TRIGGER IF EXISTS trg_create_ledger_on_delivered ON public.orders;
REVOKE ALL ON FUNCTION public.create_ledger_on_delivered() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';

-- Team invitations are accepted inside the app by the verified email owner.
-- Membership grants read-only order access here, never owner/banking permissions.
CREATE OR REPLACE FUNCTION private.protect_team_acceptance() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,private AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') OR private.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND (NEW.user_id IS NOT NULL OR NEW.aceito_em IS NOT NULL) THEN
    RAISE EXCEPTION 'O convite deve ser aceito pela pessoa convidada';
  ELSIF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.aceito_em IS DISTINCT FROM OLD.aceito_em
    OR lower(NEW.email) IS DISTINCT FROM lower(OLD.email) OR NEW.establishment_id IS DISTINCT FROM OLD.establishment_id) THEN
    RAISE EXCEPTION 'A identidade do convite não pode ser alterada';
  END IF;
  IF length(NEW.email)>254 OR NEW.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'E-mail inválido'; END IF;
  NEW.email:=lower(trim(NEW.email));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.protect_team_acceptance() FROM PUBLIC;
CREATE TRIGGER aaa_protect_team_acceptance BEFORE INSERT OR UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION private.protect_team_acceptance();

CREATE OR REPLACE FUNCTION public.accept_team_invitation(p_invitation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE verified_email text; invitation public.team_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT lower(email) INTO verified_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
  IF verified_email IS NULL THEN RAISE EXCEPTION 'Confirme seu e-mail antes de aceitar o convite'; END IF;
  SELECT * INTO invitation FROM public.team_members WHERE id=p_invitation FOR UPDATE;
  IF NOT FOUND OR NOT invitation.ativo OR lower(invitation.email)<>verified_email
    OR (invitation.user_id IS NOT NULL AND invitation.user_id<>auth.uid()) THEN RAISE EXCEPTION 'Convite indisponível'; END IF;
  UPDATE public.team_members SET user_id=auth.uid(),aceito_em=coalesce(aceito_em,now()) WHERE id=invitation.id;
END $$;
REVOKE ALL ON FUNCTION public.accept_team_invitation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_team_workspace() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE verified_email text; invites jsonb; memberships jsonb; recent_orders jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT lower(email) INTO verified_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'establishment',e.nome,'role',t.papel) ORDER BY t.created_at),'[]') INTO invites
    FROM public.team_members t JOIN public.establishments e ON e.id=t.establishment_id
    WHERE t.ativo AND t.aceito_em IS NULL AND lower(t.email)=verified_email AND (t.user_id IS NULL OR t.user_id=auth.uid());
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'establishment',e.nome,'role',t.papel)),'[]') INTO memberships
    FROM public.team_members t JOIN public.establishments e ON e.id=t.establishment_id
    WHERE t.ativo AND t.aceito_em IS NOT NULL AND t.user_id=auth.uid() AND lower(t.email)=verified_email;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]') INTO recent_orders FROM (
    SELECT o.id,e.nome AS establishment,o.status,o.created_at,o.tipo_entrega,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('nome',i.nome_snapshot,'quantidade',i.quantidade)),'[]') FROM public.order_items i WHERE i.order_id=o.id) AS items
    FROM public.orders o JOIN public.establishments e ON e.id=o.establishment_id
    WHERE EXISTS (SELECT FROM public.team_members t WHERE t.establishment_id=o.establishment_id AND t.user_id=auth.uid()
      AND t.ativo AND t.aceito_em IS NOT NULL AND lower(t.email)=verified_email)
    ORDER BY o.created_at DESC LIMIT 100
  ) x;
  RETURN jsonb_build_object('invites',invites,'memberships',memberships,'orders',recent_orders);
END $$;
REVOKE ALL ON FUNCTION public.my_team_workspace() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_team_workspace() TO authenticated;
NOTIFY pgrst,'reload schema';
