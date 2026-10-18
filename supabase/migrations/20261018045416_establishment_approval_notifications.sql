-- Registration approval is independent from KYC/payment validation.
-- Only table events can invoke this private trigger; browser RPCs cannot.
CREATE OR REPLACE FUNCTION private.notify_establishment_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  review_link text := '/admin/estabelecimentos?loja=' || NEW.id::text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pendente' THEN
      INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
      SELECT r.user_id, 'Estabelecimento aguardando aprovação',
        format('A loja “%s” foi cadastrada e aguarda sua análise.', NEW.nome),
        review_link, 'admin'
      FROM public.user_roles r WHERE r.role = 'admin';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'aprovado' THEN
    UPDATE public.notifications SET lida = true
    WHERE audience = 'admin' AND link_url = review_link AND NOT lida;

    INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
    VALUES (NEW.owner_id, 'Estabelecimento aprovado',
      format('A loja “%s” foi aprovada! Abra a loja no painel e cadastre seus produtos para receber pedidos.', NEW.nome),
      '/estabelecimento', 'estabelecimento');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_establishment_registration() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_establishment_registration_notify ON public.establishments;
CREATE TRIGGER trg_establishment_registration_notify
AFTER INSERT OR UPDATE OF status ON public.establishments
FOR EACH ROW EXECUTE FUNCTION private.notify_establishment_registration();

-- Include registrations already awaiting review without approving any store.
INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
SELECT r.user_id, 'Estabelecimento aguardando aprovação',
  format('A loja “%s” foi cadastrada e aguarda sua análise.', e.nome),
  '/admin/estabelecimentos?loja=' || e.id::text, 'admin'
FROM public.establishments e
CROSS JOIN public.user_roles r
WHERE e.status = 'pendente' AND r.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = r.user_id AND n.audience = 'admin'
      AND n.link_url = '/admin/estabelecimentos?loja=' || e.id::text
  );
