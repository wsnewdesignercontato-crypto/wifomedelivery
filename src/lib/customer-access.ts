export type AppProfile = "cliente" | "estabelecimento" | "entregador";

export function isPublicCustomerPath(pathname: string): boolean {
  return (
    /^\/cliente\/?$/.test(pathname) ||
    ["/cliente/buscar", "/cliente/novidades"].includes(pathname) ||
    /^\/cliente\/estabelecimento\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(
      pathname,
    )
  );
}
export function loginProfile(pathname: string): AppProfile {
  if (/^\/estabelecimento(?:\/|$)/.test(pathname)) return "estabelecimento";
  if (/^\/entregador(?:\/|$)/.test(pathname)) return "entregador";
  return "cliente";
}
export function safeReturnPath(
  value: string | undefined | null,
  profile: AppProfile,
): string | null {
  if (!value || !value.startsWith(`/${profile}`)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.includes("\\") ||
      [...decoded].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      return null;
    const url = new URL(value, "https://pedetrem.invalid");
    return url.origin === "https://pedetrem.invalid" &&
      new RegExp(`^/${profile}(?:/|$)`).test(url.pathname)
      ? url.pathname + url.search + url.hash
      : null;
  } catch {
    return null;
  }
}
export function missingCheckoutDetails(
  phone: string | null | undefined,
  addresses: Array<{ rua?: string | null; cidade?: string | null }>,
): Array<"telefone" | "endereco"> {
  const missing: Array<"telefone" | "endereco"> = [];
  if (!isCheckoutPhone(phone)) missing.push("telefone");
  if (!addresses.some((address) => !!address.rua?.trim() && !!address.cidade?.trim()))
    missing.push("endereco");
  return missing;
}
export function isCheckoutPhone(phone: string | null | undefined): boolean {
  return /^\d{10,15}$/.test((phone ?? "").replace(/\D/g, ""));
}
