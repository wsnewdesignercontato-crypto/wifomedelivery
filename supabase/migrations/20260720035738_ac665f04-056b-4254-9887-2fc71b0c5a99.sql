ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS rg TEXT,
  ADD COLUMN IF NOT EXISTS nascimento DATE,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS endereco JSONB,
  ADD COLUMN IF NOT EXISTS contato_emergencia_nome TEXT,
  ADD COLUMN IF NOT EXISTS contato_emergencia_tel TEXT,
  ADD COLUMN IF NOT EXISTS cnh_categoria TEXT,
  ADD COLUMN IF NOT EXISTS cnh_validade DATE,
  ADD COLUMN IF NOT EXISTS pix_tipo TEXT,
  ADD COLUMN IF NOT EXISTS banco_nome TEXT,
  ADD COLUMN IF NOT EXISTS banco_agencia TEXT,
  ADD COLUMN IF NOT EXISTS banco_conta TEXT,
  ADD COLUMN IF NOT EXISTS banco_tipo TEXT,
  ADD COLUMN IF NOT EXISTS banco_titular TEXT,
  ADD COLUMN IF NOT EXISTS cidades_atuacao TEXT[],
  ADD COLUMN IF NOT EXISTS avaliacao NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entregas_total INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aceitacao_pct NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelamento_pct NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aprovacao TEXT DEFAULT 'incompleto';

CREATE TABLE IF NOT EXISTS public.courier_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, marca TEXT, modelo TEXT, ano INT, cor TEXT, placa TEXT, renavam TEXT,
  foto_url TEXT, documento_url TEXT, ativo BOOLEAN DEFAULT true, status TEXT DEFAULT 'em_analise',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_vehicles TO authenticated;
GRANT ALL ON public.courier_vehicles TO service_role;
ALTER TABLE public.courier_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courier owns vehicles" ON public.courier_vehicles FOR ALL
  USING (auth.uid() = courier_id) WITH CHECK (auth.uid() = courier_id);
CREATE POLICY "admins read vehicles" ON public.courier_vehicles FOR SELECT
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.courier_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, url TEXT, status TEXT DEFAULT 'pendente',
  motivo_recusa TEXT, validade DATE,
  enviado_em TIMESTAMPTZ DEFAULT now(), revisado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_documents TO authenticated;
GRANT ALL ON public.courier_documents TO service_role;
ALTER TABLE public.courier_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courier owns documents" ON public.courier_documents FOR ALL
  USING (auth.uid() = courier_id) WITH CHECK (auth.uid() = courier_id);
CREATE POLICY "admins read documents" ON public.courier_documents FOR SELECT
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.courier_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor_cents INT NOT NULL CHECK (valor_cents > 0),
  metodo TEXT NOT NULL DEFAULT 'pix', pix_key TEXT, banco_info JSONB,
  status TEXT DEFAULT 'solicitado', taxa_cents INT DEFAULT 0, liquido_cents INT,
  motivo_recusa TEXT, processado_em TIMESTAMPTZ, comprovante_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_withdrawals TO authenticated;
GRANT ALL ON public.courier_withdrawals TO service_role;
ALTER TABLE public.courier_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courier reads own withdrawals" ON public.courier_withdrawals FOR SELECT
  USING (auth.uid() = courier_id);
CREATE POLICY "courier requests withdrawals" ON public.courier_withdrawals FOR INSERT
  WITH CHECK (auth.uid() = courier_id);
CREATE POLICY "admins manage withdrawals" ON public.courier_withdrawals FOR ALL
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.courier_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL, descricao TEXT,
  meta_entregas INT DEFAULT 0, progresso INT DEFAULT 0, bonus_cents INT DEFAULT 0,
  periodo_inicio TIMESTAMPTZ DEFAULT now(), periodo_fim TIMESTAMPTZ,
  status TEXT DEFAULT 'ativa',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_missions TO authenticated;
GRANT ALL ON public.courier_missions TO service_role;
ALTER TABLE public.courier_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courier reads own missions" ON public.courier_missions FOR SELECT
  USING (auth.uid() = courier_id);
CREATE POLICY "admins manage missions" ON public.courier_missions FOR ALL
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_courier_vehicles_upd BEFORE UPDATE ON public.courier_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_courier_documents_upd BEFORE UPDATE ON public.courier_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_courier_withdrawals_upd BEFORE UPDATE ON public.courier_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_courier_missions_upd BEFORE UPDATE ON public.courier_missions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_withdrawals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_missions;