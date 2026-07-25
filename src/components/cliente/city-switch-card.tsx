import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CitySwitchCard({
  cidade,
  estado,
  hasEstabs,
  onAccept,
  onDismiss,
}: {
  cidade: string;
  estado: string;
  hasEstabs: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4 shadow-lg shadow-primary/10 animate-in fade-in slide-in-from-top-2">
      <button
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground hover:bg-background/60"
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-md shadow-primary/30">
          <MapPin className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Você está em {cidade}{estado ? `, ${estado}` : ""}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hasEstabs
              ? `Temos estabelecimentos por aqui! Quer ver o que tem em ${cidade}?`
              : `Ainda não temos estabelecimentos em ${cidade}. Continue vendo sua cidade cadastrada.`}
          </p>
          {hasEstabs && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                className="h-8 rounded-full bg-primary text-primary-foreground"
                onClick={onAccept}
              >
                Sim, ver {cidade}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-full"
                onClick={onDismiss}
              >
                Não, continuar
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
