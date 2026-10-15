import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { BrevoCredentials } from "./brevo-hook.server";

export async function getBrevoCredentials(signal: AbortSignal): Promise<BrevoCredentials> {
  const { data, error } = await supabaseAdmin.rpc("brevo_credentials_get").abortSignal(signal);
  if (error || !data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Email configuration unavailable");
  return data as unknown as BrevoCredentials;
}

export async function claimBrevoHook(
  id: string,
  hash: string,
  signal: AbortSignal,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .rpc("brevo_hook_claim", { _request_id: id, _payload_hash: hash })
    .abortSignal(signal);
  if (error || typeof data !== "string") throw new Error("Email delivery unavailable");
  return data;
}

export async function completeBrevoHook(
  id: string,
  hash: string,
  signal: AbortSignal,
): Promise<void> {
  const { error } = await supabaseAdmin
    .rpc("brevo_hook_complete", { _request_id: id, _payload_hash: hash })
    .abortSignal(signal);
  if (error) throw new Error("Email delivery unavailable");
}
