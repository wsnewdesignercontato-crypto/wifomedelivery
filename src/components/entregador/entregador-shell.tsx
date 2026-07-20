import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Home, Bike, History, Wallet, Trophy, Star, FileText, Car,
  User, LifeBuoy, Bell, Settings, LogOut, Loader2, DollarSign, MessageSquare,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMyCourier } from "@/hooks/use-courier";
import { useNewRideAlert } from "@/hooks/use-new-ride-alert";

const NAV = [
  { to: "/entregador", label: "Início", icon: Home, exact: true },
  { to: "/entregador/corridas", label: "Corridas", icon: Bike },
  { to: "/entregador/historico", label: "Histórico", icon: History },
  { to: "/entregador/ganhos", label: "Ganhos", icon: DollarSign },
  { to: "/entregador/carteira", label: "Carteira", icon: Wallet },
  { to: "/entregador/metas", label: "Metas", icon: Trophy },
  { to: "/entregador/avaliacoes", label: "Avaliações", icon: Star },
  { to: "/entregador/documentos", label: "Documentos", icon: FileText },
  { to: "/entregador/veiculo", label: "Veículo", icon: Car },
  { to: "/entregador/perfil", label: "Perfil", icon: User },
  { to: "/entregador/notificacoes", label: "Notificações", icon: Bell },
  { to: "/entregador/suporte", label: "Suporte", icon: LifeBuoy },
  { to: "/entregador/chat", label: "Chat", icon: MessageSquare },
  { to: "/entregador/configuracoes", label: "Config.", icon: Settings },
];

const BOTTOM = NAV.filter((n) =>
  ["/entregador", "/entregador/corridas", "/entregador/ganhos", "/entregador/historico", "/entregador/perfil"].includes(n.to),
);

export function EntregadorShell({ children }: { children: React.ReactNode }) {
  const { courier, isLoading } = useMyCourier();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!courier) return;
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", courier.user_id)
      .eq("lida", false)
      .then(({ count }) => setUnread(count ?? 0));
  }, [courier]);

  useNewRideAlert(courier as any, true);


  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <IFomeLogo size="sm" />
            <Badge variant="outline" className="hidden sm:inline-flex">Entregador</Badge>
          </div>
          <div className="flex items-center gap-2">
            {courier && (
              <Badge className={courier.status === "online" ? "bg-emerald-500 text-white" : courier.status === "ocupado" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}>
                {courier.status}
              </Badge>
            )}
            <Link to="/entregador/notificacoes" className="relative">
              <Button variant="ghost" size="icon"><Bell className="h-5 w-5" /></Button>
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {unread}
                </span>
              )}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/", replace: true });
              }}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-56 shrink-0 overflow-y-auto rounded-2xl border border-border bg-card p-3 lg:block">
          <nav className="space-y-1">
            {NAV.map((n) => {
              const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-primary text-primary-foreground shadow-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
          {BOTTOM.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1 text-[11px] ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
