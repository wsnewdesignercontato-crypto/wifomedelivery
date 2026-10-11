import { cn } from "@/lib/utils";
import logoAsset from "@/assets/pedetrem-logo-circle.png.asset.json";

interface Props {
  className?: string;
  size?: "sm" | "md" | "lg";
  showWord?: boolean;
  perfil?: "cliente" | "estabelecimento" | "entregador";
}

const sizes = {
  sm: { box: "h-10 w-10", text: "text-lg" },
  md: { box: "h-14 w-14", text: "text-2xl" },
  lg: { box: "h-28 w-28", text: "text-3xl" },
};

export function IFomeLogo({ className, size = "md", showWord = true }: Props) {
  const s = sizes[size];
  return (
    <div className={cn("inline-flex shrink-0 items-center gap-2.5", className)}>
      <img
        src={logoAsset.url}
        alt="PedeTrem"
        width={355}
        height={352}
        className={cn("shrink-0 rounded-full object-contain shadow-brand", s.box)}
      />

      {showWord && (
        <span className={cn("brand-name whitespace-nowrap font-black text-foreground", s.text)}>
          Pede<span className="brand-name-accent">Trem</span>
        </span>
      )}
    </div>
  );
}
