import { useEffect, useState } from "react";
import { Star, MessageSquareWarning, Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

/* ------------------------------------------------------------------ */
/* Stars                                                              */
/* ------------------------------------------------------------------ */

export function StarRating({
  value,
  onChange,
  size = 22,
  readOnly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(n)}
            className={
              readOnly
                ? "cursor-default"
                : "cursor-pointer transition-transform hover:scale-110"
            }
            aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
          >
            <Star
              style={{ width: size, height: size }}
              className={
                filled
                  ? "fill-primary text-primary"
                  : "text-muted-foreground/40"
              }
            />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Post-delivery review form (used inside the customer app)           */
/* ------------------------------------------------------------------ */

const reviewSchema = z.object({
  rating_loja: z.number().int().min(1, "Avalie a loja").max(5),
  rating_entregador: z.number().int().min(0).max(5).optional(),
  comentario: z.string().trim().max(1000).optional(),
  problema_reportado: z.boolean(),
  problema_descricao: z.string().trim().max(1000).optional(),
});

export function ReviewForm({
  orderId,
  clienteId,
  establishmentId,
  entregadorId,
  onSubmitted,
}: {
  orderId: string;
  clienteId: string;
  establishmentId: string;
  entregadorId?: string | null;
  onSubmitted?: () => void;
}) {
  const [ratingLoja, setRatingLoja] = useState(0);
  const [ratingEntregador, setRatingEntregador] = useState(0);
  const [comentario, setComentario] = useState("");
  const [problema, setProblema] = useState(false);
  const [problemaDesc, setProblemaDesc] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function submit() {
    const parsed = reviewSchema.safeParse({
      rating_loja: ratingLoja,
      rating_entregador: ratingEntregador || undefined,
      comentario: comentario || undefined,
      problema_reportado: problema,
      problema_descricao: problema ? problemaDesc || undefined : undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Dados inválidos");
      return;
    }
    if (problema && !problemaDesc.trim()) {
      toast.error("Descreva o problema para relatar");
      return;
    }
    setEnviando(true);
    const { error } = await supabase.from("reviews").insert({
      order_id: orderId,
      cliente_id: clienteId,
      establishment_id: establishmentId,
      entregador_id: entregadorId ?? null,
      rating_loja: parsed.data.rating_loja,
      rating_entregador: parsed.data.rating_entregador ?? null,
      comentario: parsed.data.comentario ?? null,
      problema_reportado: parsed.data.problema_reportado,
      problema_descricao: parsed.data.problema_descricao ?? null,
    });
    setEnviando(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Você já avaliou este pedido" : "Não foi possível enviar a avaliação");
      return;
    }
    toast.success("Obrigado pela sua avaliação!");
    onSubmitted?.();
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-semibold text-foreground">Como foi seu pedido?</p>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Nota da loja</p>
        <StarRating value={ratingLoja} onChange={setRatingLoja} />
      </div>

      {entregadorId && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Nota do entregador</p>
          <StarRating value={ratingEntregador} onChange={setRatingEntregador} />
        </div>
      )}

      <Textarea
        placeholder="Deixe um comentário (opcional)"
        value={comentario}
        onChange={(e) => setComentario(e.target.value.slice(0, 1000))}
        rows={2}
      />

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={problema}
          onCheckedChange={(v) => setProblema(v === true)}
        />
        <span className="flex items-center gap-1">
          <MessageSquareWarning className="h-4 w-4 text-destructive" />
          Relatar um problema
        </span>
      </label>

      {problema && (
        <Textarea
          placeholder="Descreva o problema com o pedido"
          value={problemaDesc}
          onChange={(e) => setProblemaDesc(e.target.value.slice(0, 1000))}
          rows={3}
        />
      )}

      <Button onClick={submit} disabled={enviando || ratingLoja === 0} className="w-full">
        {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Enviar avaliação
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Establishment reviews panel                                        */
/* ------------------------------------------------------------------ */

type Review = {
  id: string;
  order_id: string;
  rating_loja: number;
  rating_entregador: number | null;
  comentario: string | null;
  problema_reportado: boolean;
  problema_descricao: string | null;
  created_at: string;
};

export function EstabReviewsPanel({ establishmentId }: { establishmentId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("reviews")
        .select("id,order_id,rating_loja,rating_entregador,comentario,problema_reportado,problema_descricao,created_at")
        .eq("establishment_id", establishmentId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (active) {
        setReviews((data ?? []) as Review[]);
        setLoading(false);
      }
    })();

    const ch = supabase
      .channel(`reviews-${establishmentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reviews",
          filter: `establishment_id=eq.${establishmentId}`,
        },
        (payload) => {
          setReviews((prev) => [payload.new as Review, ...prev]);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [establishmentId]);

  const media =
    reviews.length === 0
      ? 0
      : reviews.reduce((s, r) => s + r.rating_loja, 0) / reviews.length;
  const problemas = reviews.filter((r) => r.problema_reportado).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Média</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-black text-foreground">
              {media.toFixed(1)}
            </span>
            <Star className="h-5 w-5 fill-primary text-primary" />
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Avaliações</p>
          <p className="mt-1 text-3xl font-black text-foreground">{reviews.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Problemas</p>
          <p className="mt-1 text-3xl font-black text-destructive">{problemas}</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Carregando avaliações...
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ainda não há avaliações.
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-card"
            >
              <div className="flex items-center justify-between gap-3">
                <StarRating value={r.rating_loja} readOnly size={16} />
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              {r.comentario && (
                <p className="mt-2 text-sm text-foreground">{r.comentario}</p>
              )}
              {r.problema_reportado && (
                <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <Badge variant="destructive" className="mb-1">
                    <MessageSquareWarning className="mr-1 h-3 w-3" />
                    Problema relatado
                  </Badge>
                  {r.problema_descricao && (
                    <p className="text-xs text-foreground">{r.problema_descricao}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
