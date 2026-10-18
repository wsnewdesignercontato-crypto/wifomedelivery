import type { ReactNode } from "react";
import { Check, Megaphone } from "lucide-react";
import { brl } from "@/lib/format";

type SponsorshipPlan = {
  nome: string;
  descricao: string | null;
  preco_cents: number;
  duracao_dias: number;
  max_anuncios: number;
  destaque_home: boolean;
  destaque_categoria: boolean;
  destaque_busca: boolean;
  cor: string | null;
  ativo?: boolean;
  prioridade?: number;
};

export function SponsorshipPlanCard({
  plan,
  admin = false,
  children,
}: {
  plan: SponsorshipPlan;
  admin?: boolean;
  children: ReactNode;
}) {
  const color = plan.cor || "#F97316";
  const placements = [
    plan.destaque_home && "Destaque na página inicial",
    plan.destaque_categoria && "Destaque nas categorias",
    plan.destaque_busca && "Destaque nos resultados da busca",
  ].filter((value): value is string => !!value);
  return (
    <article className="relative flex h-full min-w-0 flex-col rounded-3xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
      <div
        className="absolute inset-x-6 top-0 h-1 rounded-b-full"
        style={{ backgroundColor: color }}
      />
      <div className="mb-5 flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted/40"
          style={{ color }}
        >
          <Megaphone className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Plano de divulgação
          </p>
          <h3 className="mt-0.5 break-words text-xl font-bold leading-tight tracking-tight">
            {plan.nome}
          </h3>
        </div>
        {plan.ativo === false && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
            Inativo
          </span>
        )}
      </div>
      <div className="mb-4">
        <p className="break-words text-3xl font-extrabold tracking-tight text-foreground">
          {brl(plan.preco_cents)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          por período de {plan.duracao_dias} {plan.duracao_dias === 1 ? "dia" : "dias"}
        </p>
      </div>
      {plan.descricao && (
        <p className="mb-5 whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">
          {plan.descricao}
        </p>
      )}
      <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          O que está incluído
        </p>
        <ul className="space-y-2.5 text-sm">
          {[
            `Até ${plan.max_anuncios} ${plan.max_anuncios === 1 ? "anúncio" : "anúncios"}`,
            ...placements,
          ].map((label) => (
            <li key={label} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span className="min-w-0 break-words leading-5">{label}</span>
            </li>
          ))}
        </ul>
      </div>
      {admin && (
        <p className="mt-3 text-xs text-muted-foreground">
          Prioridade de exibição: {plan.prioridade ?? 0}
        </p>
      )}
      <div className="mt-auto pt-5">{children}</div>
    </article>
  );
}
