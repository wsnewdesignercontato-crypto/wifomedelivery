-- The admin campaign form inserts notifications through the authenticated Data API.
-- Existing INSERT RLS only permits private.has_role(auth.uid(), 'admin').
-- Restore the table privilege; this does not permit ordinary users to send campaigns.
GRANT INSERT ON TABLE public.notifications TO authenticated;

-- A retry tick also covers a missed webhook while the app is minimized/closed.
-- No subscription secrets or keys are returned to browser roles.
CREATE OR REPLACE FUNCTION private.request_pending_push_dispatch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE base_url text; dispatch_secret text;
BEGIN
  IF NOT EXISTS (SELECT FROM public.notifications WHERE pushed_at IS NULL
    AND user_id IS NOT NULL AND created_at >= now() - interval '10 minutes') THEN RETURN; END IF;
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets
    WHERE name='push_dispatch_base_url' ORDER BY created_at DESC LIMIT 1;
  SELECT decrypted_secret INTO dispatch_secret FROM vault.decrypted_secrets
    WHERE name='push_dispatch_secret' ORDER BY created_at DESC LIMIT 1;
  IF coalesce(base_url,'')='' OR coalesce(dispatch_secret,'')='' THEN RETURN; END IF;
  PERFORM net.http_post(url := rtrim(base_url,'/') || '/api/internal/push-dispatch',
    headers := jsonb_build_object('Content-Type','application/json','x-push-dispatch-secret',dispatch_secret),
    body := '{}'::jsonb, timeout_milliseconds := 15000);
END;
$$;
REVOKE ALL ON FUNCTION private.request_pending_push_dispatch() FROM PUBLIC, anon, authenticated, service_role;
SELECT cron.schedule('pedetrem-retry-push-dispatch','10 seconds','SELECT private.request_pending_push_dispatch()');

-- Enable after publishing the dispatcher with concurrent-claim protection.
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='pedetrem-retry-push-dispatch'), active := false);
