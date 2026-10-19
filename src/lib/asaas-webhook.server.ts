import { timingSafeEqual } from "node:crypto";
import { asaasEnvironment, type AsaasEnvironment } from "./asaas-config.ts";
export type AsaasEvent = {
  environment: AsaasEnvironment;
  id: string;
  event: string;
  paymentId: string | null;
  paymentStatus: string | null;
};
type Dependencies = {
  getCredentials: (environment: AsaasEnvironment) => Promise<{ webhookToken: string | null }>;
  record: (event: AsaasEvent) => Promise<boolean>;
};
const failure = (status: number) =>
  Response.json({ error: "Não foi possível receber o evento da Asaas." }, { status });
async function readBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > 65536 || !request.body) return null;
  const reader = request.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    body = "",
    timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 3000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    return timedOut ? null : body + decoder.decode();
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
export async function handleAsaasWebhook(request: Request, deps: Dependencies): Promise<Response> {
  if (request.method !== "POST") return failure(405);
  let environment: AsaasEnvironment;
  try {
    environment = asaasEnvironment(new URL(request.url).searchParams.get("environment"));
  } catch {
    return failure(400);
  }
  const received = request.headers.get("asaas-access-token") ?? "";
  if (received.length < 32 || received.length > 255) return failure(401);
  try {
    const { webhookToken } = await deps.getCredentials(environment);
    if (!webhookToken) return failure(503);
    const expected = Buffer.from(webhookToken),
      provided = Buffer.from(received);
    if (provided.length !== expected.length || !timingSafeEqual(expected, provided))
      return failure(401);
  } catch {
    return failure(503);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return failure(415);
  let payload: Record<string, unknown>;
  try {
    const body = await readBody(request);
    if (body === null) return failure(413);
    const decoded: unknown = JSON.parse(body);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return failure(400);
    payload = decoded as Record<string, unknown>;
  } catch {
    return failure(400);
  }
  if (
    typeof payload.id !== "string" ||
    !/^[a-zA-Z0-9_&-]{1,240}$/.test(payload.id) ||
    typeof payload.event !== "string" ||
    !/^[A-Z][A-Z0-9_]{1,95}$/.test(payload.event)
  )
    return failure(400);
  const payment =
    payload.payment && typeof payload.payment === "object" && !Array.isArray(payload.payment)
      ? (payload.payment as Record<string, unknown>)
      : {};
  const summary: AsaasEvent = {
    environment,
    id: payload.id,
    event: payload.event,
    paymentId:
      typeof payment.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(payment.id)
        ? payment.id
        : null,
    paymentStatus:
      typeof payment.status === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(payment.status)
        ? payment.status
        : null,
  };
  try {
    const inserted = await deps.record(summary);
    return Response.json({ received: true, duplicate: !inserted });
  } catch {
    return failure(503);
  }
}
