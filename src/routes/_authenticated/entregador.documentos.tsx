import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Trash2 } from "lucide-react";
import { useMyCourier } from "@/hooks/use-courier";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/entregador/documentos")({
  component: Docs,
});

type Doc = {
  id: string;
  tipo: string;
  url: string | null;
  status: string;
  motivo_recusa: string | null;
  validade: string | null;
  enviado_em: string;
};

const TIPOS = [
  "cnh_frente",
  "cnh_verso",
  "comprovante_residencia",
  "selfie",
  "selfie_documento",
  "foto_veiculo",
  "foto_placa",
  "documento_veiculo",
];

function Docs() {
  const { courier } = useMyCourier();
  const courierId = courier?.user_id;
  const [docs, setDocs] = useState<Doc[]>([]);
  const [form, setForm] = useState({ tipo: "cnh_frente", url: "", validade: "" });

  const load = useCallback(async () => {
    if (!courierId) return;
    const { data } = await supabase
      .from("courier_documents")
      .select("*")
      .eq("courier_id", courierId)
      .order("enviado_em", { ascending: false });
    setDocs((data ?? []) as Doc[]);
  }, [courierId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function enviar() {
    if (!courierId || !form.url) return toast.error("Informe a URL do documento");
    const { error } = await supabase.from("courier_documents").insert({
      courier_id: courierId,
      tipo: form.tipo,
      url: form.url,
      validade: form.validade || null,
      status: "em_analise",
    });
    if (error) return toast.error(error.message);
    toast.success("Documento enviado para análise");
    setForm({ tipo: "cnh_frente", url: "", validade: "" });
    void load();
  }

  async function remover(id: string) {
    await supabase.from("courier_documents").delete().eq("id", id);
    void load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Documentos</h1>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h2 className="mb-3 font-semibold">Enviar documento</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>URL do arquivo</Label>
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label>Validade (opcional)</Label>
            <Input
              type="date"
              value={form.validade}
              onChange={(e) => setForm({ ...form, validade: e.target.value })}
            />
          </div>
        </div>
        <Button className="mt-3" onClick={enviar}>
          <Plus className="mr-2 h-4 w-4" />
          Enviar
        </Button>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Enviados</h2>
        {docs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Nenhum documento enviado ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <div>
                  <p className="font-semibold capitalize">{d.tipo.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(d.enviado_em).toLocaleDateString("pt-BR")}
                    {d.validade &&
                      ` · Validade ${new Date(d.validade).toLocaleDateString("pt-BR")}`}
                  </p>
                  {d.motivo_recusa && (
                    <p className="mt-1 text-xs text-destructive">Motivo: {d.motivo_recusa}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      d.status === "aprovado"
                        ? "default"
                        : d.status === "recusado"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {d.status}
                  </Badge>
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline"
                    >
                      Ver
                    </a>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => remover(d.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
