import { useState, type ReactNode } from "react";
import {
  CreditCard,
  Mail,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const sections = [
  { id: "general", title: "Geral", detail: "Plataforma e atendimento", icon: Settings2 },
  { id: "payments", title: "Pagamentos", detail: "Asaas e modo de teste", icon: CreditCard },
  { id: "email", title: "E-mails", detail: "Brevo e autenticação", icon: Mail },
  { id: "quality", title: "Qualidade", detail: "Pontuação e desempenho", icon: Star },
] as const;
type Section = (typeof sections)[number]["id"];
type Props = Record<Section, ReactNode> & {
  saving: boolean;
  onSave: () => void | Promise<unknown>;
};

export function AdminSettingsLayout({ saving, onSave, ...panels }: Props) {
  const [active, setActive] = useState("general");
  return (
    <div className="w-full min-w-0 space-y-6 pb-6 [&_[data-ui=button]]:h-auto [&_[data-ui=button]]:min-h-10 [&_[data-ui=button]]:max-w-full [&_[data-ui=button]]:whitespace-normal [&_input]:min-w-0 [&_select]:min-w-0">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="h-px w-5 bg-primary" /> Sua plataforma, suas regras
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-[32px]">
            Configurações<span className="text-primary">.</span>
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Tudo para cuidar da operação do PedeTrem, em um só lugar.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-border/80 bg-card px-3 py-2 text-[11px] text-muted-foreground sm:self-auto">
          <ShieldCheck className="size-3.5 text-primary" /> Área administrativa
        </span>
      </header>
      <Tabs value={active} onValueChange={setActive} className="min-w-0 space-y-6">
        <TabsList
          aria-label="Seções de configurações"
          className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-sm lg:grid-cols-4"
        >
          {sections.map((section) => (
            <TabsTrigger
              key={section.id}
              value={section.id}
              className="group h-auto min-w-0 justify-start gap-2 whitespace-normal rounded-xl border border-transparent px-2 py-3 text-left data-[state=active]:border-primary/15 data-[state=active]:bg-primary/7 data-[state=active]:text-primary data-[state=active]:shadow-none sm:gap-3 sm:px-4"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary sm:size-9">
                <section.icon className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block break-words text-xs font-semibold sm:text-sm">
                  {section.title}
                </span>
                <span className="mt-0.5 hidden text-[11px] font-normal leading-relaxed text-muted-foreground lg:block">
                  {section.detail}
                </span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map((section) => (
          <TabsContent
            key={section.id}
            value={section.id}
            forceMount
            className="mt-0 min-w-0 data-[state=inactive]:hidden"
          >
            {panels[section.id]}
          </TabsContent>
        ))}
      </Tabs>
      {(active === "general" || active === "quality") && (
        <div className="sticky bottom-3 z-10 flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur-sm sm:flex-row sm:items-center sm:px-5">
          <div className="flex items-start gap-3">
            <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary sm:flex">
              <SlidersHorizontal className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Configurações gerais e qualidade</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                As integrações de pagamento e e-mail têm seus próprios botões de salvar.
              </p>
            </div>
          </div>
          <Button onClick={onSave} disabled={saving} className="h-11 shrink-0 rounded-xl px-5">
            <Save className="mr-2 size-4" />
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      )}
    </div>
  );
}
