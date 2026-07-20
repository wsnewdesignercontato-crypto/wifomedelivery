import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Ban, CheckCircle2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { dateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  component: ClientesPage,
});

type Cliente = {
  id: string;
  nome: string | null;
  telefone: string | null;
  foto_url: string | null;
  created_at: string;
};

async function fetchClientes() {
  const { data: cliRoles, error: rerr } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "cliente");
  if (rerr) throw rerr;
  const ids = (cliRoles ?? []).map((r) => r.user_id);
  if (ids.length === 0) return [] as Cliente[];
  const { data, error } = await supabase
    .from("profiles")
    .select("id,nome,telefone,foto_url,created_at")
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Cliente[];
}

async function fetchBlocked() {
  const { data } = await supabase.from("user_roles").select("user_id,role").eq("role", "cliente");
  return new Set(((data ?? []) as { user_id: string }[]).map((d) => d.user_id));
}

function ClientesPage() {
  const [q, setQ] = useState("");
  const { data: clientes, isLoading } = useQuery({
    queryKey: ["admin-clientes"],
    queryFn: fetchClientes,
  });
  const qc = useQueryClient();

  const filtered = (clientes ?? []).filter((c) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (c.nome ?? "").toLowerCase().includes(s) || (c.telefone ?? "").includes(s);
  });

  async function toggleBlock(userId: string, block: boolean) {
    if (block) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "cliente");
      if (error) return toast.error("Falha ao bloquear");
      toast.success("Perfil cliente removido");
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "cliente" });
      if (error) return toast.error("Falha ao restaurar");
      toast.success("Perfil cliente restaurado");
    }
    await supabase.from("admin_audit_log").insert({
      admin_id: (await supabase.auth.getUser()).data.user!.id,
      action: block ? "block_cliente" : "unblock_cliente",
      entity_type: "user",
      entity_id: userId,
    });
    qc.invalidateQueries({ queryKey: ["admin-clientes"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Users className="h-6 w-6 text-primary" /> Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            {clientes?.length ?? 0} cliente(s) cadastrado(s).
          </p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou telefone" className="pl-9" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Cadastro</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={4} className="px-4 py-3">
                      <div className="h-8 animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-sm font-semibold text-primary">
                        {(c.nome ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{c.nome || "Sem nome"}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{c.id.slice(0, 8)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.telefone || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{dateShort(c.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleBlock(c.id, true)}
                      className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Ban className="mr-1.5 h-3.5 w-3.5" /> Bloquear
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

void fetchBlocked;
void CheckCircle2;
