import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMyCourier } from "@/hooks/use-courier";
import { useQueryClient } from "@tanstack/react-query";
import { registrationChanges, saveCourierRegistration } from "@/lib/courier-registration";
import { notifyDataUpdated } from "@/lib/app-refresh";
import { CreditCard, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/entregador/perfil/pagamento")({
  head: () => ({
    meta: [
      { title: "Entregador — Perfil — Pagamento | PedeTrem" },
      { name: "description", content: "PedeTrem: entregador, perfil, pagamento." },
      { property: "og:title", content: "Entregador — Perfil — Pagamento | PedeTrem" },
      { property: "og:description", content: "PedeTrem: entregador, perfil, pagamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagamento,
});

function Pagamento() {
  const { courier, userId, isLoading, error: loadError, refetch } = useMyCourier();
  const qc = useQueryClient();
  const [f, rawSetF] = useState({
    pix_tipo: "cpf",
    pix_key: "",
    banco_nome: "",
    banco_agencia: "",
    banco_conta: "",
    banco_tipo: "corrente",
    banco_titular: "",
  });
  const dirty = useRef(false);
  const baseline = useRef<{ form: typeof f; courier: typeof courier; userId: string } | null>(null);
  const setF: typeof rawSetF = (next) => {
    dirty.current = true;
    rawSetF(next);
  };
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (baseline.current?.userId !== userId) {
      dirty.current = false;
      baseline.current = null;
    }
    if (!courier || dirty.current || loadError || isLoading) return;
    const hydrated = {
      pix_tipo: courier.pix_tipo ?? "cpf",
      pix_key: courier.pix_key ?? "",
      banco_nome: courier.banco_nome ?? "",
      banco_agencia: courier.banco_agencia ?? "",
      banco_conta: courier.banco_conta ?? "",
      banco_tipo: courier.banco_tipo ?? "corrente",
      banco_titular: courier.banco_titular ?? "",
    };
    baseline.current = { form: hydrated, courier, userId };
    rawSetF(hydrated);
  }, [courier, userId, loadError, isLoading]);

  async function salvar() {
    if (saving || isLoading || loadError || !baseline.current || baseline.current.userId !== userId)
      return;
    if (!f.pix_key.trim()) return toast.error("Informe a chave PIX");
    if (!f.banco_titular.trim()) return toast.error("Informe o titular da conta");
    setSaving(true);
    try {
      const changes = registrationChanges(f, baseline.current.form, {
        courier: baseline.current.courier,
        profile: { nome: null, telefone: null, foto_url: null },
      });
      if (!Object.keys(changes.patch).length) {
        toast.success("Seus dados já estão salvos.");
        return;
      }
      const saved = await saveCourierRegistration(userId, changes.patch, changes.expected);
      await Promise.all([
        qc.cancelQueries({ queryKey: ["courier", userId] }),
        qc.cancelQueries({ queryKey: ["profile", userId] }),
      ]);
      qc.setQueryData(["courier", userId], saved.courier);
      qc.setQueryData(["profile", userId], saved.profile);
      dirty.current = false;
      notifyDataUpdated();
      toast.success("Dados de pagamento salvos e confirmados.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar. Seus dados digitados foram mantidos.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (loadError)
    return (
      <div role="alert" className="space-y-3">
        <p>Não foi possível carregar os dados de pagamento salvos.</p>
        <Button onClick={() => void refetch()}>Tentar novamente</Button>
      </div>
    );
  if (isLoading) return <p role="status">Carregando dados salvos…</p>;
  if (!courier) return <p>Complete seus dados pessoais antes de cadastrar o pagamento.</p>;

  return (
    <fieldset disabled={saving} className="min-w-0 max-w-2xl mx-auto space-y-5">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-black leading-tight">Dados de pagamento</h1>
          <p className="text-xs text-muted-foreground">Usados para receber seus saques via PIX</p>
        </div>
      </header>

      <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Somente contas em nome do titular cadastrado podem receber. Os dados são validados antes
          de cada saque.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold">Chave PIX</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Tipo</Label>
            <Select value={f.pix_tipo} onValueChange={(v) => setF({ ...f, pix_tipo: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="cnpj">CNPJ</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="telefone">Telefone</SelectItem>
                <SelectItem value="aleatoria">Aleatória</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Chave</Label>
            <Input value={f.pix_key} onChange={(e) => setF({ ...f, pix_key: e.target.value })} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold">Conta bancária (opcional)</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Banco</Label>
            <Input
              value={f.banco_nome}
              onChange={(e) => setF({ ...f, banco_nome: e.target.value })}
            />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={f.banco_tipo} onValueChange={(v) => setF({ ...f, banco_tipo: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="corrente">Corrente</SelectItem>
                <SelectItem value="poupanca">Poupança</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Agência</Label>
            <Input
              value={f.banco_agencia}
              onChange={(e) => setF({ ...f, banco_agencia: e.target.value })}
            />
          </div>
          <div>
            <Label>Conta</Label>
            <Input
              value={f.banco_conta}
              onChange={(e) => setF({ ...f, banco_conta: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Titular (obrigatório)</Label>
            <Input
              value={f.banco_titular}
              onChange={(e) => setF({ ...f, banco_titular: e.target.value })}
            />
          </div>
        </div>
      </section>

      <Button size="lg" className="w-full" onClick={salvar} disabled={saving}>
        Salvar dados de pagamento
      </Button>
    </fieldset>
  );
}
