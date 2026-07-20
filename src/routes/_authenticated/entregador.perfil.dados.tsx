import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMyCourier } from "@/hooks/use-courier";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/entregador/perfil/dados")({
  component: Perfil,
});

function Perfil() {
  const { courier, userId } = useMyCourier();
  const qc = useQueryClient();
  const [f, setF] = useState({
    foto_url: "", telefone: "", whatsapp: "", cpf: "", rg: "",
    cnh: "", cnh_categoria: "", cnh_validade: "",
    pix_key: "", pix_tipo: "cpf",
    banco_nome: "", banco_agencia: "", banco_conta: "", banco_tipo: "corrente", banco_titular: "",
    contato_emergencia_nome: "", contato_emergencia_tel: "",
  });

  useEffect(() => {
    if (!courier) return;
    setF({
      foto_url: courier.foto_url ?? "",
      telefone: courier.telefone ?? "",
      whatsapp: courier.whatsapp ?? "",
      cpf: courier.cpf ?? "",
      rg: courier.rg ?? "",
      cnh: courier.cnh ?? "",
      cnh_categoria: courier.cnh_categoria ?? "",
      cnh_validade: courier.cnh_validade ?? "",
      pix_key: courier.pix_key ?? "",
      pix_tipo: courier.pix_tipo ?? "cpf",
      banco_nome: courier.banco_nome ?? "",
      banco_agencia: courier.banco_agencia ?? "",
      banco_conta: courier.banco_conta ?? "",
      banco_tipo: courier.banco_tipo ?? "corrente",
      banco_titular: courier.banco_titular ?? "",
      contato_emergencia_nome: courier.contato_emergencia_nome ?? "",
      contato_emergencia_tel: courier.contato_emergencia_tel ?? "",
    });
  }, [courier]);

  async function salvar() {
    const { error } = await supabase.from("courier_profiles").update(f).eq("user_id", userId);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
    qc.invalidateQueries({ queryKey: ["courier", userId] });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Meu perfil</h1>

      <Section title="Dados pessoais">
        <Field label="Foto (URL)" value={f.foto_url} onChange={(v) => setF({ ...f, foto_url: v })} />
        <Field label="Telefone" value={f.telefone} onChange={(v) => setF({ ...f, telefone: v })} />
        <Field label="WhatsApp" value={f.whatsapp} onChange={(v) => setF({ ...f, whatsapp: v })} />
        <Field label="CPF" value={f.cpf} onChange={(v) => setF({ ...f, cpf: v })} />
        <Field label="RG" value={f.rg} onChange={(v) => setF({ ...f, rg: v })} />
      </Section>

      <Section title="CNH">
        <Field label="Número" value={f.cnh} onChange={(v) => setF({ ...f, cnh: v })} />
        <Field label="Categoria" value={f.cnh_categoria} onChange={(v) => setF({ ...f, cnh_categoria: v })} />
        <Field label="Validade" type="date" value={f.cnh_validade} onChange={(v) => setF({ ...f, cnh_validade: v })} />
      </Section>

      <Section title="PIX e Banco">
        <Field label="Chave PIX" value={f.pix_key} onChange={(v) => setF({ ...f, pix_key: v })} />
        <Field label="Tipo PIX" value={f.pix_tipo} onChange={(v) => setF({ ...f, pix_tipo: v })} />
        <Field label="Banco" value={f.banco_nome} onChange={(v) => setF({ ...f, banco_nome: v })} />
        <Field label="Agência" value={f.banco_agencia} onChange={(v) => setF({ ...f, banco_agencia: v })} />
        <Field label="Conta" value={f.banco_conta} onChange={(v) => setF({ ...f, banco_conta: v })} />
        <Field label="Titular" value={f.banco_titular} onChange={(v) => setF({ ...f, banco_titular: v })} />
      </Section>

      <Section title="Contato de emergência">
        <Field label="Nome" value={f.contato_emergencia_nome} onChange={(v) => setF({ ...f, contato_emergencia_nome: v })} />
        <Field label="Telefone" value={f.contato_emergencia_tel} onChange={(v) => setF({ ...f, contato_emergencia_tel: v })} />
      </Section>

      <Button size="lg" onClick={salvar}>Salvar alterações</Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <div><Label>{label}</Label><Input type={type} value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}
