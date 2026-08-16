import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/complementos")({
  component: ComplementosPage,
});

type Group = {
  id: string;
  nome: string;
  obrigatorio: boolean;
  minimo: number;
  maximo: number;
  ativo: boolean;
};
type Addon = {
  id: string;
  addon_group_id: string;
  nome: string;
  preco_extra_cents: number;
  ativo: boolean;
};

function ComplementosPage() {
  const { estab } = useMyEstab();
  const estabId = estab?.id;
  const [groups, setGroups] = useState<Group[]>([]);
  const [addons, setAddons] = useState<Record<string, Addon[]>>({});
  const [openNew, setOpenNew] = useState(false);

  const reload = useCallback(async () => {
    if (!estabId) return;
    const { data: g } = await supabase
      .from("addon_groups")
      .select("id,nome,obrigatorio,minimo,maximo,ativo")
      .eq("establishment_id", estabId)
      .order("ordem");
    const gs = (g ?? []) as Group[];
    setGroups(gs);
    if (gs.length) {
      const { data: a } = await supabase
        .from("addons")
        .select("id,addon_group_id,nome,preco_extra_cents,ativo")
        .in(
          "addon_group_id",
          gs.map((x) => x.id),
        );
      const grp: Record<string, Addon[]> = {};
      (a ?? []).forEach((x) => {
        (grp[x.addon_group_id] ??= []).push(x as Addon);
      });
      setAddons(grp);
    }
  }, [estabId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function novoAddon(gid: string) {
    const nome = prompt("Nome do item:") ?? "";
    if (!nome.trim()) return;
    const preco = parseFloat((prompt("Preço extra (R$):", "0") ?? "0").replace(",", "."));
    const { error } = await supabase.from("addons").insert({
      addon_group_id: gid,
      nome: nome.trim(),
      preco_extra_cents: Math.round(preco * 100),
    });
    if (error) toast.error("Falha");
    else reload();
  }
  async function delAddon(id: string) {
    await supabase.from("addons").delete().eq("id", id);
    reload();
  }
  async function delGroup(id: string) {
    if (!confirm("Excluir grupo e todos os itens?")) return;
    await supabase.from("addon_groups").delete().eq("id", id);
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Grupos de complementos</h1>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo grupo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <NovoGrupoForm
              onSaved={() => {
                setOpenNew(false);
                reload();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{g.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {g.obrigatorio ? "Obrigatório" : "Opcional"} · Min {g.minimo} · Max {g.maximo}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => novoAddon(g.id)}>
                  <Plus className="mr-1 h-3 w-3" /> Item
                </Button>
                <Button size="icon" variant="ghost" onClick={() => delGroup(g.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {(addons[g.id] ?? []).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
                >
                  <span>{a.nome}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-primary font-semibold">{fmt(a.preco_extra_cents)}</span>
                    <Button size="icon" variant="ghost" onClick={() => delAddon(a.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {!addons[g.id]?.length && (
                <p className="text-xs text-muted-foreground">Sem itens ainda.</p>
              )}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum grupo criado. Crie grupos como "Tamanhos", "Bordas", "Adicionais".
          </p>
        )}
      </div>
    </div>
  );
}

function NovoGrupoForm({ onSaved }: { onSaved: () => void }) {
  const { estab } = useMyEstab();
  const [form, setForm] = useState({ nome: "", obrigatorio: false, minimo: "0", maximo: "1" });

  async function salvar() {
    if (!estab || !form.nome.trim()) return toast.error("Nome obrigatório");
    const { error } = await supabase.from("addon_groups").insert({
      establishment_id: estab.id,
      nome: form.nome.trim(),
      obrigatorio: form.obrigatorio,
      minimo: parseInt(form.minimo || "0"),
      maximo: parseInt(form.maximo || "1"),
    });
    if (error) toast.error("Falha");
    else {
      toast.success("Grupo criado");
      onSaved();
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Novo grupo</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Nome (ex: Bordas)</Label>
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Mínimo</Label>
            <Input
              value={form.minimo}
              onChange={(e) => setForm({ ...form, minimo: e.target.value })}
            />
          </div>
          <div>
            <Label>Máximo</Label>
            <Input
              value={form.maximo}
              onChange={(e) => setForm({ ...form, maximo: e.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.obrigatorio}
            onCheckedChange={(v) => setForm({ ...form, obrigatorio: v })}
          />
          <span className="text-sm">Obrigatório</span>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={salvar}>Criar grupo</Button>
      </DialogFooter>
    </>
  );
}
