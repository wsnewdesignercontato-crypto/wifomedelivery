
-- 1) Establishment withdrawals (mirror of courier_withdrawals)
CREATE TABLE public.establishment_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor_cents integer NOT NULL CHECK (valor_cents > 0),
  metodo text NOT NULL DEFAULT 'pix',
  pix_key text,
  pix_tipo text,
  banco_info jsonb,
  titular_nome text,
  titular_documento text,
  status text NOT NULL DEFAULT 'solicitado',
  taxa_cents integer DEFAULT 0,
  liquido_cents integer,
  motivo_recusa text,
  processado_em timestamptz,
  comprovante_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.establishment_withdrawals TO authenticated;
GRANT ALL ON public.establishment_withdrawals TO service_role;
ALTER TABLE public.establishment_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own establishment withdrawals" ON public.establishment_withdrawals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid())
  );

CREATE POLICY "owner requests establishment withdrawals" ON public.establishment_withdrawals
  FOR INSERT WITH CHECK (
    auth.uid() = requested_by AND
    EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid())
  );

CREATE POLICY "admins manage establishment withdrawals" ON public.establishment_withdrawals
  FOR ALL USING (private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_estab_withdrawals_upd BEFORE UPDATE ON public.establishment_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_estab_withdrawals_estab ON public.establishment_withdrawals(establishment_id);
CREATE INDEX idx_estab_withdrawals_status ON public.establishment_withdrawals(status);

-- 2) Establishment documents (KYC)
CREATE TABLE public.establishment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  arquivo_url text NOT NULL,
  status text NOT NULL DEFAULT 'em_analise',
  motivo_recusa text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.establishment_documents TO authenticated;
GRANT ALL ON public.establishment_documents TO service_role;
ALTER TABLE public.establishment_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages own estab documents" ON public.establishment_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = establishment_id AND e.owner_id = auth.uid())
  );

CREATE POLICY "admin views all estab documents" ON public.establishment_documents
  FOR ALL USING (private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_estab_docs_upd BEFORE UPDATE ON public.establishment_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) KYC status columns
ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS kyc_motivo text;

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS kyc_motivo text;
