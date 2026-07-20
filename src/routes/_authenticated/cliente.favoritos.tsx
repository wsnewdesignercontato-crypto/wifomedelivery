import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, Loader2, Star, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/cliente/favoritos")({
  component: FavoritosPage,
});

type Fav = {
  id: string;
  establishment: {
    id: string;
    nome: string;
    descricao: string | null;
    capa_url: string | null;
    taxa_entrega_cents: number;
    tempo_medio_min: number | null;
    avaliacao: number | null;
    is_open: boolean;
  } | null;
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function FavoritosPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const [items, setItems] = useState<Fav[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("favorites")
      .select("id,establishment:establishments(id,nome,descricao,capa_url,taxa_entrega_cents,tempo_medio_min,avaliacao,is_open)")
      .eq("user_id", user.id);
    setItems((data ?? []) as unknown as Fav[]);
    setLoading(false);
  }

  async function remover(id: string) {
    await supabase.from("favorites").delete().eq("id", id);
    load();
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Favoritos</h1>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Heart className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Você ainda não favoritou nenhum restaurante.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.filter((f) => f.establishment).map((f) => {
            const e = f.establishment!;
            return (
              <div key={f.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                <Link to="/cliente/estabelecimento/$id" params={{ id: e.id }} className="block">
                  <div className="relative h-28 bg-gradient-to-br from-primary/20 to-primary/5">
                    {e.capa_url && <img src={e.capa_url} alt={e.nome} className="h-full w-full object-cover" loading="lazy" />}
                    {!e.is_open && <Badge variant="secondary" className="absolute right-2 top-2">Fechado</Badge>}
                  </div>
                  <div className="p-3">
                    <h3 className="truncate font-semibold">{e.nome}</h3>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {e.avaliacao != null && <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-primary text-primary" />{Number(e.avaliacao).toFixed(1)}</span>}
                      {e.tempo_medio_min && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{e.tempo_medio_min} min</span>}
                      <span>{e.taxa_entrega_cents === 0 ? "Grátis" : fmt(e.taxa_entrega_cents)}</span>
                    </div>
                  </div>
                </Link>
                <div className="border-t border-border p-2">
                  <Button size="sm" variant="ghost" className="w-full text-muted-foreground" onClick={() => remover(f.id)}>
                    <Heart className="mr-2 h-4 w-4 fill-primary text-primary" />
                    Remover dos favoritos
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
