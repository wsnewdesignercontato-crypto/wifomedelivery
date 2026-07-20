import { useEffect, useState } from "react";
import { Download, FileText, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type WithdrawalRow = {
  id: string;
  valor_cents: number;
  liquido_cents: number | null;
  taxa_cents: number | null;
  metodo: string;
  status: string;
  motivo_recusa: string | null;
  processado_em: string | null;
  comprovante_url: string | null;
  created_at: string;
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  solicitado: { label: "Solicitado", className: "bg-amber-100 text-amber-800 border-amber-200" },
  pendente:   { label: "Solicitado", className: "bg-amber-100 text-amber-800 border-amber-200" },
  aprovado:   { label: "Aprovado",   className: "bg-blue-100 text-blue-800 border-blue-200" },
  pago:       { label: "Pago",       className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  recusado:   { label: "Recusado",   className: "bg-rose-100 text-rose-800 border-rose-200" },
  cancelado:  { label: "Cancelado",  className: "bg-muted text-muted-foreground border-border" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: "" };
  return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>;
}

type Props = {
  table: "courier_withdrawals" | "establishment_withdrawals";
  ownerColumn: "courier_id" | "establishment_id";
  ownerId: string | null | undefined;
  bucket?: string; // for signed URL if comprovante is a storage path
};

export function WithdrawalHistory({ table, ownerColumn, ownerId, bucket }: Props) {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!ownerId) { setRows([]); setLoading(false); return; }
      setLoading(true);
      const query = supabase
        .from(table)
        .select("id,valor_cents,liquido_cents,taxa_cents,metodo,status,motivo_recusa,processado_em,comprovante_url,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      const { data, error } = await (query as unknown as {
        eq: (col: string, val: string) => Promise<{ data: WithdrawalRow[] | null; error: unknown }>;
      }).eq(ownerColumn, ownerId);
      if (!mounted) return;
      if (!error && data) setRows(data as WithdrawalRow[]);
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [table, ownerColumn, ownerId]);

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  async function openComprovante(url: string) {
    if (url.startsWith("http")) {
      window.open(url, "_blank", "noopener");
      return;
    }
    if (!bucket) return;
    const { data } = await supabase.storage.from(bucket).createSignedUrl(url, 60 * 5);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Histórico de saques</h2>
          <p className="text-xs text-muted-foreground">{rows.length} solicitação(ões)</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="solicitado">Solicitado</SelectItem>
            <SelectItem value="aprovado">Aprovado</SelectItem>
            <SelectItem value="pago">Pago</SelectItem>
            <SelectItem value="recusado">Recusado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum saque encontrado.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((w) => (
            <li key={w.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-black">{fmt(w.valor_cents)}</p>
                    <StatusBadge status={w.status} />
                    <Badge variant="secondary" className="uppercase text-[10px]">{w.metodo}</Badge>
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    <p>Solicitado em {new Date(w.created_at).toLocaleString("pt-BR")}</p>
                    {w.processado_em && (
                      <p>Processado em {new Date(w.processado_em).toLocaleString("pt-BR")}</p>
                    )}
                    {w.liquido_cents != null && w.liquido_cents !== w.valor_cents && (
                      <p>Líquido: {fmt(w.liquido_cents)} · Taxa: {fmt(w.taxa_cents ?? 0)}</p>
                    )}
                    {w.status === "recusado" && w.motivo_recusa && (
                      <p className="text-rose-600">Motivo: {w.motivo_recusa}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {w.comprovante_url ? (
                    <Button size="sm" variant="outline" onClick={() => openComprovante(w.comprovante_url!)}>
                      <FileText className="mr-2 h-4 w-4" /> Comprovante
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </Button>
                  ) : w.status === "pago" ? (
                    <span className="text-xs text-muted-foreground">Comprovante indisponível</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Aguardando</span>
                  )}
                  <code className="text-[10px] text-muted-foreground">#{w.id.slice(0, 8)}</code>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {filtered.length > 0 && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Download className="h-3 w-3" /> Os comprovantes ficam disponíveis assim que o pagamento for concluído pelo financeiro.
        </p>
      )}
    </div>
  );
}
