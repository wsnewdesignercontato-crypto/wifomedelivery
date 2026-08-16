import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Trash2, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/avaliacoes")({
  component: AvaliacoesPage,
});

type Review = {
  id: string;
  rating_loja: number;
  rating_entregador: number | null;
  comentario: string | null;
  created_at: string;
  establishment_id: string;
};

async function fetchReviews() {
  const { data, error } = await supabase
    .from("reviews")
    .select("id,rating_loja,rating_entregador,comentario,created_at,establishment_id")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Review[];
}

function AvaliacoesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-reviews"], queryFn: fetchReviews });
  const qc = useQueryClient();

  async function del(id: string) {
    if (!confirm("Excluir esta avaliação?")) return;
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) return toast.error("Falha ao excluir");
    toast.success("Avaliação excluída");
    await supabase.from("admin_audit_log").insert({
      admin_id: (await supabase.auth.getUser()).data.user!.id,
      action: "delete_review",
      entity_type: "review",
      entity_id: id,
    });
    qc.invalidateQueries({ queryKey: ["admin-reviews"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Star className="h-6 w-6 text-primary" /> Avaliações
        </h1>
        <p className="text-sm text-muted-foreground">{data?.length ?? 0} avaliação(ões).</p>
      </div>

      <div className="grid gap-3">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        {(data ?? []).map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${i < r.rating_loja ? "fill-amber-500 text-amber-500" : "text-muted"}`}
                    />
                  ))}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {dateShort(r.created_at)}
                  </span>
                </div>
                {r.comentario && <p className="mt-2 text-sm text-foreground">{r.comentario}</p>}
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                  loja: {r.establishment_id.slice(0, 8)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-rose-600"
                onClick={() => del(r.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {!isLoading && (data ?? []).length === 0 && (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Nenhuma avaliação ainda.
          </div>
        )}
      </div>
    </div>
  );
}

void EyeOff;
void Eye;
