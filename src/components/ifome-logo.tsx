import { cn } from "@/lib/utils";
import logoAsset from "@/assets/wifome-logo.png.asset.json";

interface Props {
  className?: string;
  size?: "sm" | "md" | "lg";
  showWord?: boolean;
}

const sizes = {
  sm: { box: "h-8 w-8", text: "text-lg" },
  md: { box: "h-10 w-10", text: "text-2xl" },
  lg: { box: "h-14 w-14", text: "text-3xl" },
};

export function IFomeLogo({ className, size = "md", showWord = true }: Props) {
  const s = sizes[size];
  return (
    <div className={cn("inline-flex shrink-0 items-center gap-2.5", className)}>
      <img
        src={logoAsset.url}
        alt="WiFome"
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
