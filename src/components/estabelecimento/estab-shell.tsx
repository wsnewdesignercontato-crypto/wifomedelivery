import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { IFomeLogo } from "@/components/ifome-logo";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  FolderTree,
  Layers,
  Boxes,
  Clock,
  Truck,
  Image as ImageIcon,
  Ticket,
  Megaphone,
  DollarSign,
  BarChart3,
  Star,
  Users,
  Settings,
  LogOut,
  Bell,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Estab } from "@/hooks/use-estab";
import { useQueryClient } from "@tanstack/react-query";

type NavItem = { label: string; to: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { label: "Visão geral", to: "/estabelecimento", icon: LayoutDashboard, exact: true },
  { label: "Pedidos", to: "/estabelecimento/pedidos", icon: ShoppingBag },
  { label: "Produtos", to: "/estabelecimento/produtos", icon: Package },
  { label: "Categorias", to: "/estabelecimento/categorias", icon: FolderTree },
  { label: "Complementos", to: "/estabelecimento/complementos", icon: Layers },
  { label: "Estoque", to: "/estabelecimento/estoque", icon: Boxes },
  { label: "Horários", to: "/estabelecimento/horarios", icon: Clock },
  { label: "Área de entrega", to: "/estabelecimento/entrega", icon: Truck },
  { label: "Financeiro", to: "/estabelecimento/financeiro", icon: DollarSign },
  { label: "Carteira", to: "/estabelecimento/carteira", icon: DollarSign },
  { label: "Extrato", to: "/estabelecimento/extrato", icon: BarChart3 },
  { label: "Histórico de saques", to: "/estabelecimento/saques", icon: FileText },
  { label: "Relatórios", to: "/estabelecimento/relatorios", icon: BarChart3 },
  { label: "Avaliações", to: "/estabelecimento/avaliacoes", icon: Star },
  { label: "Anúncios", to: "/estabelecimento/anuncios", icon: Megaphone },
  { label: "Equipe", to: "/estabelecimento/equipe", icon: Users },
  { label: "Configurações", to: "/estabelecimento/configuracoes", icon: Settings },
];

function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="px-3 py-4">
          <IFomeLogo size="sm" />
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Painel da loja</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const active = item.exact
                  ? pathname === item.to
                  : pathname === item.to || pathname.startsWith(item.to + "/");
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={item.to as never} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export function EstabShell({ estab }: { estab: Estab }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function toggleOpen(v: boolean) {
    qc.setQueryData(["myEstab", estab.owner_id], { ...estab, is_open: v });
    await supabase.from("establishments").update({ is_open: v }).eq("id", estab.id);
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{estab.nome}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={estab.is_open ? "default" : "secondary"} className={estab.is_open ? "bg-emerald-500 text-white" : ""}>
                  {estab.is_open ? "Aberto" : "Fechado"}
                </Badge>
                <span className="hidden sm:inline">{estab.status === "aprovado" ? "Loja aprovada" : `Status: ${estab.status}`}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={estab.is_open} onCheckedChange={toggleOpen} />
              <Button variant="ghost" size="icon" aria-label="Notificações">
                <Bell className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sair"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/", replace: true });
                }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
