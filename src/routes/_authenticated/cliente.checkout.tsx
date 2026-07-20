import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, CreditCard, Banknote, QrCode, Wallet, Bike, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { placeOrder } from "@/lib/checkout.functions";

const searchSchema = z.object({ cupom: z.string().optional() });

export const Route = createFileRoute("/_authenticated/cliente/checkout")({
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
type Pay = "pix" | "cartao" | "dinheiro" | "carteira";
const PAYS: { key: Pay; label: string; Icon: typeof QrCode }[] = [
  { key: "pix", label: "Pix", Icon: QrCode },
  { key: "cartao", label: "Cartão na entrega", Icon: CreditCard },
  { key: "dinheiro", label: "Dinheiro", Icon: Banknote },
  { key: "carteira", label: "Carteira WiFome", Icon: Wallet },
];

function CheckoutPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const search = Route.useSearch();
  const navigate = useNavigate();
  const call = useServerFn(placeOrder);

  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [addrId, setAddrId] = useState<string | null>(null);
  const [pagto, setPagto] = useState<Pay>("pix");
  const [tipoEntrega, setTipoEntrega] = useState<"delivery" | "pickup">("delivery");
  const [obs, setObs] = useState("");
  const [estab, setEstab] = useState<Estab | null>(null);
  const [subtotal, setSubtotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [novo, setNovo] = useState({ rua: "", numero: "", bairro: "", cidade: "", estado: "" });

  useEffect(() => {
    (async () => {
      const [a, c] = await Promise.all([
        supabase.from("addresses").select("*").eq("user_id", user.id).order("is_default", { ascending: false }),
        supabase.from("cart_items").select("preco_unit_cents,quantidade,establishment_id").eq("user_id", user.id),
      ]);
      const arr = (a.data ?? []) as Addr[];
      setAddrs(arr);
      setAddrId(arr[0]?.id ?? null);
      const ci = c.data ?? [];
      setSubtotal(ci.reduce((s, i) => s + i.preco_unit_cents * i.quantidade, 0));
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
    if (error) { toast.error(error.message); return; }
    setAddrs((prev) => [data as Addr, ...prev]);
    setAddrId((data as Addr).id);
    setNovo({ rua: "", numero: "", bairro: "", cidade: "", estado: "" });
  }

  async function confirmar() {
    const addr = addrs.find((a) => a.id === addrId);
    if (tipoEntrega === "delivery" && !addr) { toast.error("Selecione um endereço"); return; }
    if (!estab) { toast.error("Carrinho vazio"); return; }
    setEnviando(true);
    try {
      const res = await call({
        data: {
          establishment_id: estab.id,
          forma_pagamento: pagto,
          tipo_entrega: tipoEntrega,
          endereco: tipoEntrega === "pickup" || !addr ? null : {
            label: addr.label, rua: addr.rua, numero: addr.numero, complemento: addr.complemento,
            bairro: addr.bairro, cidade: addr.cidade, estado: addr.estado, cep: addr.cep,
            lat: addr.lat, lng: addr.lng,
          },
          observacoes: obs || null,
          coupon_code: search.cupom ?? null,
        },
      });
      toast.success("Pedido realizado!");
      navigate({ to: "/cliente/pedido/$id", params: { id: res.order_id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao fazer pedido");
    } finally {
      setEnviando(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!estab) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">Carrinho vazio.</p>
        <Button className="mt-4" onClick={() => navigate({ to: "/cliente" })}>Voltar</Button>
      </div>
    );
  }

  const frete = tipoEntrega === "pickup" ? 0 : estab.taxa_entrega_cents;
  const total = subtotal + frete;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Finalizar pedido</h1>

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
              <div className="text-[11px] font-normal text-muted-foreground">{estab.taxa_entrega_cents === 0 ? "Grátis" : fmt(estab.taxa_entrega_cents)}</div>
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
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" /> Endereço de entrega</h2>
          <div className="space-y-2">
            {addrs.map((a) => (
              <label key={a.id} className={`block cursor-pointer rounded-2xl border p-3 text-sm ${addrId === a.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                <input type="radio" className="sr-only" checked={addrId === a.id} onChange={() => setAddrId(a.id)} />
                <div className="font-semibold">{a.label}</div>
                <div className="text-xs text-muted-foreground">
                  {a.rua}{a.numero ? `, ${a.numero}` : ""}{a.bairro ? ` — ${a.bairro}` : ""}<br />
                  {a.cidade}{a.estado ? `/${a.estado}` : ""}{a.cep ? ` · CEP ${a.cep}` : ""}
                </div>
              </label>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-semibold">Novo endereço</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Rua" value={novo.rua} onChange={(e) => setNovo({ ...novo, rua: e.target.value })} />
              <Input placeholder="Número" value={novo.numero} onChange={(e) => setNovo({ ...novo, numero: e.target.value })} />
              <Input placeholder="Bairro" value={novo.bairro} onChange={(e) => setNovo({ ...novo, bairro: e.target.value })} />
              <Input placeholder="Cidade" value={novo.cidade} onChange={(e) => setNovo({ ...novo, cidade: e.target.value })} />
              <Input placeholder="Estado" value={novo.estado} onChange={(e) => setNovo({ ...novo, estado: e.target.value })} />
            </div>
            <Button size="sm" variant="outline" className="mt-2" onClick={criarEndereco}>Adicionar endereço</Button>
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
        <p className="mt-2 text-[11px] text-muted-foreground">Pagamento processado na entrega (Pix e cartão online em breve).</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Observações</h2>
        <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex: interfone quebrado, ligar ao chegar" maxLength={300} />
      </section>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
        <div className="flex justify-between text-muted-foreground"><span>{tipoEntrega === "pickup" ? "Retirada" : "Entrega"}</span><span>{tipoEntrega === "pickup" ? "Grátis" : (estab.taxa_entrega_cents === 0 ? "Grátis" : fmt(estab.taxa_entrega_cents))}</span></div>
        {search.cupom && <div className="flex justify-between text-primary"><span>Cupom</span><span>{search.cupom}</span></div>}
        <div className="my-2 border-t border-border" />
        <div className="flex justify-between text-base font-bold"><span>Total</span><span>{fmt(total)}</span></div>
      </div>

      <Button className="w-full" size="lg" onClick={confirmar} disabled={enviando}>
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar pedido"}
      </Button>
    </div>
  );
}
