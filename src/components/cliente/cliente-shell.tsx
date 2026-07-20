import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Home,
  Search,
  ReceiptText,
  Heart,
  User,
  ShoppingCart,
  MapPin,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/cliente/notifications-bell";

type Ctx = { user: { id: string; email?: string } };

const NAV = [
  { to: "/cliente" as const, label: "Início", icon: Home, exact: true },
  { to: "/cliente/buscar" as const, label: "Buscar", icon: Search, exact: false },
  { to: "/cliente/pedidos" as const, label: "Pedidos", icon: ReceiptText, exact: false },
  { to: "/cliente/favoritos" as const, label: "Favoritos", icon: Heart, exact: false },
  { to: "/cliente/perfil" as const, label: "Perfil", icon: User, exact: false },
];

export function ClienteShell({ user }: Ctx) {
  const location = useLocation();
  const navigate = useNavigate();
  const [cartQty, setCartQty] = useState(0);
  const [endereco, setEndereco] = useState<string>("Escolher endereço");

  useEffect(() => {
    let alive = true;
    async function reload() {
      const [{ data: cart }, { data: addr }] = await Promise.all([
        supabase.from("cart_items").select("quantidade").eq("user_id", user.id),
        supabase
          .from("addresses")
          .select("label,rua,numero,cidade,is_default")
          .eq("user_id", user.id)
          .order("is_default", { ascending: false })
          .limit(1),
      ]);
      if (!alive) return;
      setCartQty((cart ?? []).reduce((s, i) => s + i.quantidade, 0));
      if (addr && addr[0]) {
        const a = addr[0];
        setEndereco(
          `${a.label} · ${a.rua}${a.numero ? `, ${a.numero}` : ""} — ${a.cidade}`,
        );
      }
    }
    reload();
    const ch = supabase
      .channel(`cart-count-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cart_items", filter: `user_id=eq.${user.id}` },
        reload,
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [user.id]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/cliente" className="shrink-0">
            <IFomeLogo size="sm" />
          </Link>
          <button
            onClick={() => navigate({ to: "/cliente/perfil" })}
            className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-full bg-muted px-3 py-1.5 text-left text-xs text-foreground"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{endereco}</span>
          </button>
          <NotificationsBell userId={user.id} />
          <Button
            size="sm"
            variant={cartQty > 0 ? "default" : "ghost"}
            className="relative"
            onClick={() => navigate({ to: "/cliente/carrinho" })}
            aria-label="Carrinho"
          >
            <ShoppingCart className="h-4 w-4" />
            {cartQty > 0 && (
              <span className="ml-1 text-xs font-bold">{cartQty}</span>
            )}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-4">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur"
        aria-label="Navegação principal"
      >
        <div className="mx-auto grid max-w-4xl grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, exact }) => {
            const active = exact
              ? location.pathname === to
              : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
