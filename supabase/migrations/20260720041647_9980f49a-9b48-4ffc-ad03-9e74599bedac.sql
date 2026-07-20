
CREATE TABLE public.order_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  escopo TEXT NOT NULL CHECK (escopo IN ('client_courier','store_courier','client_store')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id, escopo)
);
GRANT SELECT, INSERT ON public.order_chats TO authenticated;
GRANT ALL ON public.order_chats TO service_role;
ALTER TABLE public.order_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat participants can read" ON public.order_chats FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o LEFT JOIN public.deliveries d ON d.order_id=o.id LEFT JOIN public.establishments e ON e.id=o.establishment_id WHERE o.id=order_chats.order_id AND (o.cliente_id=auth.uid() OR d.entregador_id=auth.uid() OR e.owner_id=auth.uid())));
CREATE POLICY "chat participants can create" ON public.order_chats FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.orders o LEFT JOIN public.deliveries d ON d.order_id=o.id LEFT JOIN public.establishments e ON e.id=o.establishment_id WHERE o.id=order_chats.order_id AND (o.cliente_id=auth.uid() OR d.entregador_id=auth.uid() OR e.owner_id=auth.uid())));

CREATE TABLE public.order_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.order_chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('cliente','estabelecimento','entregador')),
  tipo TEXT NOT NULL DEFAULT 'text' CHECK (tipo IN ('text','image','location','audio')),
  conteudo TEXT, anexo_url TEXT, lat NUMERIC, lng NUMERIC,
  lida_em TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.order_messages(chat_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.order_messages TO authenticated;
GRANT ALL ON public.order_messages TO service_role;
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message participants can read" ON public.order_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.order_chats c JOIN public.orders o ON o.id=c.order_id LEFT JOIN public.deliveries d ON d.order_id=o.id LEFT JOIN public.establishments e ON e.id=o.establishment_id WHERE c.id=order_messages.chat_id AND (o.cliente_id=auth.uid() OR d.entregador_id=auth.uid() OR e.owner_id=auth.uid())));
CREATE POLICY "message participants can send" ON public.order_messages FOR INSERT TO authenticated WITH CHECK (sender_id=auth.uid() AND EXISTS (SELECT 1 FROM public.order_chats c JOIN public.orders o ON o.id=c.order_id LEFT JOIN public.deliveries d ON d.order_id=o.id LEFT JOIN public.establishments e ON e.id=o.establishment_id WHERE c.id=order_messages.chat_id AND (o.cliente_id=auth.uid() OR d.entregador_id=auth.uid() OR e.owner_id=auth.uid())));
CREATE POLICY "message mark as read" ON public.order_messages FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.order_chats c JOIN public.orders o ON o.id=c.order_id LEFT JOIN public.deliveries d ON d.order_id=o.id LEFT JOIN public.establishments e ON e.id=o.establishment_id WHERE c.id=order_messages.chat_id AND (o.cliente_id=auth.uid() OR d.entregador_id=auth.uid() OR e.owner_id=auth.uid())));

CREATE TABLE public.order_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  entregador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL, descricao TEXT, foto_url TEXT,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_analise','resolvido','cancelado')),
  protocolo TEXT NOT NULL DEFAULT ('OC' || lpad((floor(random()*1000000))::int::text, 6, '0')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.order_incidents(order_id);
GRANT SELECT, INSERT, UPDATE ON public.order_incidents TO authenticated;
GRANT ALL ON public.order_incidents TO service_role;
ALTER TABLE public.order_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incident participants read" ON public.order_incidents FOR SELECT TO authenticated USING (entregador_id=auth.uid() OR EXISTS (SELECT 1 FROM public.orders o LEFT JOIN public.establishments e ON e.id=o.establishment_id WHERE o.id=order_incidents.order_id AND (o.cliente_id=auth.uid() OR e.owner_id=auth.uid())) OR private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "incident courier can create" ON public.order_incidents FOR INSERT TO authenticated WITH CHECK (entregador_id=auth.uid());
CREATE POLICY "incident admin can update" ON public.order_incidents FOR UPDATE TO authenticated USING (private.has_role(auth.uid(),'admin'::app_role));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS entrega_metodo_prova TEXT DEFAULT 'code' CHECK (entrega_metodo_prova IN ('code','photo','signature','contactless')),
  ADD COLUMN IF NOT EXISTS prova_url TEXT,
  ADD COLUMN IF NOT EXISTS prova_assinatura TEXT,
  ADD COLUMN IF NOT EXISTS troco_para_cents INT,
  ADD COLUMN IF NOT EXISTS dinheiro_recebido BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entrega_observacao TEXT;

CREATE TABLE public.sos_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL, lat NUMERIC, lng NUMERIC, descricao TEXT,
  resolvido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sos_events TO authenticated;
GRANT ALL ON public.sos_events TO service_role;
ALTER TABLE public.sos_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sos self read" ON public.sos_events FOR SELECT TO authenticated USING (courier_id=auth.uid() OR private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "sos self create" ON public.sos_events FOR INSERT TO authenticated WITH CHECK (courier_id=auth.uid());
CREATE POLICY "sos admin resolve" ON public.sos_events FOR UPDATE TO authenticated USING (private.has_role(auth.uid(),'admin'::app_role));

ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS contato_emergencia_nome TEXT,
  ADD COLUMN IF NOT EXISTS contato_emergencia_telefone TEXT,
  ADD COLUMN IF NOT EXISTS pin_saque_hash TEXT,
  ADD COLUMN IF NOT EXISTS pin_atualizado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cidade_atuacao TEXT,
  ADD COLUMN IF NOT EXISTS bairros_atuacao TEXT[];

CREATE TABLE public.login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dispositivo TEXT, ip TEXT, user_agent TEXT,
  ultimo_acesso TIMESTAMPTZ NOT NULL DEFAULT now(),
  revogada BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.login_sessions(user_id);
GRANT SELECT, INSERT, UPDATE ON public.login_sessions TO authenticated;
GRANT ALL ON public.login_sessions TO service_role;
ALTER TABLE public.login_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session self read" ON public.login_sessions FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "session self write" ON public.login_sessions FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
CREATE POLICY "session self update" ON public.login_sessions FOR UPDATE TO authenticated USING (user_id=auth.uid());

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS regras_json JSONB DEFAULT '{}'::jsonb;

CREATE OR REPLACE VIEW public.demand_zones_view AS
SELECT
  COALESCE(e.cidade, 'Sem cidade') AS cidade,
  e.id AS establishment_id,
  e.nome AS estabelecimento,
  e.lat, e.lng,
  COUNT(o.id)::INT AS pedidos_2h,
  AVG(o.total_cents)::INT AS ticket_medio_cents,
  MAX(o.created_at) AS ultimo_pedido
FROM public.orders o
JOIN public.establishments e ON e.id = o.establishment_id
WHERE o.created_at > (now() - interval '2 hours')
GROUP BY e.id, e.cidade, e.nome, e.lat, e.lng;
GRANT SELECT ON public.demand_zones_view TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_events;
