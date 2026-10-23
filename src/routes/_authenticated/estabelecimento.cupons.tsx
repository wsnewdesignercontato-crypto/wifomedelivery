import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { TicketPercent, Check, RefreshCw, Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab } from "@/hooks/use-my-estab";
import { fmtBRL } from "@/lib/format";
import {
  createCampaignRequestGuard,
  parseMerchantCampaigns,
  parseParticipationResult,
  type MerchantCampaign,
} from "@/lib/coupon-campaign-panels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/estabelecimento/cupons")({
  head: () => ({ meta: [{ title: "Cupons e campanhas | PedeTrem" }] }),
  component: CuponsPage,
});

function CuponsPage() {
  const { estab, userId, isLoading } = useMyEstab();
  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando sua loja…</p>;
  if (!estab || estab.owner_id !== userId) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Não foi possível identificar sua loja. Atualize a página.
      </p>
    );
  }
  return (
    <MerchantCampaigns key={`${userId}:${estab.id}`} establishmentId={estab.id} userId={userId} />
  );
}

function MerchantCampaigns({
  establishmentId,
  userId,
}: {
  establishmentId: string;
  userId: string;
}) {
  const [selected, setSelected] = useState<MerchantCampaign | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [identityValid, setIdentityValid] = useState(true);
  const [guard] = useState(createCampaignRequestGuard);
  useEffect(() => {
    guard.reset();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== userId) {
        guard.cancel();
        setIdentityValid(false);
        setSelected(null);
      }
    });
    return () => {
      guard.cancel();
      data.subscription.unsubscribe();
    };
  }, [guard, userId]);

  const {
    data = [],
    isPending,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["merchant-coupon-campaigns", userId, establishmentId],
    enabled: identityValid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_coupon_campaigns", {
        p_establishment_id: establishmentId,
      });
      if (error) throw error;
      return parseMerchantCampaigns(data);
    },
  });
  const campaigns = data.filter(
    (campaign) => campaign.available || campaign.participating || campaign.requires_reacceptance,
  );

  async function changeParticipation(campaign: MerchantCampaign, participating: boolean) {
    if (!identityValid) return;
    const current = data.find((item) => item.id === campaign.id);
    if (
      !current ||
      current.campaign_revision !== campaign.campaign_revision ||
      (participating && !current.available)
    ) {
      setSelected(null);
      toast.error("As condições mudaram. Atualize e confira a campanha antes de aderir.");
      void refetch();
      return;
    }
    const request = guard.begin();
    if (!request) return;
    setPendingId(campaign.id);
    try {
      const { data: result, error } = await supabase.rpc("set_coupon_participation", {
        p_establishment_id: establishmentId,
        p_coupon_id: campaign.id,
        p_revision: campaign.campaign_revision,
        p_participating: participating,
      });
      if (!request.isCurrent()) return;
      if (error) throw error;
      parseParticipationResult(result, campaign.campaign_revision, participating);
      setSelected(null);
      toast.success(
        participating ? "Adesão confirmada para sua loja." : "Sua loja saiu da campanha.",
      );
      await refetch();
    } catch (error) {
      if (!request.isCurrent()) return;
      setSelected(null);
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível confirmar a alteração. Confira a campanha novamente.",
      );
      await refetch();
    } finally {
      if (request.isCurrent()) setPendingId(null);
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
            Campanhas PedeTrem
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Cupons e campanhas</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Escolha os cupons da plataforma que sua loja aceita. A adesão é individual e você pode
            sair quando quiser.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={isFetching || pendingId !== null}
          onClick={() => void refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </header>
      <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
        <Store className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">A decisão de participar é da sua loja</p>
          <p className="mt-1">
            O desconto é custeado pela sua loja e reduz seu repasse; comissão segue regras
            existentes.
          </p>
        </div>
      </div>
      {isPending ? (
        <p className="p-6 text-sm text-muted-foreground" role="status">
          Carregando campanhas…
        </p>
      ) : isError ? (
        <div role="alert" className="rounded-2xl border p-6">
          <p>Não foi possível carregar as campanhas.</p>
          <Button className="mt-3" variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <TicketPercent className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="font-semibold">Nenhuma campanha disponível</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Os cupons liberados pela administração aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {campaigns.map((campaign) => (
            <article
              key={campaign.id}
              className="flex flex-col rounded-2xl border bg-card p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-lg font-bold tracking-wide">{campaign.code}</span>
                <Badge
                  variant={campaign.participating ? "default" : "secondary"}
                  className={campaign.participating ? "bg-emerald-700 text-white" : ""}
                >
                  {campaign.participating ? (
                    <>
                      <Check className="mr-1 h-3 w-3" />
                      Sua loja participa
                    </>
                  ) : campaign.requires_reacceptance ? (
                    "Nova adesão necessária"
                  ) : (
                    "Adesão opcional"
                  )}
                </Badge>
              </div>
              <p className="mt-4 text-3xl font-bold text-red-600">{discountLabel(campaign)}</p>
              {campaign.descricao && (
                <p className="mt-2 break-words text-sm text-muted-foreground">
                  {campaign.descricao}
                </p>
              )}
              <CampaignTerms campaign={campaign} />
              {campaign.requires_reacceptance && (
                <p className="mt-4 text-sm font-medium text-amber-700 dark:text-amber-400">
                  As condições foram alteradas. Confira os termos e confirme uma nova adesão.
                </p>
              )}
              {!campaign.available && (
                <p className="mt-4 text-sm text-muted-foreground">
                  Campanha indisponível para novas adesões ou usos.
                </p>
              )}
              <div className="mt-auto pt-5">
                {campaign.participating ? (
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={pendingId !== null}
                    onClick={() => void changeParticipation(campaign, false)}
                  >
                    {pendingId === campaign.id ? "Salvando…" : "Sair da campanha"}
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-red-600 hover:bg-red-700 sm:w-auto"
                    disabled={pendingId !== null || !campaign.available || isFetching}
                    onClick={() => setSelected(campaign)}
                  >
                    Conferir e aderir
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !pendingId) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Confirmar adesão {selected ? `ao ${selected.code}` : "à campanha"}
            </DialogTitle>
            <DialogDescription>
              Ao confirmar, sua loja passa a aceitar este cupom nas condições abaixo.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <p className="text-2xl font-bold text-red-600">{discountLabel(selected)}</p>
              <CampaignTerms campaign={selected} />
            </>
          )}
          <p className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-950 dark:bg-red-950/30 dark:text-red-100">
            O desconto é custeado pela sua loja e reduz seu repasse; comissão segue regras
            existentes.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pendingId !== null}
              onClick={() => setSelected(null)}
            >
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={pendingId !== null || isFetching}
              onClick={() => {
                if (selected) void changeParticipation(selected, true);
              }}
            >
              {pendingId ? "Confirmando…" : "Confirmar adesão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function discountLabel(campaign: MerchantCampaign) {
  return campaign.type === "percent"
    ? `${campaign.percent}% de desconto`
    : campaign.type === "fixed"
      ? `${fmtBRL(campaign.value_cents)} de desconto`
      : "Frete grátis";
}

function CampaignTerms({ campaign }: { campaign: MerchantCampaign }) {
  return (
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground">Pedido mínimo</dt>
        <dd className="font-medium">
          {campaign.min_order_cents ? fmtBRL(campaign.min_order_cents) : "Sem mínimo"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Desconto máximo</dt>
        <dd className="font-medium">
          {campaign.max_discount_cents !== null
            ? fmtBRL(campaign.max_discount_cents)
            : "Sem teto adicional"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Validade</dt>
        <dd className="font-medium">
          {campaign.expires_at
            ? new Date(campaign.expires_at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })
            : "Sem data final"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Usos na plataforma</dt>
        <dd className="font-medium">
          {campaign.used_count}
          {campaign.usage_limit !== null ? ` de ${campaign.usage_limit}` : " · sem limite"}
        </dd>
      </div>
      {campaign.starts_at && (
        <div>
          <dt className="text-muted-foreground">Início</dt>
          <dd className="font-medium">
            {new Date(campaign.starts_at).toLocaleString("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </dd>
        </div>
      )}
    </dl>
  );
}
