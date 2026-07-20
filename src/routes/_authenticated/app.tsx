import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ShoppingBag, Store, Bike } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  perfil: z.enum(["cliente", "estabelecimento", "entregador"]).optional(),
});

export const Route = createFileRoute("/_authenticated/app")({
  validateSearch: searchSchema,
  component: AppDispatcher,
});

type Role = "cliente" | "estabelecimento" | "entregador" | "admin";

async function fetchRoles(userId: string): Promise<Role[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.role as Role);
}

const perfilCards: {
  key: "cliente" | "estabelecimento" | "entregador";
  titulo: string;
  descricao: string;
  Icon: typeof ShoppingBag;
  to: "/cliente" | "/estabelecimento" | "/entregador";
}[] = [
  {
    key: "cliente",
    titulo: "Sou cliente",
    descricao: "Peça e acompanhe suas entregas.",
    Icon: ShoppingBag,
    to: "/cliente",
  },
  {
    key: "estabelecimento",
    titulo: "Tenho estabelecimento",
    descricao: "Gerencie pedidos e cardápio.",
    Icon: Store,
    to: "/estabelecimento",
  },
  {
    key: "entregador",
    titulo: "Sou entregador",
    descricao: "Aceite corridas e ganhe.",
    Icon: Bike,
    to: "/entregador",
  },
];

function AppDispatcher() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "pick" | "adding">("loading");
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchRoles(user.id);
        if (cancelled) return;
        setRoles(r);

        const requested = search.perfil;

        // 1) Perfil solicitado e já ativado → redireciona
        if (requested && r.includes(requested)) {
          navigate({ to: `/${requested}`, replace: true });
          return;
        }

        // 2) Perfil solicitado mas ainda não ativado → ativa automaticamente
        if (requested && !r.includes(requested)) {
          setState("adding");
          const { error } = await supabase
            .from("user_roles")
            .insert({ user_id: user.id, role: requested });
          if (error && !error.message.includes("duplicate")) {
            console.error(error);
            toast.error("Não foi possível ativar este perfil");
            setState("pick");
            return;
          }
          navigate({ to: `/${requested}`, replace: true });
          return;
        }

        // 3) Sem perfil pedido: admin > único perfil > escolher
        if (r.includes("admin")) {
          navigate({ to: "/admin", replace: true });
          return;
        }
        const nonAdmin = r.filter((x) => x !== "admin");
        if (nonAdmin.length === 1) {
          navigate({ to: `/${nonAdmin[0]}`, replace: true });
          return;
        }
        setState("pick");
      } catch (err) {
        console.error(err);
        toast.error("Erro ao carregar seu perfil");
        setState("pick");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id, search.perfil, navigate]);

  async function addRoleAndGo(role: "cliente" | "estabelecimento" | "entregador") {
    setState("adding");
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: user.id, role });
    if (error && !error.message.includes("duplicate")) {
      toast.error("Não foi possível ativar este perfil");
      setState("pick");
      return;
    }
    navigate({ to: `/${role}`, replace: true });
  }

  if (state === "loading" || state === "adding") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <IFomeLogo size="md" className="mx-auto" />
        <h1 className="mt-6 text-center text-2xl font-bold text-foreground">
          Como quer usar o WiFome?
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Você pode ativar mais de um perfil e alternar entre eles quando quiser.
        </p>

        <div className="mt-8 grid gap-3">
          {perfilCards.map(({ key, titulo, descricao, Icon, to }) => {
            const tem = roles.includes(key);
            return (
              <button
                key={key}
                onClick={() =>
                  tem ? navigate({ to, replace: true }) : addRoleAndGo(key)
                }
                className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-brand"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-primary-foreground shadow-brand">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-foreground">{titulo}</h2>
                    {tem && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                        Ativo
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{descricao}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <Button
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/", replace: true });
            }}
          >
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
