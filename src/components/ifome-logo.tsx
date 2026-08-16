import { cn } from "@/lib/utils";

const BRAND_LOGO_URL = "/wifome-logo.svg";

interface Props {
  className?: string;
  size?: "sm" | "md" | "lg";
  showWord?: boolean;
  perfil?: "cliente" | "estabelecimento" | "entregador";
}

const sizes = {
  sm: { box: "h-8 w-8", text: "text-lg" },
  md: { box: "h-10 w-10", text: "text-2xl" },
  lg: { box: "h-14 w-14", text: "text-3xl" },
};

const perfilFilter: Record<"cliente" | "estabelecimento" | "entregador", string> = {
  cliente: "",
  estabelecimento: "hue-rotate(-18deg) saturate(1.35) brightness(1)",
  entregador: "hue-rotate(92deg) saturate(0.95) brightness(0.95)",
};

export function IFomeLogo({ className, size = "md", showWord = true, perfil = "cliente" }: Props) {
  const s = sizes[size];
  const filter = perfilFilter[perfil];
  return (
    <div className={cn("inline-flex shrink-0 items-center gap-2.5", className)}>
      <img
        src={BRAND_LOGO_URL}
        alt="WiFome"
        style={filter ? { filter } : undefined}
        className={cn("object-contain rounded-xl shadow-brand", s.box)}
      />

      {showWord && (
        <span className={cn("whitespace-nowrap font-black tracking-tight text-foreground", s.text)}>
          Wi<span className="text-primary">Fome</span>
        </span>
      )}
    </div>
  );
}
