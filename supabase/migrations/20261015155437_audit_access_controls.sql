-- A02-A04: RLS restricts rows; column grants keep sensitive data off shared rows.
REVOKE SELECT ON public.establishments, public.orders FROM PUBLIC, anon, authenticated;
REVOKE SELECT (banco_agencia,banco_conta,banco_documento,banco_nome,banco_tipo,banco_titular,pix_key,cnpj) ON public.establishments FROM PUBLIC, anon, authenticated;
REVOKE SELECT (codigo_entrega) ON public.orders FROM PUBLIC, anon, authenticated;
GRANT SELECT (avaliacao,capa_url,categoria_id,cidade,cor_destaque,created_at,descricao,endereco,estado,id,instagram,is_open,kyc_motivo,kyc_status,lat,lng,logo_url,nome,onboarding_completed,owner_id,pedido_minimo_cents,printer_auto,printer_enabled,printer_width_mm,raio_entrega_km,razao_social,score_mensal,score_ym,site,slogan,status,taxa_entrega_cents,telefone,tempo_medio_min,tipos,updated_at,whatsapp) ON public.establishments TO anon, authenticated;
GRANT SELECT (cancellation_reason,cancelled_at,cancelled_by,cancelled_role,cliente_id,codigo_expira_em,created_at,desconto_cents,dinheiro_recebido,endereco_entrega,entrega_metodo_prova,entrega_observacao,establishment_id,forma_pagamento,frete_cents,id,observacoes,prova_assinatura,prova_url,refund_amount_cents,refund_status,refunded_at,status,subtotal_cents,tempo_estimado_min,tipo_entrega,total_cents,troco_para_cents,updated_at) ON public.orders TO authenticated;

CREATE OR REPLACE FUNCTION public.get_establishment_private(p_establishment_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('banco_agencia',e.banco_agencia,'banco_conta',e.banco_conta,'banco_documento',e.banco_documento,'banco_nome',e.banco_nome,'banco_tipo',e.banco_tipo,'banco_titular',e.banco_titular,'pix_key',e.pix_key,'cnpj',e.cnpj) INTO result
 FROM public.establishments e WHERE e.id=p_establishment_id AND (e.owner_id=auth.uid() OR private.has_role(auth.uid(),'admin'));
 IF result IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.get_order_delivery_code(p_order_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('codigo_entrega',o.codigo_entrega,'codigo_expira_em',o.codigo_expira_em) INTO result
 FROM public.orders o WHERE o.id=p_order_id AND (o.cliente_id=auth.uid() OR private.has_role(auth.uid(),'admin'));
 IF result IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_establishment_private(uuid), public.get_order_delivery_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_establishment_private(uuid), public.get_order_delivery_code(uuid) TO authenticated;

-- Secrets are not present in replicated order rows, including Realtime payloads.
CREATE TABLE private.order_delivery_codes (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
 code text NOT NULL
);
ALTER TABLE private.order_delivery_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.order_delivery_codes FROM PUBLIC,anon,authenticated;
INSERT INTO private.order_delivery_codes(order_id,code) SELECT id,codigo_entrega FROM public.orders WHERE codigo_entrega IS NOT NULL;
UPDATE public.orders SET codigo_entrega=NULL WHERE codigo_entrega IS NOT NULL;
CREATE OR REPLACE FUNCTION private.seal_order_code() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.codigo_entrega IS NOT NULL THEN
  INSERT INTO private.order_delivery_codes(order_id,code) VALUES(NEW.id,NEW.codigo_entrega)
   ON CONFLICT(order_id) DO UPDATE SET code=excluded.code;
 ELSIF TG_OP='INSERT' THEN
  INSERT INTO private.order_delivery_codes(order_id,code) VALUES(NEW.id,lpad(floor(random()*10000)::integer::text,4,'0'));
 END IF;
 NEW.codigo_entrega:=NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_seal_order_code BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.seal_order_code();
CREATE OR REPLACE FUNCTION public.get_order_delivery_code(p_order_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('codigo_entrega',s.code,'codigo_expira_em',o.codigo_expira_em) INTO result
 FROM public.orders o JOIN private.order_delivery_codes s ON s.order_id=o.id
 WHERE o.id=p_order_id AND (o.cliente_id=auth.uid() OR private.has_role(auth.uid(),'admin'));
 IF result IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.guard_reviewed_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE fields text[]; field text; data jsonb:=to_jsonb(NEW);
BEGIN
 IF current_user='postgres' OR private.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='courier_documents' THEN
  IF TG_OP='INSERT' THEN
   IF coalesce(NEW.status,'pendente') NOT IN ('pendente','em_analise','pending') OR NEW.revisado_em IS NOT NULL OR NEW.motivo_recusa IS NOT NULL THEN RAISE EXCEPTION 'Document review is administrative' USING ERRCODE='42501'; END IF;
  ELSE
   IF (to_jsonb(NEW)-ARRAY['url','tipo','validade','enviado_em','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['url','tipo','validade','enviado_em','updated_at']) THEN RAISE EXCEPTION 'Document review is administrative' USING ERRCODE='42501'; END IF;
   IF NEW.url IS DISTINCT FROM OLD.url AND OLD.status IN ('aprovado','approved') THEN RAISE EXCEPTION 'Submit a new document for review' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 fields:=CASE WHEN TG_TABLE_NAME='establishments' THEN ARRAY['owner_id','status','kyc_status','kyc_motivo','score_mensal','score_ym','avaliacao'] ELSE ARRAY['user_id','aprovacao','kyc_status','kyc_motivo','score_mensal','score_ym','avaliacao','entregas_total','aceitacao_pct','cancelamento_pct'] END;
 IF TG_OP='UPDATE' THEN
  FOREACH field IN ARRAY fields LOOP
   IF data->field IS DISTINCT FROM to_jsonb(OLD)->field THEN RAISE EXCEPTION 'Approval and quality fields are administrative' USING ERRCODE='42501'; END IF;
  END LOOP;
  IF TG_TABLE_NAME='courier_profiles' AND to_jsonb(OLD)->>'status'='bloqueado' AND data->>'status'<>to_jsonb(OLD)->>'status' THEN RAISE EXCEPTION 'Courier blocked' USING ERRCODE='42501'; END IF;
 ELSE
  IF coalesce(data->>'status','pendente') NOT IN ('pendente','offline') OR coalesce(data->>'kyc_status','pendente') NOT IN ('pendente','pending','em_analise','incompleto') OR coalesce(data->>'aprovacao','incompleto') NOT IN ('pendente','pending','em_analise','incompleto') OR data->>'kyc_motivo' IS NOT NULL OR (data->>'score_mensal')::int<>100 OR data->>'score_ym'<>to_char(now(),'YYYY-MM') OR coalesce((data->>'avaliacao')::numeric,0)<>0 OR coalesce((data->>'entregas_total')::int,0)<>0 OR coalesce((data->>'aceitacao_pct')::numeric,0)<>0 OR coalesce((data->>'cancelamento_pct')::numeric,0)<>0 THEN RAISE EXCEPTION 'New registrations require administrative review' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_TABLE_NAME='courier_profiles' AND data->>'status' IN ('online','ocupado','aprovado') AND NOT private.is_courier_dispatch_approved((data->>'user_id')::uuid) THEN RAISE EXCEPTION 'Courier not approved' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_reviewed_fields BEFORE INSERT OR UPDATE ON public.establishments FOR EACH ROW EXECUTE FUNCTION private.guard_reviewed_fields();
CREATE TRIGGER audit_reviewed_fields BEFORE INSERT OR UPDATE ON public.courier_profiles FOR EACH ROW EXECUTE FUNCTION private.guard_reviewed_fields();
CREATE TRIGGER audit_reviewed_fields BEFORE INSERT OR UPDATE ON public.courier_documents FOR EACH ROW EXECUTE FUNCTION private.guard_reviewed_fields();
CREATE POLICY audit_admin_documents ON public.courier_documents FOR ALL TO authenticated USING(private.has_role(auth.uid(),'admin')) WITH CHECK(private.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION private.guard_order_proof() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user='postgres' THEN RETURN NEW; END IF;
 IF NEW.codigo_entrega IS DISTINCT FROM OLD.codigo_entrega OR NEW.codigo_expira_em IS DISTINCT FROM OLD.codigo_expira_em
  OR NEW.entrega_metodo_prova IS DISTINCT FROM OLD.entrega_metodo_prova
  OR NEW.prova_url IS DISTINCT FROM OLD.prova_url OR NEW.prova_assinatura IS DISTINCT FROM OLD.prova_assinatura THEN RAISE EXCEPTION 'Use proof confirmation API' USING ERRCODE='42501'; END IF;
 IF NEW.status='delivered' AND OLD.status<>'delivered' THEN RAISE EXCEPTION 'Delivery proof required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_order_proof BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.guard_order_proof();
CREATE OR REPLACE FUNCTION private.guard_delivery_write() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user='postgres' THEN RETURN NEW; END IF;
 IF NEW.status='delivered' AND OLD.status IS DISTINCT FROM NEW.status THEN RAISE EXCEPTION 'Delivery proof required' USING ERRCODE='42501'; END IF;
 IF ROW(NEW.order_id,NEW.valor_entrega_cents) IS DISTINCT FROM ROW(OLD.order_id,OLD.valor_entrega_cents) THEN RAISE EXCEPTION 'Delivery order and amount are immutable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_delivery_write() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_delivery_write BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION private.guard_delivery_write();
CREATE OR REPLACE FUNCTION private.courier_confirm_delivery_core(p_order_id uuid,p_codigo text,p_prova_url text DEFAULT NULL,p_metodo text DEFAULT 'code') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; d public.deliveries%ROWTYPE; expected text; prior text:=current_setting('app.order_write_context',true); method text:=lower(coalesce(p_metodo,'code'));
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
 SELECT * INTO d FROM public.deliveries WHERE order_id=p_order_id FOR UPDATE;
 IF NOT FOUND OR (d.entregador_id IS DISTINCT FROM auth.uid() AND NOT private.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF o.status='delivered' THEN RETURN; END IF;
 IF o.tipo_entrega='pickup' OR o.status NOT IN ('picked_up','on_the_way','arriving') THEN RAISE EXCEPTION 'order_not_ready'; END IF;
 IF o.codigo_expira_em IS NOT NULL AND o.codigo_expira_em<now() THEN RAISE EXCEPTION 'code_expired'; END IF;
 SELECT code INTO expected FROM private.order_delivery_codes WHERE order_id=p_order_id;
 IF p_codigo IS NULL OR expected IS NULL OR btrim(p_codigo)<>expected THEN RAISE EXCEPTION 'invalid_code'; END IF;
 IF method='code+photo' THEN method:='photo'; END IF;
 IF method NOT IN ('code','photo','signature','contactless') THEN RAISE EXCEPTION 'invalid_proof'; END IF;
 PERFORM set_config('app.order_write_context','confirm_delivery',true);
 UPDATE public.deliveries SET status='delivered',entregue_em=coalesce(entregue_em,now()) WHERE id=d.id;
 UPDATE public.orders SET status='delivered',entrega_metodo_prova=method,prova_url=coalesce(p_prova_url,prova_url) WHERE id=p_order_id;
 UPDATE public.courier_profiles SET status='online' WHERE user_id=d.entregador_id AND status<>'bloqueado';
 PERFORM set_config('app.order_write_context',coalesce(prior,''),true);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.order_write_context',coalesce(prior,''),true); RAISE;
END $$;
CREATE OR REPLACE FUNCTION public.confirm_delivery_code(p_order_id uuid,p_code text,p_prova_url text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.courier_confirm_delivery_core(p_order_id,p_code,p_prova_url,'code');
 RETURN jsonb_build_object('success',true);
END $$;
-- The historical two- and four-argument overloads otherwise make SQL calls ambiguous.
DROP FUNCTION public.courier_confirm_delivery(uuid,text,text,text);
CREATE FUNCTION public.courier_confirm_delivery(_order_id uuid,_codigo text,_prova_url text,_metodo text) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN PERFORM private.courier_confirm_delivery_core(_order_id,_codigo,_prova_url,_metodo); END $$;
REVOKE ALL ON FUNCTION public.courier_confirm_delivery(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.courier_confirm_delivery(uuid,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.confirm_pickup_order(p_order_id uuid,p_codigo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; expected text; prior text:=current_setting('app.order_write_context',true);
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 SELECT o1.* INTO o FROM public.orders o1 JOIN public.establishments e ON e.id=o1.establishment_id WHERE o1.id=p_order_id AND e.owner_id=auth.uid() FOR UPDATE OF o1;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF o.tipo_entrega<>'pickup' THEN RAISE EXCEPTION 'pickup_only'; END IF;
 IF o.status='delivered' THEN RETURN; END IF;
 IF o.status<>'ready' THEN RAISE EXCEPTION 'order_not_ready'; END IF;
 IF o.codigo_expira_em IS NOT NULL AND o.codigo_expira_em<now() THEN RAISE EXCEPTION 'code_expired'; END IF;
 SELECT code INTO expected FROM private.order_delivery_codes WHERE order_id=p_order_id;
 IF p_codigo IS NULL OR expected IS NULL OR btrim(p_codigo)<>expected THEN RAISE EXCEPTION 'invalid_code'; END IF;
 PERFORM set_config('app.order_write_context','confirm_pickup',true);
 UPDATE public.orders SET status='delivered',entrega_metodo_prova='code' WHERE id=p_order_id;
 PERFORM set_config('app.order_write_context',coalesce(prior,''),true);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.order_write_context',coalesce(prior,''),true); RAISE;
END $$;
CREATE OR REPLACE FUNCTION public.regenerate_delivery_code(p_order_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.orders WHERE id=p_order_id AND (cliente_id=auth.uid() OR private.has_role(auth.uid(),'admin')) AND status NOT IN ('delivered','cancelled','refunded')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 UPDATE private.order_delivery_codes SET code=lpad(floor(random()*10000)::integer::text,4,'0') WHERE order_id=p_order_id;
 UPDATE public.orders SET codigo_expira_em=now()+interval '30 minutes' WHERE id=p_order_id;
 SELECT code INTO result FROM private.order_delivery_codes WHERE order_id=p_order_id; RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.can_access_order_chat(p_order uuid,p_scope text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.orders o JOIN public.establishments e ON e.id=o.establishment_id WHERE o.id=p_order AND
 (private.has_role(auth.uid(),'admin') OR (p_scope IN ('client_store','client_courier') AND o.cliente_id=auth.uid()) OR (p_scope IN ('client_store','store_courier') AND e.owner_id=auth.uid()) OR (p_scope IN ('client_courier','store_courier') AND EXISTS(SELECT 1 FROM public.deliveries d WHERE d.order_id=o.id AND d.entregador_id=auth.uid()))));
$$;
DROP POLICY "chat participants can read" ON public.order_chats;
DROP POLICY "chat participants can create" ON public.order_chats;
DROP POLICY "message participants can read" ON public.order_messages;
DROP POLICY "message participants can send" ON public.order_messages;
DROP POLICY "message mark as read" ON public.order_messages;
CREATE POLICY "chat participants can read" ON public.order_chats FOR SELECT TO authenticated USING(private.can_access_order_chat(order_id,escopo));
CREATE POLICY "chat participants can create" ON public.order_chats FOR INSERT TO authenticated WITH CHECK(private.can_access_order_chat(order_id,escopo));
CREATE POLICY "message participants can read" ON public.order_messages FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.order_chats c WHERE c.id=chat_id AND private.can_access_order_chat(c.order_id,c.escopo)));
CREATE POLICY "message participants can send" ON public.order_messages FOR INSERT TO authenticated WITH CHECK(sender_id=auth.uid() AND EXISTS(SELECT 1 FROM public.order_chats c WHERE c.id=chat_id AND private.can_access_order_chat(c.order_id,c.escopo)));
CREATE POLICY "message mark as read" ON public.order_messages FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM public.order_chats c WHERE c.id=chat_id AND private.can_access_order_chat(c.order_id,c.escopo))) WITH CHECK(EXISTS(SELECT 1 FROM public.order_chats c WHERE c.id=chat_id AND private.can_access_order_chat(c.order_id,c.escopo)));
CREATE OR REPLACE FUNCTION private.guard_chat_message() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'lida_em') IS DISTINCT FROM (to_jsonb(OLD)-'lida_em') OR NEW.lida_em IS NULL OR NEW.lida_em>now()+interval '1 minute' OR (OLD.lida_em IS NOT NULL AND NEW.lida_em<OLD.lida_em) THEN RAISE EXCEPTION 'Messages are immutable' USING ERRCODE='42501'; END IF;
 ELSIF current_user<>'postgres' AND NOT EXISTS(SELECT 1 FROM public.order_chats c JOIN public.orders o ON o.id=c.order_id JOIN public.establishments e ON e.id=o.establishment_id WHERE c.id=NEW.chat_id AND NEW.sender_id=auth.uid() AND ((NEW.sender_role='cliente' AND o.cliente_id=auth.uid()) OR (NEW.sender_role='estabelecimento' AND e.owner_id=auth.uid()) OR (NEW.sender_role='entregador' AND EXISTS(SELECT 1 FROM public.deliveries d WHERE d.order_id=o.id AND d.entregador_id=auth.uid())))) THEN RAISE EXCEPTION 'Invalid message author' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_chat_message BEFORE INSERT OR UPDATE ON public.order_messages FOR EACH ROW EXECUTE FUNCTION private.guard_chat_message();

CREATE OR REPLACE FUNCTION private.chat_attachment_path(value text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE raw text; bytes bytea:=''::bytea; i integer:=1; ch text;
BEGIN
 IF value LIKE 'http%' THEN
  IF value !~ '^https?://[^/]+/storage/v1/object/(sign|authenticated|public)/chat-attachments/' THEN RETURN NULL; END IF;
  raw:=split_part(regexp_replace(value,'^https?://[^/]+/storage/v1/object/(sign|authenticated|public)/chat-attachments/',''), '?',1);
 ELSE raw:=value; END IF;
 WHILE i<=length(raw) LOOP
  ch:=substr(raw,i,1);
  IF ch='%' AND substr(raw,i+1,2)~'^[0-9A-Fa-f]{2}$' THEN bytes:=bytes||decode(substr(raw,i+1,2),'hex');i:=i+3;
  ELSE bytes:=bytes||convert_to(ch,'UTF8');i:=i+1; END IF;
 END LOOP;
 RETURN convert_from(bytes,'UTF8');
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION private.can_read_chat_attachment(object_name text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE oid uuid; scope text;
BEGIN
 IF split_part(object_name,'/',2)!~'^[0-9a-fA-F-]{36}$' THEN RETURN false; END IF;
 oid:=split_part(object_name,'/',2)::uuid;scope:=split_part(object_name,'/',3);
 IF scope IN ('client_store','client_courier','store_courier') THEN RETURN private.can_access_order_chat(oid,scope); END IF;
 RETURN EXISTS(SELECT 1 FROM public.order_messages m JOIN public.order_chats c ON c.id=m.chat_id WHERE c.order_id=oid AND private.chat_attachment_path(m.anexo_url)=object_name AND private.can_access_order_chat(c.order_id,c.escopo));
END $$;
DROP POLICY IF EXISTS "chat read participants" ON storage.objects;
DROP POLICY IF EXISTS "chat upload own" ON storage.objects;
-- Remove every legacy permissive policy on this bucket; permissive policies combine with OR.
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%chat-attachments%' LOOP EXECUTE format('DROP POLICY %I ON storage.objects',p.policyname); END LOOP; END $$;
CREATE POLICY audit_chat_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='chat-attachments' AND private.can_read_chat_attachment(name));
CREATE POLICY audit_chat_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='chat-attachments' AND split_part(name,'/',1)=auth.uid()::text AND split_part(name,'/',3) IN ('client_store','client_courier','store_courier') AND private.can_read_chat_attachment(name));
REVOKE ALL ON FUNCTION private.seal_order_code(),private.guard_reviewed_fields(),private.guard_order_proof(),private.guard_chat_message(),private.chat_attachment_path(text),private.can_access_order_chat(uuid,text),private.can_read_chat_attachment(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_order_chat(uuid,text),private.can_read_chat_attachment(text) TO authenticated;
REVOKE ALL ON FUNCTION public.regenerate_delivery_code(uuid),public.confirm_delivery_code(uuid,text,text),public.confirm_pickup_order(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.regenerate_delivery_code(uuid),public.confirm_delivery_code(uuid,text,text),public.confirm_pickup_order(uuid,text) TO authenticated;
