import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateAdminInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { question: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await (
      context.supabase as unknown as { rpc: (n: string, p: unknown) => Promise<{ data: boolean }> }
    ).rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    // Aggregate key metrics
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [orders, estabs, couriers, ledger] = await Promise.all([
      context.supabase
        .from("orders")
        .select("status,total_cents,created_at")
        .gte("created_at", since),
      context.supabase.from("establishments").select("id,nome,status,avaliacao"),
      context.supabase.from("courier_profiles").select("status"),
      context.supabase
        .from("platform_ledger")
        .select("platform_revenue_cents,gross_cents")
        .gte("created_at", since),
    ]);

    const summary = {
      periodo: "30 dias",
      total_pedidos: orders.data?.length ?? 0,
      pedidos_entregues: orders.data?.filter((o) => o.status === "delivered").length ?? 0,
      pedidos_cancelados: orders.data?.filter((o) => o.status === "cancelled").length ?? 0,
      gmv_cents: orders.data?.reduce((s, o) => s + (o.total_cents ?? 0), 0) ?? 0,
      receita_plataforma_cents: ledger.data?.reduce((s, l) => s + l.platform_revenue_cents, 0) ?? 0,
      lojas_ativas: estabs.data?.filter((e) => e.status === "aprovado").length ?? 0,
      entregadores_online: couriers.data?.filter((c) => c.status === "online").length ?? 0,
    };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { insight: "LOVABLE_API_KEY não configurada.", summary };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Você é analista de operações do marketplace de delivery WiFome. Responda em português, direto e objetivo. Use os números fornecidos para gerar insights acionáveis (bullets curtos).",
          },
          {
            role: "user",
            content: `Métricas atuais:\n${JSON.stringify(summary, null, 2)}\n\nPergunta do admin: ${data.question}`,
          },
        ],
      }),
    });
    if (!res.ok) return { insight: `Falha IA: ${res.status}`, summary };
    const j = await res.json();
    const insight = j?.choices?.[0]?.message?.content ?? "Sem resposta.";
    return { insight, summary };
  });
