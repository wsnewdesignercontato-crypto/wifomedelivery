
-- Notify courier on KYC status change
CREATE OR REPLACE FUNCTION public.notify_courier_kyc_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

DROP TRIGGER IF EXISTS trg_courier_kyc_notify ON public.courier_profiles;
CREATE TRIGGER trg_courier_kyc_notify
AFTER UPDATE OF kyc_status ON public.courier_profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_courier_kyc_change();

-- Notify establishment owner on KYC status change
CREATE OR REPLACE FUNCTION public.notify_estab_kyc_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

DROP TRIGGER IF EXISTS trg_estab_kyc_notify ON public.establishments;
CREATE TRIGGER trg_estab_kyc_notify
AFTER UPDATE OF kyc_status ON public.establishments
FOR EACH ROW EXECUTE FUNCTION public.notify_estab_kyc_change();
