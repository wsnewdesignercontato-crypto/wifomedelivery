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
import { Loader2, MapPin, CreditCard, Banknote, QrCode, Bike, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { placeOrder, quoteOrder, type CheckoutQuoteInput } from "@/lib/checkout.functions";
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
  { key: "pix", label: "Pix", Icon: QrCode },
  { key: "cartao", label: "Cartão na entrega", Icon: CreditCard },
  { key: "dinheiro", label: "Dinheiro", Icon: Banknote },
];

function CheckoutPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const search = Route.useSearch();
  const navigate = useNavigate();
  const call = useServerFn(placeOrder);
  const callQuote = useServerFn(quoteOrder);
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
  const [novo, setNovo] = useState({ rua: "", numero: "", bairro: "", cidade: "", estado: "" });

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
          .select("id,updated_at,preco_unit_cents,quantidade,establishment_id")
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
        setEstab(e as Estab | null);
      } else setEstab(null);
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
  }, [user.id]);

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

  async function criarEndereco() {
    if (!novo.rua.trim() || !novo.cidade.trim()) {
      toast.error("Informe rua e cidade");
      return;
    }
    const { data, error } = await supabase
      .from("addresses")
      .insert({ user_id: user.id, label: "Casa", ...novo, is_default: addrs.length === 0 })
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setAddrs((prev) => [data as Addr, ...prev]);
    setAddrId((data as Addr).id);
    setNovo({ rua: "", numero: "", bairro: "", cidade: "", estado: "" });
  }

  async function confirmar() {
    if (!detailsLoaded || missing.length) {
      setDetailsOpen(true);
      return;
    }
    if (!checkoutData || !currentQuote || enviando) return;
    setEnviando(true);
    try {
      const expected_total_cents = currentQuote.total_cents;
      const fingerprint = JSON.stringify({ checkoutData, cartFingerprint, expected_total_cents });
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
      const res = await call({
        data: { ...checkoutData, expected_total_cents, idempotency_key: attempt.key },
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
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Finalizar pedido</h1>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
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
                <Link to="/cliente/perfil/conta" search={{ checkout: true, cupom: search.cupom }}>
                  Preencher telefone
                </Link>
              </Button>
            )}
            {(missing.includes("endereco") || !detailsLoaded) && (
              <Button asChild variant="outline" className="w-full">
                <Link
                  to="/cliente/perfil/enderecos"
                  search={{ checkout: true, cupom: search.cupom }}
                >
                  Cadastrar endereço
                </Link>
              </Button>
            )}
            <Button variant="ghost" className="w-full" onClick={() => navigate({ to: "/cliente" })}>
              Continuar navegando
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Como você quer receber?</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setTipoEntrega("delivery")}
            className={`flex items-center gap-2 rounded-2xl border p-3 text-sm font-medium transition ${tipoEntrega === "delivery" ? "border-primary bg-primary/5 text-primary" : "border-border bg-card"}`}
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
            onClick={() => setTipoEntrega("pickup")}
            className={`flex items-center gap-2 rounded-2xl border p-3 text-sm font-medium transition ${tipoEntrega === "pickup" ? "border-primary bg-primary/5 text-primary" : "border-border bg-card"}`}
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
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-primary" /> Endereço de entrega
          </h2>
          <div className="space-y-2">
            {addrs.map((a) => (
              <label
                key={a.id}
                className={`block cursor-pointer rounded-2xl border p-3 text-sm ${addrId === a.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  checked={addrId === a.id}
                  onChange={() => setAddrId(a.id)}
                />
                <div className="font-semibold">{a.label}</div>
                <div className="text-xs text-muted-foreground">
                  {a.rua}
                  {a.numero ? `, ${a.numero}` : ""}
                  {a.bairro ? ` — ${a.bairro}` : ""}
                  <br />
                  {a.cidade}
                  {a.estado ? `/${a.estado}` : ""}
                  {a.cep ? ` · CEP ${a.cep}` : ""}
                </div>
              </label>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-semibold">Novo endereço</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Rua"
                value={novo.rua}
                onChange={(e) => setNovo({ ...novo, rua: e.target.value })}
              />
              <Input
                placeholder="Número"
                value={novo.numero}
                onChange={(e) => setNovo({ ...novo, numero: e.target.value })}
              />
              <Input
                placeholder="Bairro"
                value={novo.bairro}
                onChange={(e) => setNovo({ ...novo, bairro: e.target.value })}
              />
              <Input
                placeholder="Cidade"
                value={novo.cidade}
                onChange={(e) => setNovo({ ...novo, cidade: e.target.value })}
              />
              <Input
                placeholder="Estado"
                value={novo.estado}
                onChange={(e) => setNovo({ ...novo, estado: e.target.value })}
              />
            </div>
            <Button size="sm" variant="outline" className="mt-2" onClick={criarEndereco}>
              Adicionar endereço
            </Button>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Forma de pagamento</h2>
        <div className="grid grid-cols-2 gap-2">
          {PAYS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setPagto(key)}
              className={`flex items-center gap-2 rounded-2xl border p-3 text-sm font-medium transition ${pagto === key ? "border-primary bg-primary/5 text-primary" : "border-border bg-card"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Pagamento processado na entrega (Pix e cartão online em breve).
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Observações</h2>
        <Textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex: interfone quebrado, ligar ao chegar"
          maxLength={300}
        />
      </section>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{currentQuote ? fmt(currentQuote.subtotal_cents) : "—"}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>{tipoEntrega === "pickup" ? "Retirada" : "Entrega"}</span>
          <span>{currentQuote ? fmt(currentQuote.frete_cents) : "—"}</span>
        </div>
        {search.cupom && (
          <div className="flex justify-between text-primary">
            <span>Cupom</span>
            <span>
              {search.cupom} {currentQuote ? `· −${fmt(currentQuote.desconto_cents)}` : ""}
            </span>
          </div>
        )}
        <div className="my-2 border-t border-border" />
        <div className="flex justify-between text-base font-bold">
          <span>Total</span>
          <span>{currentQuote ? fmt(currentQuote.total_cents) : "—"}</span>
        </div>
      </div>
      {quoteError ? (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{quoteError}</p>
          <Button variant="outline" size="sm" onClick={refreshQuote}>
            Conferir novamente
          </Button>
        </div>
      ) : !currentQuote ? (
        <p role="status" className="text-sm text-muted-foreground">
          {checkoutData
            ? "Conferindo preços, entrega e cupom…"
            : "Selecione um endereço ou a retirada para conferir o total."}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Total conferido com o catálogo atual, a entrega e o cupom. Se o preço mudar, você
          precisará revisar e confirmar novamente.
        </p>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={confirmar}
        disabled={enviando || !currentQuote || !detailsLoaded}
      >
        {enviando ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : uncertainAttempt === quoteFingerprint ? (
          "Verificar tentativa anterior"
        ) : (
          "Confirmar pedido"
        )}
      </Button>
    </div>
  );
}
