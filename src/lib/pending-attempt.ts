export type PendingAttempt = { fingerprint: string; key: string };
type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function pendingAttempt(
  storage: AttemptStorage | undefined,
  storageKey: string,
  fingerprint: string,
  previous: PendingAttempt | null = null,
): PendingAttempt {
  let attempt = previous?.fingerprint === fingerprint ? previous : null;
  try {
    const saved: unknown = JSON.parse(storage?.getItem(storageKey) ?? "null");
    if (
      saved &&
      typeof saved === "object" &&
      "fingerprint" in saved &&
      saved.fingerprint === fingerprint &&
      "key" in saved &&
      typeof saved.key === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.key)
    )
      attempt = { fingerprint, key: saved.key };
  } catch {
    /* Storage is optional; the caller retains the in-memory attempt. */
  }
  attempt ??= { fingerprint, key: crypto.randomUUID() };
  try {
    storage?.setItem(storageKey, JSON.stringify(attempt));
  } catch {
    /* Optional persistence. */
  }
  return attempt;
}

export function browserAttemptStorage(): AttemptStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function completeAttempt(storageKey: string) {
  try {
    browserAttemptStorage()?.removeItem(storageKey);
  } catch {
    /* Optional persistence. */
  }
}
