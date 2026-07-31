-- =========================================================
-- 1. Safe public wrapper for role checks (self-only)
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id = auth.uid()
      THEN private.has_role(_user_id, _role)
    ELSE false
  END
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- =========================================================
-- 2. Trigger-only functions must not be callable via the API
-- =========================================================
REVOKE ALL ON FUNCTION public.set_delivery_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_disable_product_on_zero_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_client_onboarding_from_address() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_client_onboarding_from_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_courier_onboarding() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_estab_onboarding() FROM PUBLIC, anon, authenticated;

-- =========================================================
-- 3. Business RPCs: authenticated only (never anonymous)
-- =========================================================
REVOKE ALL ON FUNCTION public.courier_confirm_delivery(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_confirm_delivery(uuid, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.courier_confirm_delivery(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_confirm_delivery(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_order_client_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_client_contact(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.regenerate_delivery_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_delivery_code(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_active_city(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_city(text, text) TO authenticated;

-- =========================================================
-- 4. check_profile_complete: self or admin only
-- =========================================================
CREATE OR REPLACE FUNCTION public.check_profile_complete(_user_id uuid, _role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  missing text[] := ARRAY[]::text[];
  p RECORD;
  addr RECORD;
  e RECORD;
  c RECORD;
BEGIN
  IF auth.uid() IS NOT NULL
     AND _user_id <> auth.uid()
     AND NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT nome, telefone INTO p FROM public.profiles WHERE id = _user_id;
  IF p IS NULL OR COALESCE(p.nome,'') = '' THEN missing := array_append(missing, 'nome'); END IF;
  IF p IS NULL OR COALESCE(p.telefone,'') = '' THEN missing := array_append(missing, 'telefone'); END IF;

  IF _role = 'cliente' THEN
    SELECT cep, rua, numero, bairro, cidade, estado INTO addr
      FROM public.addresses WHERE user_id = _user_id AND is_default = true LIMIT 1;
    IF addr IS NULL THEN
      SELECT cep, rua, numero, bairro, cidade, estado INTO addr
        FROM public.addresses WHERE user_id = _user_id ORDER BY created_at LIMIT 1;
    END IF;
    IF addr IS NULL THEN
      missing := missing || ARRAY['cep','rua','numero','bairro','cidade','estado'];
    ELSE
      IF COALESCE(addr.cep,'') = '' THEN missing := array_append(missing, 'cep'); END IF;
      IF COALESCE(addr.rua,'') = '' THEN missing := array_append(missing, 'rua'); END IF;
      IF COALESCE(addr.numero,'') = '' THEN missing := array_append(missing, 'numero'); END IF;
      IF COALESCE(addr.bairro,'') = '' THEN missing := array_append(missing, 'bairro'); END IF;
      IF COALESCE(addr.cidade,'') = '' THEN missing := array_append(missing, 'cidade'); END IF;
      IF COALESCE(addr.estado,'') = '' THEN missing := array_append(missing, 'estado'); END IF;
    END IF;
    RETURN jsonb_build_object(
      'complete', array_length(missing,1) IS NULL,
      'missing', to_jsonb(missing),
      'redirect', '/cliente/perfil/enderecos'
    );

  ELSIF _role = 'estabelecimento' THEN
    SELECT nome, telefone, cnpj, cidade, estado, endereco INTO e
      FROM public.establishments WHERE owner_id = _user_id LIMIT 1;
    IF e IS NULL THEN
      missing := missing || ARRAY['nome_loja','telefone_loja','cnpj','endereco','cidade','estado'];
    ELSE
      IF COALESCE(e.nome,'') = '' THEN missing := array_append(missing, 'nome_loja'); END IF;
      IF COALESCE(e.telefone,'') = '' THEN missing := array_append(missing, 'telefone_loja'); END IF;
      IF COALESCE(e.cnpj,'') = '' THEN missing := array_append(missing, 'cnpj'); END IF;
      IF COALESCE(e.endereco,'') = '' THEN missing := array_append(missing, 'endereco'); END IF;
      IF COALESCE(e.cidade,'') = '' THEN missing := array_append(missing, 'cidade'); END IF;
      IF COALESCE(e.estado,'') = '' THEN missing := array_append(missing, 'estado'); END IF;
    END IF;
    RETURN jsonb_build_object(
      'complete', array_length(missing,1) IS NULL,
      'missing', to_jsonb(missing),
      'redirect', '/estabelecimento/configuracoes'
    );

  ELSIF _role = 'entregador' THEN
    SELECT veiculo, placa, cidade_atuacao, cpf INTO c
      FROM public.courier_profiles WHERE user_id = _user_id LIMIT 1;
    IF c IS NULL THEN
      missing := missing || ARRAY['veiculo','placa','cpf','cidade_atuacao'];
    ELSE
      IF COALESCE(c.veiculo,'') = '' THEN missing := array_append(missing, 'veiculo'); END IF;
      IF COALESCE(c.placa,'') = '' THEN missing := array_append(missing, 'placa'); END IF;
      IF COALESCE(c.cpf,'') = '' THEN missing := array_append(missing, 'cpf'); END IF;
      IF COALESCE(c.cidade_atuacao,'') = '' THEN missing := array_append(missing, 'cidade_atuacao'); END IF;
    END IF;
    RETURN jsonb_build_object(
      'complete', array_length(missing,1) IS NULL,
      'missing', to_jsonb(missing),
      'redirect', '/entregador/perfil/dados'
    );
  END IF;

  RETURN jsonb_build_object('complete', true, 'missing', '[]'::jsonb, 'redirect', '/');
END;
$function$;
REVOKE ALL ON FUNCTION public.check_profile_complete(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_profile_complete(uuid, text) TO authenticated;

-- =========================================================
-- 5. Coupons: no anonymous enumeration, scoped + validity window
-- =========================================================
DROP POLICY IF EXISTS "coupons_read_active" ON public.coupons;
CREATE POLICY "coupons_read_scoped" ON public.coupons
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.establishments e
    WHERE e.id = coupons.establishment_id AND e.owner_id = auth.uid()
  )
  OR (
    ativo = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (expires_at IS NULL OR expires_at > now())
    AND (usage_limit IS NULL OR used_count < usage_limit)
    AND (
      establishment_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.establishments e
        WHERE e.id = coupons.establishment_id AND e.status = 'aprovado'::establishment_status
      )
    )
  )
);
REVOKE SELECT ON public.coupons FROM anon;

-- =========================================================
-- 6. Reviews: full row only for participants; safe public view
-- =========================================================
DROP POLICY IF EXISTS "reviews_authenticated_read" ON public.reviews;
CREATE POLICY "reviews_participants_read" ON public.reviews
FOR SELECT TO authenticated
USING (
  cliente_id = auth.uid()
  OR entregador_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.establishments e
    WHERE e.id = reviews.establishment_id AND e.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.order_id = reviews.order_id AND d.entregador_id = auth.uid()
  )
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

DROP VIEW IF EXISTS public.public_reviews;
CREATE VIEW public.public_reviews
WITH (security_invoker = off) AS
SELECT
  r.id,
  r.establishment_id,
  r.order_id,
  r.rating_loja,
  r.rating_entregador,
  r.comentario,
  r.resposta,
  r.respondido_em,
  r.problema_reportado,
  r.created_at
FROM public.reviews r
JOIN public.establishments e ON e.id = r.establishment_id
WHERE e.status = 'aprovado'::establishment_status;

GRANT SELECT ON public.public_reviews TO anon, authenticated;

-- =========================================================
-- 7. Indexes: every foreign key + hot query paths
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_addresses_user ON public.addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_coupon ON public.campaigns(coupon_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by ON public.campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_cart_items_estab ON public.cart_items(establishment_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product ON public.cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_user ON public.cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_created_by ON public.coupons(created_by);
CREATE INDEX IF NOT EXISTS idx_coupons_estab ON public.coupons(establishment_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_courier_documents_courier ON public.courier_documents(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_missions_courier ON public.courier_missions(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_vehicles_courier ON public.courier_vehicles(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_withdrawals_courier ON public.courier_withdrawals(courier_id);
CREATE INDEX IF NOT EXISTS idx_estab_ad_subs_plan ON public.estab_ad_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_estab_ad_subs_estab ON public.estab_ad_subscriptions(establishment_id);
CREATE INDEX IF NOT EXISTS idx_estab_banners_categoria ON public.estab_banners(link_categoria);
CREATE INDEX IF NOT EXISTS idx_estab_banners_produto ON public.estab_banners(link_produto);
CREATE INDEX IF NOT EXISTS idx_estab_docs_estab ON public.establishment_documents(establishment_id);
CREATE INDEX IF NOT EXISTS idx_estab_withdrawals_requested_by ON public.establishment_withdrawals(requested_by);
CREATE INDEX IF NOT EXISTS idx_favorites_estab ON public.favorites(establishment_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_estab ON public.menu_categories(establishment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_incidents_courier ON public.order_incidents(entregador_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_messages_sender ON public.order_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_order_messages_chat_created ON public.order_messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_osh_changed_by ON public.order_status_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_osh_order ON public.order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_cancelled_by ON public.orders(cancelled_by);
CREATE INDEX IF NOT EXISTS idx_orders_cliente_created ON public.orders(cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_estab_status_created ON public.orders(establishment_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_ledger_courier ON public.platform_ledger(courier_id);
CREATE INDEX IF NOT EXISTS idx_ledger_estab ON public.platform_ledger(establishment_id);
CREATE INDEX IF NOT EXISTS idx_platform_settings_updated_by ON public.platform_settings(updated_by);
CREATE INDEX IF NOT EXISTS idx_pag_addon_group ON public.product_addon_groups(addon_group_id);
CREATE INDEX IF NOT EXISTS idx_reviews_cliente ON public.reviews(cliente_id);
CREATE INDEX IF NOT EXISTS idx_reviews_estab_created ON public.reviews(establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_order ON public.reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_sos_courier ON public.sos_events(courier_id);
CREATE INDEX IF NOT EXISTS idx_sos_order ON public.sos_events(order_id);
CREATE INDEX IF NOT EXISTS idx_sponsored_ads_estab ON public.sponsored_ads(establishment_id);
CREATE INDEX IF NOT EXISTS idx_sponsored_ads_subscription ON public.sponsored_ads(subscription_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_user ON public.stock_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender ON public.support_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON public.support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order ON public.support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON public.deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_courier_status ON public.deliveries(entregador_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries(status);
CREATE INDEX IF NOT EXISTS idx_tracking_points_order_created ON public.tracking_points(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_points_courier_created ON public.tracking_points(courier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_estab_disp ON public.products(establishment_id, disponivel);
CREATE INDEX IF NOT EXISTS idx_establishments_owner ON public.establishments(owner_id);
CREATE INDEX IF NOT EXISTS idx_establishments_status_cidade ON public.establishments(status, cidade);
CREATE INDEX IF NOT EXISTS idx_score_events_entity ON public.score_events(entity_type, entity_id, created_at DESC);