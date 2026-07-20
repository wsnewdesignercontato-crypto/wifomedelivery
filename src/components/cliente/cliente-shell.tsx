import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Home,
  Search,
  ShoppingBag,
  ReceiptText,
  User,
  ShoppingCart,
  MapPin,
  ChevronDown,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/cliente/notifications-bell";

type Ctx = { user: { id: string; email?: string } };

const NAV = [
  { to: "/cliente" as const, label: "Início", icon: Home, exact: true },
  { to: "/cliente/novidades" as const, label: "Novidades", icon: Sparkles, exact: false },
  { to: "/cliente/pedidos" as const, label: "Pedidos", icon: ReceiptText, exact: false },
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
        setEndereco(`${a.rua}${a.numero ? `, ${a.numero}` : ""}`);
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
      {/* Premium orange header — WiFome style */}
      <header className="sticky top-0 z-40 bg-gradient-to-b from-primary to-[hsl(19,100%,45%)] text-primary-foreground shadow-lg">
        {/* Top row: brand + actions */}
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 pt-3">
          <button
            onClick={() => navigate({ to: "/cliente" })}
            className="text-xl font-black tracking-tight"
          >
            WiFome
          </button>
          <div className="flex items-center gap-1">
            <NotificationsBell userId={user.id} />
            <Button
              size="icon"
              variant="ghost"
              className="relative h-9 w-9 rounded-full text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
              onClick={() => navigate({ to: "/cliente/carrinho" })}
              aria-label="Carrinho"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartQty > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-black text-primary shadow">
                  {cartQty}
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Address row */}
        <button
          onClick={() => navigate({ to: "/cliente/perfil" })}
          className="mx-auto mt-2 flex w-full max-w-4xl items-center gap-1.5 px-4 text-left"
        >
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-bold">{endereco}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-90" />
        </button>

        {/* Search bar — always visible */}
        <div className="px-4 pt-2 pb-4">
          <button
            onClick={() => navigate({ to: "/cliente/buscar" })}
            className="flex w-full items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left text-sm text-muted-foreground shadow-md"
          >
            <Search className="h-4 w-4 text-primary" />
            Buscar restaurantes ou pratos
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-4">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/98 backdrop-blur"
        aria-label="Navegação principal"
      >
        <div className="mx-auto grid max-w-4xl grid-cols-4">
          {NAV.map(({ to, label, icon: Icon, exact }) => {
            const active = exact
              ? location.pathname === to
              : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "fill-primary/10" : ""}`} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
