import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab } from "@/hooks/use-my-estab";
import type { Estab } from "@/hooks/use-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/configuracoes")({
  component: ConfigPage,
});

function ConfigPage() {
  const { estab, userId } = useMyEstab();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    nome: "", razao_social: "", descricao: "", slogan: "", telefone: "", whatsapp: "",
    endereco: "", cidade: "", cnpj: "", instagram: "", site: "",
    logo_url: "", capa_url: "", cor_destaque: "#FF6B00",
    taxa: "0.00", tempo: "30", minimo: "0.00",
    pix_key: "", banco_nome: "", banco_agencia: "", banco_conta: "", banco_tipo: "corrente",
    banco_titular: "", banco_documento: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!estab) return;
    setForm({
      nome: estab.nome, razao_social: estab.razao_social ?? "", descricao: estab.descricao ?? "",
      slogan: estab.slogan ?? "", telefone: estab.telefone ?? "", whatsapp: estab.whatsapp ?? "",
      endereco: estab.endereco ?? "", cidade: estab.cidade ?? "", cnpj: estab.cnpj ?? "",
      instagram: estab.instagram ?? "", site: estab.site ?? "",
      logo_url: estab.logo_url ?? "", capa_url: estab.capa_url ?? "",
      cor_destaque: estab.cor_destaque ?? "#FF6B00",
      taxa: (estab.taxa_entrega_cents / 100).toFixed(2),
      tempo: String(estab.tempo_medio_min ?? 30),
      minimo: (estab.pedido_minimo_cents / 100).toFixed(2),
      pix_key: estab.pix_key ?? "",
      banco_nome: estab.banco_nome ?? "", banco_agencia: estab.banco_agencia ?? "",
      banco_conta: estab.banco_conta ?? "", banco_tipo: estab.banco_tipo ?? "corrente",
      banco_titular: estab.banco_titular ?? "", banco_documento: estab.banco_documento ?? "",
    });
  }, [estab?.id]);

  async function salvar() {
    if (!estab) return;
    setSaving(true);
    const patch = {
      nome: form.nome, razao_social: form.razao_social || null, descricao: form.descricao || null,
      slogan: form.slogan || null, telefone: form.telefone || null, whatsapp: form.whatsapp || null,
      endereco: form.endereco || null, cidade: form.cidade || null, cnpj: form.cnpj || null,
      instagram: form.instagram || null, site: form.site || null,
      logo_url: form.logo_url || null, capa_url: form.capa_url || null,
      cor_destaque: form.cor_destaque || null,
      taxa_entrega_cents: Math.round(parseFloat(form.taxa || "0") * 100),
      tempo_medio_min: parseInt(form.tempo || "30"),
      pedido_minimo_cents: Math.round(parseFloat(form.minimo || "0") * 100),
      pix_key: form.pix_key || null,
      banco_nome: form.banco_nome || null, banco_agencia: form.banco_agencia || null,
      banco_conta: form.banco_conta || null, banco_tipo: form.banco_tipo || null,
      banco_titular: form.banco_titular || null, banco_documento: form.banco_documento || null,
    };
    const { data, error } = await supabase.from("establishments").update(patch).eq("id", estab.id).select("*").single();
    setSaving(false);
    if (error) return toast.error("Falha ao salvar");
    toast.success("Configurações salvas");
    if (data) qc.setQueryData(["myEstab", userId], data as unknown as Estab);
  }

  if (!estab) return null;

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-black tracking-tight">Configurações da loja</h1>

      <Card>
        <CardHeader><CardTitle className="text-sm">Identidade</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div><Label>Nome público</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div><Label>Razão social</Label><Input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} /></div>
          <div><Label>Slogan</Label><Input value={form.slogan} onChange={(e) => setForm({ ...form, slogan: e.target.value })} /></div>
          <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Logo (URL)</Label><Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} /></div>
            <div><Label>Capa (URL)</Label><Input value={form.capa_url} onChange={(e) => setForm({ ...form, capa_url: e.target.value })} /></div>
          </div>
          <div><Label>Cor de destaque</Label><Input type="color" value={form.cor_destaque} onChange={(e) => setForm({ ...form, cor_destaque: e.target.value })} className="h-10 w-24" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Contato</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
            <div><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Instagram</Label><Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} /></div>
            <div><Label>Site</Label><Input value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} /></div>
          </div>
          <div><Label>Endereço</Label><Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
            <div><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Operação</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <div><Label>Taxa (R$)</Label><Input value={form.taxa} onChange={(e) => setForm({ ...form, taxa: e.target.value })} /></div>
          <div><Label>Mínimo (R$)</Label><Input value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} /></div>
          <div><Label>Tempo (min)</Label><Input value={form.tempo} onChange={(e) => setForm({ ...form, tempo: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Financeiro</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div><Label>Chave PIX</Label><Input value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Banco</Label><Input value={form.banco_nome} onChange={(e) => setForm({ ...form, banco_nome: e.target.value })} /></div>
            <div>
              <Label>Tipo de conta</Label>
              <select className="w-full rounded-md border border-input bg-background p-2 text-sm" value={form.banco_tipo} onChange={(e) => setForm({ ...form, banco_tipo: e.target.value })}>
                <option value="corrente">Corrente</option>
                <option value="poupanca">Poupança</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Agência</Label><Input value={form.banco_agencia} onChange={(e) => setForm({ ...form, banco_agencia: e.target.value })} /></div>
            <div><Label>Conta</Label><Input value={form.banco_conta} onChange={(e) => setForm({ ...form, banco_conta: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Titular</Label><Input value={form.banco_titular} onChange={(e) => setForm({ ...form, banco_titular: e.target.value })} /></div>
            <div><Label>CPF/CNPJ titular</Label><Input value={form.banco_documento} onChange={(e) => setForm({ ...form, banco_documento: e.target.value })} /></div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={salvar} disabled={saving} className="w-full" size="lg">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar todas as alterações
      </Button>
    </div>
  );
}
