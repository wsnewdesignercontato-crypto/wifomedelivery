import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { getCategoryKind, KIND_LABEL } from "@/lib/category-templates";

export const Route = createFileRoute("/_authenticated/estabelecimento/categorias")({
  component: CategoriasPage,
});

type Cat = { id: string; nome: string; ordem: number; ativo?: boolean };

function CategoriasPage() {
  const { estab } = useMyEstab();
  const [cats, setCats] = useState<Cat[]>([]);
  const [nome, setNome] = useState("");

  async function reload() {
    if (!estab) return;
    const { data } = await supabase.from("menu_categories")
      .select("id,nome,ordem").eq("establishment_id", estab.id).order("ordem");
    setCats((data ?? []) as Cat[]);
  }
  useEffect(() => { reload(); }, [estab?.id]);

  async function adicionar() {
    if (!estab || !nome.trim()) return;
    const ordem = (cats[cats.length - 1]?.ordem ?? 0) + 1;
    const { error } = await supabase.from("menu_categories").insert({
      establishment_id: estab.id, nome: nome.trim(), ordem,
    });
    if (error) toast.error("Falha"); else { setNome(""); reload(); }
  }
  async function remover(id: string) {
    if (!confirm("Excluir categoria?")) return;
    await supabase.from("menu_categories").delete().eq("id", id);
    reload();
  }
  async function mover(c: Cat, dir: -1 | 1) {
    const idx = cats.findIndex((x) => x.id === c.id);
    const swap = cats[idx + dir];
    if (!swap) return;
    await supabase.from("menu_categories").update({ ordem: swap.ordem }).eq("id", c.id);
    await supabase.from("menu_categories").update({ ordem: c.ordem }).eq("id", swap.id);
    reload();
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-black tracking-tight">Categorias do cardápio</h1>
      <div className="flex gap-2">
        <Input placeholder="Nova categoria (ex: Pizzas)" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Button onClick={adicionar}><Plus className="mr-2 h-4 w-4" /> Adicionar</Button>
      </div>
      <div className="space-y-2">
        {cats.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3">
            <span className="flex-1 font-medium">{c.nome}</span>
            <Button size="icon" variant="ghost" onClick={() => mover(c, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => mover(c, 1)}><ArrowDown className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => remover(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
        {cats.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma categoria criada.</p>
        )}
      </div>
    </div>
  );
}
