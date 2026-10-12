import { getVercelOidcToken } from "@vercel/oidc";

type GatewayOptions = { token?: string; model?: string; fetch?: typeof fetch };
type GatewayResponse = { choices?: Array<{ message?: { content?: unknown } }> };

export async function generateOperationsInsight(
  question: string,
  summary: Record<string, unknown>,
  options: GatewayOptions = {},
): Promise<string> {
  let token = options.token ?? process.env.AI_GATEWAY_API_KEY?.trim();
  if (options.token === undefined && !token) {
    try {
      token = await getVercelOidcToken();
    } catch {
      return "IA não configurada. Configure a autenticação do AI Gateway.";
    }
  }
  if (!token?.trim()) return "IA não configurada. Configure a autenticação do AI Gateway.";
  const model =
    options.model?.trim() || process.env.AI_GATEWAY_MODEL?.trim() || "google/gemini-3-flash";
  try {
    const response = await (options.fetch ?? fetch)(
      "https://ai-gateway.vercel.sh/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "Você é analista de operações do marketplace de delivery PedeTrem. Responda em português, direto e objetivo. Use os números fornecidos para gerar insights acionáveis (bullets curtos).",
            },
            {
              role: "user",
              content: `Métricas atuais:\n${JSON.stringify(summary, null, 2)}\n\nPergunta do admin: ${question}`,
            },
          ],
        }),
      },
    );
    if (!response.ok) return "IA indisponível no momento. Tente novamente mais tarde.";
    const data = (await response.json()) as GatewayResponse;
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim()
      ? content.trim()
      : "A IA não retornou uma resposta válida. Tente novamente.";
  } catch {
    // Never expose provider errors, request headers or credentials to the browser.
    return "IA indisponível no momento. Tente novamente mais tarde.";
  }
}
