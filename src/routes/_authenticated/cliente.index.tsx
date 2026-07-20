import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Star, Clock, Search, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/cliente/")({
  component: ClienteHome,
});

type Categoria = { id: string; nome: string; slug: string; icone: string | null };
type Estab = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria_id: string | null;
  logo_url: string | null;
  capa_url: string | null;
  taxa_entrega_cents: number;
  tempo_medio_min: number | null;
  avaliacao: number | null;
  is_open: boolean;
  cidade: string | null;
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ClienteHome() {
  const [cats, setCats] = useState<Categoria[]>([]);
  const [estabs, setEstabs] = useState<Estab[]>([]);
  const [busca, setBusca] = useState("");
  const [catSel, setCatSel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, e] = await Promise.all([
        supabase.from("global_categories").select("id,nome,slug,icone").eq("ativo", true).order("ordem"),
        supabase
          .from("establishments")
          .select("id,nome,descricao,categoria_id,logo_url,capa_url,taxa_entrega_cents,tempo_medio_min,avaliacao,is_open,cidade")
          .eq("status", "aprovado")
          .order("avaliacao", { ascending: false, nullsFirst: false }),
      ]);
      setCats((c.data ?? []) as Categoria[]);
      setEstabs((e.data ?? []) as Estab[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return estabs.filter(
      (e) =>
        (!catSel || e.categoria_id === catSel) &&
        (!q || e.nome.toLowerCase().includes(q) || (e.descricao ?? "").toLowerCase().includes(q)),
    );
  }, [estabs, catSel, busca]);

  const destaques = filtered.filter((e) => (e.avaliacao ?? 0) >= 4.5).slice(0, 8);
  const freeShip = filtered.filter((e) => e.taxa_entrega_cents === 0).slice(0, 8);
  const todos = filtered;

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar restaurantes, pratos, categorias"
          className="pl-9"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        <CatChip active={!catSel} onClick={() => setCatSel(null)} label="Todas" />
        {cats.map((c) => (
          <CatChip
            key={c.id}
            active={catSel === c.id}
            onClick={() => setCatSel(catSel === c.id ? null : c.id)}
            label={c.nome}
          />
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : todos.length === 0 ? (
        <EmptyState msg="Nenhum estabelecimento encontrado." />
      ) : (
        <>
          {destaques.length > 0 && (
            <Section title="Destaques" icon={<Sparkles className="h-4 w-4 text-primary" />}>
              <RailRow items={destaques} />
            </Section>
          )}
          {freeShip.length > 0 && (
            <Section title="Entrega grátis">
              <RailRow items={freeShip} />
            </Section>
          )}
          <Section title={catSel ? cats.find((c) => c.id === catSel)?.nome ?? "Todos" : "Todos os restaurantes"}>
            <div className="grid gap-3 sm:grid-cols-2">
              {todos.map((e) => (
                <EstabCard key={e.id} estab={e} />
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function CatChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
      }`}
    >
      {label}
    </button>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-base font-bold text-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function RailRow({ items }: { items: Estab[] }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
      {items.map((e) => (
        <div key={e.id} className="w-56 shrink-0">
          <EstabCard estab={e} />
        </div>
      ))}
    </div>
  );
}

function EstabCard({ estab }: { estab: Estab }) {
  return (
    <Link
      to="/cliente/estabelecimento/$id"
      params={{ id: estab.id }}
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-card transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-brand"
    >
      <div className="relative h-32 w-full bg-gradient-to-br from-primary/20 to-primary/5">
        {estab.capa_url && (
          <img src={estab.capa_url} alt={estab.nome} className="h-full w-full object-cover" loading="lazy" />
        )}
        {!estab.is_open && (
          <Badge variant="secondary" className="absolute right-2 top-2">Fechado</Badge>
        )}
        {estab.taxa_entrega_cents === 0 && (
          <Badge className="absolute left-2 top-2 bg-primary text-primary-foreground">Grátis</Badge>
        )}
      </div>
      <div className="p-3">
        <h3 className="truncate font-semibold text-foreground">{estab.nome}</h3>
        {estab.descricao && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{estab.descricao}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {estab.avaliacao != null && (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-primary text-primary" />
              {Number(estab.avaliacao).toFixed(1)}
            </span>
          )}
          {estab.tempo_medio_min && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {estab.tempo_medio_min} min
            </span>
          )}
          <span>{estab.taxa_entrega_cents === 0 ? "Grátis" : fmt(estab.taxa_entrega_cents)}</span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}
