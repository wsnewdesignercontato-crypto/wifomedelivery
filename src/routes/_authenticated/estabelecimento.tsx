import { recommendedCategories } from "@/lib/delivery-niches";
import { categoryLabel } from "@/lib/product-category-catalog";
import { ESTABLISHMENT_SELECT } from "@/lib/data-access";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Store } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EstabShell } from "@/components/estabelecimento/estab-shell";
import { OnboardingGate } from "@/components/onboarding-gate";
import { useEstab, type Estab } from "@/hooks/use-estab";

export const Route = createFileRoute("/_authenticated/estabelecimento")({
  head: () => ({
    meta: [
      { title: "Loja | PedeTrem" },
      { name: "description", content: "PedeTrem: loja." },
      { property: "og:title", content: "Loja | PedeTrem" },
      { property: "og:description", content: "PedeTrem: loja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EstabLayout,
});

type Categoria = { id: string; nome: string; slug: string };

function EstabLayout() {
  const location = useLocation();
  if (location.pathname.replace(/\/$/, "") === "/estabelecimento/entrar") return <Outlet />;
  return <EstabWorkspace />;
}

function EstabWorkspace() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const { data: estab, isLoading } = useEstab(user.id);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!estab) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center px-4 py-3">
            <IFomeLogo size="sm" />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">
          <SetupForm userId={user.id} />
        </main>
      </div>
    );
  }

  return (
    <OnboardingGate role="estabelecimento" userId={user.id}>
      <EstabShell estab={estab} />
    </OnboardingGate>
  );
}

function SetupForm({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [cats, setCats] = useState<Categoria[]>([]);
  const [prepareCategories, setPrepareCategories] = useState(true);
  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    telefone: "",
    categoria_id: "",
    endereco: "",
    cidade: "",
    taxa: "6.00",
    tempo: "35",
    minimo: "20.00",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("global_categories")
      .select("id,nome,slug")
      .eq("ativo", true)
      .order("ordem")
      .then(({ data }) => setCats((data ?? []) as Categoria[]));
  }, []);

  async function salvar() {
    if (!form.nome.trim()) return toast.error("Nome obrigatório");
    if (!form.categoria_id) return toast.error("Escolha o segmento da loja.");
    setSaving(true);
    const { data, error } = await supabase
      .from("establishments")
      .insert({
        owner_id: userId,
        nome: form.nome.trim(),
        descricao: form.descricao || null,
        telefone: form.telefone || null,
        categoria_id: form.categoria_id || null,
        endereco: form.endereco || null,
        cidade: form.cidade || null,
        taxa_entrega_cents: Math.round(parseFloat(form.taxa || "0") * 100),
        tempo_medio_min: parseInt(form.tempo || "30"),
        pedido_minimo_cents: Math.round(parseFloat(form.minimo || "0") * 100),
        is_open: false,
        status: "pendente",
      })
      .select(ESTABLISHMENT_SELECT)
      .single();
    if (error || !data) {
      setSaving(false);
      return toast.error("Falha ao cadastrar");
    }
    if (prepareCategories) {
      const names = recommendedCategories(
        cats.find((item) => item.id === form.categoria_id)?.slug,
      ).map(categoryLabel);
      if (names.length) {
        const result = await supabase.rpc("ensure_menu_categories", {
          p_establishment_id: data.id,
          p_names: names,
        });
        if (result.error) toast.error("Loja criada. Revise os modelos no módulo Categorias.");
      }
    }
    setSaving(false);
    toast.success("Estabelecimento enviado para aprovacao!");
    qc.setQueryData(["myEstab", userId], data as unknown as Estab);
  }

  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-6 shadow-card">
      <div className="mb-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-brand">
          <Store className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight">Cadastre seu estabelecimento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure os dados básicos para começar a receber pedidos.
        </p>
      </div>
      <div className="grid gap-3">
        <div>
          <Label>Nome</Label>
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>
        <div>
          <Label>Descrição</Label>
          <Textarea
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Telefone</Label>
            <Input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
          </div>
          <div>
            <Label>Segmento da loja</Label>
            <Select
              value={form.categoria_id}
              onValueChange={(v) => setForm({ ...form, categoria_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {cats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Endereço</Label>
          <Input
            value={form.endereco}
            onChange={(e) => setForm({ ...form, endereco: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Cidade</Label>
            <Input
              value={form.cidade}
              onChange={(e) => setForm({ ...form, cidade: e.target.value })}
            />
          </div>
          <div>
            <Label>Taxa (R$)</Label>
            <Input value={form.taxa} onChange={(e) => setForm({ ...form, taxa: e.target.value })} />
          </div>
          <div>
            <Label>Mín. (R$)</Label>
            <Input
              value={form.minimo}
              onChange={(e) => setForm({ ...form, minimo: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>Tempo médio de preparo (min)</Label>
          <Input value={form.tempo} onChange={(e) => setForm({ ...form, tempo: e.target.value })} />
        </div>
        {!!form.categoria_id && (
          <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-muted/40 p-3 text-sm">
            <input
              type="checkbox"
              checked={prepareCategories}
              onChange={(event) => setPrepareCategories(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              Preparar categorias sugeridas para meu segmento
              <span className="mt-1 block text-xs text-muted-foreground">
                Você poderá revisar e editar depois, em Categorias.
              </span>
            </span>
          </label>
        )}
        <Button className="mt-2" size="lg" onClick={salvar} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar estabelecimento
        </Button>
      </div>
    </div>
  );
}
