import { useState } from "react";
import { productPhotos } from "@/lib/product-photos";
export function ProductPhotoGallery({
  name,
  main,
  extras,
}: {
  name: string;
  main: string | null;
  extras?: string[];
}) {
  const photos = productPhotos(main, extras);
  const [selected, setSelected] = useState(0);
  if (!photos.length) return null;
  const current = Math.min(selected, photos.length - 1);
  return (
    <section aria-label={"Fotos de " + name} className="space-y-2 bg-muted/20 p-3">
      <div className="relative">
        <img
          src={photos[current]}
          alt={name + " — foto " + (current + 1)}
          className="h-52 w-full rounded-xl object-contain"
        />
        {photos.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-1 text-xs">
            {current + 1} de {photos.length}
          </span>
        )}
      </div>
      {photos.length > 1 && (
        <div className="flex justify-center gap-2">
          {photos.map((url, index) => (
            <button
              key={url}
              type="button"
              aria-label={"Ver foto " + (index + 1) + " de " + name}
              aria-pressed={current === index}
              onClick={() => setSelected(index)}
              className={
                "h-12 w-12 overflow-hidden rounded-lg border-2 " +
                (current === index ? "border-primary" : "border-transparent")
              }
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
