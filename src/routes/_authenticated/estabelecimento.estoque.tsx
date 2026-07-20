import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/estabelecimento/estoque")({
  component: EstoquePage,
});

type Prod = { id: string; nome: string; estoque: number | null; disponivel: boolean };

function EstoquePage() {
  const { estab } = useMyEstab();
  const [rows, setRows] = useState<Prod[]>([]);

  async function reload() {
    if (!estab) return;
    const { data } = await supabase.from("products")
      .select("id,nome,estoque,disponivel").eq("establishment_id", estab.id).order("nome");
    setRows((data ?? []) as Prod[]);
  }
  useEffect(() => { reload(); }, [estab?.id]);

  async function ajustar(p: Prod, novo: number) {
    if (!estab) return;
    const diff = novo - (p.estoque ?? 0);
    await supabase.from("products").update({ estoque: novo }).eq("id", p.id);
    if (diff !== 0) {
      await supabase.from("stock_movements").insert({
        product_id: p.id, establishment_id: estab.id,
        tipo: "ajuste", quantidade: diff, motivo: "Ajuste manual",
      });
    }
    toast.success("Estoque atualizado");
    reload();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black tracking-tight">Controle de estoque</h1>
      <p className="text-sm text-muted-foreground">Ajuste os níveis de cada produto. Produtos ficam indisponíveis automaticamente ao chegar em zero.</p>
      <div className="rounded-2xl border border-border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-left"><tr>
            <th className="p-3">Produto</th><th className="p-3">Status</th><th className="p-3">Estoque</th><th className="p-3">Ajustar</th>
          </tr></thead>
          <tbody>
            {rows.map((p) => (
              <StockRow key={p.id} p={p} onChange={(n) => ajustar(p, n)} />
            ))}
            {rows.length === 0 && (<tr><td className="p-6 text-center text-muted-foreground" colSpan={4}>Sem produtos.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockRow({ p, onChange }: { p: Prod; onChange: (n: number) => void }) {
  const [v, setV] = useState(p.estoque?.toString() ?? "");
  const baixo = p.estoque !== null && p.estoque !== undefined && p.estoque <= 5;
  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3 font-medium">{p.nome}</td>
      <td className="p-3">
        {p.disponivel ? <Badge className="bg-emerald-500 text-white">Ativo</Badge> : <Badge variant="secondary">Off</Badge>}
        {baixo && <Badge variant="destructive" className="ml-2">Baixo</Badge>}
      </td>
      <td className="p-3">{p.estoque ?? "—"}</td>
      <td className="p-3">
        <div className="flex gap-2">
          <Input value={v} onChange={(e) => setV(e.target.value)} className="w-24" placeholder="Novo" />
          <Button size="sm" onClick={() => onChange(parseInt(v || "0"))}>Salvar</Button>
        </div>
      </td>
    </tr>
  );
}
