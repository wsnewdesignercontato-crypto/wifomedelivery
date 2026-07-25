
CREATE OR REPLACE FUNCTION private.set_delivery_code_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo_entrega IS DISTINCT FROM OLD.codigo_entrega AND NEW.codigo_entrega IS NOT NULL THEN
    NEW.codigo_expira_em := now() + interval '30 minutes';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.set_delivery_code_expiry_ins()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo_entrega IS NOT NULL AND NEW.codigo_expira_em IS NULL THEN
    NEW.codigo_expira_em := now() + interval '30 minutes';
  END IF;
  RETURN NEW;
END;
$$;
