import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LogOut,
  Store,
  Package,
  ReceiptText,
  Settings,
  Plus,
  Trash2,
  Loader2,
  Power,
  Bike,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/estabelecimento")({
  component: EstabApp,
});

type Estab = {
  id: string;
  owner_id: string;
  nome: string;
  descricao: string | null;
  telefone: string | null;
  categoria_id: string | null;
  endereco: string | null;
  cidade: string | null;
  taxa_entrega_cents: number;
  tempo_medio_min: number | null;
  pedido_minimo_cents: number;
  is_open: boolean;
  status: string;
};
type Categoria = { id: string; nome: string };
type Produto = {
  id: string;
  nome: string;
  descricao: string | null;
  preco_cents: number;
  foto_url: string | null;
  disponivel: boolean;
};
type Order = {
  id: string;
  cliente_id: string;
  status: string;
  total_cents: number;
  observacoes: string | null;
  created_at: string;
  endereco_entrega: { endereco?: string } | null;
};
type OrderItem = {
  id: string;
  order_id: string;
  nome_snapshot: string;
  quantidade: number;
  preco_unit_cents: number;
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, string> = {
  placed: "Novo",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  waiting_courier: "Aguardando entregador",
  courier_assigned: "Entregador a caminho",
  picked_up: "Coletado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

function EstabApp() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [estab, setEstab] = useState<Estab | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("establishments")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();
      setEstab(data as Estab | null);
      setLoading(false);
    })();
  }, [user.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <IFomeLogo size="sm" />
            {estab && (
              <div className="hidden sm:block">
                <p className="text-sm font-semibold">{estab.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {estab.is_open ? "Aberto agora" : "Fechado"}
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {estab && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={estab.is_open}
                  onCheckedChange={async (v) => {
                    setEstab({ ...estab, is_open: v });
                    await supabase.from("establishments").update({ is_open: v }).eq("id", estab.id);
                  }}
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {estab.is_open ? "Aberto" : "Fechado"}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/", replace: true });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {!estab ? <SetupForm userId={user.id} onCreated={setEstab} /> : <PainelLoja estab={estab} setEstab={setEstab} />}
      </main>
    </div>
  );
}

function SetupForm({ userId, onCreated }: { userId: string; onCreated: (e: Estab) => void }) {
  const [cats, setCats] = useState<Categoria[]>([]);
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
      .select("id,nome")
      .eq("ativo", true)
      .order("ordem")
      .then(({ data }) => setCats((data ?? []) as Categoria[]));
  }, []);

  async function salvar() {
    if (!form.nome.trim()) return toast.error("Nome obrigatório");
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
        is_open: true,
        status: "aprovado",
      })
      .select("*")
      .single();
    setSaving(false);
    if (error || !data) return toast.error("Falha ao cadastrar");
    toast.success("Estabelecimento criado!");
    onCreated(data as Estab);
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
          <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Telefone</Label>
            <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={form.categoria_id} onValueChange={(v) => setForm({ ...form, categoria_id: v })}>
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
          <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Cidade</Label>
            <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
          </div>
          <div>
            <Label>Taxa (R$)</Label>
            <Input value={form.taxa} onChange={(e) => setForm({ ...form, taxa: e.target.value })} />
          </div>
          <div>
            <Label>Mín. (R$)</Label>
            <Input value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Tempo médio de preparo (min)</Label>
          <Input value={form.tempo} onChange={(e) => setForm({ ...form, tempo: e.target.value })} />
        </div>
        <Button className="mt-2" size="lg" onClick={salvar} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar estabelecimento
        </Button>
      </div>
    </div>
  );
}

function PainelLoja({ estab, setEstab }: { estab: Estab; setEstab: (e: Estab) => void }) {
  return (
    <Tabs defaultValue="pedidos">
      <TabsList className="grid w-full max-w-md grid-cols-3">
        <TabsTrigger value="pedidos">
          <ReceiptText className="mr-2 h-4 w-4" /> Pedidos
        </TabsTrigger>
        <TabsTrigger value="produtos">
          <Package className="mr-2 h-4 w-4" /> Produtos
        </TabsTrigger>
        <TabsTrigger value="config">
          <Settings className="mr-2 h-4 w-4" /> Config
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pedidos" className="mt-4">
        <PedidosPanel estab={estab} />
      </TabsContent>
      <TabsContent value="produtos" className="mt-4">
        <ProdutosPanel estab={estab} />
      </TabsContent>
      <TabsContent value="config" className="mt-4">
        <ConfigPanel estab={estab} onChange={setEstab} />
      </TabsContent>
    </Tabs>
  );
}

function PedidosPanel({ estab }: { estab: Estab }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});

  async function reload() {
    const { data } = await supabase
      .from("orders")
      .select("id,cliente_id,status,total_cents,observacoes,created_at,endereco_entrega")
      .eq("establishment_id", estab.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const list = (data ?? []) as Order[];
    setOrders(list);
    if (list.length) {
      const ids = list.map((o) => o.id);
      const { data: it } = await supabase.from("order_items").select("*").in("order_id", ids);
      const grouped: Record<string, OrderItem[]> = {};
      (it ?? []).forEach((r) => {
        (grouped[r.order_id] ??= []).push(r as OrderItem);
      });
      setItems(grouped);
    }
  }

  useEffect(() => {
    reload();
    const ch = supabase
      .channel("estab-pedidos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `establishment_id=eq.${estab.id}` },
        () => {
          reload();
          toast.info("Pedido atualizado");
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estab.id]);

  async function mudarStatus(id: string, novo: "accepted" | "preparing" | "ready" | "cancelled") {
    const { error } = await supabase.from("orders").update({ status: novo }).eq("id", id);
    if (error) return toast.error("Falha ao atualizar");
    if (novo === "ready") {
      // criar entrega broadcasting
      await supabase.from("deliveries").insert({
        order_id: id,
        status: "broadcasting",
        valor_entrega_cents: estab.taxa_entrega_cents,
      });
      await supabase.from("orders").update({ status: "waiting_courier" }).eq("id", id);
      toast.success("Corrida enviada aos entregadores");
    } else {
      toast.success("Status atualizado");
    }
  }

  const proxima = (s: string): { label: string; next: "accepted" | "preparing" | "ready" } | null => {
    if (s === "placed") return { label: "Aceitar", next: "accepted" };
    if (s === "accepted") return { label: "Iniciar preparo", next: "preparing" };
    if (s === "preparing") return { label: "Marcar pronto e chamar entregador", next: "ready" };
    return null;
  };

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <ReceiptText className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Nenhum pedido ainda. Assim que chegar aparecerá aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const step = proxima(o.status);
        return (
          <div key={o.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
                    {STATUS_LABEL[o.status] ?? o.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleTimeString("pt-BR")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Entregar em: {o.endereco_entrega?.endereco ?? "—"}
                </p>
              </div>
              <span className="font-bold text-primary">{fmt(o.total_cents)}</span>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {(items[o.id] ?? []).map((it) => (
                <li key={it.id} className="flex justify-between">
                  <span>
                    {it.quantidade}× {it.nome_snapshot}
                  </span>
                  <span className="text-muted-foreground">{fmt(it.preco_unit_cents * it.quantidade)}</span>
                </li>
              ))}
            </ul>
            {o.observacoes && (
              <p className="mt-2 rounded-lg bg-muted p-2 text-xs">Obs: {o.observacoes}</p>
            )}
            {step && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => mudarStatus(o.id, step.next)}>
                  {step.next === "ready" && <Bike className="mr-2 h-4 w-4" />}
                  {step.label}
                </Button>
                {o.status === "placed" && (
                  <Button size="sm" variant="outline" onClick={() => mudarStatus(o.id, "cancelled")}>
                    Recusar
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProdutosPanel({ estab }: { estab: Estab }) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [form, setForm] = useState({ nome: "", descricao: "", preco: "", foto_url: "" });
  const [saving, setSaving] = useState(false);

  async function reload() {
    const { data } = await supabase
      .from("products")
      .select("id,nome,descricao,preco_cents,foto_url,disponivel")
      .eq("establishment_id", estab.id)
      .order("created_at", { ascending: false });
    setProdutos((data ?? []) as Produto[]);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estab.id]);

  async function adicionar() {
    if (!form.nome.trim() || !form.preco) return toast.error("Nome e preço obrigatórios");
    setSaving(true);
    const { error } = await supabase.from("products").insert({
      establishment_id: estab.id,
      nome: form.nome.trim(),
      descricao: form.descricao || null,
      preco_cents: Math.round(parseFloat(form.preco) * 100),
      foto_url: form.foto_url || null,
      disponivel: true,
    });
    setSaving(false);
    if (error) return toast.error("Falha ao criar");
    setForm({ nome: "", descricao: "", preco: "", foto_url: "" });
    toast.success("Produto adicionado");
    reload();
  }

  async function toggle(p: Produto) {
    await supabase.from("products").update({ disponivel: !p.disponivel }).eq("id", p.id);
    reload();
  }

  async function remover(id: string) {
    if (!confirm("Excluir produto?")) return;
    await supabase.from("products").delete().eq("id", id);
    reload();
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <Plus className="h-4 w-4 text-primary" /> Novo produto
        </h3>
        <div className="space-y-2">
          <Input
            placeholder="Nome"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
          <Textarea
            placeholder="Descrição"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
          <Input
            placeholder="Preço (ex: 29.90)"
            value={form.preco}
            onChange={(e) => setForm({ ...form, preco: e.target.value })}
          />
          <Input
            placeholder="URL da foto (opcional)"
            value={form.foto_url}
            onChange={(e) => setForm({ ...form, foto_url: e.target.value })}
          />
          <Button className="w-full" onClick={adicionar} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Adicionar produto
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {produtos.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum produto cadastrado.
          </div>
        )}
        {produtos.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
              {p.foto_url && <img src={p.foto_url} alt={p.nome} className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.nome}</p>
              <p className="text-sm text-primary">{fmt(p.preco_cents)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={p.disponivel} onCheckedChange={() => toggle(p)} />
              <Button size="icon" variant="ghost" onClick={() => remover(p.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfigPanel({ estab, onChange }: { estab: Estab; onChange: (e: Estab) => void }) {
  const [form, setForm] = useState({
    nome: estab.nome,
    descricao: estab.descricao ?? "",
    telefone: estab.telefone ?? "",
    endereco: estab.endereco ?? "",
    cidade: estab.cidade ?? "",
    taxa: (estab.taxa_entrega_cents / 100).toFixed(2),
    tempo: String(estab.tempo_medio_min ?? 30),
    minimo: (estab.pedido_minimo_cents / 100).toFixed(2),
  });
  const [saving, setSaving] = useState(false);

  async function salvar() {
    setSaving(true);
    const patch = {
      nome: form.nome,
      descricao: form.descricao || null,
      telefone: form.telefone || null,
      endereco: form.endereco || null,
      cidade: form.cidade || null,
      taxa_entrega_cents: Math.round(parseFloat(form.taxa || "0") * 100),
      tempo_medio_min: parseInt(form.tempo || "30"),
      pedido_minimo_cents: Math.round(parseFloat(form.minimo || "0") * 100),
    };
    const { data, error } = await supabase
      .from("establishments")
      .update(patch)
      .eq("id", estab.id)
      .select("*")
      .single();
    setSaving(false);
    if (error) return toast.error("Falha ao salvar");
    toast.success("Configurações salvas");
    if (data) onChange(data as Estab);
  }

  return (
    <div className="mx-auto max-w-xl space-y-3 rounded-2xl border border-border bg-card p-6 shadow-card">
      <div>
        <Label>Nome</Label>
        <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
      </div>
      <div>
        <Label>Descrição</Label>
        <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Telefone</Label>
          <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
        </div>
        <div>
          <Label>Cidade</Label>
          <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>Endereço</Label>
        <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Taxa (R$)</Label>
          <Input value={form.taxa} onChange={(e) => setForm({ ...form, taxa: e.target.value })} />
        </div>
        <div>
          <Label>Mínimo (R$)</Label>
          <Input value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} />
        </div>
        <div>
          <Label>Tempo (min)</Label>
          <Input value={form.tempo} onChange={(e) => setForm({ ...form, tempo: e.target.value })} />
        </div>
      </div>
      <Button onClick={salvar} disabled={saving} className="w-full">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        <Power className="mr-2 h-4 w-4" />
        Salvar alterações
      </Button>
    </div>
  );
}
