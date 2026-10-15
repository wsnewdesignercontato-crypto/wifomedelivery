-- Verified empty-destination snapshot; historical source migrations remain intact.
-- Target: wifome / nsvgfagjezdduatmbsqq. Old test registrations are not copied.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m','S','f') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') AND NOT (n.nspname='public' AND p.proname='rls_auto_enable' AND p.pronargs=0 AND p.prorettype='event_trigger'::regtype AND p.proowner='postgres'::regrole))
 OR EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','private') AND t.typtype IN ('e','d','r','m') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e'))
 OR EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM storage.buckets) THEN RAISE EXCEPTION 'Destination must be empty; initialization refused'; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- public schema is managed by Supabase.


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'cliente',
    'estabelecimento',
    'entregador',
    'admin'
);


--
-- Name: campaign_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_status AS ENUM (
    'draft',
    'scheduled',
    'active',
    'paused',
    'ended'
);


--
-- Name: coupon_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coupon_type AS ENUM (
    'percent',
    'fixed',
    'free_delivery'
);


--
-- Name: courier_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.courier_status AS ENUM (
    'pendente',
    'aprovado',
    'online',
    'offline',
    'ocupado',
    'bloqueado'
);


--
-- Name: delivery_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.delivery_status AS ENUM (
    'created',
    'broadcasting',
    'accepted',
    'to_store',
    'at_store',
    'picked_up',
    'to_customer',
    'at_customer',
    'delivered',
    'cancelled'
);


--
-- Name: establishment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.establishment_status AS ENUM (
    'pendente',
    'aprovado',
    'bloqueado',
    'rejeitado'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'pending_payment',
    'placed',
    'accepted',
    'preparing',
    'ready',
    'waiting_courier',
    'courier_assigned',
    'picked_up',
    'on_the_way',
    'arriving',
    'delivered',
    'cancelled',
    'refunded'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'pix',
    'cartao',
    'dinheiro',
    'carteira'
);


--
-- Name: refund_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.refund_status AS ENUM (
    'none',
    'pending',
    'completed',
    'failed'
);


--
-- Name: team_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.team_role AS ENUM (
    'proprietario',
    'gerente',
    'atendente',
    'cozinha',
    'financeiro',
    'estoque',
    'marketing'
);


--
-- Name: ticket_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_priority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


--
-- Name: ticket_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_status AS ENUM (
    'open',
    'pending',
    'resolved',
    'closed'
);


--
-- Name: audit_platform_settings_change(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE OR REPLACE FUNCTION private.audit_platform_settings_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
DECLARE
  v_actor_id uuid;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_actor_id := COALESCE(auth.uid(), NEW.updated_by, OLD.updated_by);
  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
    IF v_old->v_key IS DISTINCT FROM v_new->v_key THEN
      v_changes :=
        v_changes
        || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old->v_key, 'new', v_new->v_key)
        );
    END IF;
  END LOOP;

  IF v_actor_id IS NOT NULL AND v_changes <> '{}'::jsonb THEN
    INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_actor_id,
      'platform_settings.update',
      'platform_settings',
      NEW.id::text,
      v_changes
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: courier_confirm_delivery_core(uuid, text, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE OR REPLACE FUNCTION private.courier_confirm_delivery_core(p_order_id uuid, p_codigo text, p_prova_url text DEFAULT NULL::text, p_metodo text DEFAULT 'code'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_delivery public.deliveries%ROWTYPE;
  v_metodo text := lower(COALESCE(NULLIF(btrim(p_metodo), ''), 'code'));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_metodo = 'code+photo' THEN
    v_metodo := 'photo';
  ELSIF v_metodo NOT IN ('code', 'photo', 'signature', 'contactless') THEN
    v_metodo := 'code';
  END IF;

  SELECT *
  INTO v_delivery
  FROM public.deliveries
  WHERE order_id = p_order_id
    AND entregador_id = v_uid
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.status = 'delivered' THEN
    RETURN;
  END IF;

  IF v_order.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'order_finalized';
  END IF;

  IF v_order.codigo_expira_em IS NOT NULL AND v_order.codigo_expira_em < now() THEN
    RAISE EXCEPTION 'code_expired';
  END IF;

  IF v_order.codigo_entrega IS NULL OR btrim(p_codigo) <> v_order.codigo_entrega THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  UPDATE public.deliveries
  SET status = 'delivered',
      entregue_em = COALESCE(entregue_em, now())
  WHERE id = v_delivery.id;

  UPDATE public.orders
  SET status = 'delivered',
      entrega_metodo_prova = v_metodo,
      dinheiro_recebido = (v_order.forma_pagamento = 'dinheiro'),
      prova_url = COALESCE(p_prova_url, prova_url)
  WHERE id = p_order_id;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: private; Owner: -
--

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;


--
-- Name: is_client_of_order(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE OR REPLACE FUNCTION private.is_client_of_order(_order_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = _order_id AND o.cliente_id = _user_id
  )
$$;


--
-- Name: is_courier_dispatch_approved(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE OR REPLACE FUNCTION private.is_courier_dispatch_approved(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courier_profiles cp
    WHERE cp.user_id = p_user_id
      AND lower(coalesce(cp.status::text, '')) NOT IN ('blocked', 'bloqueado')
      AND lower(coalesce(cp.aprovacao, '')) NOT IN ('rejected', 'rejeitado', 'recusado', 'blocked', 'bloqueado')
      AND lower(coalesce(cp.kyc_status, '')) NOT IN ('rejected', 'rejeitado', 'recusado', 'blocked', 'bloqueado')
      AND (
        lower(coalesce(cp.aprovacao, '')) IN ('approved', 'aprovado')
        OR lower(coalesce(cp.kyc_status, '')) IN ('approved', 'aprovado')
      )
  );
$$;


--
-- Name: is_courier_of_order(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE OR REPLACE FUNCTION private.is_courier_of_order(_order_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.order_id = _order_id AND d.entregador_id = _user_id
  )
$$;


--
-- Name: list_available_couriers(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE OR REPLACE FUNCTION private.list_available_couriers() RETURNS TABLE(user_id uuid, veiculo text, avaliacao numeric, lat double precision, lng double precision, last_seen timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT cp.user_id, cp.veiculo, cp.avaliacao, cp.lat, cp.lng, cp.last_seen
  FROM public.courier_profiles cp
  WHERE cp.status = 'online' AND cp.aprovacao = 'approved';
$$;


--
-- Name: owns_establishment_of_order(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE OR REPLACE FUNCTION private.owns_establishment_of_order(_order_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.establishments e ON e.id = o.establishment_id
    WHERE o.id = _order_id AND e.owner_id = _user_id
  )
$$;


--
-- Name: set_delivery_code_expiry(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE OR REPLACE FUNCTION private.set_delivery_code_expiry() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.codigo_entrega IS DISTINCT FROM OLD.codigo_entrega AND NEW.codigo_entrega IS NOT NULL THEN
    NEW.codigo_expira_em := now() + interval '30 minutes';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_delivery_code_expiry_ins(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE OR REPLACE FUNCTION private.set_delivery_code_expiry_ins() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.codigo_entrega IS NOT NULL AND NEW.codigo_expira_em IS NULL THEN
    NEW.codigo_expira_em := now() + interval '30 minutes';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: admin_grant_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.admin_grant_role(_target_user uuid, _role public.app_role) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'grant_role',
    'user',
    _target_user::text,
    jsonb_build_object('role', _role)
  );
END;
$$;


--
-- Name: admin_revoke_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.admin_revoke_role(_target_user uuid, _role public.app_role) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  IF _role = 'admin' AND (SELECT COUNT(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last admin';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _target_user
    AND role = _role;

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'revoke_role',
    'user',
    _target_user::text,
    jsonb_build_object('role', _role)
  );
END;
$$;


--
-- Name: apply_score_penalty(text, uuid, integer, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.apply_score_penalty(_entity_type text, _entity_id uuid, _penalty integer, _motivo text, _order_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cur_ym TEXT := to_char(now(),'YYYY-MM');
  old_score INT;
  new_score INT;
  target_user UUID;
  audience TEXT;
  link TEXT;
  crossed_yellow BOOLEAN := false;
  crossed_red BOOLEAN := false;
  titulo TEXT;
  msg TEXT;
  s_start INT;
  s_warn INT;
  s_crit INT;
BEGIN
  IF _penalty <= 0 THEN RETURN; END IF;

  SELECT COALESCE(score_start,100), COALESCE(score_band_warn,85), COALESCE(score_band_critical,60)
    INTO s_start, s_warn, s_crit
    FROM public.platform_settings WHERE id = 1;
  s_start := COALESCE(s_start, 100);
  s_warn  := COALESCE(s_warn, 85);
  s_crit  := COALESCE(s_crit, 60);

  IF _entity_type = 'establishment' THEN
    SELECT CASE WHEN score_ym <> cur_ym THEN s_start ELSE score_mensal END, owner_id
      INTO old_score, target_user
      FROM public.establishments WHERE id = _entity_id;
    new_score := GREATEST(0, COALESCE(old_score, s_start) - _penalty);
    UPDATE public.establishments
      SET score_mensal = new_score, score_ym = cur_ym
      WHERE id = _entity_id;
    audience := 'estabelecimento';
    link := '/estabelecimento';
  ELSIF _entity_type = 'courier' THEN
    SELECT CASE WHEN score_ym <> cur_ym THEN s_start ELSE score_mensal END, user_id
      INTO old_score, target_user
      FROM public.courier_profiles WHERE user_id = _entity_id;
    new_score := GREATEST(0, COALESCE(old_score, s_start) - _penalty);
    UPDATE public.courier_profiles
      SET score_mensal = new_score, score_ym = cur_ym
      WHERE user_id = _entity_id;
    audience := 'entregador';
    link := '/entregador';
  ELSE
    RETURN;
  END IF;

  INSERT INTO public.score_events(entity_type, entity_id, ym, penalty, motivo, order_id)
  VALUES (_entity_type, _entity_id, cur_ym, _penalty, _motivo, _order_id);

  crossed_yellow := COALESCE(old_score, s_start) >= s_warn AND new_score < s_warn AND new_score >= s_crit;
  crossed_red    := COALESCE(old_score, s_start) >= s_crit AND new_score < s_crit;

  IF target_user IS NOT NULL AND (crossed_yellow OR crossed_red) THEN
    IF crossed_red THEN
      titulo := '🚨 Score em nível crítico (' || new_score || ')';
      msg := 'Seu score mensal caiu para ' || new_score || ' (faixa crítica). Última perda: ' || _motivo || '. Melhore a qualidade para evitar restrições.';
    ELSE
      titulo := '⚠️ Score em atenção (' || new_score || ')';
      msg := 'Seu score mensal caiu para ' || new_score || ' (faixa de atenção). Última perda: ' || _motivo || '.';
    END IF;
    INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
    VALUES (target_user, titulo, msg, link, audience);
  END IF;
END;
$$;


--
-- Name: auto_disable_product_on_zero_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.auto_disable_product_on_zero_stock() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.estoque IS NOT NULL AND NEW.estoque <= 0 THEN
    NEW.disponivel := FALSE;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: check_profile_complete(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.check_profile_complete(_user_id uuid, _role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_missing text[] := '{}';
  v_complete boolean := true;
  v_redirect text := '/';
  v_profile record;
  v_address record;
  v_courier record;
  v_estab record;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = _user_id;
  
  IF v_profile.nome IS NULL OR v_profile.nome = '' THEN
    v_missing := array_append(v_missing, 'nome');
  END IF;
  
  IF v_profile.telefone IS NULL OR v_profile.telefone = '' THEN
    v_missing := array_append(v_missing, 'telefone');
  END IF;

  IF _role = 'cliente' THEN
    SELECT * INTO v_address FROM public.addresses WHERE user_id = _user_id AND is_default = true LIMIT 1;
    IF v_address.id IS NULL THEN
      v_missing := array_append(v_missing, 'endereco');
    END IF;
    v_redirect := '/cliente/perfil/enderecos';
    
  ELSIF _role = 'entregador' THEN
    SELECT * INTO v_courier FROM public.courier_profiles WHERE user_id = _user_id;
    IF v_courier.id IS NULL OR v_courier.cpf IS NULL OR v_courier.cpf = '' THEN
      v_missing := array_append(v_missing, 'cpf');
    END IF;
    IF v_courier.cidade_atuacao IS NULL OR v_courier.cidade_atuacao = '' THEN
      v_missing := array_append(v_missing, 'cidade_atuacao');
    END IF;
    v_redirect := '/entregador/perfil/dados';
    
  ELSIF _role = 'estabelecimento' THEN
    SELECT * INTO v_estab FROM public.establishments WHERE owner_id = _user_id;
    IF v_estab.id IS NULL OR v_estab.nome IS NULL OR v_estab.nome = '' THEN
      v_missing := array_append(v_missing, 'nome_loja');
    END IF;
    IF v_estab.cnpj IS NULL OR v_estab.cnpj = '' THEN
      v_missing := array_append(v_missing, 'cnpj');
    END IF;
    v_redirect := '/estabelecimento/configuracoes';
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    v_complete := false;
  END IF;

  RETURN jsonb_build_object(
    'complete', v_complete,
    'missing', v_missing,
    'redirect', v_redirect
  );
END;
$$;


--
-- Name: confirm_delivery_code(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.confirm_delivery_code(p_order_id uuid, p_code text, p_prova_url text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order record;
  v_delivery record;
  v_uid uuid := auth.uid();
BEGIN
  -- Segurança: Apenas o entregador atribuído ou admin pode confirmar
  SELECT * INTO v_delivery FROM public.deliveries WHERE order_id = p_order_id AND entregador_id = v_uid;
  
  IF NOT FOUND AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  
  IF v_order.codigo_entrega IS NULL OR v_order.codigo_entrega <> trim(p_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  -- Atualiza o pedido
  UPDATE public.orders 
  SET status = 'delivered', 
      prova_url = COALESCE(p_prova_url, prova_url),
      updated_at = now()
  WHERE id = p_order_id;

  -- Atualiza a entrega
  UPDATE public.deliveries
  SET status = 'delivered',
      entregue_em = now(),
      updated_at = now()
  WHERE order_id = p_order_id;

  -- Libera o entregador para ficar online novamente
  UPDATE public.courier_profiles
  SET status = 'online'
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: confirm_pickup_order(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.confirm_pickup_order(p_order_id uuid, p_codigo text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  JOIN public.establishments e ON e.id = o.establishment_id
  WHERE o.id = p_order_id
    AND e.owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF COALESCE(v_order.tipo_entrega, 'delivery') <> 'pickup' THEN
    RAISE EXCEPTION 'pickup_only';
  END IF;

  IF v_order.status = 'delivered' THEN
    RETURN;
  END IF;

  IF v_order.status <> 'ready' THEN
    RAISE EXCEPTION 'order_not_ready';
  END IF;

  IF v_order.codigo_expira_em IS NOT NULL AND v_order.codigo_expira_em < now() THEN
    RAISE EXCEPTION 'code_expired';
  END IF;

  IF v_order.codigo_entrega IS NULL OR trim(p_codigo) <> v_order.codigo_entrega THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  UPDATE public.orders
  SET status = 'delivered'
  WHERE id = p_order_id;
END;
$$;


--
-- Name: courier_confirm_delivery(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.courier_confirm_delivery(p_order_id uuid, p_codigo text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'private'
    AS $$
BEGIN
  PERFORM private.courier_confirm_delivery_core(p_order_id, p_codigo, NULL, 'code');
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: courier_confirm_delivery(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.courier_confirm_delivery(_order_id uuid, _codigo text, _prova_url text DEFAULT NULL::text, _metodo text DEFAULT 'code'::text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'private'
    AS $$
BEGIN
  PERFORM private.courier_confirm_delivery_core(_order_id, _codigo, _prova_url, _metodo);
END;
$$;


--
-- Name: create_ledger_on_delivered(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.create_ledger_on_delivered() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_commission_pct NUMERIC;
  v_commission_cents INT;
  v_courier_uid UUID;
BEGIN
  -- Só processa se o status mudou para delivered
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status <> 'delivered') THEN
    
    -- Pega a comissão da plataforma
    SELECT commission_pct INTO v_commission_pct FROM public.platform_settings ORDER BY id LIMIT 1;
    v_commission_pct := COALESCE(v_commission_pct, 12.0);
    
    -- Calcula comissão (sobre o subtotal dos produtos)
    v_commission_cents := ROUND((NEW.subtotal_cents * v_commission_pct / 100.0))::INT;
    
    -- Tenta encontrar o entregador (se houver delivery associado)
    SELECT entregador_id INTO v_courier_uid FROM public.deliveries WHERE order_id = NEW.id LIMIT 1;

    -- Evita duplicidade se já houver registro no ledger para este pedido
    IF NOT EXISTS (SELECT 1 FROM public.platform_ledger WHERE order_id = NEW.id) THEN
      INSERT INTO public.platform_ledger(
        order_id, 
        establishment_id, 
        courier_id, 
        gross_cents, 
        commission_cents, 
        delivery_fee_cents, 
        courier_payout_cents, 
        merchant_payout_cents, 
        platform_revenue_cents, 
        status
      )
      VALUES (
        NEW.id, 
        NEW.establishment_id, 
        v_courier_uid, 
        NEW.total_cents, 
        v_commission_cents,
        COALESCE(NEW.frete_cents, 0),
        COALESCE(NEW.frete_cents, 0), -- Entregador ganha 100% da taxa de entrega por padrão
        NEW.subtotal_cents - v_commission_cents, -- Loja ganha subtotal menos comissão
        v_commission_cents, -- Plataforma ganha a comissão
        'pending'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: get_order_client_contact(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_order_client_contact(_order_id uuid) RETURNS TABLE(nome text, telefone text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente uuid;
  v_estab uuid;
  v_owner uuid;
  v_is_courier boolean := false;
  v_is_owner boolean := false;
  v_is_admin boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT o.cliente_id, o.establishment_id INTO v_cliente, v_estab
    FROM public.orders o WHERE o.id = _order_id;
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;

  SELECT e.owner_id INTO v_owner FROM public.establishments e WHERE e.id = v_estab;
  v_is_owner := (v_owner = v_uid);

  SELECT EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.order_id = _order_id AND d.entregador_id = v_uid
  ) INTO v_is_courier;

  BEGIN
    v_is_admin := public.has_role(v_uid, 'admin'::app_role);
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  IF NOT (v_is_owner OR v_is_courier OR v_is_admin) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
    SELECT
      p.nome,
      CASE
        WHEN v_is_courier OR v_is_admin THEN p.telefone
        ELSE NULL
      END AS telefone
    FROM public.profiles p WHERE p.id = v_cliente;
END; $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, foto_url, telefone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'telefone'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cliente')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id = auth.uid()
      THEN private.has_role(_user_id, _role)
    ELSE false
  END
$$;


--
-- Name: notify_client_on_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notify_client_on_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  msg TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    msg := CASE NEW.status
      WHEN 'accepted' THEN 'Sua loja aceitou o pedido!'
      WHEN 'preparing' THEN 'Seu pedido está em preparo.'
      WHEN 'ready' THEN 'Seu pedido está pronto.'
      WHEN 'courier_assigned' THEN 'Um entregador aceitou seu pedido.'
      WHEN 'picked_up' THEN 'Pedido coletado pelo entregador.'
      WHEN 'on_the_way' THEN 'Seu pedido está a caminho!'
      WHEN 'arriving' THEN 'O entregador está chegando.'
      WHEN 'delivered' THEN 'Pedido entregue. Bom apetite!'
      WHEN 'cancelled' THEN 'Pedido cancelado.'
      WHEN 'refunded' THEN 'Pedido reembolsado.'
      ELSE NULL
    END;
    IF msg IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
      VALUES (NEW.cliente_id, 'Atualização do pedido', msg, '/cliente/pedido/' || NEW.id::text, 'cliente');
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: notify_courier_kyc_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notify_courier_kyc_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t TEXT; m TEXT; link TEXT := '/entregador/perfil';
BEGIN
  IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    IF NEW.kyc_status = 'approved' THEN
      t := 'KYC aprovado ✅';
      m := 'Seu cadastro foi aprovado. Você já pode receber corridas e solicitar saques.';
    ELSIF NEW.kyc_status = 'rejected' THEN
      t := 'KYC recusado ❌';
      m := 'Seu cadastro foi recusado. Motivo: ' || COALESCE(NEW.kyc_motivo,'não informado') ||
           '. Próximos passos: revise seus documentos e dados no perfil e reenvie para nova análise.';
    ELSIF NEW.kyc_status = 'pending' THEN
      t := 'KYC em análise ⏳';
      m := 'Recebemos seus documentos. A análise costuma levar até 48h úteis.';
    ELSE
      RETURN NEW;
    END IF;
    INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
    VALUES (NEW.user_id, t, m, link, 'entregador');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: notify_couriers_new_ride(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notify_couriers_new_ride() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_cidade text;
  v_valor text;
BEGIN
  IF NEW.status NOT IN ('created', 'broadcasting') THEN
    RETURN NEW;
  END IF;

  SELECT e.cidade INTO v_cidade
  FROM public.orders o
  JOIN public.establishments e ON e.id = o.establishment_id
  WHERE o.id = NEW.order_id;

  v_valor := to_char(COALESCE(NEW.valor_entrega_cents, 0) / 100.0, 'FM999999990.00');

  INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
  SELECT cp.user_id,
         'Nova corrida disponivel!',
         'Corrida de R$ ' || v_valor || ' disponivel agora. Toque para aceitar antes de outro entregador.',
         '/entregador/corridas',
         'entregador'
  FROM public.courier_profiles cp
  WHERE cp.status = 'online'
    AND private.is_courier_dispatch_approved(cp.user_id)
    AND (
      v_cidade IS NULL
      OR cp.cidade_atuacao IS NULL
      OR lower(btrim(cp.cidade_atuacao)) = lower(btrim(v_cidade))
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(cp.cidades_atuacao, ARRAY[]::text[])) c
        WHERE lower(btrim(c)) = lower(btrim(v_cidade))
      )
    );

  RETURN NEW;
END;
$_$;


--
-- Name: notify_estab_ad_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notify_estab_ad_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE owner UUID; t TEXT; m TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT owner_id INTO owner FROM public.establishments WHERE id = NEW.establishment_id;
    IF owner IS NULL THEN RETURN NEW; END IF;
    IF NEW.status = 'approved' THEN
      t := 'Campanha aprovada ✅';
      m := 'Sua campanha "' || COALESCE(NEW.titulo,'') || '" foi aprovada e já está no ar.';
    ELSIF NEW.status = 'rejected' THEN
      t := 'Campanha recusada';
      m := 'Sua campanha "' || COALESCE(NEW.titulo,'') || '" foi recusada. ' || COALESCE(NEW.motivo_recusa,'');
    ELSE RETURN NEW;
    END IF;
    INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
    VALUES (owner, t, m, '/estabelecimento/anuncios', 'estabelecimento');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: notify_estab_ad_sub_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notify_estab_ad_sub_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE owner UUID; plan_name TEXT; t TEXT; m TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT owner_id INTO owner FROM public.establishments WHERE id = NEW.establishment_id;
    SELECT nome INTO plan_name FROM public.ad_plans WHERE id = NEW.plan_id;
    IF NEW.status = 'active' THEN
      t := 'Plano de anúncio ativo ✅';
      m := 'Seu plano "' || COALESCE(plan_name,'') || '" está ativo até ' || to_char(NEW.fim_em, 'DD/MM/YYYY') || '.';
    ELSIF NEW.status = 'rejected' THEN
      t := 'Plano de anúncio recusado';
      m := 'O plano "' || COALESCE(plan_name,'') || '" foi recusado. ' || COALESCE(NEW.observacao,'');
    ELSIF NEW.status = 'expired' THEN
      t := 'Plano de anúncio expirado';
      m := 'Seu plano "' || COALESCE(plan_name,'') || '" expirou. Renove para continuar em destaque.';
    ELSE RETURN NEW;
    END IF;
    INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
    VALUES (owner, t, m, '/estabelecimento/anuncios', 'estabelecimento');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: notify_estab_kyc_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notify_estab_kyc_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t TEXT; m TEXT; link TEXT := '/estabelecimento/carteira';
BEGIN
  IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    IF NEW.kyc_status = 'approved' THEN
      t := 'KYC aprovado ✅';
      m := 'Sua conta foi validada. Você já pode solicitar saques via Pix.';
    ELSIF NEW.kyc_status = 'rejected' THEN
      t := 'KYC recusado ❌';
      m := 'A validação foi recusada. Motivo: ' || COALESCE(NEW.kyc_motivo,'não informado') ||
           '. Próximos passos: corrija os documentos e dados de pagamento e reenvie para nova análise.';
    ELSIF NEW.kyc_status = 'pending' THEN
      t := 'KYC em análise ⏳';
      m := 'Documentos recebidos. Retornaremos em até 48h úteis.';
    ELSE
      RETURN NEW;
    END IF;
    INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
    VALUES (NEW.owner_id, t, m, link, 'estabelecimento');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: notify_estab_new_order(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notify_estab_new_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_owner uuid;
  v_total text;
BEGIN
  SELECT owner_id INTO v_owner FROM public.establishments WHERE id = NEW.establishment_id;
  IF v_owner IS NULL THEN RETURN NEW; END IF;
  v_total := to_char(NEW.total_cents / 100.0, 'FM999999990.00');
  INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
  VALUES (
    v_owner,
    '🛎️ Novo pedido recebido!',
    'Você recebeu um novo pedido de R$ ' || v_total || '. Toque para aceitar e começar o preparo.',
    '/estabelecimento/pedidos',
    'estabelecimento'
  );
  RETURN NEW;
END;
$_$;


--
-- Name: orders_status_after(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.orders_status_after() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history(order_id, from_status, to_status, changed_by, reason)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), NEW.cancellation_reason);

    IF NEW.status = 'cancelled' THEN
      UPDATE public.deliveries
        SET status = 'cancelled', updated_at = now()
        WHERE order_id = NEW.id AND status NOT IN ('delivered','cancelled');
      UPDATE public.courier_profiles cp
        SET status = 'online'
        WHERE cp.status = 'ocupado'
          AND cp.user_id IN (SELECT entregador_id FROM public.deliveries WHERE order_id = NEW.id AND entregador_id IS NOT NULL);
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: orders_status_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.orders_status_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  allowed boolean := false;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'delivered' AND NEW.status NOT IN ('refunded') THEN
    RAISE EXCEPTION 'Cannot change delivered order to %', NEW.status;
  END IF;
  IF OLD.status = 'refunded' THEN
    RAISE EXCEPTION 'Order already refunded';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status NOT IN ('refunded') THEN
    RAISE EXCEPTION 'Cancelled order can only be refunded';
  END IF;

  IF NEW.status = 'cancelled' THEN
    allowed := true;
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
  ELSIF NEW.status = 'refunded' THEN
    allowed := OLD.status IN ('cancelled', 'delivered');
    NEW.refunded_at := COALESCE(NEW.refunded_at, now());
    IF NEW.refund_status = 'none' THEN
      NEW.refund_status := 'completed';
    END IF;
    IF NEW.refund_amount_cents = 0 THEN
      NEW.refund_amount_cents := NEW.total_cents;
    END IF;
  ELSE
    allowed := (OLD.status, NEW.status) IN (
      ('placed', 'accepted'),
      ('accepted', 'preparing'),
      ('preparing', 'ready'),
      ('waiting_courier', 'courier_assigned'),
      ('courier_assigned', 'picked_up'),
      ('picked_up', 'on_the_way'),
      ('on_the_way', 'arriving'),
      ('arriving', 'delivered'),
      ('on_the_way', 'delivered'),
      ('picked_up', 'delivered')
    );

    IF OLD.status = 'ready' AND NEW.status = 'waiting_courier' THEN
      allowed := COALESCE(OLD.tipo_entrega, 'delivery') <> 'pickup';
    ELSIF OLD.status = 'ready' AND NEW.status = 'delivered' THEN
      allowed := COALESCE(OLD.tipo_entrega, 'delivery') = 'pickup';
    END IF;
  END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: recompute_establishment_rating(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.recompute_establishment_rating() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.establishments e
    SET avaliacao = COALESCE((
      SELECT ROUND(AVG(rating_loja)::numeric, 2)
        FROM public.reviews r
       WHERE r.establishment_id = NEW.establishment_id
    ), 0)
   WHERE e.id = NEW.establishment_id;
  RETURN NEW;
END $$;


--
-- Name: regenerate_delivery_code(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.regenerate_delivery_code(p_order_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new_code text;
  v_cliente uuid;
  v_status order_status;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT cliente_id, status INTO v_cliente, v_status
  FROM public.orders WHERE id = p_order_id;

  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_cliente <> v_uid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_status IN ('delivered','cancelled','refunded') THEN
    RAISE EXCEPTION 'order_finalized';
  END IF;

  v_new_code := lpad((floor(random()*10000))::int::text, 4, '0');

  UPDATE public.orders
  SET codigo_entrega = v_new_code,
      codigo_expira_em = now() + interval '30 minutes'
  WHERE id = p_order_id;

  RETURN v_new_code;
END;
$$;


--
-- Name: set_active_city(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_active_city(_cidade text, _estado text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.profiles
    SET cidade_ativa = _cidade, estado_ativo = _estado
    WHERE id = auth.uid();
END;
$$;


--
-- Name: set_active_city(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_active_city(_user_id uuid, _city text, _state text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.profiles
  SET cidade_ativa = _city,
      estado_ativo = _state,
      last_location_at = now()
  WHERE id = _user_id;
END;
$$;


--
-- Name: set_delivery_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_delivery_code() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.codigo_entrega IS NULL THEN
    NEW.codigo_entrega := lpad((floor(random()*10000))::int::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: sync_client_onboarding_from_address(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.sync_client_onboarding_from_address() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  is_client boolean;
  chk jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'cliente'
  ) INTO is_client;

  IF is_client THEN
    -- Cidade ativa vem do endereço default (ou do mais recente, se ainda não houver default)
    IF NEW.is_default = true OR NOT EXISTS (
      SELECT 1 FROM public.addresses WHERE user_id = NEW.user_id AND is_default = true AND id <> NEW.id
    ) THEN
      UPDATE public.profiles
        SET cidade_ativa = NEW.cidade,
            estado_ativo = NEW.estado
        WHERE id = NEW.user_id;
    END IF;

    chk := public.check_profile_complete(NEW.user_id, 'cliente');
    UPDATE public.profiles
      SET onboarding_completed = COALESCE((chk->>'complete')::boolean, false)
      WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_client_onboarding_from_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.sync_client_onboarding_from_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  is_client boolean;
  chk jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id AND role = 'cliente'
  ) INTO is_client;
  IF is_client THEN
    chk := public.check_profile_complete(NEW.id, 'cliente');
    NEW.onboarding_completed := COALESCE((chk->>'complete')::boolean, false);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_courier_onboarding(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.sync_courier_onboarding() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  chk jsonb;
BEGIN
  chk := public.check_profile_complete(NEW.user_id, 'entregador');
  NEW.onboarding_completed := COALESCE((chk->>'complete')::boolean, false);
  RETURN NEW;
END;
$$;


--
-- Name: sync_courier_vehicle_to_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.sync_courier_vehicle_to_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v RECORD;
BEGIN
  SELECT tipo, placa INTO v
  FROM public.courier_vehicles
  WHERE courier_id = COALESCE(NEW.courier_id, OLD.courier_id)
  ORDER BY ativo DESC, created_at DESC
  LIMIT 1;

  IF v IS NOT NULL THEN
    UPDATE public.courier_profiles
      SET veiculo = COALESCE(NULLIF(v.tipo,''), veiculo),
          placa = COALESCE(NULLIF(v.placa,''), placa),
          updated_at = now()
      WHERE user_id = COALESCE(NEW.courier_id, OLD.courier_id);
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: sync_estab_onboarding(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.sync_estab_onboarding() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  chk jsonb;
BEGIN
  chk := public.check_profile_complete(NEW.owner_id, 'estabelecimento');
  NEW.onboarding_completed := COALESCE((chk->>'complete')::boolean, false);
  RETURN NEW;
END;
$$;


--
-- Name: trg_notifications_ping_push(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.trg_notifications_ping_push() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'vault'
    AS $$
declare
  base_url text;
  dispatch_secret text;
begin
  select decrypted_secret
    into base_url
  from vault.decrypted_secrets
  where name = 'push_dispatch_base_url'
  order by created_at desc
  limit 1;

  select decrypted_secret
    into dispatch_secret
  from vault.decrypted_secrets
  where name = 'push_dispatch_secret'
  order by created_at desc
  limit 1;

  if coalesce(base_url, '') = '' or coalesce(dispatch_secret, '') = '' then
    return new;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/api/internal/push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-dispatch-secret', dispatch_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 3000
  );

  return new;
exception when others then
  return new;
end;
$$;


--
-- Name: trg_orders_delay_penalty(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.trg_orders_delay_penalty() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  expected INT;
  actual NUMERIC;
  ratio NUMERIC;
  courier_uid UUID;
  penalty INT := 0;
  motivo TEXT;
  cfg RECORD;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    SELECT score_delay_warn_ratio, score_delay_warn_penalty,
           score_delay_severe_ratio, score_delay_severe_penalty
      INTO cfg FROM public.platform_settings WHERE id = 1;

    SELECT COALESCE(NEW.tempo_estimado_min, e.tempo_medio_min, 60)
      INTO expected FROM public.establishments e WHERE e.id = NEW.establishment_id;
    IF expected IS NULL OR expected <= 0 THEN expected := 60; END IF;

    actual := EXTRACT(EPOCH FROM (now() - NEW.created_at))/60.0;
    ratio := actual / expected;

    IF ratio > COALESCE(cfg.score_delay_severe_ratio, 1.5) THEN
      penalty := COALESCE(cfg.score_delay_severe_penalty, 10);
      motivo := 'Atraso severo (' || round(actual)::text || 'min de ' || expected || 'min)';
    ELSIF ratio > COALESCE(cfg.score_delay_warn_ratio, 1.25) THEN
      penalty := COALESCE(cfg.score_delay_warn_penalty, 5);
      motivo := 'Atraso na entrega (' || round(actual)::text || 'min de ' || expected || 'min)';
    END IF;

    IF penalty > 0 THEN
      PERFORM public.apply_score_penalty('establishment', NEW.establishment_id, penalty, motivo, NEW.id);
      SELECT entregador_id INTO courier_uid FROM public.deliveries WHERE order_id = NEW.id;
      IF courier_uid IS NOT NULL THEN
        PERFORM public.apply_score_penalty('courier', courier_uid, penalty, motivo, NEW.id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_reviews_score_penalty(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.trg_reviews_score_penalty() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  courier_uid UUID;
  cfg RECORD;
  bad_max INT;
  bad_pen INT;
  reg_rat INT;
  reg_pen INT;
BEGIN
  SELECT score_review_bad_max, score_review_bad_penalty,
         score_review_regular_rating, score_review_regular_penalty
    INTO cfg FROM public.platform_settings WHERE id = 1;
  bad_max := COALESCE(cfg.score_review_bad_max, 2);
  bad_pen := COALESCE(cfg.score_review_bad_penalty, 10);
  reg_rat := COALESCE(cfg.score_review_regular_rating, 3);
  reg_pen := COALESCE(cfg.score_review_regular_penalty, 3);

  IF NEW.establishment_id IS NOT NULL AND NEW.rating_loja IS NOT NULL THEN
    IF NEW.rating_loja <= bad_max THEN
      PERFORM public.apply_score_penalty('establishment', NEW.establishment_id, bad_pen, 'Avaliação baixa da loja ('||NEW.rating_loja||'★)', NEW.order_id);
    ELSIF NEW.rating_loja = reg_rat THEN
      PERFORM public.apply_score_penalty('establishment', NEW.establishment_id, reg_pen, 'Avaliação regular da loja ('||NEW.rating_loja||'★)', NEW.order_id);
    END IF;
  END IF;

  IF NEW.rating_entregador IS NOT NULL AND NEW.order_id IS NOT NULL THEN
    SELECT entregador_id INTO courier_uid FROM public.deliveries WHERE order_id = NEW.order_id;
    IF courier_uid IS NOT NULL THEN
      IF NEW.rating_entregador <= bad_max THEN
        PERFORM public.apply_score_penalty('courier', courier_uid, bad_pen, 'Avaliação baixa do entregador ('||NEW.rating_entregador||'★)', NEW.order_id);
      ELSIF NEW.rating_entregador = reg_rat THEN
        PERFORM public.apply_score_penalty('courier', courier_uid, reg_pen, 'Avaliação regular do entregador ('||NEW.rating_entregador||'★)', NEW.order_id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: vehicle_requires_plate(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.vehicle_requires_plate(_tipo text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(lower(btrim(_tipo)), '') NOT IN (
    'bicicleta','bicicleta_eletrica','bike','bike_eletrica','patinete','patinete_eletrico','a_pe','pe'
  ) AND COALESCE(btrim(_tipo),'') <> ''
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ad_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    descricao text,
    preco_cents integer DEFAULT 0 NOT NULL,
    duracao_dias integer DEFAULT 7 NOT NULL,
    prioridade integer DEFAULT 0 NOT NULL,
    max_anuncios integer DEFAULT 1 NOT NULL,
    destaque_home boolean DEFAULT false NOT NULL,
    destaque_categoria boolean DEFAULT false NOT NULL,
    destaque_busca boolean DEFAULT false NOT NULL,
    impressoes_estimadas integer,
    cor text DEFAULT '#FF6B00'::text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: addon_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addon_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text,
    obrigatorio boolean DEFAULT false NOT NULL,
    minimo integer DEFAULT 0 NOT NULL,
    maximo integer DEFAULT 1 NOT NULL,
    selecao_multipla boolean DEFAULT false NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: addons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    addon_group_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text,
    foto_url text,
    preco_extra_cents integer DEFAULT 0 NOT NULL,
    estoque integer,
    qtd_maxima integer,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT addons_preco_extra_cents_check CHECK ((preco_extra_cents >= 0))
);


--
-- Name: addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    label text DEFAULT 'Casa'::text NOT NULL,
    cep text,
    rua text NOT NULL,
    numero text,
    complemento text,
    bairro text,
    cidade text NOT NULL,
    estado text,
    lat double precision,
    lng double precision,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    image_url text NOT NULL,
    link_url text,
    posicao integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    descricao text,
    status public.campaign_status DEFAULT 'draft'::public.campaign_status NOT NULL,
    audience text DEFAULT 'all'::text NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    banner_url text,
    cta_label text,
    cta_url text,
    coupon_id uuid,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    regras_json jsonb DEFAULT '{}'::jsonb
);


--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    product_id uuid NOT NULL,
    nome_snapshot text NOT NULL,
    preco_unit_cents integer NOT NULL,
    quantidade integer NOT NULL,
    observacoes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    addons jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT cart_items_preco_unit_cents_check CHECK ((preco_unit_cents >= 0)),
    CONSTRAINT cart_items_quantidade_check CHECK ((quantidade > 0))
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    descricao text,
    type public.coupon_type DEFAULT 'percent'::public.coupon_type NOT NULL,
    value_cents integer DEFAULT 0 NOT NULL,
    percent numeric(5,2) DEFAULT 0 NOT NULL,
    min_order_cents integer DEFAULT 0 NOT NULL,
    max_discount_cents integer,
    usage_limit integer,
    used_count integer DEFAULT 0 NOT NULL,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    ativo boolean DEFAULT true NOT NULL,
    establishment_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.coupons REPLICA IDENTITY FULL;


--
-- Name: courier_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courier_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    courier_id uuid NOT NULL,
    tipo text NOT NULL,
    url text,
    status text DEFAULT 'pendente'::text,
    motivo_recusa text,
    validade date,
    enviado_em timestamp with time zone DEFAULT now(),
    revisado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: courier_missions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courier_missions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    courier_id uuid NOT NULL,
    titulo text NOT NULL,
    descricao text,
    meta_entregas integer DEFAULT 0,
    progresso integer DEFAULT 0,
    bonus_cents integer DEFAULT 0,
    periodo_inicio timestamp with time zone DEFAULT now(),
    periodo_fim timestamp with time zone,
    status text DEFAULT 'ativa'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: courier_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courier_profiles (
    user_id uuid NOT NULL,
    cnh text,
    veiculo text,
    placa text,
    pix_key text,
    selfie_url text,
    doc_frente_url text,
    doc_verso_url text,
    status public.courier_status DEFAULT 'pendente'::public.courier_status NOT NULL,
    lat double precision,
    lng double precision,
    last_seen timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    foto_url text,
    cpf text,
    rg text,
    nascimento date,
    telefone text,
    whatsapp text,
    endereco jsonb,
    contato_emergencia_nome text,
    contato_emergencia_tel text,
    cnh_categoria text,
    cnh_validade date,
    pix_tipo text,
    banco_nome text,
    banco_agencia text,
    banco_conta text,
    banco_tipo text,
    banco_titular text,
    cidades_atuacao text[],
    avaliacao numeric DEFAULT 0,
    entregas_total integer DEFAULT 0,
    aceitacao_pct numeric DEFAULT 0,
    cancelamento_pct numeric DEFAULT 0,
    aprovacao text DEFAULT 'incompleto'::text,
    contato_emergencia_telefone text,
    pin_saque_hash text,
    pin_atualizado_em timestamp with time zone,
    cidade_atuacao text,
    bairros_atuacao text[],
    kyc_status text DEFAULT 'pendente'::text NOT NULL,
    kyc_motivo text,
    score_mensal integer DEFAULT 100 NOT NULL,
    score_ym text DEFAULT to_char(now(), 'YYYY-MM'::text) NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.courier_profiles REPLICA IDENTITY FULL;


--
-- Name: courier_vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courier_vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    courier_id uuid NOT NULL,
    tipo text NOT NULL,
    marca text,
    modelo text,
    ano integer,
    cor text,
    placa text,
    renavam text,
    foto_url text,
    documento_url text,
    ativo boolean DEFAULT true,
    status text DEFAULT 'em_analise'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: courier_withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courier_withdrawals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    courier_id uuid NOT NULL,
    valor_cents integer NOT NULL,
    metodo text DEFAULT 'pix'::text NOT NULL,
    pix_key text,
    banco_info jsonb,
    status text DEFAULT 'solicitado'::text,
    taxa_cents integer DEFAULT 0,
    liquido_cents integer,
    motivo_recusa text,
    processado_em timestamp with time zone,
    comprovante_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT courier_withdrawals_valor_cents_check CHECK ((valor_cents > 0))
);


--
-- Name: deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    entregador_id uuid,
    status public.delivery_status DEFAULT 'created'::public.delivery_status NOT NULL,
    valor_entrega_cents integer DEFAULT 0 NOT NULL,
    aceito_em timestamp with time zone,
    coletado_em timestamp with time zone,
    entregue_em timestamp with time zone,
    lat double precision,
    lng double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.deliveries REPLICA IDENTITY FULL;


--
-- Name: establishments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    nome text NOT NULL,
    cnpj text,
    telefone text,
    whatsapp text,
    categoria_id uuid,
    logo_url text,
    capa_url text,
    descricao text,
    endereco text,
    cidade text,
    estado text,
    lat double precision,
    lng double precision,
    taxa_entrega_cents integer DEFAULT 0 NOT NULL,
    raio_entrega_km numeric(5,2) DEFAULT 5 NOT NULL,
    tempo_medio_min integer DEFAULT 40 NOT NULL,
    pedido_minimo_cents integer DEFAULT 0 NOT NULL,
    pix_key text,
    status public.establishment_status DEFAULT 'pendente'::public.establishment_status NOT NULL,
    is_open boolean DEFAULT false NOT NULL,
    avaliacao numeric(3,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    razao_social text,
    slogan text,
    instagram text,
    site text,
    cor_destaque text,
    tipos text[] DEFAULT '{}'::text[] NOT NULL,
    banco_nome text,
    banco_agencia text,
    banco_conta text,
    banco_tipo text,
    banco_titular text,
    banco_documento text,
    kyc_status text DEFAULT 'pendente'::text NOT NULL,
    kyc_motivo text,
    score_mensal integer DEFAULT 100 NOT NULL,
    score_ym text DEFAULT to_char(now(), 'YYYY-MM'::text) NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    printer_enabled boolean DEFAULT false NOT NULL,
    printer_auto boolean DEFAULT false NOT NULL,
    printer_width_mm integer DEFAULT 80 NOT NULL
);

ALTER TABLE ONLY public.establishments REPLICA IDENTITY FULL;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    status public.order_status DEFAULT 'placed'::public.order_status NOT NULL,
    subtotal_cents integer DEFAULT 0 NOT NULL,
    frete_cents integer DEFAULT 0 NOT NULL,
    desconto_cents integer DEFAULT 0 NOT NULL,
    total_cents integer DEFAULT 0 NOT NULL,
    forma_pagamento public.payment_method DEFAULT 'pix'::public.payment_method NOT NULL,
    endereco_entrega jsonb,
    observacoes text,
    tempo_estimado_min integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancellation_reason text,
    cancelled_role text,
    refund_status public.refund_status DEFAULT 'none'::public.refund_status NOT NULL,
    refund_amount_cents integer DEFAULT 0 NOT NULL,
    refunded_at timestamp with time zone,
    codigo_entrega text,
    entrega_metodo_prova text DEFAULT 'code'::text,
    prova_url text,
    prova_assinatura text,
    troco_para_cents integer,
    dinheiro_recebido boolean DEFAULT false NOT NULL,
    entrega_observacao text,
    tipo_entrega text DEFAULT 'delivery'::text NOT NULL,
    codigo_expira_em timestamp with time zone,
    CONSTRAINT orders_entrega_metodo_prova_check CHECK ((entrega_metodo_prova = ANY (ARRAY['code'::text, 'photo'::text, 'signature'::text, 'contactless'::text]))),
    CONSTRAINT orders_tipo_entrega_check CHECK ((tipo_entrega = ANY (ARRAY['delivery'::text, 'pickup'::text])))
);

ALTER TABLE ONLY public.orders REPLICA IDENTITY FULL;


--
-- Name: demand_zones_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.demand_zones_view WITH (security_invoker='true') AS
 SELECT COALESCE(e.cidade, 'Sem cidade'::text) AS cidade,
    e.id AS establishment_id,
    e.nome AS estabelecimento,
    e.lat,
    e.lng,
    (count(o.id))::integer AS pedidos_2h,
    (avg(o.total_cents))::integer AS ticket_medio_cents,
    max(o.created_at) AS ultimo_pedido
   FROM (public.orders o
     JOIN public.establishments e ON ((e.id = o.establishment_id)))
  WHERE (o.created_at > (now() - '02:00:00'::interval))
  GROUP BY e.id, e.cidade, e.nome, e.lat, e.lng;


--
-- Name: estab_ad_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estab_ad_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    preco_pago_cents integer DEFAULT 0 NOT NULL,
    inicio_em timestamp with time zone,
    fim_em timestamp with time zone,
    metodo_pagamento text,
    observacao text,
    aprovado_por uuid,
    aprovado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: estab_banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estab_banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    titulo text NOT NULL,
    subtitulo text,
    imagem_url text,
    link_produto uuid,
    link_categoria uuid,
    cta_texto text,
    cta_link text,
    data_inicial timestamp with time zone,
    data_final timestamp with time zone,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: establishment_delivery_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishment_delivery_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    nome text NOT NULL,
    bairro text,
    raio_km numeric(5,2),
    taxa_cents integer DEFAULT 0 NOT NULL,
    tempo_min integer,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT establishment_delivery_zones_taxa_cents_check CHECK ((taxa_cents >= 0))
);


--
-- Name: establishment_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishment_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    tipo text NOT NULL,
    arquivo_url text NOT NULL,
    status text DEFAULT 'em_analise'::text NOT NULL,
    motivo_recusa text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: establishment_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishment_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    dia_semana smallint NOT NULL,
    abre time without time zone NOT NULL,
    fecha time without time zone NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT establishment_hours_dia_semana_check CHECK (((dia_semana >= 0) AND (dia_semana <= 6)))
);


--
-- Name: establishment_withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishment_withdrawals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    valor_cents integer NOT NULL,
    metodo text DEFAULT 'pix'::text NOT NULL,
    pix_key text,
    pix_tipo text,
    banco_info jsonb,
    titular_nome text,
    titular_documento text,
    status text DEFAULT 'solicitado'::text NOT NULL,
    taxa_cents integer DEFAULT 0,
    liquido_cents integer,
    motivo_recusa text,
    processado_em timestamp with time zone,
    comprovante_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT establishment_withdrawals_valor_cents_check CHECK ((valor_cents > 0))
);


--
-- Name: establishments_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.establishments_public WITH (security_invoker='true') AS
 SELECT id,
    owner_id,
    nome,
    categoria_id,
    logo_url,
    capa_url,
    descricao,
    endereco,
    cidade,
    estado,
    lat,
    lng,
    taxa_entrega_cents,
    raio_entrega_km,
    tempo_medio_min,
    pedido_minimo_cents,
    status,
    is_open,
    avaliacao,
    created_at,
    updated_at
   FROM public.establishments
  WHERE (status = 'aprovado'::public.establishment_status);


--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: global_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    nome text NOT NULL,
    icone text,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: login_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    dispositivo text,
    ip text,
    user_agent text,
    ultimo_acesso timestamp with time zone DEFAULT now() NOT NULL,
    revogada boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: menu_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    nome text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    audience text NOT NULL,
    nome text NOT NULL,
    categoria text DEFAULT 'geral'::text NOT NULL,
    titulo text NOT NULL,
    mensagem text NOT NULL,
    link_url text,
    tipo text DEFAULT 'info'::text NOT NULL,
    banner jsonb,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_templates_audience_check CHECK ((audience = ANY (ARRAY['cliente'::text, 'estabelecimento'::text, 'entregador'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    audience text,
    titulo text NOT NULL,
    mensagem text NOT NULL,
    link_url text,
    lida boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pushed_at timestamp with time zone,
    tipo text DEFAULT 'info'::text NOT NULL,
    banner jsonb
);


--
-- Name: order_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_chats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    escopo text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_chats_escopo_check CHECK ((escopo = ANY (ARRAY['client_courier'::text, 'store_courier'::text, 'client_store'::text])))
);


--
-- Name: order_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    entregador_id uuid,
    tipo text NOT NULL,
    descricao text,
    foto_url text,
    status text DEFAULT 'aberto'::text NOT NULL,
    protocolo text DEFAULT ('OC'::text || lpad(((floor((random() * (1000000)::double precision)))::integer)::text, 6, '0'::text)) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_incidents_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'em_analise'::text, 'resolvido'::text, 'cancelado'::text])))
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    nome_snapshot text NOT NULL,
    preco_unit_cents integer NOT NULL,
    quantidade integer NOT NULL,
    observacoes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    addons jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT order_items_quantidade_check CHECK ((quantidade > 0))
);


--
-- Name: order_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    sender_role text NOT NULL,
    tipo text DEFAULT 'text'::text NOT NULL,
    conteudo text,
    anexo_url text,
    lat numeric,
    lng numeric,
    lida_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['cliente'::text, 'estabelecimento'::text, 'entregador'::text]))),
    CONSTRAINT order_messages_tipo_check CHECK ((tipo = ANY (ARRAY['text'::text, 'image'::text, 'location'::text, 'audio'::text])))
);


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    from_status public.order_status,
    to_status public.order_status NOT NULL,
    changed_by uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    establishment_id uuid,
    courier_id uuid,
    gross_cents integer DEFAULT 0 NOT NULL,
    commission_cents integer DEFAULT 0 NOT NULL,
    delivery_fee_cents integer DEFAULT 0 NOT NULL,
    courier_payout_cents integer DEFAULT 0 NOT NULL,
    merchant_payout_cents integer DEFAULT 0 NOT NULL,
    platform_revenue_cents integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    id integer DEFAULT 1 NOT NULL,
    platform_name text DEFAULT 'WiFome'::text NOT NULL,
    commission_pct numeric(5,2) DEFAULT 15.00 NOT NULL,
    default_delivery_fee_cents integer DEFAULT 500 NOT NULL,
    default_radius_km numeric(5,2) DEFAULT 5.00 NOT NULL,
    maintenance_mode boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    bestseller_threshold integer DEFAULT 15 NOT NULL,
    ad_default_seconds integer DEFAULT 8 NOT NULL,
    score_delay_warn_ratio numeric DEFAULT 1.25 NOT NULL,
    score_delay_warn_penalty integer DEFAULT 5 NOT NULL,
    score_delay_severe_ratio numeric DEFAULT 1.5 NOT NULL,
    score_delay_severe_penalty integer DEFAULT 10 NOT NULL,
    score_review_bad_max integer DEFAULT 2 NOT NULL,
    score_review_bad_penalty integer DEFAULT 10 NOT NULL,
    score_review_regular_rating integer DEFAULT 3 NOT NULL,
    score_review_regular_penalty integer DEFAULT 3 NOT NULL,
    score_start integer DEFAULT 100 NOT NULL,
    score_band_warn integer DEFAULT 85 NOT NULL,
    score_band_critical integer DEFAULT 60 NOT NULL,
    CONSTRAINT single_row CHECK ((id = 1))
);


--
-- Name: product_addon_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_addon_groups (
    product_id uuid NOT NULL,
    addon_group_id uuid NOT NULL,
    ordem integer DEFAULT 0 NOT NULL
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    nome text NOT NULL,
    preco_cents integer NOT NULL,
    preco_promo_cents integer,
    estoque integer,
    tempo_extra_min integer,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_variants_preco_cents_check CHECK ((preco_cents >= 0)),
    CONSTRAINT product_variants_preco_promo_cents_check CHECK (((preco_promo_cents IS NULL) OR (preco_promo_cents >= 0)))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    menu_category_id uuid,
    nome text NOT NULL,
    descricao text,
    foto_url text,
    preco_cents integer NOT NULL,
    preco_promo_cents integer,
    tempo_preparo_min integer DEFAULT 20,
    estoque integer,
    disponivel boolean DEFAULT true NOT NULL,
    destaque boolean DEFAULT false NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT products_preco_cents_check CHECK ((preco_cents >= 0)),
    CONSTRAINT products_preco_promo_cents_check CHECK (((preco_promo_cents IS NULL) OR (preco_promo_cents >= 0)))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    nome text DEFAULT ''::text NOT NULL,
    foto_url text,
    telefone text,
    cpf text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    cidade_ativa text,
    estado_ativo text
);


--
-- Name: public_platform_settings; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.public_platform_settings WITH (security_invoker='true') AS
 SELECT bestseller_threshold,
    ad_default_seconds
   FROM public.platform_settings
  WHERE (id = 1);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    entregador_id uuid,
    rating_loja smallint NOT NULL,
    rating_entregador smallint,
    comentario text,
    problema_reportado boolean DEFAULT false NOT NULL,
    problema_descricao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resposta text,
    respondido_em timestamp with time zone,
    CONSTRAINT reviews_comentario_check CHECK ((char_length(comentario) <= 1000)),
    CONSTRAINT reviews_problema_descricao_check CHECK ((char_length(problema_descricao) <= 1000)),
    CONSTRAINT reviews_rating_entregador_check CHECK (((rating_entregador >= 1) AND (rating_entregador <= 5))),
    CONSTRAINT reviews_rating_loja_check CHECK (((rating_loja >= 1) AND (rating_loja <= 5)))
);


--
-- Name: public_reviews; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.public_reviews WITH (security_invoker=off) AS
 SELECT r.id,
    r.establishment_id,
    r.order_id,
    r.rating_loja,
    r.rating_entregador,
    r.comentario,
    r.resposta,
    r.respondido_em,
    r.problema_reportado,
    r.created_at
   FROM (public.reviews r
     JOIN public.establishments e ON ((e.id = r.establishment_id)))
  WHERE (e.status = 'aprovado'::public.establishment_status);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: score_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.score_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    ym text NOT NULL,
    penalty integer NOT NULL,
    motivo text NOT NULL,
    order_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT score_events_entity_type_check CHECK ((entity_type = ANY (ARRAY['establishment'::text, 'courier'::text])))
);


--
-- Name: sos_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sos_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    courier_id uuid NOT NULL,
    order_id uuid,
    tipo text NOT NULL,
    lat numeric,
    lng numeric,
    descricao text,
    resolvido boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sponsored_ads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sponsored_ads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid,
    titulo text NOT NULL,
    subtitulo text,
    imagem_url text,
    cta_texto text DEFAULT 'Ver mais'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    patrocinado boolean DEFAULT true NOT NULL,
    prioridade integer DEFAULT 0 NOT NULL,
    duracao_segundos integer DEFAULT 6 NOT NULL,
    inicio_em timestamp with time zone,
    fim_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subscription_id uuid,
    banner_path text,
    video_url text,
    destino_url text,
    status text DEFAULT 'approved'::text NOT NULL,
    motivo_recusa text
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    tipo text NOT NULL,
    quantidade integer NOT NULL,
    motivo text,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_movements_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'saida'::text, 'ajuste'::text, 'perda'::text, 'venda'::text])))
);


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    mensagem text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    assunto text NOT NULL,
    status public.ticket_status DEFAULT 'open'::public.ticket_status NOT NULL,
    priority public.ticket_priority DEFAULT 'normal'::public.ticket_priority NOT NULL,
    order_id uuid,
    assigned_to uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    user_id uuid,
    email text NOT NULL,
    nome text,
    papel public.team_role DEFAULT 'atendente'::public.team_role NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    convidado_em timestamp with time zone DEFAULT now() NOT NULL,
    aceito_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tracking_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tracking_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    courier_id uuid NOT NULL,
    order_id uuid,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    accuracy double precision,
    heading double precision,
    speed double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vw_admin_audit_logs; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_admin_audit_logs AS
 SELECT l.id,
    l.admin_id,
    p.nome AS admin_nome,
    l.action,
    l.entity_type,
    l.entity_id,
    l.created_at
   FROM (public.admin_audit_log l
     LEFT JOIN public.profiles p ON ((l.admin_id = p.id)));


--
-- Name: ad_plans ad_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_plans
    ADD CONSTRAINT ad_plans_pkey PRIMARY KEY (id);


--
-- Name: addon_groups addon_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addon_groups
    ADD CONSTRAINT addon_groups_pkey PRIMARY KEY (id);


--
-- Name: addons addons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addons
    ADD CONSTRAINT addons_pkey PRIMARY KEY (id);


--
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: banners banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banners
    ADD CONSTRAINT banners_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_code_key UNIQUE (code);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: courier_documents courier_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_documents
    ADD CONSTRAINT courier_documents_pkey PRIMARY KEY (id);


--
-- Name: courier_missions courier_missions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_missions
    ADD CONSTRAINT courier_missions_pkey PRIMARY KEY (id);


--
-- Name: courier_profiles courier_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_profiles
    ADD CONSTRAINT courier_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: courier_vehicles courier_vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_vehicles
    ADD CONSTRAINT courier_vehicles_pkey PRIMARY KEY (id);


--
-- Name: courier_withdrawals courier_withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_withdrawals
    ADD CONSTRAINT courier_withdrawals_pkey PRIMARY KEY (id);


--
-- Name: deliveries deliveries_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_order_id_key UNIQUE (order_id);


--
-- Name: deliveries deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);


--
-- Name: estab_ad_subscriptions estab_ad_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estab_ad_subscriptions
    ADD CONSTRAINT estab_ad_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: estab_banners estab_banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estab_banners
    ADD CONSTRAINT estab_banners_pkey PRIMARY KEY (id);


--
-- Name: establishment_delivery_zones establishment_delivery_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_delivery_zones
    ADD CONSTRAINT establishment_delivery_zones_pkey PRIMARY KEY (id);


--
-- Name: establishment_documents establishment_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_documents
    ADD CONSTRAINT establishment_documents_pkey PRIMARY KEY (id);


--
-- Name: establishment_hours establishment_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_hours
    ADD CONSTRAINT establishment_hours_pkey PRIMARY KEY (id);


--
-- Name: establishment_withdrawals establishment_withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_withdrawals
    ADD CONSTRAINT establishment_withdrawals_pkey PRIMARY KEY (id);


--
-- Name: establishments establishments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT establishments_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_user_id_establishment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_establishment_id_key UNIQUE (user_id, establishment_id);


--
-- Name: global_categories global_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_categories
    ADD CONSTRAINT global_categories_pkey PRIMARY KEY (id);


--
-- Name: global_categories global_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_categories
    ADD CONSTRAINT global_categories_slug_key UNIQUE (slug);


--
-- Name: login_sessions login_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_sessions
    ADD CONSTRAINT login_sessions_pkey PRIMARY KEY (id);


--
-- Name: menu_categories menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_chats order_chats_order_id_escopo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_chats
    ADD CONSTRAINT order_chats_order_id_escopo_key UNIQUE (order_id, escopo);


--
-- Name: order_chats order_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_chats
    ADD CONSTRAINT order_chats_pkey PRIMARY KEY (id);


--
-- Name: order_incidents order_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_incidents
    ADD CONSTRAINT order_incidents_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_messages order_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_messages
    ADD CONSTRAINT order_messages_pkey PRIMARY KEY (id);


--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: platform_ledger platform_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ledger
    ADD CONSTRAINT platform_ledger_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: product_addon_groups product_addon_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_addon_groups
    ADD CONSTRAINT product_addon_groups_pkey PRIMARY KEY (product_id, addon_group_id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_order_id_key UNIQUE (order_id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: score_events score_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.score_events
    ADD CONSTRAINT score_events_pkey PRIMARY KEY (id);


--
-- Name: sos_events sos_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sos_events
    ADD CONSTRAINT sos_events_pkey PRIMARY KEY (id);


--
-- Name: sponsored_ads sponsored_ads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsored_ads
    ADD CONSTRAINT sponsored_ads_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_establishment_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_establishment_id_email_key UNIQUE (establishment_id, email);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: tracking_points tracking_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking_points
    ADD CONSTRAINT tracking_points_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_addon_groups_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_addon_groups_estab ON public.addon_groups USING btree (establishment_id);


--
-- Name: idx_addons_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_addons_group ON public.addons USING btree (addon_group_id);


--
-- Name: idx_addresses_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_addresses_user ON public.addresses USING btree (user_id);


--
-- Name: idx_admin_audit_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_admin ON public.admin_audit_log USING btree (admin_id);


--
-- Name: idx_admin_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_created ON public.admin_audit_log USING btree (created_at DESC);


--
-- Name: idx_campaigns_coupon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_coupon ON public.campaigns USING btree (coupon_id);


--
-- Name: idx_campaigns_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_created_by ON public.campaigns USING btree (created_by);


--
-- Name: idx_cart_items_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_items_estab ON public.cart_items USING btree (establishment_id);


--
-- Name: idx_cart_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_items_product ON public.cart_items USING btree (product_id);


--
-- Name: idx_cart_items_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_items_user ON public.cart_items USING btree (user_id);


--
-- Name: idx_coupons_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_code ON public.coupons USING btree (code);


--
-- Name: idx_coupons_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_created_by ON public.coupons USING btree (created_by);


--
-- Name: idx_coupons_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_estab ON public.coupons USING btree (establishment_id);


--
-- Name: idx_courier_documents_courier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courier_documents_courier ON public.courier_documents USING btree (courier_id);


--
-- Name: idx_courier_missions_courier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courier_missions_courier ON public.courier_missions USING btree (courier_id);


--
-- Name: idx_courier_vehicles_courier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courier_vehicles_courier ON public.courier_vehicles USING btree (courier_id);


--
-- Name: idx_courier_withdrawals_courier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courier_withdrawals_courier ON public.courier_withdrawals USING btree (courier_id);


--
-- Name: idx_deliveries_courier_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deliveries_courier_status ON public.deliveries USING btree (entregador_id, status);


--
-- Name: idx_deliveries_entregador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deliveries_entregador ON public.deliveries USING btree (entregador_id);


--
-- Name: idx_deliveries_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deliveries_order ON public.deliveries USING btree (order_id);


--
-- Name: idx_deliveries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deliveries_status ON public.deliveries USING btree (status);


--
-- Name: idx_dz_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dz_estab ON public.establishment_delivery_zones USING btree (establishment_id);


--
-- Name: idx_estab_ad_sub_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estab_ad_sub_estab ON public.estab_ad_subscriptions USING btree (establishment_id);


--
-- Name: idx_estab_ad_sub_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estab_ad_sub_status ON public.estab_ad_subscriptions USING btree (status);


--
-- Name: idx_estab_ad_subs_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estab_ad_subs_estab ON public.estab_ad_subscriptions USING btree (establishment_id);


--
-- Name: idx_estab_ad_subs_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estab_ad_subs_plan ON public.estab_ad_subscriptions USING btree (plan_id);


--
-- Name: idx_estab_banners_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estab_banners_categoria ON public.estab_banners USING btree (link_categoria);


--
-- Name: idx_estab_banners_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estab_banners_estab ON public.estab_banners USING btree (establishment_id);


--
-- Name: idx_estab_banners_produto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estab_banners_produto ON public.estab_banners USING btree (link_produto);


--
-- Name: idx_estab_docs_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estab_docs_estab ON public.establishment_documents USING btree (establishment_id);


--
-- Name: idx_estab_withdrawals_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estab_withdrawals_estab ON public.establishment_withdrawals USING btree (establishment_id);


--
-- Name: idx_estab_withdrawals_requested_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estab_withdrawals_requested_by ON public.establishment_withdrawals USING btree (requested_by);


--
-- Name: idx_estab_withdrawals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estab_withdrawals_status ON public.establishment_withdrawals USING btree (status);


--
-- Name: idx_establishments_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_establishments_categoria ON public.establishments USING btree (categoria_id);


--
-- Name: idx_establishments_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_establishments_owner ON public.establishments USING btree (owner_id);


--
-- Name: idx_establishments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_establishments_status ON public.establishments USING btree (status);


--
-- Name: idx_establishments_status_cidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_establishments_status_cidade ON public.establishments USING btree (status, cidade);


--
-- Name: idx_favorites_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorites_estab ON public.favorites USING btree (establishment_id);


--
-- Name: idx_favorites_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorites_user ON public.favorites USING btree (user_id);


--
-- Name: idx_hours_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hours_estab ON public.establishment_hours USING btree (establishment_id);


--
-- Name: idx_ledger_courier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_courier ON public.platform_ledger USING btree (courier_id);


--
-- Name: idx_ledger_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_estab ON public.platform_ledger USING btree (establishment_id);


--
-- Name: idx_menu_categories_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_categories_estab ON public.menu_categories USING btree (establishment_id);


--
-- Name: idx_notifications_pending_push; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_pending_push ON public.notifications USING btree (created_at) WHERE (pushed_at IS NULL);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_order_incidents_courier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_incidents_courier ON public.order_incidents USING btree (entregador_id);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_product ON public.order_items USING btree (product_id);


--
-- Name: idx_order_messages_chat_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_messages_chat_created ON public.order_messages USING btree (chat_id, created_at);


--
-- Name: idx_order_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_messages_sender ON public.order_messages USING btree (sender_id);


--
-- Name: idx_orders_cancelled_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_cancelled_by ON public.orders USING btree (cancelled_by);


--
-- Name: idx_orders_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_cliente ON public.orders USING btree (cliente_id);


--
-- Name: idx_orders_cliente_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_cliente_created ON public.orders USING btree (cliente_id, created_at DESC);


--
-- Name: idx_orders_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_estab ON public.orders USING btree (establishment_id);


--
-- Name: idx_orders_estab_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_estab_status_created ON public.orders USING btree (establishment_id, status, created_at DESC);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_osh_changed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_osh_changed_by ON public.order_status_history USING btree (changed_by);


--
-- Name: idx_osh_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_osh_order ON public.order_status_history USING btree (order_id);


--
-- Name: idx_osh_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_osh_order_id ON public.order_status_history USING btree (order_id);


--
-- Name: idx_pag_addon_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pag_addon_group ON public.product_addon_groups USING btree (addon_group_id);


--
-- Name: idx_platform_settings_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_settings_updated_by ON public.platform_settings USING btree (updated_by);


--
-- Name: idx_products_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_categoria ON public.products USING btree (menu_category_id);


--
-- Name: idx_products_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_estab ON public.products USING btree (establishment_id);


--
-- Name: idx_products_estab_disp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_estab_disp ON public.products USING btree (establishment_id, disponivel);


--
-- Name: idx_push_subs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subs_user ON public.push_subscriptions USING btree (user_id);


--
-- Name: idx_reviews_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_cliente ON public.reviews USING btree (cliente_id);


--
-- Name: idx_reviews_entregador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_entregador ON public.reviews USING btree (entregador_id);


--
-- Name: idx_reviews_estab_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_estab_created ON public.reviews USING btree (establishment_id, created_at DESC);


--
-- Name: idx_reviews_establishment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_establishment ON public.reviews USING btree (establishment_id);


--
-- Name: idx_reviews_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_order ON public.reviews USING btree (order_id);


--
-- Name: idx_score_events_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_score_events_entity ON public.score_events USING btree (entity_type, entity_id, ym DESC);


--
-- Name: idx_sos_courier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sos_courier ON public.sos_events USING btree (courier_id);


--
-- Name: idx_sos_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sos_order ON public.sos_events USING btree (order_id);


--
-- Name: idx_sponsored_ads_ativo_prioridade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sponsored_ads_ativo_prioridade ON public.sponsored_ads USING btree (ativo, prioridade DESC, created_at DESC);


--
-- Name: idx_sponsored_ads_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sponsored_ads_estab ON public.sponsored_ads USING btree (establishment_id);


--
-- Name: idx_sponsored_ads_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sponsored_ads_subscription ON public.sponsored_ads USING btree (subscription_id);


--
-- Name: idx_stock_mov_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_mov_estab ON public.stock_movements USING btree (establishment_id, created_at DESC);


--
-- Name: idx_stock_mov_prod; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_mov_prod ON public.stock_movements USING btree (product_id, created_at DESC);


--
-- Name: idx_stock_movements_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_product ON public.stock_movements USING btree (product_id);


--
-- Name: idx_stock_movements_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_user ON public.stock_movements USING btree (user_id);


--
-- Name: idx_support_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_sender ON public.support_messages USING btree (sender_id);


--
-- Name: idx_support_messages_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_ticket ON public.support_messages USING btree (ticket_id);


--
-- Name: idx_support_tickets_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_assigned ON public.support_tickets USING btree (assigned_to);


--
-- Name: idx_support_tickets_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_order ON public.support_tickets USING btree (order_id);


--
-- Name: idx_support_tickets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_user ON public.support_tickets USING btree (user_id);


--
-- Name: idx_team_estab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_estab ON public.team_members USING btree (establishment_id);


--
-- Name: idx_team_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_user ON public.team_members USING btree (user_id);


--
-- Name: idx_tracking_points_courier_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tracking_points_courier_created ON public.tracking_points USING btree (courier_id, created_at DESC);


--
-- Name: idx_tracking_points_order_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tracking_points_order_created ON public.tracking_points USING btree (order_id, created_at DESC);


--
-- Name: idx_variants_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_product ON public.product_variants USING btree (product_id);


--
-- Name: ledger_estab_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ledger_estab_idx ON public.platform_ledger USING btree (establishment_id, created_at DESC);


--
-- Name: ledger_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ledger_order_idx ON public.platform_ledger USING btree (order_id);


--
-- Name: login_sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_sessions_user_id_idx ON public.login_sessions USING btree (user_id);


--
-- Name: order_incidents_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_incidents_order_id_idx ON public.order_incidents USING btree (order_id);


--
-- Name: order_messages_chat_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_messages_chat_id_created_at_idx ON public.order_messages USING btree (chat_id, created_at DESC);


--
-- Name: tracking_points_courier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tracking_points_courier_idx ON public.tracking_points USING btree (courier_id, created_at DESC);


--
-- Name: tracking_points_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tracking_points_order_idx ON public.tracking_points USING btree (order_id, created_at DESC);


--
-- Name: notifications notifications_ping_push; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notifications_ping_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.trg_notifications_ping_push();


--
-- Name: orders orders_status_after_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_status_after_trg AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_status_after();


--
-- Name: orders orders_status_guard_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_status_guard_trg BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_status_guard();


--
-- Name: ad_plans trg_ad_plans_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ad_plans_updated BEFORE UPDATE ON public.ad_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: addon_groups trg_addon_groups_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_addon_groups_updated BEFORE UPDATE ON public.addon_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: addons trg_addons_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_addons_updated BEFORE UPDATE ON public.addons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: addresses trg_addresses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_addresses_updated_at BEFORE UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: platform_settings trg_audit_platform_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_platform_settings AFTER UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION private.audit_platform_settings_change();


--
-- Name: products trg_auto_disable_on_zero; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_disable_on_zero BEFORE UPDATE OF estoque ON public.products FOR EACH ROW EXECUTE FUNCTION public.auto_disable_product_on_zero_stock();


--
-- Name: cart_items trg_cart_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cart_items_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: courier_documents trg_courier_documents_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_courier_documents_upd BEFORE UPDATE ON public.courier_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: courier_profiles trg_courier_kyc_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_courier_kyc_notify AFTER UPDATE OF kyc_status ON public.courier_profiles FOR EACH ROW EXECUTE FUNCTION public.notify_courier_kyc_change();


--
-- Name: courier_missions trg_courier_missions_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_courier_missions_upd BEFORE UPDATE ON public.courier_missions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: courier_profiles trg_courier_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_courier_profiles_updated_at BEFORE UPDATE ON public.courier_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: courier_vehicles trg_courier_vehicles_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_courier_vehicles_upd BEFORE UPDATE ON public.courier_vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: courier_withdrawals trg_courier_withdrawals_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_courier_withdrawals_upd BEFORE UPDATE ON public.courier_withdrawals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: orders trg_create_ledger_on_delivered; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_create_ledger_on_delivered AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.create_ledger_on_delivered();


--
-- Name: deliveries trg_deliveries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deliveries_updated_at BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: estab_ad_subscriptions trg_estab_ad_sub_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_estab_ad_sub_updated BEFORE UPDATE ON public.estab_ad_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: estab_banners trg_estab_banners_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_estab_banners_updated BEFORE UPDATE ON public.estab_banners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: establishment_documents trg_estab_docs_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_estab_docs_upd BEFORE UPDATE ON public.establishment_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: establishments trg_estab_kyc_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_estab_kyc_notify AFTER UPDATE OF kyc_status ON public.establishments FOR EACH ROW EXECUTE FUNCTION public.notify_estab_kyc_change();


--
-- Name: establishment_withdrawals trg_estab_withdrawals_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_estab_withdrawals_upd BEFORE UPDATE ON public.establishment_withdrawals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: establishments trg_establishments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_establishments_updated_at BEFORE UPDATE ON public.establishments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: orders trg_ledger_on_delivered; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ledger_on_delivered AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.create_ledger_on_delivered();


--
-- Name: notification_templates trg_notification_templates_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_templates_updated BEFORE UPDATE ON public.notification_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: orders trg_notify_client_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_client_status AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.notify_client_on_status();


--
-- Name: deliveries trg_notify_couriers_new_ride; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_couriers_new_ride AFTER INSERT ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.notify_couriers_new_ride();


--
-- Name: sponsored_ads trg_notify_estab_ad_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_estab_ad_status AFTER UPDATE ON public.sponsored_ads FOR EACH ROW EXECUTE FUNCTION public.notify_estab_ad_status();


--
-- Name: estab_ad_subscriptions trg_notify_estab_ad_sub; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_estab_ad_sub AFTER UPDATE ON public.estab_ad_subscriptions FOR EACH ROW EXECUTE FUNCTION public.notify_estab_ad_sub_status();


--
-- Name: orders trg_notify_estab_new_order; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_estab_new_order AFTER INSERT ON public.orders FOR EACH ROW WHEN ((new.status = 'placed'::public.order_status)) EXECUTE FUNCTION public.notify_estab_new_order();


--
-- Name: orders trg_orders_delay_score; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_orders_delay_score AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_orders_delay_penalty();


--
-- Name: orders trg_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products trg_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: reviews trg_reviews_recompute; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reviews_recompute AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.recompute_establishment_rating();


--
-- Name: reviews trg_reviews_score; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reviews_score AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.trg_reviews_score_penalty();


--
-- Name: orders trg_set_delivery_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_delivery_code BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_delivery_code();


--
-- Name: orders trg_set_delivery_code_expiry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_delivery_code_expiry BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.set_delivery_code_expiry();


--
-- Name: orders trg_set_delivery_code_expiry_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_delivery_code_expiry_ins BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION private.set_delivery_code_expiry_ins();


--
-- Name: sponsored_ads trg_sponsored_ads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sponsored_ads_updated_at BEFORE UPDATE ON public.sponsored_ads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: addresses trg_sync_client_onboarding_address; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_client_onboarding_address AFTER INSERT OR UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.sync_client_onboarding_from_address();


--
-- Name: profiles trg_sync_client_onboarding_profile; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_client_onboarding_profile BEFORE UPDATE OF nome, telefone ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_client_onboarding_from_profile();


--
-- Name: courier_profiles trg_sync_courier_onboarding; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_courier_onboarding BEFORE INSERT OR UPDATE ON public.courier_profiles FOR EACH ROW EXECUTE FUNCTION public.sync_courier_onboarding();


--
-- Name: courier_vehicles trg_sync_courier_vehicle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_courier_vehicle AFTER INSERT OR DELETE OR UPDATE ON public.courier_vehicles FOR EACH ROW EXECUTE FUNCTION public.sync_courier_vehicle_to_profile();


--
-- Name: establishments trg_sync_estab_onboarding; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_estab_onboarding BEFORE INSERT OR UPDATE ON public.establishments FOR EACH ROW EXECUTE FUNCTION public.sync_estab_onboarding();


--
-- Name: team_members trg_team_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_team_updated BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_variants trg_variants_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_variants_updated BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: push_subscriptions update_push_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_push_subscriptions_updated_at BEFORE UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: addon_groups addon_groups_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addon_groups
    ADD CONSTRAINT addon_groups_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: addons addons_addon_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addons
    ADD CONSTRAINT addons_addon_group_id_fkey FOREIGN KEY (addon_group_id) REFERENCES public.addon_groups(id) ON DELETE CASCADE;


--
-- Name: addresses addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admin_audit_log admin_audit_log_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: cart_items cart_items_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: coupons coupons_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: coupons coupons_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: courier_documents courier_documents_courier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_documents
    ADD CONSTRAINT courier_documents_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: courier_missions courier_missions_courier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_missions
    ADD CONSTRAINT courier_missions_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: courier_profiles courier_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_profiles
    ADD CONSTRAINT courier_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: courier_vehicles courier_vehicles_courier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_vehicles
    ADD CONSTRAINT courier_vehicles_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: courier_withdrawals courier_withdrawals_courier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_withdrawals
    ADD CONSTRAINT courier_withdrawals_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: deliveries deliveries_entregador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_entregador_id_fkey FOREIGN KEY (entregador_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: deliveries deliveries_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: estab_ad_subscriptions estab_ad_subscriptions_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estab_ad_subscriptions
    ADD CONSTRAINT estab_ad_subscriptions_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: estab_ad_subscriptions estab_ad_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estab_ad_subscriptions
    ADD CONSTRAINT estab_ad_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.ad_plans(id);


--
-- Name: estab_banners estab_banners_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estab_banners
    ADD CONSTRAINT estab_banners_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: estab_banners estab_banners_link_categoria_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estab_banners
    ADD CONSTRAINT estab_banners_link_categoria_fkey FOREIGN KEY (link_categoria) REFERENCES public.menu_categories(id) ON DELETE SET NULL;


--
-- Name: estab_banners estab_banners_link_produto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estab_banners
    ADD CONSTRAINT estab_banners_link_produto_fkey FOREIGN KEY (link_produto) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: establishment_delivery_zones establishment_delivery_zones_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_delivery_zones
    ADD CONSTRAINT establishment_delivery_zones_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: establishment_documents establishment_documents_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_documents
    ADD CONSTRAINT establishment_documents_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: establishment_hours establishment_hours_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_hours
    ADD CONSTRAINT establishment_hours_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: establishment_withdrawals establishment_withdrawals_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_withdrawals
    ADD CONSTRAINT establishment_withdrawals_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: establishment_withdrawals establishment_withdrawals_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_withdrawals
    ADD CONSTRAINT establishment_withdrawals_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: establishments establishments_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT establishments_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.global_categories(id);


--
-- Name: establishments establishments_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT establishments_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: favorites favorites_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: favorites favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: login_sessions login_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_sessions
    ADD CONSTRAINT login_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: menu_categories menu_categories_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: order_chats order_chats_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_chats
    ADD CONSTRAINT order_chats_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_incidents order_incidents_entregador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_incidents
    ADD CONSTRAINT order_incidents_entregador_id_fkey FOREIGN KEY (entregador_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: order_incidents order_incidents_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_incidents
    ADD CONSTRAINT order_incidents_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: order_messages order_messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_messages
    ADD CONSTRAINT order_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.order_chats(id) ON DELETE CASCADE;


--
-- Name: order_messages order_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_messages
    ADD CONSTRAINT order_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: order_status_history order_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);


--
-- Name: order_status_history order_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id);


--
-- Name: orders orders_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: orders orders_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE RESTRICT;


--
-- Name: platform_ledger platform_ledger_courier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ledger
    ADD CONSTRAINT platform_ledger_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES auth.users(id);


--
-- Name: platform_ledger platform_ledger_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ledger
    ADD CONSTRAINT platform_ledger_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE SET NULL;


--
-- Name: platform_ledger platform_ledger_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ledger
    ADD CONSTRAINT platform_ledger_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: platform_settings platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: product_addon_groups product_addon_groups_addon_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_addon_groups
    ADD CONSTRAINT product_addon_groups_addon_group_id_fkey FOREIGN KEY (addon_group_id) REFERENCES public.addon_groups(id) ON DELETE CASCADE;


--
-- Name: product_addon_groups product_addon_groups_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_addon_groups
    ADD CONSTRAINT product_addon_groups_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: products products_menu_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_menu_category_id_fkey FOREIGN KEY (menu_category_id) REFERENCES public.menu_categories(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_entregador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_entregador_id_fkey FOREIGN KEY (entregador_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: reviews reviews_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: sos_events sos_events_courier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sos_events
    ADD CONSTRAINT sos_events_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sos_events sos_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sos_events
    ADD CONSTRAINT sos_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: sponsored_ads sponsored_ads_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsored_ads
    ADD CONSTRAINT sponsored_ads_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: sponsored_ads sponsored_ads_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsored_ads
    ADD CONSTRAINT sponsored_ads_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.estab_ad_subscriptions(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: support_messages support_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);


--
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id);


--
-- Name: support_tickets support_tickets_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tracking_points tracking_points_courier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking_points
    ADD CONSTRAINT tracking_points_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tracking_points tracking_points_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking_points
    ADD CONSTRAINT tracking_points_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: courier_profiles Admins full access courier_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access courier_profiles" ON public.courier_profiles TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: order_items Admins full access order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access order_items" ON public.order_items TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: products Admins full access products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access products" ON public.products TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins full access profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access profiles" ON public.profiles TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: reviews Admins full access reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access reviews" ON public.reviews TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins full access user_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access user_roles" ON public.user_roles TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: admin_audit_log Admins insert audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins insert audit log" ON public.admin_audit_log FOR INSERT TO authenticated WITH CHECK ((private.has_role(auth.uid(), 'admin'::public.app_role) AND (admin_id = auth.uid())));


--
-- Name: sponsored_ads Admins manage ads (delete); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage ads (delete)" ON public.sponsored_ads FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sponsored_ads Admins manage ads (insert); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage ads (insert)" ON public.sponsored_ads FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sponsored_ads Admins manage ads (select); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage ads (select)" ON public.sponsored_ads FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sponsored_ads Admins manage ads (update); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage ads (update)" ON public.sponsored_ads FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: admin_audit_log Admins read audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read audit log" ON public.admin_audit_log FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: platform_settings Admins read settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read settings" ON public.platform_settings FOR SELECT USING (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: platform_settings Admins update settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update settings" ON public.platform_settings FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: reviews Customer can review own delivered order; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customer can review own delivered order" ON public.reviews FOR INSERT TO authenticated WITH CHECK (((cliente_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = reviews.order_id) AND (o.cliente_id = auth.uid()) AND (o.status = 'delivered'::public.order_status) AND (o.establishment_id = reviews.establishment_id))))));


--
-- Name: sponsored_ads Estab owner can delete own ads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Estab owner can delete own ads" ON public.sponsored_ads FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = sponsored_ads.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: sponsored_ads Estab owner can insert own ads with active subscription; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Estab owner can insert own ads with active subscription" ON public.sponsored_ads FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = sponsored_ads.establishment_id) AND (e.owner_id = auth.uid())))) AND ((subscription_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.estab_ad_subscriptions s
  WHERE ((s.id = sponsored_ads.subscription_id) AND (s.establishment_id = sponsored_ads.establishment_id) AND (s.status = 'active'::text)))))));


--
-- Name: sponsored_ads Estab owner can update own ads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Estab owner can update own ads" ON public.sponsored_ads FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = sponsored_ads.establishment_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = sponsored_ads.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: sponsored_ads Estab owner can view own ads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Estab owner can view own ads" ON public.sponsored_ads FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = sponsored_ads.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: sponsored_ads Public can view approved active ads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view approved active ads" ON public.sponsored_ads FOR SELECT USING (((ativo = true) AND (status = 'approved'::text) AND ((inicio_em IS NULL) OR (inicio_em <= now())) AND ((fim_em IS NULL) OR (fim_em >= now()))));


--
-- Name: ad_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ad_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_plans ad_plans admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ad_plans admin manage" ON public.ad_plans USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: ad_plans ad_plans read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ad_plans read active" ON public.ad_plans FOR SELECT USING ((ativo OR private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: addon_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.addon_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: addon_groups addon_groups_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addon_groups_admin_all ON public.addon_groups TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: addon_groups addon_groups_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addon_groups_owner_all ON public.addon_groups TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = addon_groups.establishment_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = addon_groups.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: addon_groups addon_groups_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addon_groups_public_read ON public.addon_groups FOR SELECT TO authenticated, anon USING ((ativo AND (EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = addon_groups.establishment_id) AND (e.status = 'aprovado'::public.establishment_status))))));


--
-- Name: addons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;

--
-- Name: addons addons_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addons_admin_all ON public.addons TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: addons addons_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addons_owner_all ON public.addons TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.addon_groups g
     JOIN public.establishments e ON ((e.id = g.establishment_id)))
  WHERE ((g.id = addons.addon_group_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.addon_groups g
     JOIN public.establishments e ON ((e.id = g.establishment_id)))
  WHERE ((g.id = addons.addon_group_id) AND (e.owner_id = auth.uid())))));


--
-- Name: addons addons_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addons_public_read ON public.addons FOR SELECT TO authenticated, anon USING ((ativo AND (EXISTS ( SELECT 1
   FROM (public.addon_groups g
     JOIN public.establishments e ON ((e.id = g.establishment_id)))
  WHERE ((g.id = addons.addon_group_id) AND (e.status = 'aprovado'::public.establishment_status))))));


--
-- Name: addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: addresses addresses_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addresses_own ON public.addresses TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: establishment_documents admin views all estab documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin views all estab documents" ON public.establishment_documents USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: admin_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: establishment_withdrawals admins manage establishment withdrawals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage establishment withdrawals" ON public.establishment_withdrawals USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: courier_missions admins manage missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage missions" ON public.courier_missions USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: courier_withdrawals admins manage withdrawals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage withdrawals" ON public.courier_withdrawals USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: courier_documents admins read documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read documents" ON public.courier_documents FOR SELECT USING (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: courier_vehicles admins read vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read vehicles" ON public.courier_vehicles FOR SELECT USING (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

--
-- Name: banners banners_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banners_admin_all ON public.banners USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: banners banners_read_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banners_read_active ON public.banners FOR SELECT USING (((ativo = true) OR private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns campaigns_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_admin_all ON public.campaigns USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: campaigns campaigns_read_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_read_active ON public.campaigns FOR SELECT USING (((status = ANY (ARRAY['active'::public.campaign_status, 'scheduled'::public.campaign_status])) OR private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: cart_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

--
-- Name: cart_items cart_items_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cart_items_own ON public.cart_items TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: order_chats chat participants can create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat participants can create" ON public.order_chats FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.orders o
     LEFT JOIN public.deliveries d ON ((d.order_id = o.id)))
     LEFT JOIN public.establishments e ON ((e.id = o.establishment_id)))
  WHERE ((o.id = order_chats.order_id) AND ((o.cliente_id = auth.uid()) OR (d.entregador_id = auth.uid()) OR (e.owner_id = auth.uid()))))));


--
-- Name: order_chats chat participants can read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat participants can read" ON public.order_chats FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.orders o
     LEFT JOIN public.deliveries d ON ((d.order_id = o.id)))
     LEFT JOIN public.establishments e ON ((e.id = o.establishment_id)))
  WHERE ((o.id = order_chats.order_id) AND ((o.cliente_id = auth.uid()) OR (d.entregador_id = auth.uid()) OR (e.owner_id = auth.uid()))))));


--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons coupons_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coupons_admin_all ON public.coupons USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: coupons coupons_read_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coupons_read_scoped ON public.coupons FOR SELECT TO authenticated USING ((private.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = coupons.establishment_id) AND (e.owner_id = auth.uid())))) OR ((ativo = true) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((expires_at IS NULL) OR (expires_at > now())) AND ((usage_limit IS NULL) OR (used_count < usage_limit)) AND ((establishment_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = coupons.establishment_id) AND (e.status = 'aprovado'::public.establishment_status))))))));


--
-- Name: courier_documents courier owns documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "courier owns documents" ON public.courier_documents USING ((auth.uid() = courier_id)) WITH CHECK ((auth.uid() = courier_id));


--
-- Name: courier_vehicles courier owns vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "courier owns vehicles" ON public.courier_vehicles USING ((auth.uid() = courier_id)) WITH CHECK ((auth.uid() = courier_id));


--
-- Name: courier_missions courier reads own missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "courier reads own missions" ON public.courier_missions FOR SELECT USING ((auth.uid() = courier_id));


--
-- Name: courier_withdrawals courier reads own withdrawals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "courier reads own withdrawals" ON public.courier_withdrawals FOR SELECT USING ((auth.uid() = courier_id));


--
-- Name: courier_withdrawals courier requests withdrawals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "courier requests withdrawals" ON public.courier_withdrawals FOR INSERT WITH CHECK ((auth.uid() = courier_id));


--
-- Name: courier_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courier_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: courier_missions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courier_missions ENABLE ROW LEVEL SECURITY;

--
-- Name: courier_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courier_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: courier_profiles courier_profiles_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courier_profiles_admin_all ON public.courier_profiles TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: courier_profiles courier_profiles_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courier_profiles_own ON public.courier_profiles TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: courier_vehicles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courier_vehicles ENABLE ROW LEVEL SECURITY;

--
-- Name: courier_withdrawals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courier_withdrawals ENABLE ROW LEVEL SECURITY;

--
-- Name: deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: deliveries deliveries_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_admin_all ON public.deliveries TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: deliveries deliveries_cliente_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_cliente_read ON public.deliveries FOR SELECT USING (private.is_client_of_order(order_id, auth.uid()));


--
-- Name: deliveries deliveries_courier_assigned_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_courier_assigned_read ON public.deliveries FOR SELECT TO authenticated USING ((entregador_id = auth.uid()));


--
-- Name: deliveries deliveries_courier_broadcast_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_courier_broadcast_read ON public.deliveries FOR SELECT TO authenticated USING (((status = 'broadcasting'::public.delivery_status) AND private.is_courier_dispatch_approved(auth.uid()) AND ((entregador_id IS NULL) OR (entregador_id = auth.uid()))));


--
-- Name: deliveries deliveries_courier_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_courier_update ON public.deliveries FOR UPDATE TO authenticated USING (((entregador_id = auth.uid()) OR ((status = 'broadcasting'::public.delivery_status) AND private.is_courier_dispatch_approved(auth.uid()) AND ((entregador_id IS NULL) OR (entregador_id = auth.uid()))))) WITH CHECK (((entregador_id = auth.uid()) AND ((status <> 'broadcasting'::public.delivery_status) OR private.is_courier_dispatch_approved(auth.uid()))));


--
-- Name: deliveries deliveries_estab_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_estab_insert ON public.deliveries FOR INSERT WITH CHECK (private.owns_establishment_of_order(order_id, auth.uid()));


--
-- Name: deliveries deliveries_estab_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_estab_read ON public.deliveries FOR SELECT USING (private.owns_establishment_of_order(order_id, auth.uid()));


--
-- Name: deliveries deliveries_estab_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_estab_update ON public.deliveries FOR UPDATE USING (private.owns_establishment_of_order(order_id, auth.uid())) WITH CHECK (private.owns_establishment_of_order(order_id, auth.uid()));


--
-- Name: establishment_delivery_zones dz_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dz_owner_all ON public.establishment_delivery_zones TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = establishment_delivery_zones.establishment_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = establishment_delivery_zones.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: establishment_delivery_zones dz_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dz_public_read ON public.establishment_delivery_zones FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = establishment_delivery_zones.establishment_id) AND (e.status = 'aprovado'::public.establishment_status)))));


--
-- Name: estab_ad_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estab_ad_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: estab_banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estab_banners ENABLE ROW LEVEL SECURITY;

--
-- Name: estab_banners estab_banners_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estab_banners_owner_all ON public.estab_banners TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = estab_banners.establishment_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = estab_banners.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: estab_banners estab_banners_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estab_banners_public_read ON public.estab_banners FOR SELECT TO authenticated, anon USING ((ativo AND (EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = estab_banners.establishment_id) AND (e.status = 'aprovado'::public.establishment_status))))));


--
-- Name: establishment_delivery_zones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.establishment_delivery_zones ENABLE ROW LEVEL SECURITY;

--
-- Name: establishment_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.establishment_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: establishment_hours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.establishment_hours ENABLE ROW LEVEL SECURITY;

--
-- Name: establishment_withdrawals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.establishment_withdrawals ENABLE ROW LEVEL SECURITY;

--
-- Name: establishments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;

--
-- Name: establishments establishments_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY establishments_admin_all ON public.establishments TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: establishments establishments_authenticated_read_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY establishments_authenticated_read_approved ON public.establishments FOR SELECT TO authenticated USING ((status = 'aprovado'::public.establishment_status));


--
-- Name: establishments establishments_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY establishments_owner_insert ON public.establishments FOR INSERT TO authenticated WITH CHECK ((auth.uid() = owner_id));


--
-- Name: establishments establishments_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY establishments_owner_read ON public.establishments FOR SELECT TO authenticated USING ((auth.uid() = owner_id));


--
-- Name: establishments establishments_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY establishments_owner_update ON public.establishments FOR UPDATE TO authenticated USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));


--
-- Name: favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

--
-- Name: favorites favorites_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY favorites_own ON public.favorites TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: global_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.global_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: global_categories global_categories_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY global_categories_admin_all ON public.global_categories TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: global_categories global_categories_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY global_categories_public_read ON public.global_categories FOR SELECT TO authenticated, anon USING ((ativo = true));


--
-- Name: establishment_hours hours_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hours_owner_all ON public.establishment_hours TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = establishment_hours.establishment_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = establishment_hours.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: establishment_hours hours_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hours_public_read ON public.establishment_hours FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = establishment_hours.establishment_id) AND (e.status = 'aprovado'::public.establishment_status)))));


--
-- Name: order_incidents incident admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "incident admin can update" ON public.order_incidents FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: order_incidents incident courier can create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "incident courier can create" ON public.order_incidents FOR INSERT TO authenticated WITH CHECK ((entregador_id = auth.uid()));


--
-- Name: order_incidents incident participants read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "incident participants read" ON public.order_incidents FOR SELECT TO authenticated USING (((entregador_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.orders o
     LEFT JOIN public.establishments e ON ((e.id = o.establishment_id)))
  WHERE ((o.id = order_incidents.order_id) AND ((o.cliente_id = auth.uid()) OR (e.owner_id = auth.uid()))))) OR private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: platform_ledger ledger_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ledger_admin_all ON public.platform_ledger USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: platform_ledger ledger_courier_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ledger_courier_read ON public.platform_ledger FOR SELECT USING ((courier_id = auth.uid()));


--
-- Name: platform_ledger ledger_estab_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ledger_estab_read ON public.platform_ledger FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = platform_ledger.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: login_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_categories menu_categories_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_categories_admin_all ON public.menu_categories TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: menu_categories menu_categories_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_categories_owner_all ON public.menu_categories TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = menu_categories.establishment_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = menu_categories.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: menu_categories menu_categories_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_categories_public_read ON public.menu_categories FOR SELECT TO authenticated, anon USING (((ativo = true) AND (EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = menu_categories.establishment_id) AND (e.status = 'aprovado'::public.establishment_status))))));


--
-- Name: order_messages message mark as read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "message mark as read" ON public.order_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (((public.order_chats c
     JOIN public.orders o ON ((o.id = c.order_id)))
     LEFT JOIN public.deliveries d ON ((d.order_id = o.id)))
     LEFT JOIN public.establishments e ON ((e.id = o.establishment_id)))
  WHERE ((c.id = order_messages.chat_id) AND ((o.cliente_id = auth.uid()) OR (d.entregador_id = auth.uid()) OR (e.owner_id = auth.uid()))))));


--
-- Name: order_messages message participants can read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "message participants can read" ON public.order_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (((public.order_chats c
     JOIN public.orders o ON ((o.id = c.order_id)))
     LEFT JOIN public.deliveries d ON ((d.order_id = o.id)))
     LEFT JOIN public.establishments e ON ((e.id = o.establishment_id)))
  WHERE ((c.id = order_messages.chat_id) AND ((o.cliente_id = auth.uid()) OR (d.entregador_id = auth.uid()) OR (e.owner_id = auth.uid()))))));


--
-- Name: order_messages message participants can send; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "message participants can send" ON public.order_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (((public.order_chats c
     JOIN public.orders o ON ((o.id = c.order_id)))
     LEFT JOIN public.deliveries d ON ((d.order_id = o.id)))
     LEFT JOIN public.establishments e ON ((e.id = o.establishment_id)))
  WHERE ((c.id = order_messages.chat_id) AND ((o.cliente_id = auth.uid()) OR (d.entregador_id = auth.uid()) OR (e.owner_id = auth.uid())))))));


--
-- Name: notification_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_admin_all ON public.notifications USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: notifications notifications_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_self ON public.notifications FOR SELECT USING (((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: notifications notifications_update_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update_self ON public.notifications FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: order_chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_chats ENABLE ROW LEVEL SECURITY;

--
-- Name: order_incidents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_incidents ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_admin_all ON public.order_items TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: order_items order_items_cliente_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_cliente_insert ON public.order_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.cliente_id = auth.uid())))));


--
-- Name: order_items order_items_visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_visible ON public.order_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND ((o.cliente_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.establishments e
          WHERE ((e.id = o.establishment_id) AND (e.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.deliveries d
          WHERE ((d.order_id = o.id) AND (d.entregador_id = auth.uid())))) OR private.has_role(auth.uid(), 'admin'::public.app_role))))));


--
-- Name: order_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_admin_all ON public.orders TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: orders orders_cliente_cancel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_cliente_cancel ON public.orders FOR UPDATE USING (((auth.uid() = cliente_id) AND (status = ANY (ARRAY['placed'::public.order_status, 'accepted'::public.order_status])))) WITH CHECK (((auth.uid() = cliente_id) AND (status = 'cancelled'::public.order_status)));


--
-- Name: orders orders_cliente_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_cliente_insert ON public.orders FOR INSERT TO authenticated WITH CHECK ((auth.uid() = cliente_id));


--
-- Name: orders orders_cliente_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_cliente_read ON public.orders FOR SELECT TO authenticated USING ((auth.uid() = cliente_id));


--
-- Name: orders orders_courier_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_courier_read ON public.orders FOR SELECT USING (private.is_courier_of_order(id, auth.uid()));


--
-- Name: orders orders_courier_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_courier_update ON public.orders FOR UPDATE TO authenticated USING (private.is_courier_of_order(id, auth.uid())) WITH CHECK (private.is_courier_of_order(id, auth.uid()));


--
-- Name: orders orders_estab_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_estab_read ON public.orders FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = orders.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: orders orders_estab_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_estab_update ON public.orders FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = orders.establishment_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = orders.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: order_status_history osh_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY osh_admin_all ON public.order_status_history USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: order_status_history osh_cliente_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY osh_cliente_read ON public.order_status_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_status_history.order_id) AND (o.cliente_id = auth.uid())))));


--
-- Name: order_status_history osh_courier_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY osh_courier_read ON public.order_status_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.deliveries d
  WHERE ((d.order_id = order_status_history.order_id) AND (d.entregador_id = auth.uid())))));


--
-- Name: order_status_history osh_estab_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY osh_estab_read ON public.order_status_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.orders o
     JOIN public.establishments e ON ((e.id = o.establishment_id)))
  WHERE ((o.id = order_status_history.order_id) AND (e.owner_id = auth.uid())))));


--
-- Name: establishment_documents owner manages own estab documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner manages own estab documents" ON public.establishment_documents USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = establishment_documents.establishment_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = establishment_documents.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: establishment_withdrawals owner reads own establishment withdrawals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner reads own establishment withdrawals" ON public.establishment_withdrawals FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = establishment_withdrawals.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: establishment_withdrawals owner requests establishment withdrawals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner requests establishment withdrawals" ON public.establishment_withdrawals FOR INSERT WITH CHECK (((auth.uid() = requested_by) AND (EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = establishment_withdrawals.establishment_id) AND (e.owner_id = auth.uid()))))));


--
-- Name: product_addon_groups pag_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pag_owner_all ON public.product_addon_groups TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.products p
     JOIN public.establishments e ON ((e.id = p.establishment_id)))
  WHERE ((p.id = product_addon_groups.product_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.products p
     JOIN public.establishments e ON ((e.id = p.establishment_id)))
  WHERE ((p.id = product_addon_groups.product_id) AND (e.owner_id = auth.uid())))));


--
-- Name: product_addon_groups pag_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pag_public_read ON public.product_addon_groups FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.products p
     JOIN public.establishments e ON ((e.id = p.establishment_id)))
  WHERE ((p.id = product_addon_groups.product_id) AND (p.disponivel = true) AND (e.status = 'aprovado'::public.establishment_status)))));


--
-- Name: platform_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: product_addon_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_addon_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_admin_all ON public.products TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: products products_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_owner_all ON public.products TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = products.establishment_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = products.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: products products_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_public_read ON public.products FOR SELECT TO authenticated, anon USING (((disponivel = true) AND (EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = products.establishment_id) AND (e.status = 'aprovado'::public.establishment_status))))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (((auth.uid() = id) OR private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: push_subscriptions push_subs_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subs_own ON public.push_subscriptions TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews reviews_participants_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reviews_participants_read ON public.reviews FOR SELECT TO authenticated USING (((cliente_id = auth.uid()) OR (entregador_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = reviews.establishment_id) AND (e.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.deliveries d
  WHERE ((d.order_id = reviews.order_id) AND (d.entregador_id = auth.uid())))) OR private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: score_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.score_events ENABLE ROW LEVEL SECURITY;

--
-- Name: score_events score_events_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY score_events_admin_all ON public.score_events TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: score_events score_events_courier_own_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY score_events_courier_own_read ON public.score_events FOR SELECT TO authenticated USING (((entity_type = 'courier'::text) AND (entity_id = auth.uid())));


--
-- Name: score_events score_events_estab_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY score_events_estab_owner_read ON public.score_events FOR SELECT TO authenticated USING (((entity_type = 'establishment'::text) AND (EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = score_events.entity_id) AND (e.owner_id = auth.uid()))))));


--
-- Name: login_sessions session self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "session self read" ON public.login_sessions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: login_sessions session self update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "session self update" ON public.login_sessions FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: login_sessions session self write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "session self write" ON public.login_sessions FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: support_messages smsg_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY smsg_insert ON public.support_messages FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND ((t.user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role)))))));


--
-- Name: support_messages smsg_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY smsg_read ON public.support_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND ((t.user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role))))));


--
-- Name: sos_events sos admin resolve; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sos admin resolve" ON public.sos_events FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sos_events sos self create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sos self create" ON public.sos_events FOR INSERT TO authenticated WITH CHECK ((courier_id = auth.uid()));


--
-- Name: sos_events sos self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sos self read" ON public.sos_events FOR SELECT TO authenticated USING (((courier_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: sos_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sos_events ENABLE ROW LEVEL SECURITY;

--
-- Name: sponsored_ads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sponsored_ads ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements stock_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_owner_all ON public.stock_movements TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = stock_movements.establishment_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = stock_movements.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: estab_ad_subscriptions sub admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sub admin manage" ON public.estab_ad_subscriptions USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: estab_ad_subscriptions sub owner create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sub owner create" ON public.estab_ad_subscriptions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = estab_ad_subscriptions.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: estab_ad_subscriptions sub owner read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sub owner read" ON public.estab_ad_subscriptions FOR SELECT USING ((private.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = estab_ad_subscriptions.establishment_id) AND (e.owner_id = auth.uid()))))));


--
-- Name: estab_ad_subscriptions sub owner update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sub owner update" ON public.estab_ad_subscriptions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = estab_ad_subscriptions.establishment_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = estab_ad_subscriptions.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: support_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members team_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_owner_all ON public.team_members TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = team_members.establishment_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.establishments e
  WHERE ((e.id = team_members.establishment_id) AND (e.owner_id = auth.uid())))));


--
-- Name: team_members team_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_self_read ON public.team_members FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notification_templates templates_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY templates_admin_all ON public.notification_templates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: notification_templates templates_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY templates_select_auth ON public.notification_templates FOR SELECT TO authenticated USING (true);


--
-- Name: support_tickets tickets_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_admin_all ON public.support_tickets USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: support_tickets tickets_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_insert_self ON public.support_tickets FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: support_tickets tickets_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_self ON public.support_tickets FOR SELECT USING (((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tracking_points track_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY track_insert_self ON public.tracking_points FOR INSERT WITH CHECK ((courier_id = auth.uid()));


--
-- Name: tracking_points track_read_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY track_read_admin ON public.tracking_points FOR SELECT USING (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: tracking_points track_read_related; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY track_read_related ON public.tracking_points FOR SELECT USING (((courier_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = tracking_points.order_id) AND ((o.cliente_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.establishments e
          WHERE ((e.id = o.establishment_id) AND (e.owner_id = auth.uid()))))))))));


--
-- Name: tracking_points; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tracking_points ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_admin_all ON public.user_roles TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles user_roles_insert_self_nonadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_insert_self_nonadmin ON public.user_roles FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (role <> 'admin'::public.app_role)));


--
-- Name: user_roles user_roles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: product_variants variants_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY variants_admin_all ON public.product_variants TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: product_variants variants_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY variants_owner_all ON public.product_variants TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.products p
     JOIN public.establishments e ON ((e.id = p.establishment_id)))
  WHERE ((p.id = product_variants.product_id) AND (e.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.products p
     JOIN public.establishments e ON ((e.id = p.establishment_id)))
  WHERE ((p.id = product_variants.product_id) AND (e.owner_id = auth.uid())))));


--
-- Name: product_variants variants_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY variants_public_read ON public.product_variants FOR SELECT TO authenticated, anon USING ((ativo AND (EXISTS ( SELECT 1
   FROM (public.products p
     JOIN public.establishments e ON ((e.id = p.establishment_id)))
  WHERE ((p.id = product_variants.product_id) AND (e.status = 'aprovado'::public.establishment_status))))));


--
-- Normalize only application objects before restoring their source ACLs.
-- Managed Supabase defaults may otherwise retain revoked anon/authenticated
-- privileges. Provider default privileges and rls_auto_enable remain untouched.
DO $normalize_app_acls$
DECLARE app_object record;
BEGIN
 FOR app_object IN SELECT p.oid::regprocedure AS identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND NOT (n.nspname='public' AND p.proname='rls_auto_enable' AND p.pronargs=0) AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',app_object.identity);
  -- pg_dump omits ACLs for functions with PostgreSQL's default PUBLIC EXECUTE.
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC',app_object.identity);
 END LOOP;
 FOR app_object IN SELECT n.nspname,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m','S','f') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e') LOOP
  EXECUTE format('REVOKE ALL ON %s %I.%I FROM PUBLIC, anon, authenticated, service_role',CASE WHEN app_object.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,app_object.nspname,app_object.relname);
 END LOOP;
END $normalize_app_acls$;

-- Name: SCHEMA private; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA private TO service_role;
GRANT USAGE ON SCHEMA private TO authenticated;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION courier_confirm_delivery_core(p_order_id uuid, p_codigo text, p_prova_url text, p_metodo text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.courier_confirm_delivery_core(p_order_id uuid, p_codigo text, p_prova_url text, p_metodo text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.courier_confirm_delivery_core(p_order_id uuid, p_codigo text, p_prova_url text, p_metodo text) TO authenticated;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION private.has_role(_user_id uuid, _role public.app_role) TO service_role;
GRANT ALL ON FUNCTION private.has_role(_user_id uuid, _role public.app_role) TO authenticated;


--
-- Name: FUNCTION is_client_of_order(_order_id uuid, _user_id uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.is_client_of_order(_order_id uuid, _user_id uuid) TO authenticated;


--
-- Name: FUNCTION is_courier_dispatch_approved(p_user_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.is_courier_dispatch_approved(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.is_courier_dispatch_approved(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION private.is_courier_dispatch_approved(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_courier_of_order(_order_id uuid, _user_id uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.is_courier_of_order(_order_id uuid, _user_id uuid) TO authenticated;


--
-- Name: FUNCTION list_available_couriers(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.list_available_couriers() FROM PUBLIC;
GRANT ALL ON FUNCTION private.list_available_couriers() TO service_role;


--
-- Name: FUNCTION owns_establishment_of_order(_order_id uuid, _user_id uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.owns_establishment_of_order(_order_id uuid, _user_id uuid) TO authenticated;


--
-- Name: FUNCTION admin_grant_role(_target_user uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_grant_role(_target_user uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_grant_role(_target_user uuid, _role public.app_role) TO authenticated;


--
-- Name: FUNCTION admin_revoke_role(_target_user uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_revoke_role(_target_user uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_revoke_role(_target_user uuid, _role public.app_role) TO authenticated;


--
-- Name: FUNCTION apply_score_penalty(_entity_type text, _entity_id uuid, _penalty integer, _motivo text, _order_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_score_penalty(_entity_type text, _entity_id uuid, _penalty integer, _motivo text, _order_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION auto_disable_product_on_zero_stock(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auto_disable_product_on_zero_stock() FROM PUBLIC;


--
-- Name: FUNCTION check_profile_complete(_user_id uuid, _role text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_profile_complete(_user_id uuid, _role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_profile_complete(_user_id uuid, _role text) TO authenticated;


--
-- Name: FUNCTION confirm_delivery_code(p_order_id uuid, p_code text, p_prova_url text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.confirm_delivery_code(p_order_id uuid, p_code text, p_prova_url text) TO authenticated;


--
-- Name: FUNCTION confirm_pickup_order(p_order_id uuid, p_codigo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_pickup_order(p_order_id uuid, p_codigo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_pickup_order(p_order_id uuid, p_codigo text) TO authenticated;


--
-- Name: FUNCTION courier_confirm_delivery(p_order_id uuid, p_codigo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.courier_confirm_delivery(p_order_id uuid, p_codigo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.courier_confirm_delivery(p_order_id uuid, p_codigo text) TO authenticated;


--
-- Name: FUNCTION courier_confirm_delivery(_order_id uuid, _codigo text, _prova_url text, _metodo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.courier_confirm_delivery(_order_id uuid, _codigo text, _prova_url text, _metodo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.courier_confirm_delivery(_order_id uuid, _codigo text, _prova_url text, _metodo text) TO authenticated;


--
-- Name: FUNCTION create_ledger_on_delivered(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_ledger_on_delivered() FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_ledger_on_delivered() TO service_role;


--
-- Name: FUNCTION get_order_client_contact(_order_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_order_client_contact(_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_order_client_contact(_order_id uuid) TO authenticated;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;


--
-- Name: FUNCTION notify_client_on_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_client_on_status() FROM PUBLIC;


--
-- Name: FUNCTION notify_courier_kyc_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_courier_kyc_change() FROM PUBLIC;


--
-- Name: FUNCTION notify_estab_ad_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_estab_ad_status() FROM PUBLIC;


--
-- Name: FUNCTION notify_estab_ad_sub_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_estab_ad_sub_status() FROM PUBLIC;


--
-- Name: FUNCTION notify_estab_kyc_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_estab_kyc_change() FROM PUBLIC;


--
-- Name: FUNCTION orders_status_after(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.orders_status_after() FROM PUBLIC;


--
-- Name: FUNCTION orders_status_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.orders_status_guard() FROM PUBLIC;


--
-- Name: FUNCTION recompute_establishment_rating(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.recompute_establishment_rating() FROM PUBLIC;


--
-- Name: FUNCTION regenerate_delivery_code(p_order_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.regenerate_delivery_code(p_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.regenerate_delivery_code(p_order_id uuid) TO authenticated;


--
-- Name: FUNCTION set_active_city(_cidade text, _estado text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_active_city(_cidade text, _estado text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_active_city(_cidade text, _estado text) TO authenticated;


--
-- Name: FUNCTION set_active_city(_user_id uuid, _city text, _state text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_active_city(_user_id uuid, _city text, _state text) TO authenticated;


--
-- Name: FUNCTION set_delivery_code(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_delivery_code() FROM PUBLIC;


--
-- Name: FUNCTION sync_client_onboarding_from_address(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sync_client_onboarding_from_address() FROM PUBLIC;


--
-- Name: FUNCTION sync_client_onboarding_from_profile(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sync_client_onboarding_from_profile() FROM PUBLIC;


--
-- Name: FUNCTION sync_courier_onboarding(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sync_courier_onboarding() FROM PUBLIC;


--
-- Name: FUNCTION sync_estab_onboarding(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sync_estab_onboarding() FROM PUBLIC;


--
-- Name: FUNCTION trg_notifications_ping_push(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_notifications_ping_push() FROM PUBLIC;


--
-- Name: FUNCTION trg_orders_delay_penalty(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_orders_delay_penalty() FROM PUBLIC;


--
-- Name: FUNCTION trg_reviews_score_penalty(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_reviews_score_penalty() FROM PUBLIC;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;


--
-- Name: TABLE ad_plans; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ad_plans TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ad_plans TO authenticated;
GRANT ALL ON TABLE public.ad_plans TO service_role;


--
-- Name: TABLE addon_groups; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.addon_groups TO anon;
GRANT ALL ON TABLE public.addon_groups TO authenticated;
GRANT ALL ON TABLE public.addon_groups TO service_role;


--
-- Name: TABLE addons; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.addons TO anon;
GRANT ALL ON TABLE public.addons TO authenticated;
GRANT ALL ON TABLE public.addons TO service_role;


--
-- Name: TABLE addresses; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.addresses TO anon;
GRANT ALL ON TABLE public.addresses TO authenticated;
GRANT ALL ON TABLE public.addresses TO service_role;


--
-- Name: TABLE admin_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.admin_audit_log TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.admin_audit_log TO authenticated;
GRANT ALL ON TABLE public.admin_audit_log TO service_role;


--
-- Name: TABLE banners; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.banners TO anon;
GRANT ALL ON TABLE public.banners TO authenticated;
GRANT ALL ON TABLE public.banners TO service_role;


--
-- Name: TABLE campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.campaigns TO anon;
GRANT ALL ON TABLE public.campaigns TO authenticated;
GRANT ALL ON TABLE public.campaigns TO service_role;


--
-- Name: TABLE cart_items; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cart_items TO anon;
GRANT ALL ON TABLE public.cart_items TO authenticated;
GRANT ALL ON TABLE public.cart_items TO service_role;


--
-- Name: TABLE coupons; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.coupons TO anon;
GRANT ALL ON TABLE public.coupons TO authenticated;
GRANT ALL ON TABLE public.coupons TO service_role;


--
-- Name: TABLE courier_documents; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.courier_documents TO anon;
GRANT ALL ON TABLE public.courier_documents TO authenticated;
GRANT ALL ON TABLE public.courier_documents TO service_role;


--
-- Name: TABLE courier_missions; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.courier_missions TO anon;
GRANT ALL ON TABLE public.courier_missions TO authenticated;
GRANT ALL ON TABLE public.courier_missions TO service_role;


--
-- Name: TABLE courier_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.courier_profiles TO anon;
GRANT ALL ON TABLE public.courier_profiles TO authenticated;
GRANT ALL ON TABLE public.courier_profiles TO service_role;


--
-- Name: TABLE courier_vehicles; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.courier_vehicles TO anon;
GRANT ALL ON TABLE public.courier_vehicles TO authenticated;
GRANT ALL ON TABLE public.courier_vehicles TO service_role;


--
-- Name: TABLE courier_withdrawals; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.courier_withdrawals TO anon;
GRANT ALL ON TABLE public.courier_withdrawals TO authenticated;
GRANT ALL ON TABLE public.courier_withdrawals TO service_role;


--
-- Name: TABLE deliveries; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.deliveries TO anon;
GRANT ALL ON TABLE public.deliveries TO authenticated;
GRANT ALL ON TABLE public.deliveries TO service_role;


--
-- Name: TABLE establishments; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.establishments TO anon;
GRANT ALL ON TABLE public.establishments TO authenticated;
GRANT ALL ON TABLE public.establishments TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE demand_zones_view; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.demand_zones_view TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.demand_zones_view TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.demand_zones_view TO service_role;


--
-- Name: TABLE estab_ad_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.estab_ad_subscriptions TO anon;
GRANT ALL ON TABLE public.estab_ad_subscriptions TO authenticated;
GRANT ALL ON TABLE public.estab_ad_subscriptions TO service_role;


--
-- Name: TABLE estab_banners; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.estab_banners TO anon;
GRANT ALL ON TABLE public.estab_banners TO authenticated;
GRANT ALL ON TABLE public.estab_banners TO service_role;


--
-- Name: TABLE establishment_delivery_zones; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.establishment_delivery_zones TO anon;
GRANT ALL ON TABLE public.establishment_delivery_zones TO authenticated;
GRANT ALL ON TABLE public.establishment_delivery_zones TO service_role;


--
-- Name: TABLE establishment_documents; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.establishment_documents TO anon;
GRANT ALL ON TABLE public.establishment_documents TO authenticated;
GRANT ALL ON TABLE public.establishment_documents TO service_role;


--
-- Name: TABLE establishment_hours; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.establishment_hours TO anon;
GRANT ALL ON TABLE public.establishment_hours TO authenticated;
GRANT ALL ON TABLE public.establishment_hours TO service_role;


--
-- Name: TABLE establishment_withdrawals; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.establishment_withdrawals TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.establishment_withdrawals TO authenticated;
GRANT ALL ON TABLE public.establishment_withdrawals TO service_role;


--
-- Name: TABLE establishments_public; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.establishments_public TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.establishments_public TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.establishments_public TO service_role;


--
-- Name: TABLE favorites; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.favorites TO anon;
GRANT ALL ON TABLE public.favorites TO authenticated;
GRANT ALL ON TABLE public.favorites TO service_role;


--
-- Name: TABLE global_categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.global_categories TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.global_categories TO authenticated;
GRANT ALL ON TABLE public.global_categories TO service_role;


--
-- Name: TABLE login_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.login_sessions TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.login_sessions TO authenticated;
GRANT ALL ON TABLE public.login_sessions TO service_role;


--
-- Name: TABLE menu_categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.menu_categories TO anon;
GRANT ALL ON TABLE public.menu_categories TO authenticated;
GRANT ALL ON TABLE public.menu_categories TO service_role;


--
-- Name: TABLE notification_templates; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.notification_templates TO anon;
GRANT ALL ON TABLE public.notification_templates TO authenticated;
GRANT ALL ON TABLE public.notification_templates TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.notifications TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE order_chats; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.order_chats TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.order_chats TO authenticated;
GRANT ALL ON TABLE public.order_chats TO service_role;


--
-- Name: TABLE order_incidents; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.order_incidents TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.order_incidents TO authenticated;
GRANT ALL ON TABLE public.order_incidents TO service_role;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.order_items TO anon;
GRANT ALL ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;


--
-- Name: TABLE order_messages; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.order_messages TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.order_messages TO authenticated;
GRANT ALL ON TABLE public.order_messages TO service_role;


--
-- Name: TABLE order_status_history; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.order_status_history TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.order_status_history TO authenticated;
GRANT ALL ON TABLE public.order_status_history TO service_role;


--
-- Name: TABLE platform_ledger; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.platform_ledger TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.platform_ledger TO authenticated;
GRANT ALL ON TABLE public.platform_ledger TO service_role;


--
-- Name: TABLE platform_settings; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.platform_settings TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.platform_settings TO authenticated;
GRANT ALL ON TABLE public.platform_settings TO service_role;


--
-- Name: COLUMN platform_settings.bestseller_threshold; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(bestseller_threshold) ON TABLE public.platform_settings TO anon;
GRANT SELECT(bestseller_threshold) ON TABLE public.platform_settings TO authenticated;


--
-- Name: COLUMN platform_settings.ad_default_seconds; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(ad_default_seconds) ON TABLE public.platform_settings TO anon;
GRANT SELECT(ad_default_seconds) ON TABLE public.platform_settings TO authenticated;


--
-- Name: TABLE product_addon_groups; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.product_addon_groups TO anon;
GRANT ALL ON TABLE public.product_addon_groups TO authenticated;
GRANT ALL ON TABLE public.product_addon_groups TO service_role;


--
-- Name: TABLE product_variants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.product_variants TO anon;
GRANT ALL ON TABLE public.product_variants TO authenticated;
GRANT ALL ON TABLE public.product_variants TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE public_platform_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.public_platform_settings TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.public_platform_settings TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.public_platform_settings TO service_role;


--
-- Name: TABLE reviews; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.reviews TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.reviews TO authenticated;
GRANT ALL ON TABLE public.reviews TO service_role;


--
-- Name: TABLE public_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.public_reviews TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.public_reviews TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.public_reviews TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.push_subscriptions TO anon;
GRANT ALL ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE score_events; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.score_events TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.score_events TO authenticated;
GRANT ALL ON TABLE public.score_events TO service_role;


--
-- Name: TABLE sos_events; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sos_events TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.sos_events TO authenticated;
GRANT ALL ON TABLE public.sos_events TO service_role;


--
-- Name: TABLE sponsored_ads; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sponsored_ads TO anon;
GRANT ALL ON TABLE public.sponsored_ads TO authenticated;
GRANT ALL ON TABLE public.sponsored_ads TO service_role;


--
-- Name: TABLE stock_movements; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_movements TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_movements TO authenticated;
GRANT ALL ON TABLE public.stock_movements TO service_role;


--
-- Name: TABLE support_messages; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.support_messages TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.support_messages TO authenticated;
GRANT ALL ON TABLE public.support_messages TO service_role;


--
-- Name: TABLE support_tickets; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.support_tickets TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.support_tickets TO authenticated;
GRANT ALL ON TABLE public.support_tickets TO service_role;


--
-- Name: TABLE team_members; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.team_members TO anon;
GRANT ALL ON TABLE public.team_members TO authenticated;
GRANT ALL ON TABLE public.team_members TO service_role;


--
-- Name: TABLE tracking_points; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.tracking_points TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.tracking_points TO authenticated;
GRANT ALL ON TABLE public.tracking_points TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: TABLE vw_admin_audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.vw_admin_audit_logs TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.vw_admin_audit_logs TO authenticated;
GRANT ALL ON TABLE public.vw_admin_audit_logs TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: ad_plans; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: global_categories; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.global_categories VALUES ('7f08e1b9-d9cc-419d-9f44-a95b3a8f0e3e', 'hamburguer', 'Hamburgueria', '🍔', 1, true, '2026-10-13 04:00:01.347061+00');
INSERT INTO public.global_categories VALUES ('d5159016-cccd-4eb6-9df9-9ccedccbca80', 'pizza', 'Pizza', '🍕', 2, true, '2026-10-13 04:00:01.347061+00');
INSERT INTO public.global_categories VALUES ('2594579d-651e-4e9e-886b-6b52674865fc', 'sushi', 'Sushi', '🍣', 3, true, '2026-10-13 04:01:49.086328+00');
INSERT INTO public.global_categories VALUES ('6ce60631-3596-4b21-86fb-c38ab1f45d8b', 'marmita', 'Marmitaria', '🍱', 4, true, '2026-10-13 04:00:01.347061+00');
INSERT INTO public.global_categories VALUES ('beb2d8dc-cbee-4edf-99db-88875da33498', 'frango', 'Frango', '🍗', 5, true, '2026-10-13 04:01:49.086328+00');
INSERT INTO public.global_categories VALUES ('8869fdc0-2d33-403a-aa89-bcd6ad43554e', 'churrasco', 'Churrasco', '🍖', 6, true, '2026-10-13 04:01:49.086328+00');
INSERT INTO public.global_categories VALUES ('e9c05574-c0f1-494b-8d10-fa497e5f5d7a', 'saudavel', 'Saudável', '🥗', 7, true, '2026-10-13 04:01:49.086328+00');
INSERT INTO public.global_categories VALUES ('8cc47563-136c-46d0-9844-5b48f4122040', 'mexicana', 'Mexicana', '🌮', 8, true, '2026-10-13 04:01:49.086328+00');
INSERT INTO public.global_categories VALUES ('92a4aa54-44d6-4792-b4ac-e496271f8155', 'massas', 'Massas', '🍝', 9, true, '2026-10-13 04:01:49.086328+00');
INSERT INTO public.global_categories VALUES ('188ea72a-4b23-42b4-a91b-3ff0e5d1c3d4', 'padaria', 'Padaria', '🥐', 10, true, '2026-10-13 04:01:49.086328+00');
INSERT INTO public.global_categories VALUES ('441f6bbd-3204-4d42-8c6a-18b42659d806', 'pastel', 'Salgaderia', '🥟', 11, true, '2026-10-13 04:00:01.347061+00');
INSERT INTO public.global_categories VALUES ('ef215c09-0d63-4c7a-bb27-2686fda01c5a', 'lanches', 'Lanchonete', '🥪', 12, true, '2026-10-13 04:00:01.347061+00');
INSERT INTO public.global_categories VALUES ('6b5dd07c-bdb3-4c44-b5eb-ea481633c0c6', 'doces', 'Doces', '🍰', 13, true, '2026-10-13 04:01:49.086328+00');
INSERT INTO public.global_categories VALUES ('ee1c184b-7ec3-4c28-ac13-4cd9353ae94c', 'chocolates', 'Chocolates', '🍫', 14, true, '2026-10-13 04:01:49.086328+00');
INSERT INTO public.global_categories VALUES ('f375f13d-0dca-4091-8e19-528d875e9d5c', 'sorvete', 'Sorvetes', '🍨', 15, true, '2026-10-13 04:00:01.347061+00');
INSERT INTO public.global_categories VALUES ('909cc077-8e07-4b4c-b905-dd193bb10f14', 'acai', 'Açaí', '🍧', 16, true, '2026-10-13 04:00:01.347061+00');
INSERT INTO public.global_categories VALUES ('28a5d020-2c04-4592-a5f9-8911d1427093', 'bebidas', 'Bebidas', '🥤', 17, true, '2026-10-13 04:00:01.347061+00');
INSERT INTO public.global_categories VALUES ('818546fe-bfb1-4898-8795-88e0b2c47c94', 'cafeteria', 'Cafeteria', '☕', 18, true, '2026-10-13 04:01:49.086328+00');
INSERT INTO public.global_categories VALUES ('ca784099-9bcb-4609-a616-956c429c547b', 'porcoes', 'Porções', '🍟', 19, true, '2026-10-13 04:01:49.086328+00');
INSERT INTO public.global_categories VALUES ('b1f5b5d7-f162-4e26-90e8-9078bffbdc99', 'mercado', 'Mercado', '🛒', 20, true, '2026-10-13 04:00:01.347061+00');
INSERT INTO public.global_categories VALUES ('9f4b8384-747c-491c-bb62-0ba750dffdb0', 'farmacia', 'Farmácia', '💊', 21, true, '2026-10-13 04:00:01.347061+00');


--
-- Data for Name: establishments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: addon_groups; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: addons; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: addresses; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: admin_audit_log; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: banners; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: coupons; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: campaigns; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: menu_categories; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: cart_items; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: courier_documents; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: courier_missions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: courier_profiles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: courier_vehicles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: courier_withdrawals; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: deliveries; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: estab_ad_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: estab_banners; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: establishment_delivery_zones; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: establishment_documents; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: establishment_hours; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: establishment_withdrawals; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: favorites; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: login_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_templates; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.notification_templates VALUES ('47f3c710-8486-4063-9eef-37f42202ac59', 'cliente', 'Cupom de boas-vindas', 'promocao', 'Ganhe 15% no primeiro pedido 🎉', 'Use o cupom BEMVINDO15 e economize agora no seu pedido.', '/cliente', 'promo', '{"cor": "#FF6B00", "titulo": "15% OFF no seu 1º pedido", "cta_link": "/cliente", "cta_texto": "Pedir agora", "subtitulo": "Cupom BEMVINDO15 — válido hoje"}', true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('550c2c8a-89fa-4eb7-9935-841263a29b63', 'cliente', 'Frete grátis hoje', 'promocao', 'Frete grátis hoje! 🛵', 'Peça nos restaurantes participantes e não pague a entrega.', '/cliente', 'promo', '{"cor": "#FF6B00", "titulo": "Frete grátis hoje", "cta_link": "/cliente", "cta_texto": "Ver lojas", "subtitulo": "Em lojas selecionadas perto de você"}', true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('e8e37adf-9a91-43a2-b462-5b8b0a28dbc9', 'cliente', 'Fim de semana com desconto', 'promocao', 'Fim de semana WiFome 🍕', 'Descontos de até 40% nos seus restaurantes favoritos.', '/cliente', 'promo', '{"cor": "#E03E00", "titulo": "Até 40% OFF", "cta_link": "/cliente", "cta_texto": "Aproveitar", "subtitulo": "Só neste fim de semana"}', true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('4c1a004b-3ef4-4414-9279-23329f4df1d8', 'cliente', 'Novidades na sua cidade', 'novidade', 'Novos restaurantes na sua região 🏪', 'Confira as lojas que acabaram de chegar no WiFome.', '/cliente/novidades', 'info', NULL, true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('d0866ee4-227f-44c4-8a46-3cb346256cb1', 'cliente', 'Avalie seu pedido', 'engajamento', 'Como foi seu último pedido?', 'Avalie e ajude outros clientes a escolherem melhor.', '/cliente/pedidos', 'info', NULL, true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('0174f88b-2ca2-4480-99ac-c08503e4738c', 'cliente', 'Volte a pedir', 'engajamento', 'Sentimos sua falta! 💛', 'Temos ofertas especiais esperando por você hoje.', '/cliente', 'promo', '{"cor": "#FF6B00", "titulo": "A gente sentiu sua falta", "cta_link": "/cliente", "cta_texto": "Ver ofertas", "subtitulo": "Ofertas especiais liberadas para você"}', true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('206519ec-0c8f-4a9e-80ab-c2841d6b4260', 'estabelecimento', 'Nova campanha de anúncios', 'promocao', 'Destaque sua loja na home 🚀', 'Planos de anúncio a partir de R$ 30. Apareça primeiro para os clientes.', '/estabelecimento/anuncios', 'promo', '{"cor": "#FF6B00", "titulo": "Apareça em 1º lugar", "cta_link": "/estabelecimento/anuncios", "cta_texto": "Ver planos", "subtitulo": "Planos de anúncio a partir de R$ 30"}', true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('52f42f97-73e0-4ce0-9c7d-e5de2e56e468', 'estabelecimento', 'Recebimento D+1', 'financeiro', 'Receba no dia seguinte 💰', 'Suas vendas caem na conta em D+1 com a melhor taxa do Brasil.', '/estabelecimento/financeiro', 'info', NULL, true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('54594d0b-4483-4c6c-8753-cde433ed3d09', 'estabelecimento', 'Atualize seu cardápio', 'operacional', 'Atualize seu cardápio 📋', 'Fotos e descrições completas aumentam suas vendas em até 30%.', '/estabelecimento/produtos', 'info', NULL, true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('6450d514-c7ae-4f3b-a37b-2c1c0c40643f', 'estabelecimento', 'Documentos pendentes', 'aviso', 'Documentos pendentes ⚠️', 'Envie os documentos para manter sua loja ativa na plataforma.', '/estabelecimento/configuracoes', 'info', NULL, true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('9ff8f436-d84b-4a60-ab26-e52b60950838', 'estabelecimento', 'Horário de pico', 'operacional', 'Horário de pico chegando 🔥', 'Prepare a cozinha: o movimento aumenta nas próximas horas.', '/estabelecimento/pedidos', 'info', NULL, true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('d530f524-f4b0-48f4-918c-320b6ce6767d', 'entregador', 'Bônus de corridas', 'promocao', 'Bônus por entregas hoje! 🏍️', 'Complete 10 entregas hoje e ganhe R$ 30 de bônus.', '/entregador/metas', 'promo', '{"cor": "#FF6B00", "titulo": "Bônus de R$ 30", "cta_link": "/entregador/metas", "cta_texto": "Ver metas", "subtitulo": "Complete 10 entregas hoje"}', true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('6e74ee2f-53d6-449e-83a0-a34e06e5e774', 'entregador', 'Alta demanda na região', 'operacional', 'Alta demanda agora ⚡', 'Fique online: há muitos pedidos na sua região neste momento.', '/entregador/corridas', 'info', NULL, true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('c3e0d5ae-f847-45b0-bd79-6fdaa2f94389', 'entregador', 'Documentos vencendo', 'aviso', 'Documento perto do vencimento ⚠️', 'Atualize seus documentos para continuar recebendo corridas.', '/entregador/documentos', 'info', NULL, true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('633d7b44-6e72-4211-8538-d03162ca4e3e', 'entregador', 'Saque disponível', 'financeiro', 'Seu saldo está disponível 💸', 'Solicite seu saque pela carteira e receba via PIX.', '/entregador/carteira', 'info', NULL, true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');
INSERT INTO public.notification_templates VALUES ('4a42f7b8-25e2-406c-bcd9-be776d2f24c8', 'entregador', 'Melhore seu score', 'engajamento', 'Cuide do seu score ⭐', 'Aceite mais corridas e evite cancelamentos para subir de nível.', '/entregador/score', 'info', NULL, true, '2026-10-13 04:01:50.401856+00', '2026-10-13 04:01:50.401856+00');


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: order_chats; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: order_incidents; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: order_messages; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: order_status_history; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: platform_ledger; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: platform_settings; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.platform_settings VALUES (1, 'WiFome', 15.00, 500, 5.00, false, '2026-10-13 04:01:48.28011+00', NULL, 15, 8, 1.25, 5, 1.5, 10, 2, 10, 3, 3, 100, 85, 60);


--
-- Data for Name: product_addon_groups; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: push_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: score_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: sos_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: sponsored_ads; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: support_tickets; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: support_messages; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: team_members; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: tracking_points; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



SET LOCAL search_path = public, extensions;
INSERT INTO storage.buckets(id,name,public) VALUES ('avatars','avatars',false),('chat-attachments','chat-attachments',false),('delivery-proofs','delivery-proofs',false),('ad-banners','ad-banners',false);
CREATE POLICY "chat upload own" ON storage.objects FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'chat-attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "proof upload own" ON storage.objects FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'delivery-proofs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "avatars_read_own" ON storage.objects FOR SELECT TO "authenticated" USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE TO "authenticated" USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE TO "authenticated" USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "chat read participants" ON storage.objects FOR SELECT TO "authenticated" USING (((bucket_id = 'chat-attachments'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM ((orders o
     LEFT JOIN deliveries d ON ((d.order_id = o.id)))
     LEFT JOIN establishments e ON ((e.id = o.establishment_id)))
  WHERE (((o.id)::text = (storage.foldername(objects.name))[2]) AND ((o.cliente_id = auth.uid()) OR (d.entregador_id = auth.uid()) OR (e.owner_id = auth.uid()))))))));
CREATE POLICY "proof read participants" ON storage.objects FOR SELECT TO "authenticated" USING (((bucket_id = 'delivery-proofs'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM ((orders o
     LEFT JOIN deliveries d ON ((d.order_id = o.id)))
     LEFT JOIN establishments e ON ((e.id = o.establishment_id)))
  WHERE (((o.id)::text = (storage.foldername(objects.name))[2]) AND ((o.cliente_id = auth.uid()) OR (d.entregador_id = auth.uid()) OR (e.owner_id = auth.uid()))))))));
CREATE POLICY "Estab owner uploads own ad banners" ON storage.objects FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = 'ad-banners'::text) AND (EXISTS ( SELECT 1
   FROM establishments e
  WHERE (((e.id)::text = (storage.foldername(objects.name))[1]) AND (e.owner_id = auth.uid()))))));
CREATE POLICY "Estab owner reads own ad banners" ON storage.objects FOR SELECT TO PUBLIC USING (((bucket_id = 'ad-banners'::text) AND (EXISTS ( SELECT 1
   FROM establishments e
  WHERE (((e.id)::text = (storage.foldername(objects.name))[1]) AND (e.owner_id = auth.uid()))))));
CREATE POLICY "Estab owner updates own ad banners" ON storage.objects FOR UPDATE TO PUBLIC USING (((bucket_id = 'ad-banners'::text) AND (EXISTS ( SELECT 1
   FROM establishments e
  WHERE (((e.id)::text = (storage.foldername(objects.name))[1]) AND (e.owner_id = auth.uid()))))));
CREATE POLICY "Estab owner deletes own ad banners" ON storage.objects FOR DELETE TO PUBLIC USING (((bucket_id = 'ad-banners'::text) AND (EXISTS ( SELECT 1
   FROM establishments e
  WHERE (((e.id)::text = (storage.foldername(objects.name))[1]) AND (e.owner_id = auth.uid()))))));
CREATE POLICY "Admins manage ad banners" ON storage.objects FOR ALL TO PUBLIC USING (((bucket_id = 'ad-banners'::text) AND private.has_role(auth.uid(), 'admin'::app_role))) WITH CHECK (((bucket_id = 'ad-banners'::text) AND private.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Authenticated can read approved ad banners" ON storage.objects FOR SELECT TO PUBLIC USING (((bucket_id = 'ad-banners'::text) AND (auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM sponsored_ads a
  WHERE ((a.banner_path = objects.name) AND (a.status = 'approved'::text) AND (a.ativo = true) AND ((a.inicio_em IS NULL) OR (a.inicio_em <= now())) AND ((a.fim_em IS NULL) OR (a.fim_em >= now())))))));
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
ALTER PUBLICATION supabase_realtime ADD TABLE public."establishments";
ALTER PUBLICATION supabase_realtime ADD TABLE public."courier_profiles";
ALTER PUBLICATION supabase_realtime ADD TABLE public."orders";
ALTER PUBLICATION supabase_realtime ADD TABLE public."deliveries";
ALTER PUBLICATION supabase_realtime ADD TABLE public."order_status_history";
ALTER PUBLICATION supabase_realtime ADD TABLE public."reviews";
ALTER PUBLICATION supabase_realtime ADD TABLE public."coupons";
ALTER PUBLICATION supabase_realtime ADD TABLE public."notifications";
ALTER PUBLICATION supabase_realtime ADD TABLE public."support_messages";
ALTER PUBLICATION supabase_realtime ADD TABLE public."tracking_points";
ALTER PUBLICATION supabase_realtime ADD TABLE public."cart_items";
ALTER PUBLICATION supabase_realtime ADD TABLE public."courier_withdrawals";
ALTER PUBLICATION supabase_realtime ADD TABLE public."courier_missions";
ALTER PUBLICATION supabase_realtime ADD TABLE public."order_chats";
ALTER PUBLICATION supabase_realtime ADD TABLE public."order_messages";
ALTER PUBLICATION supabase_realtime ADD TABLE public."order_incidents";
ALTER PUBLICATION supabase_realtime ADD TABLE public."sos_events";
COMMIT;
