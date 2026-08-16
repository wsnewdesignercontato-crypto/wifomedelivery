import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";
import { generateAdminInsights } from "@/lib/admin-ai.functions";

export const Route = createFileRoute("/_authenticated/admin/ia")({ component: IaPage });

const SUGGESTIONS = [
  "Quais os principais riscos operacionais dessa semana?",
  "Como aumentar o ticket médio nos próximos 30 dias?",
  "Que lojas precisam de atenção agora?",
  "Sugira 3 campanhas de marketing para reativar clientes inativos.",
];

function IaPage() {
  const gen = useServerFn(generateAdminInsights);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);

  async function ask(question?: string) {
    const query = question ?? q;
    if (!query.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const r = await gen({ data: { question: query } });
      setAnswer(r.insight);
      setSummary(r.summary as Record<string, unknown>);
    } catch (e) {
      setAnswer(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Sparkles className="h-7 w-7 text-primary" />
          IA Insights
        </h1>
        <p className="text-sm text-muted-foreground">
          Pergunte à IA sobre operação, crescimento, riscos e marketing.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setQ(s);
              ask(s);
            }}
            className="rounded-xl border border-border bg-card p-4 text-left text-sm transition-all hover:border-primary hover:bg-primary/5"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <Textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Faça uma pergunta sobre a plataforma…"
          rows={3}
        />
        <Button onClick={() => ask()} disabled={loading} className="mt-3">
          <Sparkles className="mr-2 h-4 w-4" />
          {loading ? "Analisando…" : "Gerar insight"}
        </Button>
      </div>

      {answer && (
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
            Resposta da IA
          </p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</div>
          {summary && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Ver métricas usadas
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-3 text-[10px]">
                {JSON.stringify(summary, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
