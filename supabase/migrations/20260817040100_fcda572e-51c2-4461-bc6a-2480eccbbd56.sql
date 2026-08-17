-- Criação de uma VIEW para facilitar a leitura dos logs com o nome do Admin
CREATE OR REPLACE VIEW public.vw_admin_audit_logs AS
SELECT 
  l.id,
  l.admin_id,
  p.nome as admin_nome,
  l.action,
  l.entity_type,
  l.entity_id,
  l.created_at
FROM public.admin_audit_log l
LEFT JOIN public.profiles p ON l.admin_id = p.id;

-- Garante privilégios na VIEW
GRANT SELECT ON public.vw_admin_audit_logs TO authenticated;
GRANT ALL ON public.vw_admin_audit_logs TO service_role;
