import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Bike, RefreshCw, Smartphone, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAppInstallMetrics } from "@/lib/app-install.functions";

export const Route = createFileRoute("/_authenticated/admin/aplicativos")({
  head: () => ({ meta: [{ title: "Admin — Aplicativos | PedeTrem" }] }),
  component: AdminApplications,
});

const profiles = {
  cliente: {
    label: "Cliente",
    icon: Users,
    color: "bg-red-500",
    tone: "text-red-600 bg-red-500/10",
  },
  estabelecimento: {
    label: "Estabelecimento",
    icon: Store,
    color: "bg-orange-500",
    tone: "text-orange-600 bg-orange-500/10",
  },
  entrega: {
    label: "Entrega",
    icon: Bike,
    color: "bg-emerald-500",
    tone: "text-emerald-600 bg-emerald-500/10",
  },
};
const number = new Intl.NumberFormat("pt-BR");
const formatDate = (value: string) => new Date(value).toLocaleString("pt-BR");

function AdminApplications() {
  const getMetrics = useServerFn(getAppInstallMetrics);
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["admin-app-install-metrics"],
    queryFn: () => getMetrics(),
    refetchInterval: 60_000,
  });
  const ranked = [...(data?.apps ?? [])].sort(
    (a, b) => b.activeInstalls - a.activeInstalls || b.historicalInstalls - a.historicalInstalls,
  );
  const maximum = Math.max(0, ...ranked.map((app) => app.activeInstalls));
  const historicalTotal = ranked.reduce((total, app) => total + app.historicalInstalls, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Smartphone className="h-6 w-6 text-primary" />
            Aplicativos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe as instalações dos três aplicativos PedeTrem.
          </p>
          {data && (
            <p className="mt-2 text-xs text-muted-foreground">
              Última atualização: {formatDate(data.updatedAt)}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {isFetching ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>

      {isError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          Não foi possível atualizar as instalações. Tente novamente.
        </p>
      )}
      {isPending && (
        <p role="status" className="py-8 text-center text-muted-foreground">
          Carregando instalações…
        </p>
      )}
      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {data.apps.map((app) => {
              const profile = profiles[app.appType];
              const Icon = profile.icon;
              return (
                <section
                  key={app.appType}
                  className="rounded-2xl border border-border bg-card p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">Aplicativo {profile.label}</h2>
                    <span className={`rounded-xl p-2.5 ${profile.tone}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-4 text-3xl font-bold tabular-nums">
                    {number.format(app.activeInstalls)}
                  </p>
                  <p className="text-sm text-muted-foreground">Instalações ativas observadas</p>
                  <dl className="mt-4 space-y-2 border-t pt-4 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Histórico de instalações</dt>
                      <dd className="font-medium tabular-nums">
                        {number.format(app.historicalInstalls)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Contas identificadas</dt>
                      <dd className="font-medium tabular-nums">
                        {number.format(app.identifiedAccounts)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-4 text-xs text-muted-foreground">
                    {app.lastObservedAt
                      ? `Última observação: ${formatDate(app.lastObservedAt)}`
                      : "Nenhuma instalação observada."}
                  </p>
                </section>
              );
            })}
          </div>

          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b p-5">
              <h2 className="font-semibold">Ranking de instalações</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ordenado pelas instalações ativas observadas; o histórico desempata.
              </p>
            </div>
            {historicalTotal === 0 && (
              <p className="px-5 pt-5 text-sm text-muted-foreground">
                Ainda não há instalações registradas. Os números serão atualizados quando um
                aplicativo enviar uma confirmação de instalação.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="p-4">Posição</th>
                    <th className="p-4">Aplicativo</th>
                    <th className="p-4 text-right">Instalações ativas</th>
                    <th className="p-4 text-right">Histórico</th>
                    <th className="p-4 text-right">Contas identificadas</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((app) => {
                    const profile = profiles[app.appType];
                    const firstTie = ranked.findIndex(
                      (item) =>
                        item.activeInstalls === app.activeInstalls &&
                        item.historicalInstalls === app.historicalInstalls,
                    );
                    return (
                      <tr key={app.appType} className="border-t">
                        <td className="p-4 text-muted-foreground">
                          {app.historicalInstalls === 0 ? "—" : `${firstTie + 1}º`}
                        </td>
                        <th scope="row" className="min-w-48 p-4 text-left font-medium">
                          {profile.label}
                          <div
                            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                            aria-hidden="true"
                          >
                            <div
                              className={`h-full rounded-full ${profile.color}`}
                              style={{
                                width: `${maximum > 0 ? (app.activeInstalls / maximum) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </th>
                        <td className="p-4 text-right tabular-nums">
                          {number.format(app.activeInstalls)}
                        </td>
                        <td className="p-4 text-right tabular-nums">
                          {number.format(app.historicalInstalls)}
                        </td>
                        <td className="p-4 text-right tabular-nums">
                          {number.format(app.identifiedAccounts)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
            Instalações são observações enviadas pelo navegador, separadas por aplicativo e
            aparelho. Limpar os dados do navegador pode gerar outra instalação. O histórico inclui
            instalações já observadas mesmo quando deixam de estar ativas. Contas identificadas são
            contas distintas que confirmaram uma instalação após entrar; não representam o total de
            pessoas.
          </p>
        </>
      )}
    </div>
  );
}
