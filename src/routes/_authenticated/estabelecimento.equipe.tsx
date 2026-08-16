import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/equipe")({
  component: EquipePage,
});

type Member = {
  id: string;
  email: string;
  nome: string | null;
  papel: string;
  ativo: boolean;
  aceito_em: string | null;
};

function EquipePage() {
  const { estab } = useMyEstab();
  const estabId = estab?.id;
  const [list, setList] = useState<Member[]>([]);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!estabId) return;
    const { data } = await supabase
      .from("team_members")
      .select("id,email,nome,papel,ativo,aceito_em")
      .eq("establishment_id", estabId)
      .order("created_at");
    setList((data ?? []) as Member[]);
  }, [estabId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function remover(id: string) {
    if (!confirm("Remover membro?")) return;
    await supabase.from("team_members").delete().eq("id", id);
    reload();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Equipe</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Convidar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <ConvidarForm
              onSaved={() => {
                setOpen(false);
                reload();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        {list.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            <div className="flex-1">
              <p className="font-semibold">{m.nome ?? m.email}</p>
              <p className="text-xs text-muted-foreground">{m.email}</p>
            </div>
            <Badge variant="outline">{m.papel}</Badge>
            <Badge variant={m.aceito_em ? "default" : "secondary"}>
              {m.aceito_em ? "Ativo" : "Pendente"}
            </Badge>
            <Button size="icon" variant="ghost" onClick={() => remover(m.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum membro adicionado.</p>
        )}
      </div>
    </div>
  );
}

function ConvidarForm({ onSaved }: { onSaved: () => void }) {
  const { estab } = useMyEstab();
  const [f, setF] = useState({ email: "", nome: "", papel: "atendente" });
  async function salvar() {
    if (!estab || !f.email.trim()) return toast.error("Email obrigatório");
    const { error } = await supabase.from("team_members").insert({
      establishment_id: estab.id,
      email: f.email.trim().toLowerCase(),
      nome: f.nome || null,
      papel: f.papel as never,
    });
    if (error) toast.error("Falha: " + error.message);
    else {
      toast.success("Convite enviado");
      onSaved();
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Convidar membro</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Email</Label>
          <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div>
          <Label>Nome</Label>
          <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </div>
        <div>
          <Label>Papel</Label>
          <select
            className="w-full rounded-md border border-input bg-background p-2 text-sm"
            value={f.papel}
            onChange={(e) => setF({ ...f, papel: e.target.value })}
          >
            <option value="gerente">Gerente</option>
            <option value="atendente">Atendente</option>
            <option value="cozinha">Cozinha</option>
            <option value="financeiro">Financeiro</option>
            <option value="estoque">Estoque</option>
            <option value="marketing">Marketing</option>
          </select>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={salvar}>Convidar</Button>
      </DialogFooter>
    </>
  );
}
