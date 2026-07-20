import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Store,
  Bike,
  ShoppingBag,
  Star,
  ScrollText,
  Settings,
  Search,
  Bell,
  LogOut,
  Menu,
  X,
  Shield,
  DollarSign,
  Ticket,
  Megaphone,
  Image as ImageIcon,
  Send,
  LifeBuoy,
  Map as MapIcon,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; group?: string };
const navItems: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag },
  { to: "/admin/mapa", label: "Mapa ao vivo", icon: MapIcon },
  { to: "/admin/usuarios", label: "Usuários & Admins", icon: Shield, group: "Pessoas" },
  { to: "/admin/clientes", label: "Clientes", icon: Users, group: "Pessoas" },
  { to: "/admin/estabelecimentos", label: "Estabelecimentos", icon: Store, group: "Pessoas" },
  { to: "/admin/entregadores", label: "Entregadores", icon: Bike, group: "Pessoas" },

  { to: "/admin/financeiro", label: "Financeiro", icon: DollarSign, group: "Operação" },
  { to: "/admin/saques", label: "Saques", icon: DollarSign, group: "Operação" },
  { to: "/admin/avaliacoes", label: "Avaliações", icon: Star, group: "Operação" },
  { to: "/admin/cupons", label: "Cupons", icon: Ticket, group: "Marketing" },
  { to: "/admin/campanhas", label: "Campanhas", icon: Megaphone, group: "Marketing" },
  { to: "/admin/banners", label: "Banners", icon: ImageIcon, group: "Marketing" },
  { to: "/admin/anuncios", label: "Anúncios patrocinados", icon: Megaphone, group: "Marketing" },
  { to: "/admin/notificacoes", label: "Notificações", icon: Send, group: "Marketing" },
  { to: "/admin/suporte", label: "Suporte", icon: LifeBuoy, group: "Atendimento" },
  { to: "/admin/ia", label: "IA Insights", icon: Sparkles, group: "Atendimento" },
  { to: "/admin/logs", label: "Logs & Auditoria", icon: ScrollText, group: "Sistema" },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings, group: "Sistema" },
];

export function AdminShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link to="/admin" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-orange-600 text-primary-foreground shadow-brand">
              <Shield className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold text-foreground">WiFome</div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-primary">
                Admin
              </div>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-muted-foreground hover:bg-accent lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {(() => {
            const groups = new Map<string, NavItem[]>();
            for (const it of navItems) {
              const g = it.group ?? "";
              if (!groups.has(g)) groups.set(g, []);
              groups.get(g)!.push(it);
            }
            return Array.from(groups.entries()).map(([group, items], gi) => (
              <div key={group || "root"} className={gi > 0 ? "mt-5" : ""}>
                {group && (
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {group}
                  </p>
                )}
                <div className="space-y-0.5">
                  {items.map(({ to, label, icon: Icon, exact }) => (
                    <Link
                      key={to}
                      to={to as "/admin"}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                        isActive(to, exact)
                          ? "bg-primary/10 text-primary shadow-sm"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon className={cn("h-4 w-4", isActive(to, exact) && "text-primary")} />
                      {label}
                      {isActive(to, exact) && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ));
          })()}
        </nav>
        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-lg lg:px-8">
          <button
            onClick={() => setOpen(true)}
            className="rounded p-2 text-muted-foreground hover:bg-accent lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar clientes, pedidos, lojas…"
              className="h-10 pl-9"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
            </button>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
