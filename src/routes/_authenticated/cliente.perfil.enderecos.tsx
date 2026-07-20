import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, MapPin, Plus, Trash2, Star, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/cliente/perfil/enderecos")({
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
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [loading, setLoading] = useState(true);
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
    (async () => {
      const { data } = await supabase
        .from("addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false });
      setAddrs((data ?? []) as Addr[]);
      setLoading(false);
    })();
  }, [user.id]);

  async function addAddr() {
    if (!novo.rua.trim() || !novo.cidade.trim()) {
      toast.error("Rua e cidade obrigatórios");
      return;
    }
    const { data, error } = await supabase
      .from("addresses")
      .insert({ user_id: user.id, ...novo, is_default: addrs.length === 0 })
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setAddrs((prev) => [data as Addr, ...prev]);
    setNovo({ label: "Casa", rua: "", numero: "", bairro: "", cidade: "", estado: "", cep: "" });
    toast.success("Endereço adicionado");
  }
  async function delAddr(id: string) {
    await supabase.from("addresses").delete().eq("id", id);
    setAddrs((prev) => prev.filter((a) => a.id !== id));
  }
  async function setDefault(id: string) {
    await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
    await supabase.from("addresses").update({ is_default: true }).eq("id", id);
    setAddrs((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })));
  }

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-5">
      <Link to="/cliente/perfil" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
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
                <Button size="sm" variant="ghost" onClick={() => setDefault(a.id)}>
                  Padrão
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => delAddr(a.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
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
          <Button onClick={addAddr}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
      </section>
    </div>
  );
}
