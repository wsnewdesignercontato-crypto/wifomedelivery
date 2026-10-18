/** Supabase/PostgREST errors are plain objects, not necessarily Error instances. */
export function notificationErrorMessage(
  error: unknown,
  fallback = "Não foi possível enviar agora. Tente novamente.",
): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  )
    return error.message;
  return fallback;
}
