export type DevicePreferences = {
  som: boolean;
  vibracao: boolean;
  localizacao: boolean;
  modo_escuro_auto: boolean;
  economia_dados: boolean;
};

export const DEVICE_PREFERENCES_KEY = "wifome:device-prefs";
const LOCATION_KEY = "wifome:location-enabled";
const CHANGED_EVENT = "wifome:device-prefs-changed";
export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  som: true,
  vibracao: true,
  localizacao: true,
  modo_escuro_auto: true,
  economia_dados: false,
};
let temporaryPreferences: DevicePreferences | null = null;

export function normalizeDevicePreferences(value: unknown): DevicePreferences {
  const result = { ...DEFAULT_DEVICE_PREFERENCES };
  if (!value || typeof value !== "object") return result;
  for (const key of Object.keys(result) as (keyof DevicePreferences)[]) {
    if (typeof (value as Record<string, unknown>)[key] === "boolean") {
      result[key] = (value as DevicePreferences)[key];
    }
  }
  return result;
}

export function readDevicePreferences(): DevicePreferences {
  if (typeof window === "undefined") return { ...DEFAULT_DEVICE_PREFERENCES };
  if (temporaryPreferences) return { ...temporaryPreferences };
  try {
    const readObject = (key: string): Record<string, unknown> => {
      try {
        const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
        return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    };
    const courier = readObject("wifome_courier_prefs");
    const previous = normalizeDevicePreferences({ ...courier, som: courier.som_corridas });
    const stored = readObject(DEVICE_PREFERENCES_KEY);
    const prefs = { ...previous };
    for (const key of Object.keys(prefs) as (keyof DevicePreferences)[]) {
      if (typeof stored[key] === "boolean") prefs[key] = stored[key];
    }
    if (window.localStorage.getItem(LOCATION_KEY) === "0") prefs.localizacao = false;
    return prefs;
  } catch {
    return { ...(temporaryPreferences ?? DEFAULT_DEVICE_PREFERENCES) };
  }
}

export function updateDevicePreference(key: keyof DevicePreferences, value: boolean) {
  const next = { ...readDevicePreferences(), [key]: value };
  if (typeof window === "undefined") return;
  temporaryPreferences = next;
  try {
    window.localStorage.setItem(DEVICE_PREFERENCES_KEY, JSON.stringify(next));
    if (key === "localizacao") window.localStorage.setItem(LOCATION_KEY, value ? "1" : "0");
    temporaryPreferences = null;
  } catch {
    // Keep applying choices for this session when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function subscribeDevicePreferences(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === DEVICE_PREFERENCES_KEY || event.key === LOCATION_KEY)
      listener();
  };
  window.addEventListener(CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function isLocationEnabled() {
  return readDevicePreferences().localizacao;
}

export function vibrateDevice(pattern: number | number[]) {
  if (readDevicePreferences().vibracao && typeof navigator !== "undefined") {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Some browsers expose the API but do not allow vibration.
    }
  }
}

const locationDisabled: GeolocationPositionError = {
  code: 1,
  message: "Localização desativada nas configurações do dispositivo.",
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
};

export function getCurrentDevicePosition(
  success: PositionCallback,
  error?: PositionErrorCallback | null,
  options?: PositionOptions,
) {
  if (!isLocationEnabled() || typeof navigator === "undefined" || !navigator.geolocation) {
    error?.(locationDisabled);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (isLocationEnabled()) success(position);
      else error?.(locationDisabled);
    },
    error,
    options,
  );
}

/** Stops active GPS on opt-out and restarts it on opt-in; cleanup ends both. */
export function watchDeviceLocation(
  success: PositionCallback,
  error?: PositionErrorCallback | null,
  options?: PositionOptions,
): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) return () => {};
  let id: number | null = null;
  let generation = 0;
  const sync = () => {
    if (!isLocationEnabled()) {
      if (id !== null) navigator.geolocation.clearWatch(id);
      id = null;
      generation++;
    } else if (id === null) {
      const current = ++generation;
      id = navigator.geolocation.watchPosition(
        (position) => {
          if (current === generation && isLocationEnabled()) success(position);
        },
        error,
        options,
      );
    }
  };
  const unsubscribe = subscribeDevicePreferences(sync);
  sync();
  return () => {
    generation++;
    unsubscribe();
    if (id !== null) navigator.geolocation.clearWatch(id);
    id = null;
  };
}

/** Cached HTTP responses are disposable; login, preferences and install IDs are not. */
export async function clearDeviceCache(cacheStorage?: Pick<CacheStorage, "keys" | "delete">) {
  const storage = cacheStorage ?? (typeof window !== "undefined" ? window.caches : undefined);
  if (!storage) return;
  const keys = await storage.keys();
  await Promise.all(keys.map((key) => storage.delete(key)));
}
