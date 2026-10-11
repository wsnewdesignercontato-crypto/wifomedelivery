import { createFileRoute } from "@tanstack/react-router";
import { useMyEstab } from "@/hooks/use-my-estab";
import { EstabReviewsPanel } from "@/components/reviews";

export const Route = createFileRoute("/_authenticated/estabelecimento/avaliacoes")({
  head: () => ({ meta: [
    { title: "Loja — Avaliações | PedeTrem" },
    { name: "description", content: "PedeTrem: loja, avaliações." },
    { property: "og:title", content: "Loja — Avaliações | PedeTrem" },
    { property: "og:description", content: "PedeTrem: loja, avaliações." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AvaliacoesPage,
});

function AvaliacoesPage() {
  const { estab } = useMyEstab();
  if (!estab) return null;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black tracking-tight">Avaliações</h1>
      <EstabReviewsPanel establishmentId={estab.id} owner />
    </div>
  );
}
