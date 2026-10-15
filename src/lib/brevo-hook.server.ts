import { createHash } from "node:crypto";
import { Webhook } from "standardwebhooks";
import { buildAuthEmails, sendBrevoEmail } from "./brevo-email.server.ts";
import type { BrevoEmail, BrevoDeliveryResult } from "./brevo-email.server.ts";

export type BrevoCredentials = {
  senderName: string;
  senderEmail: string;
  apiKey: string | null;
  tested: boolean;
  revision?: string;
};

type HookOptions = {
  secret: string;
  supabaseUrl: string;
  allowedOrigins: string[];
  getCredentials: (signal: AbortSignal) => Promise<BrevoCredentials>;
  claim: (id: string, hash: string, signal: AbortSignal) => Promise<string>;
  complete: (id: string, hash: string, signal: AbortSignal) => Promise<void>;
  send?: (
    key: string,
    message: BrevoEmail,
    options: { signal: AbortSignal; timeoutMs: number },
  ) => Promise<BrevoDeliveryResult>;
};

// UUIDv5 with the RFC URL namespace: retries derive the same provider key.
function deliveryUuid(value: string): string {
  const namespace = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
  const bytes = createHash("sha1").update(namespace).update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function failure(status: number): Response {
  return Response.json(
    {
      error: {
        http_code: status,
        message: "Não foi possível enviar o e-mail de autenticação. Tente novamente mais tarde.",
      },
    },
    { status },
  );
}

async function readBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > 65536 || !request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let body = "";
  const timer = setTimeout(() => {
    void reader.cancel().catch(() => {});
  }, 1500);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 65536) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export async function handleBrevoAuthHook(
  request: Request,
  options: HookOptions,
): Promise<Response> {
  if (request.method !== "POST") return failure(405);
  if (!options.secret) return failure(503);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return failure(400);
  const signal = AbortSignal.timeout(4000);
  let body: string | null;
  let payload: unknown;
  const id = request.headers.get("webhook-id") ?? "";
  try {
    body = await readBody(request);
    if (body === null) return failure(413);
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) return failure(401);
    const webhook = new Webhook(options.secret.replace(/^v1,/, ""));
    payload = webhook.verify(body, {
      "webhook-id": id,
      "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": request.headers.get("webhook-signature") ?? "",
    });
  } catch {
    return failure(401);
  }
  try {
    const credentials = await options.getCredentials(signal);
    if (!credentials.apiKey || !credentials.tested) return failure(503);
    const messages = buildAuthEmails(
      payload,
      { name: credentials.senderName, email: credentials.senderEmail },
      options.supabaseUrl,
      options.allowedOrigins,
    );
    const hash = createHash("sha256").update(body).digest("hex");
    await Promise.all(
      messages.map(async (message, index) => {
        const deliveryId = `${id}_${index}`;
        const state = await options.claim(deliveryId, hash, signal);
        if (state === "sent") return;
        if (state !== "claimed") throw new Error("Delivery pending");
        message.headers = {
          idempotencyKey: deliveryUuid(`wifome-auth:${options.supabaseUrl}:${deliveryId}`),
        };
        await (options.send ?? sendBrevoEmail)(credentials.apiKey!, message, {
          signal,
          timeoutMs: 2000,
        });
        await options.complete(deliveryId, hash, signal);
      }),
    );
    return Response.json({});
  } catch {
    // Auth events contain tokens and addresses. Never log payloads or raw errors.
    return failure(503);
  }
}
