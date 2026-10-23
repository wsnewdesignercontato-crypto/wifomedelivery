import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/upload-validation";

export type ImageUploadProfile =
  | "banner"
  | "logo"
  | "profile"
  | "product"
  | "cover"
  | "document"
  | "attachment"
  | "delivery-proof";

export type ImageFormatPolicy = "standard" | "product" | "any-image";

const recommendations: Record<ImageUploadProfile, string> = {
  banner:
    "Recomendado: 1200 × 600 px (2:1), horizontal. Mantenha textos e elementos principais no centro; as bordas podem ser cortadas.",
  logo: "Recomendado: 512 × 512 px (1:1), quadrado. Deixe uma margem ao redor da marca.",
  profile: "Recomendado: 512 × 512 px (1:1), quadrado. Centralize o rosto para o recorte circular.",
  product:
    "Recomendado: 1080 × 1080 px (1:1), quadrado. Centralize o produto; a foto será ajustada com fundo branco, sem cortar.",
  cover:
    "Recomendado: 1600 × 600 px (8:3), horizontal. Mantenha o assunto principal no centro; o recorte varia conforme a tela.",
  document:
    "Envie uma foto nítida do documento inteiro, com todos os dados legíveis, sem cortes ou reflexos.",
  attachment: "Envie uma imagem nítida e legível, sem cortar informações importantes.",
  "delivery-proof":
    "Envie uma foto nítida que mostre a entrega por inteiro, sem cortar os detalhes importantes.",
};

/** Preparation advice only: dimensions never decide whether an upload is accepted. */
export function imageUploadGuidance(
  profile: ImageUploadProfile,
  formatPolicy: ImageFormatPolicy = profile === "product" ? "product" : "standard",
) {
  return {
    recommendation: recommendations[profile],
    formats:
      formatPolicy === "any-image"
        ? "Prefira JPG, PNG ou WebP"
        : formatPolicy === "product"
          ? "JPG, PNG ou WebP"
          : "JPG, PNG, WebP ou GIF",
    mimeTypes:
      formatPolicy === "any-image"
        ? ["image/*"]
        : formatPolicy === "product"
          ? ALLOWED_IMAGE_TYPES.filter((type) => type !== "image/gif")
          : ALLOWED_IMAGE_TYPES,
    maxBytes: MAX_IMAGE_BYTES,
  };
}
