import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageUploadGuidance } from "@/components/image-upload-guidance";
import { MAX_IMAGE_BYTES } from "@/lib/upload-validation";

import { toast } from "sonner";

export async function prepareProductPhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Escolha uma foto JPG, PNG ou WebP.");
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new Error("A foto deve ter até 5 MB. Escolha um arquivo menor.");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40000000
    )
      throw new Error("Escolha uma foto com resolução menor, de até 40 megapixels.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1000;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto. Tente novamente.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 1000, 1000);
    const ratio = Math.min(1000 / image.naturalWidth, 1000 / image.naturalHeight);
    const width = image.naturalWidth * ratio,
      height = image.naturalHeight * ratio;
    context.drawImage(image, (1000 - width) / 2, (1000 - height) / 2, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Não foi possível preparar a foto.")),
        "image/jpeg",
        0.9,
      ),
    );
    return new File([blob], "produto.jpg", { type: "image/jpeg" });
  } catch (error) {
    throw error instanceof Error && error.message
      ? error
      : new Error("Não conseguimos abrir essa foto. Escolha outra imagem.");
  } finally {
    URL.revokeObjectURL(source);
  }
}

export function ProductPhotoField({
  url,
  file,
  disabled,
  onChange,
  onBusy,
  compact = false,
  title = "Foto do produto",
  optional = true,
}: {
  compact?: boolean;
  title?: string;
  optional?: boolean;
  url: string;
  file: File | null;
  disabled: boolean;
  onChange: (file: File | null, remove?: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const id = useId();
  const mounted = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const local = URL.createObjectURL(file);
    setPreview(local);
    return () => URL.revokeObjectURL(local);
  }, [file]);
  async function choose(selected: File) {
    setBusy(true);
    onBusy(true);
    try {
      const ready = await prepareProductPhoto(selected);
      if (mounted.current) onChange(ready);
    } catch (error) {
      if (mounted.current)
        toast.error(error instanceof Error ? error.message : "Não foi possível abrir a foto.");
    } finally {
      if (mounted.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  return (
    <section
      className={
        compact
          ? "relative min-w-0 space-y-2"
          : "flex items-center gap-4 rounded-2xl border border-border bg-gradient-to-br from-muted/30 to-background p-4"
      }
    >
      <button
        type="button"
        aria-label={
          compact
            ? `${preview || url ? "Trocar" : "Adicionar"} ${title.toLowerCase()}`
            : preview || url
              ? "Trocar foto do produto"
              : "Adicionar foto do produto"
        }
        disabled={disabled || busy}
        aria-describedby={id + "-help"}
        onClick={() => inputRef.current?.click()}
        className={`relative flex ${compact ? "aspect-square w-full" : "h-24 w-24 shrink-0"} items-center justify-center overflow-hidden rounded-xl border border-dashed border-primary/30 bg-background text-primary transition-colors hover:bg-primary/5 disabled:opacity-50`}
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : preview || url ? (
          <img
            src={preview || url}
            alt="Prévia da foto do produto"
            className="h-full w-full object-contain"
          />
        ) : (
          <ImagePlus className="h-7 w-7" />
        )}
      </button>
      <div className="min-w-0 space-y-1.5">
        <p
          className={compact ? "min-h-10 text-sm font-semibold leading-5" : "text-sm font-semibold"}
        >
          {title}{" "}
          {compact && !optional && (
            <span className="block text-xs font-normal text-muted-foreground">Capa</span>
          )}
          {optional && (
            <span
              className={
                compact
                  ? "block text-xs font-normal text-muted-foreground"
                  : "font-normal text-muted-foreground"
              }
            >
              {" "}
              {compact ? "Opcional" : "· opcional"}
            </span>
          )}
        </p>
        <ImageUploadGuidance id={id + "-help"} profile="product" />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className={compact ? "h-8 w-full px-1 text-xs" : undefined}
            variant="outline"
            disabled={disabled || busy}
            aria-describedby={id + "-help"}
            onClick={() => inputRef.current?.click()}
          >
            {busy
              ? "Preparando..."
              : compact
                ? preview || url
                  ? "Trocar"
                  : "Adicionar"
                : preview || url
                  ? "Trocar foto"
                  : "Escolher foto"}
          </Button>
          {(file || url) && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={
                compact
                  ? "absolute right-1 top-1 h-7 w-7 rounded-full border bg-background/95 shadow-sm"
                  : undefined
              }
              aria-label={compact ? `Remover ${title.toLowerCase()}` : "Remover foto"}
              disabled={disabled || busy}
              onClick={() => onChange(null, true)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {file && (
          <p
            role="status"
            className={
              compact
                ? "absolute left-1 top-1 rounded bg-background/95 px-1.5 py-1 text-[10px] font-medium text-emerald-700"
                : "text-xs text-emerald-700"
            }
          >
            {compact ? "Pronta" : "Pronta para salvar"}
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={compact ? `Arquivo: ${title}` : "Arquivo da foto do produto"}
        aria-describedby={id + "-help"}
        disabled={disabled || busy}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (selected) void choose(selected);
        }}
      />
    </section>
  );
}
