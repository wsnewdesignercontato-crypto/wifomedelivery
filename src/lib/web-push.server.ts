/**
 * Implementação de Web Push (RFC 8291 / aes128gcm + VAPID RFC 8292)
 * usando apenas Web Crypto — compatível com o runtime serverless.
 */

const encoder = new TextEncoder();

function b64urlToBytes(input: string): Uint8Array {
  const padding = "=".repeat((4 - (input.length % 4)) % 4);
  const normalized = (input + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as BufferSource));
}

/** HKDF (extract + expand de um único bloco), suficiente para Web Push. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  const okm = await hmacSha256(prk, concat(info, Uint8Array.of(1)));
  return okm.slice(0, length);
}

/** Criptografa o payload no formato aes128gcm para a inscrição informada. */
async function encryptPayload(payload: string, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(p256dh);
  const auth = b64urlToBytes(authSecret);

  const asKeys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256),
  );

  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(auth, shared, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(encoder.encode(payload), Uint8Array.of(2)); // delimitador de registro
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aesKey, plaintext as BufferSource),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);

  return concat(salt, recordSize, Uint8Array.of(asPublic.length), asPublic, ciphertext);
}

async function vapidHeader(endpoint: string): Promise<string> {
  const jwkRaw = process.env["VAPID_PRIVATE_JWK"];
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const subject = process.env["VAPID_SUBJECT"] || "mailto:contato@wifomedelivery.com";
  if (!jwkRaw || !publicKey) throw new Error("VAPID keys ausentes");

  const jwk = JSON.parse(jwkRaw) as JsonWebKey;
  const key = await crypto.subtle.importKey(
    "jwk",
    { ...jwk, key_ops: ["sign"], ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = bytesToB64url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const signingInput = encoder.encode(`${header}.${claims}`);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, signingInput as BufferSource),
  );

  return `vapid t=${header}.${claims}.${bytesToB64url(signature)}, k=${publicKey}`;
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  unread?: number;
};

/** Envia uma notificação. Retorna o status HTTP do serviço de push. */
export async function sendWebPush(target: PushTarget, payload: PushPayload): Promise<number> {
  const body = await encryptPayload(JSON.stringify(payload), target.p256dh, target.auth);
  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(target.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body: body as BodyInit,
  });
  return res.status;
}
