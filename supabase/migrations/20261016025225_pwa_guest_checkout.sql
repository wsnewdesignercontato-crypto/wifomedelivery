-- Browsing remains public; only creating a checkout order requires delivery contact data.
CREATE POLICY establishments_visitor_read_approved ON public.establishments FOR SELECT TO anon USING(status='aprovado');
GRANT SELECT(establishment_id,expires_at,ativo) ON public.coupons TO anon;
CREATE POLICY coupons_visitor_promotions ON public.coupons FOR SELECT TO anon USING(ativo AND (starts_at IS NULL OR starts_at<=now()) AND (expires_at IS NULL OR expires_at>now()) AND (usage_limit IS NULL OR used_count<usage_limit) AND (establishment_id IS NULL OR EXISTS(SELECT 1 FROM public.establishments e WHERE e.id=establishment_id AND e.status='aprovado')));
CREATE OR REPLACE FUNCTION private.require_order_contact() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.checkout_key IS NOT NULL AND auth.uid() IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.cliente_id AND regexp_replace(coalesce(telefone,''),'[^0-9]','','g') ~ '^[0-9]{10,15}$')
   OR NOT EXISTS(SELECT 1 FROM public.addresses WHERE user_id=NEW.cliente_id AND nullif(btrim(rua),'') IS NOT NULL AND nullif(btrim(cidade),'') IS NOT NULL) THEN
   RAISE EXCEPTION 'CUSTOMER_DETAILS_REQUIRED: Cadastre telefone e endereço antes de confirmar o pedido.' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.require_order_contact() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_order_contact BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION private.require_order_contact();

-- Public aggregate for storefront ranking; no order or customer rows are exposed.
CREATE OR REPLACE FUNCTION public.public_store_sales() RETURNS TABLE(establishment_id uuid,order_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.id,count(o.id) FROM public.establishments e LEFT JOIN public.orders o ON o.establishment_id=e.id AND o.status='delivered' WHERE e.status='aprovado' GROUP BY e.id
$$;
REVOKE ALL ON FUNCTION public.public_store_sales() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_store_sales() TO anon,authenticated;
