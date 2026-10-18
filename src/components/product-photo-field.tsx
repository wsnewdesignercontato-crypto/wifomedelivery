import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export async function prepareProductPhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Escolha uma foto JPG, PNG ou WebP.");
  if (!file.size || file.size > 5 * 1024 * 1024)
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
}: {
  url: string;
  file: File | null;
  disabled: boolean;
  onChange: (file: File | null, remove?: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const id = useId();
  const mounted = useRef(true);
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
    <section className="space-y-3 rounded-2xl border border-border p-4">
      <Label htmlFor={id} className="font-semibold">
        Foto do produto (opcional)
      </Label>
      <p id={id + "-help"} className="text-sm text-muted-foreground">
        Escolha da galeria ou tire uma foto pelo celular. Recomendado: 1.000 × 1.000 pixels, JPG,
        PNG ou WebP, até 5 MB. Use boa iluminação e deixe o produto inteiro no centro. Ajustamos o
        tamanho automaticamente, sem cortar a foto.
      </p>
      {(preview || url) && (
        <img
          src={preview || url}
          alt="Prévia da foto do produto"
          className="h-40 w-40 rounded-xl border bg-white object-contain"
        />
      )}
      <Input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-describedby={id + "-help"}
        disabled={disabled || busy}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (selected) void choose(selected);
        }}
      />
      {busy && (
        <p role="status" className="text-sm">
          Preparando sua foto…
        </p>
      )}
      {file && (
        <p className="text-sm text-emerald-700">
          Foto pronta: 1.000 × 1.000 pixels. Clique em Salvar produto para enviar.
        </p>
      )}
      {(file || url) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy}
          onClick={() => onChange(null, true)}
        >
          Remover foto
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Você pode trocar a foto depois, em Editar produto.
      </p>
    </section>
  );
}
