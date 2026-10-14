/** Chave pública VAPID (pode ficar no frontend por definição do protocolo Web Push). */
export const VAPID_PUBLIC_KEY =
  "BFSIvClNp-ABqbioYKVKln3FEZFRAhxnxV-VAlWqC2gYkub3Fh6SITtOlQ-xsiPL-R0KWddoaG9od-yqzaK8ugE";

export const PUSH_SW_URL = "/push-sw.js";

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
