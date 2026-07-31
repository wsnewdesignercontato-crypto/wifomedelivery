export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Retorna uma mensagem de erro, ou null se o arquivo for válido. */
export function validateImageFile(file: File, maxBytes = MAX_IMAGE_BYTES): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Formato inválido. Envie uma imagem JPG, PNG, WEBP ou GIF.";
  }
  if (file.size > maxBytes) {
    return `Arquivo muito grande (máx. ${Math.round(maxBytes / (1024 * 1024))} MB).`;
  }
  return null;
}
