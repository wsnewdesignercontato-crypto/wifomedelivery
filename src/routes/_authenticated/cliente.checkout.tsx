import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { missingCheckoutDetails } from "@/lib/customer-access";
import { PROFILE_UPDATED_EVENT } from "@/lib/app-refresh";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  CreditCard,
  Banknote,
  QrCode,
  Bike,
  Store,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { placeOrder, quoteOrder, type CheckoutQuoteInput } from "@/lib/checkout.functions";
import {
  getOnlinePaymentAvailability,
  startOnlineOrder,
  listSavedCards,
  removeSavedCard,
} from "@/lib/asaas-payment.functions";
import type { CardOptions, SavedCard } from "@/lib/saved-cards";
import { IFomeLogo } from "@/components/ifome-logo";
import { CheckoutSummary, type CheckoutSummaryItem } from "@/components/checkout/checkout-summary";
import { SavedCheckoutAddresses } from "@/components/checkout/saved-checkout-addresses";
import { OnlinePaymentForm } from "@/components/checkout/online-payment-form";
import type { PayerInput, CardInput } from "@/lib/asaas-payment-contract";
import {
  checkoutFailure,
  checkoutQuoteReducer,
  currentCheckoutQuote,
  initialCheckoutQuote,
} from "@/lib/commerce";

const searchSchema = z.object({ cupom: z.string().optional() });

export const Route = createFileRoute("/_authenticated/cliente/checkout")({
  head: () => ({
    meta: [
      { title: "Cliente — Finalizar pedido | PedeTrem" },
      { name: "description", content: "PedeTrem: cliente, finalizar pedido." },
      { property: "og:title", content: "Cliente — Finalizar pedido | PedeTrem" },
      { property: "og:description", content: "PedeTrem: cliente, finalizar pedido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: searchSchema,
  component: CheckoutPage,
});

type Addr = {
  id: string;
  label: string;
  rua: string;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  estado: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
};
type Estab = { id: string; nome: string; taxa_entrega_cents: number; pedido_minimo_cents: number };

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Pay = "pix" | "cartao" | "dinheiro";
const PAYS: { key: Pay; label: string; Icon: typeof QrCode }[] = [
  { key: "pix", label: "Pix na entrega", Icon: QrCode },
  { key: "cartao", label: "Cartão na entrega", Icon: CreditCard },
  { key: "dinheiro", label: "Dinheiro", Icon: Banknote },
];

function CheckoutPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const search = Route.useSearch();
  const navigate = useNavigate();
  const call = useServerFn(placeOrder);
  const callQuote = useServerFn(quoteOrder);
  const onlineAvailability = useServerFn(getOnlinePaymentAvailability);
  const callOnline = useServerFn(startOnlineOrder);
  const callSavedCards = useServerFn(listSavedCards);
  const callRemoveCard = useServerFn(removeSavedCard);
  const [onlineAvailable, setOnlineAvailable] = useState(false);
  const [online, setOnline] = useState(false);
  const submitLock = useRef(false);
  const identity = useRef(user.id);
  identity.current = user.id;
  useEffect(() => {
    let active = true;
    setOnline(false);
    setOnlineAvailable(false);
    void onlineAvailability()
      .then((value) => {
        if (active) setOnlineAvailable(value.enabled);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [onlineAvailability, user.id]);
  const checkoutAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const quoteSequence = useRef(0);
  const [quoteState, updateQuote] = useReducer(checkoutQuoteReducer, initialCheckoutQuote);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [uncertainAttempt, setUncertainAttempt] = useState<string | null>(null);

  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [addrId, setAddrId] = useState<string | null>(null);
  const [pagto, setPagto] = useState<Pay>("pix");
  const [tipoEntrega, setTipoEntrega] = useState<"delivery" | "pickup">("delivery");
  const [obs, setObs] = useState("");
  const [testMode, setTestMode] = useState<boolean | null>(null);
  const [estab, setEstab] = useState<Estab | null>(null);
  const [cartFingerprint, setCartFingerprint] = useState("");
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState<string | null>(null);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const missing = useMemo(() => missingCheckoutDetails(phone, addrs), [phone, addrs]);
  useEffect(() => {
    if (!loading && detailsLoaded && estab) setDetailsOpen(missing.length > 0);
  }, [loading, detailsLoaded, estab, missing]);
  const [enviando, setEnviando] = useState(false);
  const [cardsState, setCardsState] = useState<{
    userId: string;
    cards: SavedCard[];
    loading: boolean;
    error: string | null;
  }>({ userId: user.id, cards: [], loading: false, error: null });
  const [cardsRevision, setCardsRevision] = useState(0);
  const [pendingRemoval, setPendingRemoval] = useState<{ userId: string; card: SavedCard } | null>(
    null,
  );
  const [removingCard, setRemovingCard] = useState(false);
  const [summaryItems, setSummaryItems] = useState<{
    userId: string;
    items: CheckoutSummaryItem[];
  }>({ userId: user.id, items: [] });
  const checkoutItems = summaryItems.userId === user.id ? summaryItems.items : [];
  const removalLock = useRef(false);
  const savedCards = cardsState.userId === user.id ? cardsState.cards : [];
  const removalCard = pendingRemoval?.userId === user.id ? pendingRemoval.card : null;
  useEffect(() => {
    if (!online || pagto !== "cartao" || !onlineAvailable || testMode) return;
    let active = true;
    const requestedUser = user.id;
    setCardsState({ userId: requestedUser, cards: [], loading: true, error: null });
    void callSavedCards({ data: undefined })
      .then((cards) => {
        if (active && identity.current === requestedUser)
          setCardsState({ userId: requestedUser, cards, loading: false, error: null });
      })
      .catch(() => {
        if (active && identity.current === requestedUser)
          setCardsState({
            userId: requestedUser,
            cards: [],
            loading: false,
            error: "Não foi possível carregar seus cartões salvos. Você pode usar um novo cartão.",
          });
      });
    return () => {
      active = false;
    };
  }, [online, pagto, onlineAvailable, testMode, user.id, cardsRevision, callSavedCards]);

  async function confirmCardRemoval() {
    if (
      !removalCard ||
      !pendingRemoval ||
      pendingRemoval.userId !== identity.current ||
      removalLock.current ||
      enviando
    )
      return;
    removalLock.current = true;
    setRemovingCard(true);
    const requestedUser = pendingRemoval.userId;
    try {
      await callRemoveCard({ data: { id: removalCard.id } });
      if (identity.current !== requestedUser) return;
      setCardsState((current) =>
        current.userId === requestedUser
          ? { ...current, cards: current.cards.filter((card) => card.id !== removalCard.id) }
          : current,
      );
      setPendingRemoval(null);
      toast.success("Cartão removido.");
    } catch {
      if (identity.current === requestedUser)
        toast.error("Não foi possível remover o cartão. Tente novamente.");
    } finally {
      removalLock.current = false;
      setRemovingCard(false);
    }
  }

  useEffect(() => {
    let active = true;
    let sequence = 0;
    const reload = async () => {
      const request = ++sequence;
      const [a, c, profile] = await Promise.all([
        supabase
          .from("addresses")
          .select("*")
          .eq("user_id", user.id)
          .order("is_default", { ascending: false }),
        supabase
          .from("cart_items")
          .select("id,updated_at,preco_unit_cents,quantidade,establishment_id,nome_snapshot")
          .eq("user_id", user.id),
        supabase.from("profiles").select("telefone").eq("id", user.id).single(),
      ]);
      if (!active || request !== sequence) return;
      if (a.error || c.error || profile.error) {
        setDetailsLoaded(false);
        setLoadError("Não foi possível carregar seus dados e carrinho. Tente novamente.");
        toast.error(
          a.error?.message ??
            c.error?.message ??
            profile.error?.message ??
            "Falha ao carregar checkout",
        );
        setLoading(false);
        return;
      }
      const arr = (a.data ?? []) as Addr[];
      setLoadError(null);
      setAddrs(arr);
      setPhone(profile.data.telefone);
      setDetailsLoaded(true);
      setAddrId((current) =>
        arr.some((address) => address.id === current) ? current : (arr[0]?.id ?? null),
      );
      const ci = c.data ?? [];
      const storeItems = ci.filter((item) => item.establishment_id === ci[0]?.establishment_id);
      setSummaryItems({
        userId: user.id,
        items: storeItems.map((item) => ({
          id: item.id,
          name: item.nome_snapshot,
          quantity: item.quantidade,
        })),
      });
      setCartFingerprint(
        JSON.stringify(
          storeItems.map((item) => [item.id, item.updated_at, item.quantidade]).sort(),
        ),
      );
      if (ci[0]) {
        const { data: e, error: storeError } = await supabase
          .from("establishments")
          .select("id,nome,taxa_entrega_cents,pedido_minimo_cents")
          .eq("id", ci[0].establishment_id)
          .maybeSingle();
        if (!active || request !== sequence) return;
        if (storeError) {
          toast.error(storeError.message);
          setLoadError("Não foi possível carregar a loja. Tente novamente.");
        }
        const mode = await supabase.rpc("customer_payment_test_context", {
          p_store: ci[0].establishment_id,
        });
        if (!active || request !== sequence) return;
        if (mode.error) {
          setTestMode(null);
          setLoadError("Não foi possível conferir o modo de pagamento. Tente novamente.");
        } else {
          const enabled = z.object({ enabled: z.boolean() }).parse(mode.data).enabled;
          setTestMode(enabled);
          if (enabled) setPagto((pay) => (pay === "dinheiro" ? "pix" : pay));
        }
        setEstab(e as Estab | null);
      } else {
        const pending = await supabase
          .from("orders")
          .select("id")
          .eq("cliente_id", user.id)
          .eq("status", "pending_payment")
          .eq("payment_channel", "asaas")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!active || request !== sequence) return;
        if (pending.data) {
          void navigate({ to: "/cliente/pedido/$id", params: { id: pending.data.id } });
          return;
        }
        setEstab(null);
      }
      setLoading(false);
    };
    void reload();
    const refresh = () => {
      void reload();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener(PROFILE_UPDATED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user.id, navigate]);

  const checkoutData = useMemo<Omit<CheckoutQuoteInput, "idempotency_key"> | null>(() => {
    const addr = addrs.find((address) => address.id === addrId);
    if (!estab || (tipoEntrega === "delivery" && !addr)) return null;
    return {
      establishment_id: estab.id,
      forma_pagamento: pagto,
      tipo_entrega: tipoEntrega,
      endereco:
        tipoEntrega === "pickup" || !addr
          ? null
          : {
              label: addr.label,
              rua: addr.rua,
              numero: addr.numero,
              complemento: addr.complemento,
              bairro: addr.bairro,
              cidade: addr.cidade,
              estado: addr.estado,
              cep: addr.cep,
              lat: addr.lat,
              lng: addr.lng,
            },
      observacoes: obs || null,
      coupon_code: search.cupom ?? null,
    };
  }, [estab, addrs, addrId, tipoEntrega, pagto, obs, search.cupom]);
  const quoteFingerprint = JSON.stringify({ checkoutData, cartFingerprint });
  const currentQuote = currentCheckoutQuote(quoteState, quoteFingerprint);
  const quoteError = quoteState.fingerprint === quoteFingerprint ? quoteState.error : null;

  useEffect(() => {
    if (!checkoutData) return;
    const requestId = ++quoteSequence.current;
    updateQuote({ type: "start", requestId, fingerprint: quoteFingerprint });
    let cancelled = false;
    const timer = setTimeout(() => {
      void callQuote({ data: { ...checkoutData, idempotency_key: crypto.randomUUID() } })
        .then((quote) => {
          if (!cancelled)
            updateQuote({ type: "success", requestId, fingerprint: quoteFingerprint, quote });
        })
        .catch((error: unknown) => {
          if (!cancelled)
            updateQuote({
              type: "error",
              requestId,
              fingerprint: quoteFingerprint,
              error: error instanceof Error ? error.message : "Não foi possível conferir o pedido",
            });
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checkoutData, quoteFingerprint, quoteRevision, callQuote]);

  function refreshQuote() {
    updateQuote({
      type: "start",
      requestId: ++quoteSequence.current,
      fingerprint: quoteFingerprint,
    });
    setQuoteRevision((revision) => revision + 1);
  }

  async function confirmar(payment?: {
    payer: PayerInput;
    card?: CardInput;
    cardOptions?: CardOptions;
  }) {
    if (!detailsLoaded || missing.length) {
      setDetailsOpen(true);
      return;
    }
    if (!checkoutData || !currentQuote || submitLock.current || enviando || testMode === null)
      return;
    if (online && (!onlineAvailable || testMode)) return;
    submitLock.current = true;
    const submittedUser = user.id;
    setEnviando(true);
    try {
      const expected_total_cents = currentQuote.total_cents;
      const fingerprint = JSON.stringify({
        checkoutData,
        cartFingerprint,
        expected_total_cents,
        testMode,
        channel: online ? "asaas" : "delivery",
      });
      const storageKey = `wifome-pending-checkout-${user.id}`;
      let attempt = checkoutAttempt.current;
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as unknown;
        if (
          saved &&
          typeof saved === "object" &&
          "fingerprint" in saved &&
          saved.fingerprint === fingerprint &&
          "key" in saved &&
          typeof saved.key === "string" &&
          z.string().uuid().safeParse(saved.key).success
        ) {
          attempt = { fingerprint, key: saved.key };
        }
      } catch {
        /* Memory also preserves retries when browser storage is unavailable. */
      }
      if (attempt?.fingerprint !== fingerprint) attempt = { fingerprint, key: crypto.randomUUID() };
      checkoutAttempt.current = attempt;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(attempt));
      } catch {
        /* Optional persistence. */
      }
      if (online) {
        const view = await callOnline({
          data: {
            checkout: {
              ...checkoutData,
              expected_total_cents,
              idempotency_key: attempt.key,
              test_mode: false,
            },
            payer: payment?.payer,
            card: payment?.card,
            cardOptions: payment?.cardOptions,
          },
        });
        if (identity.current !== submittedUser) return;
        if (view.cardSaveStatus === "unavailable")
          toast.info(
            "Pagamento processado, mas não foi possível salvar o cartão. Você poderá informar os dados na próxima compra.",
          );
        sessionStorage.removeItem(storageKey);
        checkoutAttempt.current = null;
        await navigate({ to: "/cliente/pedido/$id", params: { id: view.orderId } });
        return;
      }
      const res = await call({
        data: {
          ...checkoutData,
          expected_total_cents,
          idempotency_key: attempt.key,
          test_mode: testMode,
        },
      });
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Optional persistence. */
      }
      checkoutAttempt.current = null;
      toast.success(`Pedido realizado! Total: ${fmt(res.total_cents)}`);
      navigate({ to: "/cliente/pedido/$id", params: { id: res.order_id } });
    } catch (e) {
      const failure = checkoutFailure(e instanceof Error ? e.message : "");
      if (failure.message.includes("CUSTOMER_DETAILS_REQUIRED")) {
        setDetailsOpen(true);
        setDetailsLoaded(false);
      }
      toast.error(failure.message);
      if (failure.refreshQuote) {
        setUncertainAttempt(null);
        refreshQuote();
      } else setUncertainAttempt(quoteFingerprint);
    } finally {
      submitLock.current = false;
      setEnviando(false);
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  if (loadError)
    return (
      <div role="alert" className="space-y-3">
        <p>{loadError}</p>
        <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
      </div>
    );
  if (!estab) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">Carrinho vazio.</p>
        <Button className="mt-4" onClick={() => navigate({ to: "/cliente" })}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-3xl bg-background text-foreground [--background:#faf9f7] [--card:#ffffff] [--card-foreground:#20242b] [--foreground:#20242b] [--muted:#f4f4f5] [--muted-foreground:#626b76] [--border:#e5e7eb] [--input:#dce0e5]">
      <header className="space-y-5 border-b border-border/70 px-4 py-6 sm:px-7 sm:py-8">
        <div className="flex items-center justify-between gap-4">
          <IFomeLogo perfil="cliente" size="sm" />
          <Link
            to="/cliente/carrinho"
            className="inline-flex min-h-10 items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary sm:text-sm"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao carrinho
          </Link>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Quase na sua mesa
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Finalizar pedido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Confira os detalhes e escolha como quer pagar.
          </p>
        </div>
      </header>
      <div className="grid min-w-0 gap-6 px-4 py-6 sm:px-7 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)] lg:items-start lg:gap-8">
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1">
          <div className="flex items-center gap-3 rounded-3xl border border-border/70 bg-card p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted">
              <ShoppingBag className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Seu pedido em</p>
              <p className="break-words text-base font-semibold tracking-tight">{estab.nome}</p>
            </div>
          </div>
          <CheckoutSummary
            quote={currentQuote}
            pickup={tipoEntrega === "pickup"}
            coupon={search.cupom}
            establishmentId={estab.id}
            canQuote={!!checkoutData}
            error={quoteError}
            onRetry={refreshQuote}
            items={checkoutItems}
          />
          <p className="flex items-start gap-2 px-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            Confira o total antes de confirmar. Seu pedido é enviado com os valores validados pela
            loja.
          </p>
        </aside>
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          {testMode && (
            <div
              role="status"
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            >
              <strong>TESTE · compra completa sem cobrança.</strong>
              <p>
                Ao confirmar, o pagamento de teste é aprovado e o pedido segue para a loja e o
                entregador selecionados pelo administrador. Não pague nem realize uma entrega de
                verdade.
              </p>
            </div>
          )}
          <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
            <DialogContent className="theme-cliente">
              <DialogHeader>
                <DialogTitle>Complete os dados para fazer seu pedido</DialogTitle>
                <DialogDescription>
                  {missing.length === 1
                    ? missing.includes("endereco")
                      ? "Cadastre seu endereço de entrega para concluir o pedido."
                      : "Cadastre um telefone com DDD para contato sobre a entrega."
                    : "Precisamos de telefone e endereço cadastrados para entrar em contato e realizar a entrega."}{" "}
                  Você pode continuar navegando enquanto isso.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {(missing.includes("telefone") || !detailsLoaded) && (
                  <Button asChild className="w-full">
                    <Link
                      to="/cliente/perfil/conta"
                      search={{ checkout: true, cupom: search.cupom }}
                    >
                      Preencher telefone
                    </Link>
                  </Button>
                )}
                {(missing.includes("endereco") || !detailsLoaded) && (
                  <Button asChild variant="default" className="w-full">
                    <Link
                      to="/cliente/perfil/enderecos"
                      search={{ checkout: true, cupom: search.cupom }}
                    >
                      Cadastrar endereço
                    </Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate({ to: "/cliente" })}
                >
                  Continuar navegando
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog
            open={!!removalCard}
            onOpenChange={(open) => {
              if (!open && !removingCard) setPendingRemoval(null);
            }}
          >
            <DialogContent className="theme-cliente">
              <DialogHeader>
                <DialogTitle>Remover cartão salvo?</DialogTitle>
                <DialogDescription>
                  O cartão {removalCard?.brand} final {removalCard?.last4} deixará de aparecer nas
                  próximas compras. Você poderá cadastrá-lo novamente ao pagar.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  disabled={removingCard}
                  onClick={() => setPendingRemoval(null)}
                >
                  Manter cartão
                </Button>
                <Button disabled={removingCard} onClick={() => void confirmCardRemoval()}>
                  {removingCard ? "Removendo…" : "Remover cartão"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-7">
            <h2 className="mb-5 text-lg font-semibold tracking-tight">Como você quer receber?</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={tipoEntrega === "delivery"}
                disabled={enviando}
                onClick={() => setTipoEntrega("delivery")}
                className={`flex min-h-20 items-center gap-3 rounded-2xl border p-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait ${tipoEntrega === "delivery" ? "border-primary bg-primary/5 text-foreground shadow-sm ring-1 ring-primary/10" : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/[0.02]"}`}
              >
                <Bike className="h-4 w-4" />
                <div className="text-left">
                  <div>Entrega</div>
                  <div className="text-[11px] font-normal text-muted-foreground">
                    Taxa conferida para o endereço
                  </div>
                </div>
              </button>
              <button
                type="button"
                aria-pressed={tipoEntrega === "pickup"}
                disabled={enviando}
                onClick={() => setTipoEntrega("pickup")}
                className={`flex min-h-20 items-center gap-3 rounded-2xl border p-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait ${tipoEntrega === "pickup" ? "border-primary bg-primary/5 text-foreground shadow-sm ring-1 ring-primary/10" : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/[0.02]"}`}
              >
                <Store className="h-4 w-4" />
                <div className="text-left">
                  <div>Retirar no local</div>
                  <div className="text-[11px] font-normal text-muted-foreground">Sem taxa</div>
                </div>
              </button>
            </div>
          </section>

          {tipoEntrega === "delivery" && (
            <SavedCheckoutAddresses
              addresses={addrs}
              selectedId={addrId}
              onSelect={setAddrId}
              coupon={search.cupom}
            />
          )}

          <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-7">
            <h2 className="mb-5 text-lg font-semibold tracking-tight">Forma de pagamento</h2>
            {onlineAvailable && !testMode && (
              <div className="mb-5 grid grid-cols-1 gap-2 rounded-2xl bg-muted/60 p-1.5 sm:grid-cols-2">
                <Button
                  variant="ghost"
                  className={
                    !online
                      ? "h-11 rounded-xl bg-card text-primary shadow-sm"
                      : "h-11 rounded-xl text-muted-foreground"
                  }
                  aria-pressed={!online}
                  disabled={enviando}
                  onClick={() => setOnline(false)}
                >
                  Pagar na entrega
                </Button>
                <Button
                  variant="ghost"
                  className={
                    online
                      ? "h-11 rounded-xl bg-card text-primary shadow-sm"
                      : "h-11 rounded-xl text-muted-foreground"
                  }
                  aria-pressed={online}
                  disabled={enviando}
                  onClick={() => {
                    setOnline(true);
                    if (pagto === "dinheiro") setPagto("pix");
                  }}
                >
                  Pagar online
                </Button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PAYS.filter((pay) => !(testMode || online) || pay.key !== "dinheiro").map(
                ({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={pagto === key}
                    disabled={enviando}
                    onClick={() => setPagto(key)}
                    className={`flex min-h-20 items-center gap-3 rounded-2xl border p-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait ${pagto === key ? "border-primary bg-primary/5 text-foreground shadow-sm ring-1 ring-primary/10" : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/[0.02]"}`}
                  >
                    <Icon className="h-4 w-4" />
                    {testMode
                      ? key === "pix"
                        ? "Pix de teste"
                        : "Cartão de teste"
                      : online
                        ? key === "pix"
                          ? "Pix online"
                          : "Cartão online · à vista"
                        : label}
                  </button>
                ),
              )}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {testMode
                ? "Pagamento aprovado apenas no simulador, sem Pix, cartão ou dinheiro real."
                : online
                  ? "Pagamento dentro do PedeTrem, processado pela Asaas. A loja recebe o pedido após a confirmação."
                  : "Pague à loja ou ao entregador ao receber seu pedido."}
            </p>
          </section>

          <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-7">
            <label
              htmlFor="checkout-notes"
              className="mb-2 block text-base font-semibold tracking-tight"
            >
              Observações{" "}
              <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Textarea
              id="checkout-notes"
              className="min-h-24 rounded-xl bg-background text-base"
              disabled={enviando}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex: interfone quebrado, ligar ao chegar"
              maxLength={300}
            />
          </section>

          {online && pagto !== "dinheiro" && currentQuote && currentQuote.total_cents > 0 ? (
            <OnlinePaymentForm
              key={`${user.id}:${pagto}`}
              method={pagto}
              busy={enviando}
              disabled={!detailsLoaded || missing.length > 0 || removingCard}
              submitLabel={`Pagar ${fmt(currentQuote.total_cents)}`}
              savedCards={savedCards}
              cardsLoading={cardsState.userId === user.id && cardsState.loading}
              cardsError={cardsState.userId === user.id ? cardsState.error : null}
              onRetryCards={() => setCardsRevision((revision) => revision + 1)}
              onRemoveCard={async (id) => {
                const card = savedCards.find((card) => card.id === id);
                if (card && identity.current === user.id && !enviando)
                  setPendingRemoval({ userId: user.id, card });
              }}
              onSubmit={async (payer, card, cardOptions) => {
                await confirmar({ payer, card, cardOptions });
              }}
              onError={() => toast.error("Confira os dados de pagamento informados.")}
            />
          ) : (
            <Button
              className="min-h-14 w-full rounded-2xl text-base font-semibold shadow-sm"
              size="lg"
              onClick={() => void confirmar()}
              disabled={enviando || !currentQuote || !detailsLoaded || testMode === null}
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : uncertainAttempt === quoteFingerprint ? (
                "Verificar tentativa anterior"
              ) : testMode ? (
                "Confirmar pedido de teste"
              ) : (
                "Confirmar pedido"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
