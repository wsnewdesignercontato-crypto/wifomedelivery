import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, TicketPercent, Store, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { fmtBRL } from "@/lib/format";
import {
  buildPublishedCampaign,
  emptyPublishedCampaign,
  createCampaignRequestGuard,
  countCurrentCampaignParticipants,
  readAllCampaignRows,
} from "@/lib/coupon-campaign-panels";

export const Route = createFileRoute("/_authenticated/admin/cupons")({
  head: () => ({ meta: [{ title: "Admin — Cupons e campanhas | PedeTrem" }] }),
  component: CuponsPage,
});

type Coupon = Tables<"coupons">;

async function fetchCampaigns() {
  const [coupons, participations] = await Promise.all([
    readAllCampaignRows((from, to) =>
      supabase
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    readAllCampaignRows((from, to) =>
      supabase
        .from("coupon_participations")
        .select("coupon_id,campaign_revision,participating")
        .order("coupon_id")
        .order("establishment_id")
        .range(from, to),
    ),
  ]);
  return { coupons, participations };
}

function CuponsPage() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  return <AdminCampaigns key={user.id} userId={user.id} />;
}

function AdminCampaigns({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyPublishedCampaign);
  const [busy, setBusy] = useState(false);
  const [identityValid, setIdentityValid] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [guard] = useState(createCampaignRequestGuard);
  useEffect(() => {
    guard.reset();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== userId) {
        guard.cancel();
        setIdentityValid(false);
        setOpen(false);
      }
    });
    return () => {
      guard.cancel();
      data.subscription.unsubscribe();
    };
  }, [guard, userId]);
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ["admin-coupon-campaigns", userId],
    queryFn: fetchCampaigns,
    enabled: identityValid,
  });
  const coupons = data?.coupons ?? [];
  const participations = data?.participations ?? [];
  const filtered = coupons.filter((coupon) =>
    coupon.code.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, totalPages - 1);
  const published = coupons.filter((coupon) => coupon.ativo && !coupon.establishment_id);
  const activeParticipationCount = published.reduce(
    (sum, coupon) =>
      sum + countCurrentCampaignParticipants(participations, coupon.id, coupon.campaign_revision),
    0,
  );

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identityValid) return;
    let payload;
    try {
      payload = buildPublishedCampaign(form);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Confira os campos da campanha.");
      return;
    }
    const request = guard.begin();
    if (!request) return;
    setBusy(true);
    setFormError(null);
    try {
      const { error } = await supabase.from("coupons").insert(payload);
      if (!request.isCurrent()) return;
      if (error) {
        setFormError(error.message);
        return;
      }
      setOpen(false);
      setForm(emptyPublishedCampaign);
      toast.success("Cupom publicado. Cada loja decide se deseja participar.");
      await refetch();
    } catch {
      if (request.isCurrent())
        setFormError(
          "Não foi possível confirmar a publicação. Atualize a lista antes de tentar novamente.",
        );
    } finally {
      if (request.isCurrent()) setBusy(false);
      request.finish();
    }
  }

  async function toggle(coupon: Coupon) {
    if (!identityValid) return;
    const request = guard.begin();
    if (!request) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("coupons")
        .update({ ativo: !coupon.ativo })
        .eq("id", coupon.id)
        .select("id");
      if (!request.isCurrent()) return;
      if (error || data?.length !== 1) {
        toast.error(error?.message ?? "Não foi possível alterar o cupom.");
        return;
      }
      toast.success(coupon.ativo ? "Cupom pausado." : "Cupom reativado.");
      await refetch();
    } catch {
      if (request.isCurrent())
        toast.error("Não foi possível confirmar a alteração. Atualize a lista.");
    } finally {
      if (request.isCurrent()) setBusy(false);
      request.finish();
    }
  }

  if (!identityValid)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        A sessão mudou. Atualize a página para continuar.
      </p>
    );

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-red-600">
            Administração PedeTrem
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Cupons e campanhas</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Publique cupons na plataforma. Cada loja aceita ou recusa a campanha e custeia
            integralmente o desconto quando participa.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Atualizar campanhas"
            disabled={isFetching || busy}
            onClick={() => void refetch()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700"
            disabled={busy}
            onClick={() => {
              setFormError(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo cupom
          </Button>
        </div>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <TicketPercent className="mb-3 h-5 w-5 text-red-600" />
          <p className="text-sm text-muted-foreground">Campanhas globais ativas</p>
          <p className="mt-1 text-3xl font-bold">{isPending || isError ? "—" : published.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <Store className="mb-3 h-5 w-5 text-red-600" />
          <p className="text-sm text-muted-foreground">Adesões na revisão vigente</p>
          <p className="mt-1 text-3xl font-bold">
            {isPending || isError ? "—" : activeParticipationCount}
          </p>
        </div>
      </div>
      <section
        className="overflow-hidden rounded-2xl border bg-card"
        aria-label="Campanhas publicadas"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <h2 className="font-semibold">Cupons publicados</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Buscar pelo código"
              className="pl-9"
              placeholder="Buscar código"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
          </div>
        </div>
        {isPending ? (
          <p role="status" className="p-8 text-center text-sm text-muted-foreground">
            Carregando campanhas…
          </p>
        ) : isError ? (
          <div role="alert" className="p-8 text-center">
            <p>Não foi possível carregar os cupons e suas adesões.</p>
            <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {search
              ? "Nenhum código encontrado."
              : "Publique o primeiro cupom para convidar as lojas."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr className="[&>th]:px-5 [&>th]:py-3 [&>th]:text-left">
                    <th scope="col">Cupom</th>
                    <th scope="col">Desconto e condições</th>
                    <th scope="col">Lojas participantes</th>
                    <th scope="col">Usos</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(currentPage * 10, currentPage * 10 + 10).map((coupon) => (
                    <tr key={coupon.id} className="border-b last:border-0 [&>td]:px-5 [&>td]:py-4">
                      <td>
                        <p className="font-mono font-bold">{coupon.code}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {coupon.establishment_id
                            ? "Legado · loja específica"
                            : "Global · adesão por loja"}
                        </p>
                        {coupon.descricao && (
                          <p className="mt-1 max-w-56 break-words text-xs text-muted-foreground">
                            {coupon.descricao}
                          </p>
                        )}
                      </td>
                      <td>
                        <p className="font-semibold text-red-600">
                          {coupon.type === "percent"
                            ? `${coupon.percent}%`
                            : coupon.type === "fixed"
                              ? fmtBRL(coupon.value_cents)
                              : "Frete grátis"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Mínimo:{" "}
                          {coupon.min_order_cents ? fmtBRL(coupon.min_order_cents) : "sem mínimo"}
                          {coupon.max_discount_cents !== null
                            ? ` · teto ${fmtBRL(coupon.max_discount_cents)}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {coupon.expires_at
                            ? `Até ${new Date(coupon.expires_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                            : "Sem data final"}
                        </p>
                      </td>
                      <td className="font-semibold">
                        {coupon.establishment_id
                          ? "—"
                          : countCurrentCampaignParticipants(
                              participations,
                              coupon.id,
                              coupon.campaign_revision,
                            )}
                      </td>
                      <td>
                        {coupon.used_count}
                        {coupon.usage_limit !== null ? ` / ${coupon.usage_limit}` : ""}
                      </td>
                      <td>
                        <Badge
                          variant="secondary"
                          className={
                            coupon.ativo
                              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                              : ""
                          }
                        >
                          {coupon.ativo ? "Ativo" : "Pausado"}
                        </Badge>
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void toggle(coupon)}
                          aria-label={`${coupon.ativo ? "Pausar" : "Reativar"} ${coupon.code}`}
                        >
                          {coupon.ativo ? "Pausar" : "Reativar"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
              <span>
                {filtered.length} cupons · página {currentPage + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage + 1 >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publicar cupom global</DialogTitle>
            <DialogDescription>
              O cupom será liberado para adesão das lojas. Cada participante assume integralmente o
              desconto no próprio repasse.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void publish(event)} className="space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="campaign-code">Código do cupom</Label>
                <Input
                  id="campaign-code"
                  maxLength={50}
                  required
                  autoComplete="off"
                  placeholder="TREM15"
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-2">
                <Label>Desconto percentual</Label>
                <div className="flex gap-2">
                  {[10, 15, 20].map((percent) => (
                    <Button
                      key={percent}
                      type="button"
                      variant={form.percent === String(percent) ? "default" : "outline"}
                      className={
                        form.percent === String(percent) ? "bg-red-600 hover:bg-red-700" : ""
                      }
                      aria-pressed={form.percent === String(percent)}
                      onClick={() => setForm({ ...form, percent: String(percent) })}
                    >
                      {percent}%
                    </Button>
                  ))}
                </div>
                <Label htmlFor="campaign-percent" className="text-xs text-muted-foreground">
                  Ou informe outro percentual (1 a 100%)
                </Label>
                <Input
                  id="campaign-percent"
                  type="number"
                  required
                  min={1}
                  max={100}
                  step={1}
                  value={form.percent}
                  onChange={(event) => setForm({ ...form, percent: event.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-minimum">Pedido mínimo (R$)</Label>
                  <Input
                    id="campaign-minimum"
                    inputMode="decimal"
                    placeholder="Sem mínimo"
                    value={form.minimum}
                    onChange={(event) => setForm({ ...form, minimum: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-maximum">Desconto máximo (R$)</Label>
                  <Input
                    id="campaign-maximum"
                    inputMode="decimal"
                    placeholder="Sem teto adicional"
                    value={form.maximum}
                    onChange={(event) => setForm({ ...form, maximum: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-usage">Limite total de usos</Label>
                  <Input
                    id="campaign-usage"
                    type="number"
                    min={1}
                    max={2147483647}
                    step={1}
                    placeholder="Sem limite"
                    value={form.usageLimit}
                    onChange={(event) => setForm({ ...form, usageLimit: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-expiry">Válido até</Label>
                  <Input
                    id="campaign-expiry"
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-description">Descrição (opcional)</Label>
                <Input
                  id="campaign-description"
                  maxLength={500}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Conte às lojas sobre esta campanha"
                />
              </div>
            </fieldset>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              Publicar o cupom não inscreve nenhuma loja automaticamente. As adesões valem para as
              condições apresentadas.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy} className="bg-red-600 hover:bg-red-700">
                {busy ? "Publicando…" : "Publicar cupom"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
