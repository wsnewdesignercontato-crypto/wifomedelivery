import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, MapPin, Plus, Trash2, Star, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { notifyDataUpdated } from "@/lib/app-refresh";

export const Route = createFileRoute("/_authenticated/cliente/perfil/enderecos")({
  validateSearch: (search: Record<string, unknown>): { checkout?: boolean; cupom?: string } => ({
    ...(search.checkout === true || search.checkout === "true" ? { checkout: true } : {}),
    ...(typeof search.cupom === "string" && search.cupom.length <= 50
      ? { cupom: search.cupom }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "Cliente — Perfil — Endereços | PedeTrem" },
      { name: "description", content: "PedeTrem: cliente, perfil, endereços." },
      { property: "og:title", content: "Cliente — Perfil — Endereços | PedeTrem" },
      { property: "og:description", content: "PedeTrem: cliente, perfil, endereços." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EnderecosPage,
});

type Addr = {
  id: string;
  label: string;
  rua: string;
  numero: string | null;
  bairro: string | null;
  cidade: string;
  estado: string | null;
  cep: string | null;
  is_default: boolean;
};

function EnderecosPage() {
  const { checkout, cupom } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const [addrs, setAddrs] = useState<Addr[]>([]);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [novo, setNovo] = useState({
    label: "Casa",
    rua: "",
    numero: "",
    bairro: "",
    cidade: "",
    estado: "",
    cep: "",
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setAddrs([]);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("addresses")
          .select("*")
          .eq("user_id", user.id)
          .order("is_default", { ascending: false });
        if (!active) return;
        if (error) throw error;
        setAddrs((data ?? []) as Addr[]);
      } catch (error) {
        if (active)
          setLoadError(
            error && typeof error === "object" && "message" in error
              ? String(error.message)
              : "Não foi possível carregar seus endereços.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user.id]);

  async function addAddr() {
    if (busy.current || loading || loadError) return;
    if (!novo.rua.trim() || !novo.cidade.trim()) {
      toast.error("Rua e cidade obrigatórios");
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("addresses")
        .insert({ user_id: user.id, ...novo, is_default: addrs.length === 0 })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "O endereço não foi salvo. Tente novamente.");
        return;
      }
      setAddrs((prev) => [data as Addr, ...prev]);
      setNovo({ label: "Casa", rua: "", numero: "", bairro: "", cidade: "", estado: "", cep: "" });
      notifyDataUpdated();
      toast.success("Endereço adicionado");
      if (checkout) navigate({ to: "/cliente/checkout", search: { cupom } });
    } catch {
      toast.error("Não foi possível salvar. Seus dados continuam no formulário.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function delAddr(id: string) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("addresses")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("O endereço não foi removido.");
      setAddrs((prev) => prev.filter((a) => a.id !== id));
      notifyDataUpdated();
      toast.success("Endereço removido");
    } catch {
      toast.error("Não foi possível remover o endereço. Tente novamente.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function setDefault(id: string) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("set_my_default_address", { p_address_id: id });
      if (
        error ||
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        data.id !== id ||
        data.is_default !== true
      )
        throw error ?? new Error("O endereço padrão não foi salvo.");
      setAddrs((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })));
      notifyDataUpdated();
      toast.success("Endereço padrão atualizado");
    } catch {
      toast.error("Não foi possível alterar o endereço padrão. Tente novamente.");
    } finally {
      busy.current = false;
      setSaving(false);
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

  return (
    <div className="space-y-5">
      <Link
        to="/cliente/perfil"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <MapPin className="h-5 w-5 text-primary" /> Meus endereços
      </h1>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        {addrs.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum endereço cadastrado.</p>
        )}
        {addrs.map((a) => (
          <div
            key={a.id}
            className="flex items-start justify-between gap-2 rounded-xl border border-border p-3 text-sm"
          >
            <div>
              <p className="font-semibold">
                {a.label}{" "}
                {a.is_default && <Star className="ml-1 inline h-3 w-3 fill-primary text-primary" />}
              </p>
              <p className="text-xs text-muted-foreground">
                {a.rua}
                {a.numero ? `, ${a.numero}` : ""}
                {a.bairro ? ` — ${a.bairro}` : ""} — {a.cidade}
                {a.estado ? `/${a.estado}` : ""}
              </p>
            </div>
            <div className="flex gap-1">
              {!a.is_default && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => setDefault(a.id)}
                >
                  Padrão
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                disabled={saving}
                aria-label="Remover endereço"
                onClick={() => delAddr(a.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </section>

      <fieldset
        disabled={saving}
        className="space-y-3 rounded-2xl border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Adicionar novo endereço</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Rótulo (Casa/Trabalho)"
            value={novo.label}
            onChange={(e) => setNovo({ ...novo, label: e.target.value })}
          />
          <Input
            placeholder="CEP"
            value={novo.cep}
            onChange={(e) => setNovo({ ...novo, cep: e.target.value })}
          />
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
          <Button disabled={saving} onClick={addAddr}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
