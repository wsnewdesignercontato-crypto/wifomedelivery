/** Re-read snapshots after a suspended app or disconnected browser resumes. */
export function bindResumeRefresh(refresh: () => void | Promise<void>): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const onResume = () => {
    void refresh();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") onResume();
  };
  const worker = typeof navigator === "undefined" ? undefined : navigator.serviceWorker;
  const onPush = (event: MessageEvent) => {
    if (event.data?.type === "pedetrem:push-received") onResume();
  };
  worker?.addEventListener?.("message", onPush);
  window.addEventListener("focus", onResume);
  window.addEventListener("online", onResume);
  window.addEventListener("pageshow", onResume);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    worker?.removeEventListener?.("message", onPush);
    window.removeEventListener("focus", onResume);
    window.removeEventListener("online", onResume);
    window.removeEventListener("pageshow", onResume);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
