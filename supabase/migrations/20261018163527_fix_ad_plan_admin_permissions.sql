-- RLS already restricts plan writes to administrators; the table grants were missing.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ad_plans TO authenticated;
