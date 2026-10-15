import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { IFomeLogo } from "@/components/ifome-logo";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({ meta: [{ title: "Minha equipe | PedeTrem" }] }),
  component: TeamWorkspace,
});
const membership = z.object({ id: z.string(), establishment: z.string(), role: z.string() });
const workspaceSchema = z.object({
  invites: z.array(membership),
  memberships: z.array(membership),
  orders: z.array(
    z.object({
      id: z.string(),
      establishment: z.string(),
      status: z.string(),
      created_at: z.string(),
      tipo_entrega: z.string(),
      items: z.array(z.object({ nome: z.string(), quantidade: z.number() })),
    }),
  ),
});
function TeamWorkspace() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [accepting, setAccepting] = useState<string | null>(null);
  const key = ["team-workspace", user.id];
  const { data, isPending, error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await supabase.rpc("my_team_workspace");
      if (res.error) throw new Error(res.error.message);
      return workspaceSchema.parse(res.data);
    },
    refetchInterval: 30000,
  });
  async function accept(id: string) {
    setAccepting(id);
    try {
      const res = await supabase.rpc("accept_team_invitation", { p_invitation: id });
      if (res.error) throw new Error(res.error.message);
      await qc.invalidateQueries({ queryKey: key });
      toast.success("Convite aceito");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível aceitar");
    } finally {
      setAccepting(null);
    }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <IFomeLogo size="sm" />
      <Link to="/app" className="block text-sm text-primary">
        Voltar aos meus perfis
      </Link>
      <h1 className="text-2xl font-bold">Minha equipe</h1>
      <p className="text-sm text-muted-foreground">
        Aceite convites com o e-mail confirmado da sua conta. O acesso da equipe permite consultar
        pedidos, sem alterar pagamentos ou configurações da loja.
      </p>
      {isPending ? (
        <p role="status">Carregando equipe…</p>
      ) : error ? (
        <div role="alert">
          <p>{error.message}</p>
          <Button onClick={() => void qc.invalidateQueries({ queryKey: key })}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold">Convites</h2>
            {data.invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum convite pendente para este e-mail confirmado.
              </p>
            ) : (
              data.invites.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-xl border p-4">
                  <div>
                    <p>{i.establishment}</p>
                    <p className="text-xs text-muted-foreground">{i.role} · consulta de pedidos</p>
                  </div>
                  <Button disabled={!!accepting} onClick={() => void accept(i.id)}>
                    {accepting === i.id ? "Aceitando…" : "Aceitar convite"}
                  </Button>
                </div>
              ))
            )}
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Pedidos das minhas equipes</h2>
            {data.memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aceite um convite para consultar os pedidos da loja.
              </p>
            ) : data.orders.length === 0 ? (
              <p>Nenhum pedido disponível.</p>
            ) : (
              data.orders.map((o) => (
                <article key={o.id} className="rounded-xl border p-4">
                  <h3 className="font-semibold">
                    {o.establishment} · #{o.id.slice(0, 8)}
                  </h3>
                  <p className="text-sm">
                    {o.status} · {new Date(o.created_at).toLocaleString("pt-BR")}
                  </p>
                  <ul className="mt-2 text-sm">
                    {o.items.map((i, n) => (
                      <li key={n}>
                        {i.quantidade} × {i.nome}
                      </li>
                    ))}
                  </ul>
                </article>
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
