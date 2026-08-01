import { useEffect, useState } from "react";
import { Sandwich, Store, Bike } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export type LoaderPerfil = "cliente" | "estabelecimento" | "entregador";

const STEPS = [
  { icon: Sandwich, label: "Preparando o pedido" },
  { icon: Store, label: "Enviando para a loja" },
  { icon: Bike, label: "Saindo para entrega" },
] as const;

export function detectPerfil(pathname?: string): LoaderPerfil {
  const path =
    pathname ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "");
  if (path.includes("estabelecimento") || path.includes("estab")) return "estabelecimento";
  if (path.includes("entregador") || path.includes("courier")) return "entregador";
  return "cliente";
}

function themeClassFor(perfil: LoaderPerfil) {
  if (perfil === "estabelecimento") return "theme-estab";
  if (perfil === "entregador") return "theme-entregador";
  return "";
}

/** Animação de carregamento: pedido → loja → entregador, em loop. */
export function WifomeLoaderIcons({ compact = false }: { compact?: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % STEPS.length), 900);
    return () => window.clearInterval(id);
  }, [reduced]);

  const size = compact ? "size-10" : "size-16";
  const icon = compact ? 20 : 30;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2 sm:gap-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const done = i < step;
          return (
            <div key={s.label} className="flex items-center gap-2 sm:gap-3">
              <div
                className={[
                  size,
                  "grid place-items-center rounded-2xl border transition-all duration-500",
                  active
                    ? "scale-110 border-primary-foreground/70 bg-primary-foreground/20 text-primary-foreground shadow-lg"
                    : done
                      ? "border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground/80"
                      : "border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground/50",
                ].join(" ")}
              >
                <Icon size={icon} strokeWidth={2.2} />
              </div>
              {i < STEPS.length - 1 && (
                <span
                  className={[
                    "h-0.5 rounded-full transition-all duration-500",
                    compact ? "w-4" : "w-8 sm:w-12",
                    i < step ? "bg-primary-foreground/80" : "bg-primary-foreground/25",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
      </div>
      {!compact && (
        <p className="text-sm font-medium text-primary-foreground/85">{STEPS[step].label}…</p>
      )}
    </div>
  );
}

/** Tela cheia na cor do perfil (laranja/vermelho/verde) com a marca WiFome. */
export function WifomeLoader({
  perfil,
  message,
}: {
  perfil?: LoaderPerfil;
  message?: string;
}) {
  const resolved = perfil ?? detectPerfil();
  return (
    <div
      className={`${themeClassFor(resolved)} fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-primary px-6`}
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      <div className="text-center">
        <span className="text-4xl font-extrabold tracking-tight text-primary-foreground sm:text-5xl">
          WiFome
        </span>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary-foreground/70">
          {resolved === "estabelecimento"
            ? "Estabelecimento"
            : resolved === "entregador"
              ? "Entregador"
              : "Cliente"}
        </p>
      </div>
      <WifomeLoaderIcons />
      {message && <p className="text-sm text-primary-foreground/80">{message}</p>}
    </div>
  );
}

export default WifomeLoader;
