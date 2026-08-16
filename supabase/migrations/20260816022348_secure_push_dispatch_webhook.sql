create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Required Vault secrets:
--   select vault.create_secret('https://your-app.example.com', 'push_dispatch_base_url');
--   select vault.create_secret('replace-with-a-shared-secret', 'push_dispatch_secret');
--
-- Keep the app runtime using the same secret via PUSH_DISPATCH_SECRET
-- (or reuse SUPABASE_SERVICE_ROLE_KEY as a fallback on the app side).
create or replace function public.trg_notifications_ping_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  base_url text;
  dispatch_secret text;
begin
  select decrypted_secret
    into base_url
  from vault.decrypted_secrets
  where name = 'push_dispatch_base_url'
  order by created_at desc
  limit 1;

  select decrypted_secret
    into dispatch_secret
  from vault.decrypted_secrets
  where name = 'push_dispatch_secret'
  order by created_at desc
  limit 1;

  if coalesce(base_url, '') = '' or coalesce(dispatch_secret, '') = '' then
    return new;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/api/internal/push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-dispatch-secret', dispatch_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 3000
  );

  return new;
exception when others then
  return new;
end;
$$;

revoke all on function public.trg_notifications_ping_push() from public, anon, authenticated;

drop trigger if exists notifications_ping_push on public.notifications;
create trigger notifications_ping_push
after insert on public.notifications
for each row execute function public.trg_notifications_ping_push();
