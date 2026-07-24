
REVOKE ALL ON FUNCTION public.apply_score_penalty(TEXT, UUID, INT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_reviews_score_penalty() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_orders_delay_penalty() FROM PUBLIC, anon, authenticated;
