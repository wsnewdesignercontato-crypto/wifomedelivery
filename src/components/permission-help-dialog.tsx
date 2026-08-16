import { useState } from "react";
import { ExternalLink, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Kind = "push" | "location";

function detectOS(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

const STEPS: Record<"ios" | "android" | "desktop", Record<Kind, string[]>> = {
  ios: {
    push: [
      "Abra os Ajustes do iPhone",
      "Toque em Notificações",
      "Escolha o navegador (Safari/Chrome) ou o app WiFome instalado",
      "Ative Permitir notificações",
    ],
    location: [
      "Abra os Ajustes do iPhone",
      "Toque em Privacidade e Segurança → Serviços de Localização",
      "Escolha o navegador (Safari/Chrome) ou o app WiFome",
      "Selecione Ao usar o app e ative Localização precisa",
    ],
  },
  android: {
    push: [
      "Abra as Configurações do Android",
      "Toque em Apps → seu navegador (ou WiFome)",
      "Entre em Notificações e ative-as",
      "Volte ao app e ligue o interruptor de novo",
    ],
    location: [
      "Abra as Configurações do Android",
      "Toque em Apps → seu navegador (ou WiFome) → Permissões",
      "Em Localização escolha Permitir ao usar o app",
      "Ative também a Localização precisa",
    ],
  },
  desktop: {
    push: [
      "Clique no cadeado ao lado do endereço do site",
      "Encontre Notificações",
      "Mude para Permitir e recarregue a página",
    ],
    location: [
      "Clique no cadeado ao lado do endereço do site",
      "Encontre Localização",
      "Mude para Permitir e recarregue a página",
    ],
  },
};

/** Atalho com o passo a passo para liberar a permissão nas configurações do aparelho. */
export function PermissionHelpDialog({ kind }: { kind: Kind }) {
  const [os, setOs] = useState<"ios" | "android" | "desktop">(detectOS());
  const title = kind === "push" ? "Liberar notificações" : "Liberar localização";
  const steps = STEPS[os][kind];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full rounded-full">
          <Settings2 className="mr-2 h-4 w-4" />
          Abrir configurações do aparelho
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Por segurança, o navegador não deixa o app abrir os ajustes sozinho. Siga o passo a
            passo abaixo — leva menos de um minuto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          {(["android", "ios", "desktop"] as const).map((o) => (
            <Button
              key={o}
              size="sm"
              variant={os === o ? "default" : "outline"}
              className="flex-1 rounded-full"
              onClick={() => setOs(o)}
            >
              {o === "ios" ? "iPhone" : o === "android" ? "Android" : "Computador"}
            </Button>
          ))}
        </div>

        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-3 rounded-xl border border-border bg-card p-3 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        {os === "desktop" && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
            No Chrome também dá para colar em uma nova aba: chrome://settings/content
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
