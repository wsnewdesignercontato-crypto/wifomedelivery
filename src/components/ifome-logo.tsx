import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  size?: "sm" | "md" | "lg";
  showWord?: boolean;
}

const sizes = {
  sm: { box: "h-8 w-8 text-sm", text: "text-lg" },
  md: { box: "h-10 w-10 text-base", text: "text-2xl" },
  lg: { box: "h-14 w-14 text-lg", text: "text-3xl" },
};

export function IFomeLogo({ className, size = "md", showWord = true }: Props) {
  const s = sizes[size];
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-xl bg-gradient-brand shadow-brand font-black text-primary-foreground",
          s.box,
        )}
      >
        iF
      </div>
      {showWord && (
        <span className={cn("font-black tracking-tight text-foreground", s.text)}>
          iFome
        </span>
      )}
    </div>
  );
}
