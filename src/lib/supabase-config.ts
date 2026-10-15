type PublicSupabaseConfig = { url?: string; key?: string };

function isLegacyAnonKey(key: string): boolean {
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "anon";
  } catch {
    return false;
  }
}

export function getPublicSupabaseConfig(input: PublicSupabaseConfig): { url: string; key: string } {
  const url = input.url?.trim();
  const key = input.key?.trim();
  if (!url || !key) throw new Error("Configure a URL e a chave pública do Supabase.");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("A URL do Supabase é inválida.");
  }
  if (
    !["https:", "http:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("A URL do Supabase deve usar HTTP(S) e não conter credenciais.");
  }

  const isPublishable = key.startsWith("sb_publishable_") && key.length > "sb_publishable_".length;
  if (!isPublishable && !isLegacyAnonKey(key)) {
    throw new Error("Use somente uma chave publicável ou anon do Supabase no navegador.");
  }
  return { url: url.replace(/\/+$/, ""), key };
}
