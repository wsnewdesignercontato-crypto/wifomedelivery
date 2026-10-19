import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Bike,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Ellipsis,
  LockKeyhole,
  LockKeyholeOpen,
  Mail,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Store,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type UserRole = "cliente" | "estabelecimento" | "entregador" | "admin";
export type AccountAction = "block" | "unblock" | "delete" | "grant" | "revoke";
export type DirectoryUser = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  blocked: boolean;
  roles: string[];
};
export type DirectorySummary = Record<
  UserRole | "total" | "active" | "blocked" | "pending",
  number
>;

const profiles = [
  { value: "all", label: "Todas as contas", icon: Users, tone: "text-primary" },
  { value: "cliente", label: "Clientes", icon: UserRound, tone: "text-red-600 dark:text-red-400" },
  {
    value: "estabelecimento",
    label: "Estabelecimentos",
    icon: Store,
    tone: "text-orange-600 dark:text-orange-400",
  },
  {
    value: "entregador",
    label: "Entregadores",
    icon: Bike,
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  {
    value: "admin",
    label: "Administradores",
    icon: ShieldCheck,
    tone: "text-violet-600 dark:text-violet-400",
  },
] as const;
const roleStyles: Record<UserRole, string> = {
  cliente: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  estabelecimento: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  entregador: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  admin: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
};
const roleLabels: Record<UserRole, string> = {
  cliente: "Cliente",
  estabelecimento: "Estabelecimento",
  entregador: "Entregador",
  admin: "Admin",
};
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});
const dateLabel = (value: string | null) =>
  value ? dateFormat.format(new Date(value)) : "Ainda não acessou";

function UserIdentity({ account, own }: { account: DirectoryUser; own: boolean }) {
  const isAdmin = account.roles.includes("admin");
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        aria-hidden="true"
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold",
          isAdmin
            ? "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
            : "bg-secondary text-muted-foreground",
        )}
      >
        {isAdmin ? (
          <ShieldCheck className="size-5" />
        ) : (
          account.email?.slice(0, 2).toUpperCase() || <UserRound className="size-5" />
        )}
      </div>
      <div className="min-w-0">
        <p
          title={account.email ?? undefined}
          className="truncate text-sm font-semibold text-foreground"
        >
          {account.email ?? "Conta sem e-mail"}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {own ? (
            <>
              <LockKeyhole className="size-3" /> Sua conta
            </>
          ) : account.confirmed ? (
            <>
              <Check className="size-3 text-emerald-600" /> E-mail confirmado
            </>
          ) : (
            <>
              <Mail className="size-3" /> Confirmação pendente
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function ProfileBadges({ roles }: { roles: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.length ? (
        roles.map((role) => (
          <span
            key={role}
            className={cn(
              "inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold leading-none",
              roleStyles[role as UserRole] ?? "bg-muted text-muted-foreground",
            )}
          >
            {roleLabels[role as UserRole] ?? role}
          </span>
        ))
      ) : (
        <span className="text-xs text-muted-foreground">Sem perfil atribuído</span>
      )}
    </div>
  );
}

function AccountStatus({ account }: { account: DirectoryUser }) {
  const status = account.blocked ? "blocked" : account.confirmed ? "active" : "pending";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        status === "blocked"
          ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          : status === "active"
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {status === "blocked" ? "Bloqueado" : status === "active" ? "Ativo" : "Aguardando e-mail"}
    </span>
  );
}

function AccountMenu({
  account,
  own,
  pending,
  onAction,
}: {
  account: DirectoryUser;
  own: boolean;
  pending: boolean;
  onAction: (account: DirectoryUser, action: AccountAction) => void;
}) {
  const admin = account.roles.includes("admin");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          disabled={pending || !account.email}
          className="size-9 shrink-0 rounded-xl text-muted-foreground"
          aria-label={`Ações para ${account.email ?? "conta sem e-mail"}`}
        >
          <Ellipsis className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Gerenciar conta
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="rounded-lg py-2.5"
          disabled={own}
          onSelect={() => onAction(account, admin ? "revoke" : "grant")}
        >
          {admin ? <ShieldOff /> : <Shield />}{" "}
          {admin ? "Remover administrador" : "Tornar administrador"}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-lg py-2.5"
          disabled={own || (!account.blocked && admin)}
          onSelect={() => onAction(account, account.blocked ? "unblock" : "block")}
        >
          {account.blocked ? <LockKeyholeOpen /> : <Ban />}{" "}
          {account.blocked ? "Desbloquear usuário" : "Bloquear usuário"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="rounded-lg py-2.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
          disabled={own || admin}
          onSelect={() => onAction(account, "delete")}
        >
          <Trash2 /> Excluir conta e e-mail
        </DropdownMenuItem>
        {(own || admin) && (
          <p className="px-2 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {own
              ? "Sua conta está protegida contra alterações de acesso por aqui."
              : "Remova o perfil de administrador antes de bloquear ou excluir."}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Props = {
  users: DirectoryUser[];
  summary?: DirectorySummary;
  currentUserId: string;
  total: number;
  page: number;
  totalPages: number;
  search: string;
  role: string;
  status: string;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  pending: boolean;
  onSearch: (value: string) => void;
  onRole: (value: string) => void;
  onStatus: (value: string) => void;
  onPage: (page: number) => void;
  onRefresh: () => void;
  onReset: () => void;
  onAction: (account: DirectoryUser, action: AccountAction) => void;
};

export function UsersDirectory(props: Props) {
  const { users, summary, total, page, totalPages, loading, error, pending } = props;
  const filtered = props.search !== "" || props.role !== "all" || props.status !== "all";
  const metrics = [
    {
      label: "Total de contas",
      value: summary?.total,
      icon: Users,
      detail: "Todos os perfis da plataforma",
      color: "text-primary bg-primary/8",
      accent: true,
    },
    {
      label: "Contas ativas",
      value: summary?.active,
      icon: CircleCheck,
      detail: "E-mail confirmado e acesso liberado",
      color: "text-emerald-600 bg-emerald-500/10",
      accent: false,
    },
    {
      label: "Aguardando e-mail",
      value: summary?.pending,
      icon: Clock3,
      detail: "Confirmação de cadastro pendente",
      color: "text-amber-600 bg-amber-500/10",
      accent: false,
    },
    {
      label: "Contas bloqueadas",
      value: summary?.blocked,
      icon: LockKeyhole,
      detail: "Acesso à plataforma suspenso",
      color: "text-slate-600 bg-slate-500/10 dark:text-slate-300",
      accent: false,
    },
  ];
  return (
    <div className="w-full min-w-0 space-y-6 pb-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="h-px w-5 bg-primary" /> Controle de acesso
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-[32px]">
            Usuários & Admins<span className="text-primary">.</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Pessoas que fazem o PedeTrem acontecer. Gerencie perfis e acessos em um só lugar.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={props.onRefresh}
          disabled={props.refreshing || pending}
          className="h-10 shrink-0 self-start rounded-xl bg-card sm:self-auto"
        >
          <RefreshCw className={cn("mr-2 size-4", props.refreshing && "animate-spin")} /> Atualizar
          lista
        </Button>
      </header>

      <section
        aria-label="Resumo de todas as contas"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={cn(
              "relative min-w-0 overflow-hidden rounded-2xl border bg-card p-4 sm:p-5",
              metric.accent
                ? "border-primary/20 shadow-[0_4px_24px_-12px_var(--primary)]"
                : "border-border/80",
            )}
          >
            {metric.accent && (
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground sm:text-sm">{metric.label}</p>
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-xl",
                  metric.color,
                )}
              >
                <metric.icon className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums">
              {metric.value == null ? "—" : metric.value.toLocaleString("pt-BR")}
            </p>
            <p className="mt-1.5 hidden text-[11px] leading-relaxed text-muted-foreground sm:block">
              {metric.detail}
            </p>
          </div>
        ))}
      </section>

      <section
        aria-label="Diretório de contas"
        className="min-w-0 rounded-2xl border border-border/80 bg-card shadow-sm"
      >
        <div className="flex flex-col justify-between gap-3 border-b border-border/70 px-4 py-5 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-secondary">
              <Users className="size-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">Diretório de contas</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Consulte os cadastros e controle suas permissões.
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-emerald-600" /> Ações com confirmação
          </span>
        </div>

        <div className="space-y-4 px-4 pb-5 pt-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Buscar usuários por e-mail"
                placeholder="Buscar uma conta pelo e-mail..."
                value={props.search}
                onChange={(e) => props.onSearch(e.target.value)}
                maxLength={254}
                className="h-11 rounded-xl border-border/80 bg-background pl-10 pr-10 shadow-none"
              />
              {props.search && (
                <button
                  type="button"
                  onClick={() => props.onSearch("")}
                  aria-label="Limpar busca"
                  className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="relative shrink-0">
              <SlidersHorizontal
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <select
                aria-label="Filtrar por situação"
                value={props.status}
                onChange={(e) => props.onStatus(e.target.value)}
                className="h-11 w-full rounded-xl border border-border/80 bg-background pl-10 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-56"
              >
                <option value="all">Todas as situações</option>
                <option value="active">Ativos</option>
                <option value="pending">Aguardando e-mail</option>
                <option value="blocked">Bloqueados</option>
              </select>
            </div>
          </div>
          <div aria-label="Filtrar por perfil" className="flex flex-wrap gap-1.5">
            {profiles.map((profile) => (
              <button
                key={profile.value}
                type="button"
                aria-pressed={props.role === profile.value}
                onClick={() => props.onRole(profile.value)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  props.role === profile.value
                    ? "border-primary/15 bg-primary/7 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <profile.icon
                  aria-hidden="true"
                  className={cn("size-3.5", props.role !== profile.value && profile.tone)}
                />
                {profile.label}
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] tabular-nums",
                    props.role === profile.value
                      ? "bg-primary/10"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {summary
                    ? summary[profile.value === "all" ? "total" : profile.value].toLocaleString(
                        "pt-BR",
                      )
                    : "—"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="mx-4 mb-6 rounded-xl bg-destructive/5 p-6 text-center sm:mx-6"
          >
            <p className="font-medium text-destructive">Não foi possível carregar as contas.</p>
            <Button variant="outline" className="mt-3" onClick={props.onRefresh}>
              Tentar novamente
            </Button>
          </div>
        ) : loading ? (
          <div role="status" aria-label="Carregando usuários" className="space-y-4 px-6 py-8">
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="flex animate-pulse items-center gap-4 motion-reduce:animate-none"
              >
                <span className="size-11 rounded-2xl bg-muted" />
                <span className="h-4 w-1/3 rounded bg-muted" />
                <span className="ml-auto h-6 w-20 rounded bg-muted" />
              </div>
            ))}
            <span className="sr-only">Carregando usuários...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary">
              <Search className="size-6 text-muted-foreground" />
            </span>
            <h3 className="text-base font-semibold">Nenhuma conta encontrada</h3>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              {filtered
                ? "Experimente outro e-mail ou ajuste os filtros da busca."
                : "Os novos cadastros aparecerão aqui."}
            </p>
            {filtered && (
              <Button variant="outline" className="mt-5 rounded-xl" onClick={props.onReset}>
                Limpar filtros
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden xl:block">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">
                  Contas cadastradas e suas permissões de acesso
                </caption>
                <thead>
                  <tr className="border-y border-border/70 bg-muted/35 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="w-[35%] py-3 pl-6 pr-3">
                      Conta
                    </th>
                    <th scope="col" className="w-[24%] px-3 py-3">
                      Perfis de acesso
                    </th>
                    <th scope="col" className="w-[17%] px-3 py-3">
                      Situação
                    </th>
                    <th scope="col" className="w-[18%] px-3 py-3">
                      Cadastro
                    </th>
                    <th scope="col" className="w-[6%] py-3 pr-6">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {users.map((account) => (
                    <tr key={account.id} className="transition-colors hover:bg-muted/20">
                      <td className="py-5 pl-6 pr-3">
                        <UserIdentity account={account} own={account.id === props.currentUserId} />
                      </td>
                      <td className="px-3 py-5">
                        <ProfileBadges roles={account.roles} />
                      </td>
                      <td className="px-3 py-5">
                        <AccountStatus account={account} />
                      </td>
                      <td className="px-3 py-5">
                        <p className="text-xs font-medium">{dateLabel(account.created_at)}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {account.last_sign_in_at
                            ? `Acesso: ${dateLabel(account.last_sign_in_at)}`
                            : "Ainda não acessou"}
                        </p>
                      </td>
                      <td className="py-5 pr-6">
                        <AccountMenu
                          account={account}
                          own={account.id === props.currentUserId}
                          pending={pending}
                          onAction={props.onAction}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 border-t border-border/60 bg-muted/15 p-3 sm:p-5 xl:hidden">
              {users.map((account) => (
                <article
                  key={account.id}
                  className="min-w-0 rounded-xl border border-border/70 bg-card p-4"
                >
                  <div className="flex min-w-0 items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <UserIdentity account={account} own={account.id === props.currentUserId} />
                    </div>
                    <AccountMenu
                      account={account}
                      own={account.id === props.currentUserId}
                      pending={pending}
                      onAction={props.onAction}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <ProfileBadges roles={account.roles} />
                    <AccountStatus account={account} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ArrowDownLeft className="size-3" /> Cadastro: {dateLabel(account.created_at)}
                    </span>
                    {account.last_sign_in_at && (
                      <span className="flex items-center gap-1">
                        <ArrowUpRight className="size-3" /> Acesso:{" "}
                        {dateLabel(account.last_sign_in_at)}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-border/70 px-4 py-4 text-xs sm:flex-row sm:px-6">
          <p role="status" className="text-muted-foreground">
            {error ? (
              "Lista indisponível"
            ) : loading ? (
              "Buscando contas..."
            ) : total === 0 ? (
              "0 contas"
            ) : (
              <>
                <span className="font-semibold text-foreground">
                  {(page - 1) * 20 + 1}–{Math.min(page * 20, total)}
                </span>{" "}
                de{" "}
                <span className="font-semibold text-foreground">
                  {total.toLocaleString("pt-BR")}
                </span>{" "}
                {total === 1 ? "conta" : "contas"}
                {filtered && (total === 1 ? " encontrada" : " encontradas")}
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="size-9 rounded-lg"
              aria-label="Página anterior"
              disabled={loading || error || page <= 1 || pending}
              onClick={() => props.onPage(page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 text-muted-foreground">
              Página <span className="font-semibold text-foreground">{page}</span> de {totalPages}
            </span>
            <Button
              size="icon"
              variant="outline"
              className="size-9 rounded-lg"
              aria-label="Próxima página"
              disabled={loading || error || page >= totalPages || pending}
              onClick={() => props.onPage(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </footer>
      </section>
      <p className="flex items-start justify-center gap-2 px-2 text-center text-[11px] leading-relaxed text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-3 shrink-0" /> Uma conta pode ter mais de um perfil. As
        permissões são compartilhadas entre os aplicativos.
      </p>
    </div>
  );
}
