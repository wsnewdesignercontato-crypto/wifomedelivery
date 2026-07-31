ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS banner jsonb;

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL CHECK (audience IN ('cliente','estabelecimento','entregador')),
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'geral',
  titulo text NOT NULL,
  mensagem text NOT NULL,
  link_url text,
  tipo text NOT NULL DEFAULT 'info',
  banner jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.notification_templates TO authenticated;
GRANT ALL ON public.notification_templates TO service_role;

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_select_auth" ON public.notification_templates;
CREATE POLICY "templates_select_auth" ON public.notification_templates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "templates_admin_all" ON public.notification_templates;
CREATE POLICY "templates_admin_all" ON public.notification_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_notification_templates_updated ON public.notification_templates;
CREATE TRIGGER trg_notification_templates_updated
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.notification_templates (audience, nome, categoria, titulo, mensagem, link_url, tipo, banner) VALUES
('cliente','Cupom de boas-vindas','promocao','Ganhe 15% no primeiro pedido 🎉','Use o cupom BEMVINDO15 e economize agora no seu pedido.','/cliente','promo','{"titulo":"15% OFF no seu 1º pedido","subtitulo":"Cupom BEMVINDO15 — válido hoje","cta_texto":"Pedir agora","cta_link":"/cliente","cor":"#FF6B00"}'),
('cliente','Frete grátis hoje','promocao','Frete grátis hoje! 🛵','Peça nos restaurantes participantes e não pague a entrega.','/cliente','promo','{"titulo":"Frete grátis hoje","subtitulo":"Em lojas selecionadas perto de você","cta_texto":"Ver lojas","cta_link":"/cliente","cor":"#FF6B00"}'),
('cliente','Fim de semana com desconto','promocao','Fim de semana WiFome 🍕','Descontos de até 40% nos seus restaurantes favoritos.','/cliente','promo','{"titulo":"Até 40% OFF","subtitulo":"Só neste fim de semana","cta_texto":"Aproveitar","cta_link":"/cliente","cor":"#E03E00"}'),
('cliente','Novidades na sua cidade','novidade','Novos restaurantes na sua região 🏪','Confira as lojas que acabaram de chegar no WiFome.','/cliente/novidades','info',NULL),
('cliente','Avalie seu pedido','engajamento','Como foi seu último pedido?','Avalie e ajude outros clientes a escolherem melhor.','/cliente/pedidos','info',NULL),
('cliente','Volte a pedir','engajamento','Sentimos sua falta! 💛','Temos ofertas especiais esperando por você hoje.','/cliente','promo','{"titulo":"A gente sentiu sua falta","subtitulo":"Ofertas especiais liberadas para você","cta_texto":"Ver ofertas","cta_link":"/cliente","cor":"#FF6B00"}'),
('estabelecimento','Nova campanha de anúncios','promocao','Destaque sua loja na home 🚀','Planos de anúncio a partir de R$ 30. Apareça primeiro para os clientes.','/estabelecimento/anuncios','promo','{"titulo":"Apareça em 1º lugar","subtitulo":"Planos de anúncio a partir de R$ 30","cta_texto":"Ver planos","cta_link":"/estabelecimento/anuncios","cor":"#FF6B00"}'),
('estabelecimento','Recebimento D+1','financeiro','Receba no dia seguinte 💰','Suas vendas caem na conta em D+1 com a melhor taxa do Brasil.','/estabelecimento/financeiro','info',NULL),
('estabelecimento','Atualize seu cardápio','operacional','Atualize seu cardápio 📋','Fotos e descrições completas aumentam suas vendas em até 30%.','/estabelecimento/produtos','info',NULL),
('estabelecimento','Documentos pendentes','aviso','Documentos pendentes ⚠️','Envie os documentos para manter sua loja ativa na plataforma.','/estabelecimento/configuracoes','info',NULL),
('estabelecimento','Horário de pico','operacional','Horário de pico chegando 🔥','Prepare a cozinha: o movimento aumenta nas próximas horas.','/estabelecimento/pedidos','info',NULL),
('entregador','Bônus de corridas','promocao','Bônus por entregas hoje! 🏍️','Complete 10 entregas hoje e ganhe R$ 30 de bônus.','/entregador/metas','promo','{"titulo":"Bônus de R$ 30","subtitulo":"Complete 10 entregas hoje","cta_texto":"Ver metas","cta_link":"/entregador/metas","cor":"#FF6B00"}'),
('entregador','Alta demanda na região','operacional','Alta demanda agora ⚡','Fique online: há muitos pedidos na sua região neste momento.','/entregador/corridas','info',NULL),
('entregador','Documentos vencendo','aviso','Documento perto do vencimento ⚠️','Atualize seus documentos para continuar recebendo corridas.','/entregador/documentos','info',NULL),
('entregador','Saque disponível','financeiro','Seu saldo está disponível 💸','Solicite seu saque pela carteira e receba via PIX.','/entregador/carteira','info',NULL),
('entregador','Melhore seu score','engajamento','Cuide do seu score ⭐','Aceite mais corridas e evite cancelamentos para subir de nível.','/entregador/score','info',NULL);