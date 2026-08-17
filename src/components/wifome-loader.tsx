/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from "react";
import { Sandwich, Store, Bike } from "lucide-react";

export type LoaderPerfil = "cliente" | "estabelecimento" | "entregador";

const STEPS = [
  { icon: Sandwich, label: "Pedido" },
  { icon: Store, label: "Loja" },
  { icon: Bike, label: "Entrega" },
] as const;

const LOADER_CYCLE_SECONDS = 1.95;
const LOADER_STEP_DELAY = LOADER_CYCLE_SECONDS / STEPS.length;
const LOADER_LINE_OFFSET = LOADER_STEP_DELAY * 0.38;

export function detectPerfil(pathname?: string): LoaderPerfil {
  const path =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname + window.location.search : "");
  if (path.includes("estabelecimento") || path.includes("estab")) return "estabelecimento";
  if (path.includes("entregador") || path.includes("courier")) return "entregador";
  return "cliente";
}

function themeClassFor(perfil: LoaderPerfil) {
  if (perfil === "estabelecimento") return "theme-estab";
  if (perfil === "entregador") return "theme-entregador";
  return "";
}

/** Animação de carregamento: pedido → loja → entregador, em loop contínuo. */
export function WifomeLoaderIcons({ compact = false }: { compact?: boolean }) {
  const size = compact ? "size-7" : "size-10";
  const icon = compact ? 14 : 18;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-1.5 sm:gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const delay = i * LOADER_STEP_DELAY;
          const lineDelay = delay + LOADER_LINE_OFFSET;

          return (
            <div key={s.label} className="flex items-center gap-1.5 sm:gap-2">
              <div
                className={[
                  size,
                  "loader-step-icon relative grid place-items-center overflow-hidden rounded-full border border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground",
                ].join(" ")}
                style={{ animationDelay: `${delay}s` }}
              >
                <span
                  aria-hidden
                  className="loader-step-glow absolute inset-0 rounded-full"
                  style={{ animationDelay: `${delay}s` }}
                />
                <Icon size={icon} strokeWidth={2.2} />
              </div>
              {i < STEPS.length - 1 && (
                <span
                  className={[
                    "relative h-0.5 overflow-hidden rounded-full bg-primary-foreground/20",
                    compact ? "w-4" : "w-7 sm:w-9",
                  ].join(" ")}
                >
                  <span
                    className="loader-step-line absolute inset-y-0 left-0 w-full origin-left rounded-full bg-primary-foreground/90"
                    style={{ animationDelay: `${lineDelay}s` }}
                  />
                  <span
                    aria-hidden
                    className="loader-step-dot absolute top-1/2 left-0 size-2 -translate-y-1/2 rounded-full bg-primary-foreground"
                    style={{ animationDelay: `${lineDelay}s` }}
                  />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Tela cheia na cor do perfil (laranja/vermelho/verde) com a marca WiFome. */
export function WifomeLoader({ perfil, message }: { perfil?: LoaderPerfil; message?: string }) {
  const [resolved, setResolved] = useState<LoaderPerfil>(perfil ?? "cliente");

  useEffect(() => {
    if (perfil) {
      setResolved(perfil);
      return;
    }
    setResolved(detectPerfil());
  }, [perfil]);

  return (
    <div
      className={`${themeClassFor(resolved)} fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-primary px-6`}
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      <div className="animate-loader-logo-pop text-center">
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
