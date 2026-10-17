import {
  PUSH_SW_URL,
  VAPID_PUBLIC_KEY,
  pushSupported,
  urlBase64ToUint8Array,
} from "./push-config.ts";

export type DevicePushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
};

const PUSH_ENABLED_KEY = "pedetrem:push-enabled";
export const PUSH_PREFERENCES_CHANGED = "pedetrem:push-preferences-changed";
let temporaryChoice: boolean | null = null;

export function devicePushEnabled(): boolean | null {
  if (typeof window === "undefined") return null;
  if (temporaryChoice !== null) return temporaryChoice;
  try {
    const saved = window.localStorage.getItem(PUSH_ENABLED_KEY);
    if (saved === "1" || saved === "0") return saved === "1";
  } catch {
    /* Use this session's choice when storage is unavailable. */
  }
  return temporaryChoice;
}

export function setDevicePushEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  temporaryChoice = enabled;
  try {
    window.localStorage.setItem(PUSH_ENABLED_KEY, enabled ? "1" : "0");
    temporaryChoice = null;
  } catch {
    /* Keep the in-memory choice. */
  }
  window.dispatchEvent(new Event(PUSH_PREFERENCES_CHANGED));
}

function keyToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function serializeSubscription(subscription: PushSubscription): DevicePushSubscription {
  return {
    endpoint: subscription.endpoint,
    p256dh: keyToBase64Url(subscription.getKey("p256dh")),
    auth: keyToBase64Url(subscription.getKey("auth")),
    userAgent: navigator.userAgent,
  };
}

async function nativePushSubscription(): Promise<PushSubscription> {
  const existing = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
  const registration =
    existing ?? (await navigator.serviceWorker.register(PUSH_SW_URL, { scope: "/" }));
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription)
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  return subscription;
}

export async function devicePushSubscription(): Promise<DevicePushSubscription> {
  return serializeSubscription(await nativePushSubscription());
}

/** Silent registration only after native consent and an authenticated route. */
export async function syncGrantedPushSubscription(
  userId: string | null,
  save: (subscription: DevicePushSubscription) => Promise<unknown>,
): Promise<boolean> {
  const enabled = devicePushEnabled();
  if (
    !userId ||
    enabled === false ||
    !pushSupported() ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  )
    return false;
  const registration = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
  if (devicePushEnabled() === false || Notification.permission !== "granted") return false;
  const existing = await registration?.pushManager.getSubscription();
  // Preserve a legacy opt-out: only an explicit opt-in may create a new subscription.
  if (devicePushEnabled() === false || Notification.permission !== "granted") return false;
  if (!existing && devicePushEnabled() !== true) return false;
  const subscription = existing ?? (await nativePushSubscription());
  if (devicePushEnabled() === false || Notification.permission !== "granted") {
    if (!existing) await subscription.unsubscribe().catch(() => {});
    return false;
  }
  await save(serializeSubscription(subscription));
  return true;
}
