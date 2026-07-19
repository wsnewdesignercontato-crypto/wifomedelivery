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
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src={logoAsset.url}
        alt="WiFome"
        className={cn("object-contain", s.box)}
      />
      {showWord && (
        <span className={cn("font-black tracking-tight text-foreground", s.text)}>
          Wi<span className="text-primary">Fome</span>
        </span>
      )}
    </div>
  );
}
