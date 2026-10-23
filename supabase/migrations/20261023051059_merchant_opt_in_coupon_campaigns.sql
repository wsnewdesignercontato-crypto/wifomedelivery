-- Admin publishes; each store explicitly accepts the current terms and funds redemptions.
-- No historical orders, coupon balances or store memberships are rewritten.
ALTER TABLE public.coupons ADD COLUMN campaign_revision uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.orders ADD COLUMN coupon_campaign_revision uuid;

CREATE TABLE public.coupon_participations (
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  campaign_revision uuid NOT NULL,
  participating boolean NOT NULL,
  accepted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(coupon_id,establishment_id),
  CHECK (NOT participating OR accepted_at IS NOT NULL)
);
CREATE INDEX coupon_participations_establishment ON public.coupon_participations(establishment_id,coupon_id);
ALTER TABLE public.coupon_participations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coupon_participations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.coupon_participations TO authenticated;
GRANT ALL ON public.coupon_participations TO service_role;
CREATE POLICY coupon_participations_read ON public.coupon_participations FOR SELECT TO authenticated
USING (private.has_role((SELECT auth.uid()),'admin') OR EXISTS(
  SELECT FROM public.establishments e WHERE e.id=establishment_id AND e.owner_id=(SELECT auth.uid())
));
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coupons_merchant_write ON public.coupons;
DROP POLICY IF EXISTS coupons_read_scoped ON public.coupons;
DROP POLICY IF EXISTS coupons_visitor_promotions ON public.coupons;
REVOKE SELECT(establishment_id,expires_at,ativo) ON public.coupons FROM anon;
DROP POLICY IF EXISTS coupons_admin_all ON public.coupons;
CREATE POLICY coupons_admin_all ON public.coupons FOR ALL TO authenticated
USING(private.has_role((SELECT auth.uid()),'admin'))
WITH CHECK(private.has_role((SELECT auth.uid()),'admin'));

CREATE FUNCTION private.version_coupon_campaign() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.campaign_revision:=gen_random_uuid();
 ELSIF ROW(NEW.code,NEW.type,NEW.percent,NEW.value_cents,NEW.min_order_cents,NEW.max_discount_cents,NEW.starts_at,NEW.expires_at,NEW.usage_limit,NEW.establishment_id)
  IS DISTINCT FROM ROW(OLD.code,OLD.type,OLD.percent,OLD.value_cents,OLD.min_order_cents,OLD.max_discount_cents,OLD.starts_at,OLD.expires_at,OLD.usage_limit,OLD.establishment_id)
 THEN NEW.campaign_revision:=gen_random_uuid();
 ELSE NEW.campaign_revision:=OLD.campaign_revision;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coupon_campaign_version BEFORE INSERT OR UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION private.version_coupon_campaign();
REVOKE ALL ON FUNCTION private.version_coupon_campaign() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.merchant_coupon_campaigns(p_establishment_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT FROM public.establishments WHERE id=p_establishment_id AND owner_id=auth.uid())
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(offers) ORDER BY offers.created_at DESC,offers.id),'[]'::jsonb) INTO result
 FROM (
  SELECT c.id,c.code,c.type,c.percent,c.value_cents,c.min_order_cents,c.max_discount_cents,c.usage_limit,c.used_count,
    c.ativo,c.starts_at,c.expires_at,c.descricao,c.campaign_revision,c.created_at,
    coalesce(p.participating AND p.campaign_revision=c.campaign_revision,false) AS participating,
    coalesce(p.participating AND p.campaign_revision<>c.campaign_revision,false) AS requires_reacceptance,
    (e.status='aprovado' AND c.ativo AND (c.starts_at IS NULL OR c.starts_at<=now())
      AND(c.expires_at IS NULL OR c.expires_at>now()) AND(c.usage_limit IS NULL OR c.used_count<c.usage_limit)) AS available
  FROM public.coupons c JOIN public.establishments e ON e.id=p_establishment_id
  LEFT JOIN public.coupon_participations p ON p.coupon_id=c.id AND p.establishment_id=e.id
  WHERE(c.establishment_id IS NULL OR c.establishment_id=e.id) AND(c.ativo OR p.coupon_id IS NOT NULL)
 ) offers;
 RETURN result;
END $$;
CREATE FUNCTION public.merchant_coupon_campaigns(p_establishment_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' RETURN private.merchant_coupon_campaigns(p_establishment_id);
REVOKE ALL ON FUNCTION private.merchant_coupon_campaigns(uuid),public.merchant_coupon_campaigns(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.merchant_coupon_campaigns(uuid),public.merchant_coupon_campaigns(uuid) TO authenticated;

CREATE FUNCTION private.set_coupon_participation(p_establishment_id uuid,p_coupon_id uuid,p_revision uuid,p_participating boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE campaign public.coupons%ROWTYPE; result public.coupon_participations%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR p_participating IS NULL OR NOT EXISTS(
  SELECT FROM public.establishments WHERE id=p_establishment_id AND owner_id=auth.uid()
 ) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 -- Same lock order as checkout: campaign before membership.
 SELECT * INTO campaign FROM public.coupons WHERE id=p_coupon_id FOR SHARE;
 IF NOT FOUND OR (campaign.establishment_id IS NOT NULL AND campaign.establishment_id<>p_establishment_id)
 THEN RAISE EXCEPTION 'Campanha indisponível para esta loja.' USING ERRCODE='22023'; END IF;
 IF p_participating AND p_revision IS DISTINCT FROM campaign.campaign_revision
 THEN RAISE EXCEPTION 'As condições foram alteradas. Atualize e confira o desconto antes de aceitar.' USING ERRCODE='22023'; END IF;
 IF p_participating AND (NOT campaign.ativo OR campaign.starts_at>now() OR campaign.expires_at<=now()
  OR(campaign.usage_limit IS NOT NULL AND campaign.used_count>=campaign.usage_limit)
  OR NOT EXISTS(SELECT FROM public.establishments WHERE id=p_establishment_id AND status='aprovado'))
 THEN RAISE EXCEPTION 'Campanha indisponível no momento.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.coupon_participations(coupon_id,establishment_id,campaign_revision,participating,accepted_at,updated_at)
 VALUES(campaign.id,p_establishment_id,campaign.campaign_revision,p_participating,CASE WHEN p_participating THEN now() END,now())
 ON CONFLICT(coupon_id,establishment_id) DO UPDATE SET campaign_revision=excluded.campaign_revision,
  participating=excluded.participating,accepted_at=CASE WHEN excluded.participating THEN
    CASE WHEN public.coupon_participations.participating AND public.coupon_participations.campaign_revision=excluded.campaign_revision
      THEN public.coupon_participations.accepted_at ELSE excluded.accepted_at END
    ELSE public.coupon_participations.accepted_at END,updated_at=now()
 RETURNING * INTO result;
 RETURN jsonb_build_object('participating',result.participating,'campaign_revision',result.campaign_revision,'accepted_at',result.accepted_at);
END $$;
CREATE FUNCTION public.set_coupon_participation(p_establishment_id uuid,p_coupon_id uuid,p_revision uuid,p_participating boolean)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
RETURN private.set_coupon_participation(p_establishment_id,p_coupon_id,p_revision,p_participating);
REVOKE ALL ON FUNCTION private.set_coupon_participation(uuid,uuid,uuid,boolean),public.set_coupon_participation(uuid,uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.set_coupon_participation(uuid,uuid,uuid,boolean),public.set_coupon_participation(uuid,uuid,uuid,boolean) TO authenticated;

CREATE FUNCTION private.customer_coupon_offers(p_establishment_ids uuid[])
RETURNS TABLE(id uuid,establishment_id uuid,code text,type public.coupon_type,percent numeric,value_cents integer,min_order_cents integer,
 max_discount_cents integer,usage_limit integer,used_count integer,ativo boolean,starts_at timestamptz,expires_at timestamptz,descricao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(cardinality(p_establishment_ids),0)>100 THEN RAISE EXCEPTION 'Too many stores' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT c.id,e.id,CASE WHEN auth.uid() IS NOT NULL THEN c.code ELSE NULL END,c.type,c.percent,c.value_cents,c.min_order_cents,
 c.max_discount_cents,c.usage_limit,c.used_count,c.ativo,c.starts_at,c.expires_at,c.descricao
 FROM public.establishments e JOIN public.coupon_participations p ON p.establishment_id=e.id AND p.participating
 JOIN public.coupons c ON c.id=p.coupon_id AND c.campaign_revision=p.campaign_revision
 WHERE e.id=ANY(p_establishment_ids) AND e.status='aprovado' AND c.ativo
 AND(c.establishment_id IS NULL OR c.establishment_id=e.id)
 AND(c.starts_at IS NULL OR c.starts_at<=now()) AND(c.expires_at IS NULL OR c.expires_at>now())
 AND(c.usage_limit IS NULL OR c.used_count<c.usage_limit)
 ORDER BY e.id,c.id;
END $$;
CREATE FUNCTION public.customer_coupon_offers(p_establishment_ids uuid[])
RETURNS TABLE(id uuid,establishment_id uuid,code text,type public.coupon_type,percent numeric,value_cents integer,min_order_cents integer,
 max_discount_cents integer,usage_limit integer,used_count integer,ativo boolean,starts_at timestamptz,expires_at timestamptz,descricao text)
LANGUAGE sql SECURITY INVOKER SET search_path=''
BEGIN ATOMIC SELECT * FROM private.customer_coupon_offers(p_establishment_ids); END;
REVOKE ALL ON FUNCTION private.customer_coupon_offers(uuid[]),public.customer_coupon_offers(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.customer_coupon_offers(uuid[]),public.customer_coupon_offers(uuid[]) TO anon,authenticated;

-- Modify only the verified extension points of the installed authoritative checkout.
DO $migration$
DECLARE definition text; original text;
 anchor text := 'THEN RAISE EXCEPTION ''Coupon unavailable'' USING ERRCODE=''22023''; END IF;';
BEGIN
 original:=pg_get_functiondef('private.checkout_order_core(uuid,uuid,text,text,jsonb,text,text,integer,boolean,boolean,text)'::regprocedure);
 IF position(anchor IN original)=0 OR position('WHEN coupon.establishment_id IS NULL THEN ''platform''' IN original)=0
 THEN RAISE EXCEPTION 'Unexpected checkout contract; migration stopped without replacing it.'; END IF;
 definition:=replace(original,anchor,anchor||$guard$
  PERFORM 1 FROM public.coupon_participations p WHERE p.coupon_id=coupon.id AND p.establishment_id=store.id
    AND p.participating AND p.campaign_revision=coupon.campaign_revision FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coupon unavailable' USING ERRCODE='22023'; END IF;
 $guard$);
 definition:=replace(definition,'coupon.expires_at<now()','coupon.expires_at<=now()');
 definition:=replace(definition,'CASE WHEN coupon.id IS NULL THEN NULL WHEN coupon.establishment_id IS NULL THEN ''platform'' ELSE ''merchant'' END',
   'CASE WHEN coupon.id IS NULL THEN NULL ELSE ''merchant'' END');
 definition:=replace(definition,'coupon_id,coupon_funder,commission_cents','coupon_id,coupon_funder,coupon_campaign_revision,commission_cents');
 definition:=replace(definition,'CASE WHEN coupon.id IS NULL THEN NULL ELSE ''merchant'' END,commission',
   'CASE WHEN coupon.id IS NULL THEN NULL ELSE ''merchant'' END,coupon.campaign_revision,commission');
 IF definition=original OR position('coupon.campaign_revision,commission' IN definition)=0
 THEN RAISE EXCEPTION 'Checkout extension points changed; migration stopped.'; END IF;
 EXECUTE definition;
END $migration$;

CREATE FUNCTION private.guard_order_campaign_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE revision uuid;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.coupon_campaign_revision IS DISTINCT FROM OLD.coupon_campaign_revision
  THEN RAISE EXCEPTION 'Order coupon revision is immutable' USING ERRCODE='42501'; END IF;
 ELSIF NEW.coupon_id IS NOT NULL THEN
  SELECT campaign_revision INTO revision FROM public.coupons WHERE id=NEW.coupon_id FOR SHARE;
  IF NEW.coupon_funder IS DISTINCT FROM 'merchant' OR NEW.coupon_campaign_revision IS DISTINCT FROM revision
  THEN RAISE EXCEPTION 'Coupon acceptance and merchant funding required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.coupon_participations p WHERE p.coupon_id=NEW.coupon_id AND p.establishment_id=NEW.establishment_id
   AND p.campaign_revision=revision AND p.participating FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coupon acceptance required' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_campaign_acceptance BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.guard_order_campaign_revision();
CREATE TRIGGER order_campaign_revision_immutable BEFORE UPDATE OF coupon_campaign_revision ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.guard_order_campaign_revision();
REVOKE ALL ON FUNCTION private.guard_order_campaign_revision() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
