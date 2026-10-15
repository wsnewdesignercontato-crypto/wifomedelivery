import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, CreditCard, Banknote, QrCode, Bike, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  placeOrder,
  quoteOrder,
  type CheckoutQuote,
  type PlaceOrderInput,
} from "@/lib/checkout.functions";

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
  const quoteCall = useServerFn(quoteOrder);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const checkoutKey = useRef<string | null>(null);
  const submitting = useRef(false);
  const pendingRequest = useRef<PlaceOrderInput | null>(null);
  const [retryConfirmation, setRetryConfirmation] = useState(false);

  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [addrId, setAddrId] = useState<string | null>(null);
  const [pagto, setPagto] = useState<Pay>("pix");
  const [tipoEntrega, setTipoEntrega] = useState<"delivery" | "pickup">("delivery");
  const [obs, setObs] = useState("");
  const [estab, setEstab] = useState<Estab | null>(null);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [novo, setNovo] = useState({ rua: "", numero: "", bairro: "", cidade: "", estado: "" });

  useEffect(() => {
    (async () => {
      const [a, c] = await Promise.all([
        supabase
          .from("addresses")
          .select("*")
          .eq("user_id", user.id)
          .order("is_default", { ascending: false }),
        supabase
          .from("cart_items")
          .select("preco_unit_cents,quantidade,establishment_id")
          .eq("user_id", user.id),
      ]);
      const arr = (a.data ?? []) as Addr[];
      setAddrs(arr);
      setAddrId(arr[0]?.id ?? null);
      const ci = c.data ?? [];
      if (ci[0]) {
        const { data: e } = await supabase
          .from("establishments")
          .select("id,nome,taxa_entrega_cents,pedido_minimo_cents")
          .eq("id", ci[0].establishment_id)
          .maybeSingle();
        setEstab(e as Estab | null);
      }
      setLoading(false);
    })();
  }, [user.id]);

  useEffect(() => {
    if (!estab?.id) return;
    let cancelled = false;
    setQuoting(true);
    setQuote(null);
    setQuoteError("");
    quoteCall({
      data: {
        establishment_id: estab.id,
        tipo_entrega: tipoEntrega,
        coupon_code: search.cupom ?? null,
      },
    })
      .then((value) => {
        if (!cancelled) setQuote(value);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setQuoteError(
            error instanceof Error ? error.message : "Não foi possível conferir o carrinho",
          );
      })
      .finally(() => {
        if (!cancelled) setQuoting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [estab?.id, tipoEntrega, search.cupom, quoteCall, quoteRevision]);

  useEffect(() => {
    checkoutKey.current = null;
  }, [quote?.fingerprint, addrId, pagto, obs]);

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
    if (submitting.current || (!pendingRequest.current && (!quote || quoting || quoteError)))
      return;
    const addr = addrs.find((a) => a.id === addrId);
    if (tipoEntrega === "delivery" && !addr) {
      toast.error("Selecione um endereço");
      return;
    }
    if (!estab) {
      toast.error("Carrinho vazio");
      return;
    }
    submitting.current = true;
    setEnviando(true);
    checkoutKey.current ??= crypto.randomUUID();
    try {
      const request = pendingRequest.current ?? {
        establishment_id: estab.id,
        checkout_key: checkoutKey.current,
        quote_fingerprint: quote!.fingerprint,
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
      pendingRequest.current = request;
      const res = await call({ data: request });
      pendingRequest.current = null;
      setRetryConfirmation(false);
      toast.success("Pedido realizado!");
      navigate({ to: "/cliente/pedido/$id", params: { id: res.order_id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao fazer pedido");
      const message = e instanceof Error ? e.message : "";
      if (
        /carrinho|preços|estoque|cupom|fechada|indisponível|inválid|mínimo|complemento/i.test(
          message,
        )
      ) {
        pendingRequest.current = null;
        checkoutKey.current = null;
        setRetryConfirmation(false);
        setQuoteRevision((v) => v + 1);
      } else {
        // Retry the exact payload and key after an uncertain network response.
        setRetryConfirmation(true);
      }
    } finally {
      setEnviando(false);
      submitting.current = false;
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
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

  const total = quote?.total_cents ?? 0;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Finalizar pedido</h1>

      <fieldset disabled={enviando || retryConfirmation} className="space-y-5">
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
                  {estab.taxa_entrega_cents === 0 ? "Grátis" : fmt(estab.taxa_entrega_cents)}
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
            <span>{quote ? fmt(quote.subtotal_cents) : "Conferindo…"}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{tipoEntrega === "pickup" ? "Retirada" : "Entrega"}</span>
            <span>
              {tipoEntrega === "pickup"
                ? "Grátis"
                : estab.taxa_entrega_cents === 0
                  ? "Grátis"
                  : fmt(estab.taxa_entrega_cents)}
            </span>
          </div>
          {search.cupom && (
            <div className="flex justify-between text-primary">
              <span>Cupom</span>
              <span>
                {search.cupom}
                {quote ? ` · − ${fmt(quote.desconto_cents)}` : ""}
              </span>
            </div>
          )}
          <div className="my-2 border-t border-border" />
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span>{quote ? fmt(total) : "—"}</span>
          </div>
        </div>
      </fieldset>
      {retryConfirmation && (
        <p role="alert" className="text-sm text-muted-foreground">
          A confirmação não foi recebida. Tente novamente para verificar o mesmo pedido sem
          duplicá-lo.
        </p>
      )}
      {quoteError && (
        <div
          role="alert"
          className="rounded-xl border border-destructive p-3 text-sm text-destructive"
        >
          <p>{quoteError}</p>
          <Button variant="outline" onClick={() => setQuoteRevision((v) => v + 1)}>
            Conferir novamente
          </Button>
        </div>
      )}
      <Button
        className="w-full"
        size="lg"
        onClick={confirmar}
        disabled={enviando || (!retryConfirmation && (quoting || !quote || !!quoteError))}
      >
        {enviando || quoting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : retryConfirmation ? (
          "Verificar confirmação do pedido"
        ) : (
          "Confirmar pedido"
        )}
      </Button>
    </div>
  );
}
