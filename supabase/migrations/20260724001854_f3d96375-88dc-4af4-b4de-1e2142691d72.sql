
CREATE OR REPLACE FUNCTION public.apply_score_penalty(_entity_type text, _entity_id uuid, _penalty integer, _motivo text, _order_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cur_ym TEXT := to_char(now(),'YYYY-MM');
  old_score INT;
  new_score INT;
  target_user UUID;
  audience TEXT;
  link TEXT;
  crossed_yellow BOOLEAN := false;
  crossed_red BOOLEAN := false;
  titulo TEXT;
  msg TEXT;
BEGIN
  IF _penalty <= 0 THEN RETURN; END IF;

  IF _entity_type = 'establishment' THEN
    SELECT CASE WHEN score_ym <> cur_ym THEN 100 ELSE score_mensal END, owner_id
      INTO old_score, target_user
      FROM public.establishments WHERE id = _entity_id;
    new_score := GREATEST(0, COALESCE(old_score,100) - _penalty);
    UPDATE public.establishments
      SET score_mensal = new_score, score_ym = cur_ym
      WHERE id = _entity_id;
    audience := 'estabelecimento';
    link := '/estabelecimento';
  ELSIF _entity_type = 'courier' THEN
    SELECT CASE WHEN score_ym <> cur_ym THEN 100 ELSE score_mensal END, user_id
      INTO old_score, target_user
      FROM public.courier_profiles WHERE user_id = _entity_id;
    new_score := GREATEST(0, COALESCE(old_score,100) - _penalty);
    UPDATE public.courier_profiles
      SET score_mensal = new_score, score_ym = cur_ym
      WHERE user_id = _entity_id;
    audience := 'entregador';
    link := '/entregador';
  ELSE
    RETURN;
  END IF;

  INSERT INTO public.score_events(entity_type, entity_id, ym, penalty, motivo, order_id)
  VALUES (_entity_type, _entity_id, cur_ym, _penalty, _motivo, _order_id);

  -- Detectar transições de faixa
  crossed_yellow := COALESCE(old_score,100) >= 85 AND new_score < 85 AND new_score >= 60;
  crossed_red    := COALESCE(old_score,100) >= 60 AND new_score < 60;

  IF target_user IS NOT NULL AND (crossed_yellow OR crossed_red) THEN
    IF crossed_red THEN
      titulo := '🚨 Score em nível crítico (' || new_score || ')';
      msg := 'Seu score mensal caiu para ' || new_score || ' (faixa crítica). Última perda: ' || _motivo || '. Melhore a qualidade para evitar restrições.';
    ELSE
      titulo := '⚠️ Score em atenção (' || new_score || ')';
      msg := 'Seu score mensal caiu para ' || new_score || ' (faixa de atenção). Última perda: ' || _motivo || '.';
    END IF;
    INSERT INTO public.notifications(user_id, titulo, mensagem, link_url, audience)
    VALUES (target_user, titulo, msg, link, audience);
  END IF;
END;
$function$;
