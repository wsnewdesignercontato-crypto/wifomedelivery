/**
 * Avisa o app inteiro que algum dado foi salvo, para tudo recarregar
 * sozinho (sem o usuário precisar atualizar a página).
 */
export const DATA_UPDATED_EVENT = "wifome:data-updated";
export const PROFILE_UPDATED_EVENT = "wifome:profile-updated";

export function notifyDataUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DATA_UPDATED_EVENT));
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}
