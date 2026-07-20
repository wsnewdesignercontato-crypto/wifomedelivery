import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import { useMyCourier } from "@/hooks/use-courier";

export const Route = createFileRoute("/_authenticated/entregador/avaliacoes")({
  component: Avaliacoes,
});

type Review = { id: string; rating_entregador: number | null; comentario: string | null; created_at: string };

function Avaliacoes() {
  const { courier } = useMyCourier();
  const [reviews, setReviews] = useState<Review[]>([]);
  const media = reviews.length
    ? reviews.filter((r) => r.rating_entregador).reduce((s, r) => s + (r.rating_entregador ?? 0), 0) / reviews.filter((r) => r.rating_entregador).length
    : Number(courier?.avaliacao ?? 0);

  useEffect(() => {
    if (!courier) return;
    supabase.from("reviews").select("id,rating_entregador,comentario,created_at")
      .eq("entregador_id", courier.user_id)
      .not("rating_entregador", "is", null)
      .order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setReviews((data ?? []) as Review[]));
  }, [courier]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Avaliações</h1>
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-card">
        <div className="flex items-center justify-center gap-2">
          <Star className="h-6 w-6 fill-primary text-primary" />
          <span className="text-4xl font-black">{media ? media.toFixed(2) : "—"}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{reviews.length} avaliações</p>
      </div>
      {reviews.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Você ainda não recebeu avaliações.</p>
      ) : (
        <div className="space-y-2">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between">
                <Badge>{r.rating_entregador} ★</Badge>
                <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
              {r.comentario && <p className="mt-2 text-sm">{r.comentario}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
