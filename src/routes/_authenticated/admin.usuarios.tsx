import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listAppUsers,
  grantAppRole,
  revokeAppRole,
  manageAppUser,
} from "@/lib/admin-users.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  ShieldOff,
  Search,
  Ban,
  LockKeyholeOpen,
  Trash2,
  UserRound,
  Mail,
  Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  head: () => ({
    meta: [
      { title: "Admin — Usuários | PedeTrem" },
      { name: "description", content: "PedeTrem: admin, usuários." },
      { property: "og:title", content: "Admin — Usuários | PedeTrem" },
      { property: "og:description", content: "PedeTrem: admin, usuários." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminUsers,
});

const ROLES = ["cliente", "estabelecimento", "entregador", "admin"] as const;
type Role = (typeof ROLES)[number];

function AdminUsers() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const manage = useServerFn(manageAppUser);
  const [accountDialog, setAccountDialog] = useState<{
    id: string;
    email: string;
    action: "block" | "unblock" | "delete";
  } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const list = useServerFn(listAppUsers);
  const grant = useServerFn(grantAppRole);
  const revoke = useServerFn(revokeAppRole);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const {
    data: result,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["admin-users", search, page],
    queryFn: () => list({ data: { search, page } }),
  });
  const users = result?.users ?? [];

  const grantMut = useMutation({
    mutationFn: (v: { targetUserId: string; role: Role }) => grant({ data: v }),
    onSuccess: () => {
      toast.success("Papel concedido");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (v: { targetUserId: string; role: Role }) => revoke({ data: v }),
    onSuccess: () => {
      toast.success("Papel removido");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accountMut = useMutation({
    mutationFn: (v: {
      targetUserId: string;
      action: "block" | "unblock" | "delete";
      confirmedEmail: string;
    }) => manage({ data: v }),
    onSuccess: (result) => {
      toast.success(
        result.action === "delete"
          ? "Conta e e-mail de acesso excluídos"
          : result.action === "block"
            ? "Usuário bloqueado"
            : "Usuário desbloqueado",
      );
      setAccountDialog(null);
      setConfirmation("");
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const pending = accountMut.isPending || grantMut.isPending || revokeMut.isPending;
  const openAction = (
    u: { id: string; email: string | null },
    action: "block" | "unblock" | "delete",
  ) => {
    if (!u.email) return;
    setConfirmation("");
    setAccountDialog({ id: u.id, email: u.email, action });
  };
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5 pb-6">
      <div className="flex min-w-0 items-start gap-3">
        <div className="rounded-2xl bg-orange-500/10 p-3 text-orange-600">
          <Shield className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Contas, permissões e acesso à plataforma.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar usuários por e-mail"
            placeholder="Buscar por e-mail…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            maxLength={254}
            className="pl-9"
          />
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">
          {result?.total ?? 0} contas cadastradas
        </span>
      </div>
      {isError && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          Não foi possível carregar os usuários. Tente novamente.
        </p>
      )}
      {isLoading && (
        <p
          role="status"
          className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando usuários…
        </p>
      )}
      {!isLoading && !isError && users.length === 0 && (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum usuário encontrado.
        </p>
      )}
      <div className="grid min-w-0 gap-3">
        {users.map((u) => {
          const roles = u.roles as Role[];
          const isAdmin = roles.includes("admin");
          const own = u.id === user.id;
          const protectedAccount = own || isAdmin;
          return (
            <article
              key={u.id}
              className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-semibold leading-relaxed">
                    {u.email ?? "Sem e-mail"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge
                      variant="outline"
                      className={
                        u.blocked
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }
                    >
                      {u.blocked ? "Bloqueado" : "Ativo"}
                    </Badge>
                    {!u.confirmed && (
                      <Badge variant="outline" className="text-amber-600">
                        E-mail não confirmado
                      </Badge>
                    )}
                    {roles.map((r) => (
                      <Badge key={r} variant="secondary">
                        {r === "admin" ? "Administrador" : r}
                      </Badge>
                    ))}
                    {own && <Badge variant="outline">Sua conta</Badge>}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cadastro:{" "}
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("pt-BR") : "—"}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border/70 pt-4 sm:flex sm:flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || own}
                  onClick={() => {
                    if (
                      confirm(
                        isAdmin
                          ? `Remover admin de ${u.email}?`
                          : `Tornar ${u.email} administrador master?`,
                      )
                    )
                      (isAdmin ? revokeMut : grantMut).mutate({
                        targetUserId: u.id,
                        role: "admin",
                      });
                  }}
                >
                  {isAdmin ? (
                    <ShieldOff className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Shield className="mr-1.5 h-4 w-4" />
                  )}
                  {isAdmin ? "Remover admin" : "Tornar admin"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || own || (!u.blocked && isAdmin)}
                  onClick={() => openAction(u, u.blocked ? "unblock" : "block")}
                >
                  {u.blocked ? (
                    <LockKeyholeOpen className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Ban className="mr-1.5 h-4 w-4" />
                  )}
                  {u.blocked ? "Desbloquear usuário" : "Bloquear usuário"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={pending || protectedAccount}
                  onClick={() => openAction(u, "delete")}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Excluir conta e e-mail
                </Button>
              </div>
              {protectedAccount && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {own
                    ? "Sua própria conta está protegida contra bloqueio e exclusão."
                    : "Para bloquear ou excluir, remova antes o papel de administrador."}
                </p>
              )}
            </article>
          );
        })}
      </div>
      <div className="flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
        <span className="text-muted-foreground">
          Página {page} de {result?.totalPages ?? 1}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={isLoading || page <= 1 || pending}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={isLoading || !result || page >= result.totalPages || pending}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
      <Dialog
        open={!!accountDialog}
        onOpenChange={(open) => {
          if (!open && !accountMut.isPending) setAccountDialog(null);
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-3xl p-5 sm:p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-foreground">
            {accountDialog?.action === "delete" ? (
              <Trash2 className="h-6 w-6 text-destructive" />
            ) : accountDialog?.action === "block" ? (
              <Ban className="h-6 w-6" />
            ) : (
              <LockKeyholeOpen className="h-6 w-6" />
            )}
          </div>
          <DialogTitle>
            {accountDialog?.action === "delete"
              ? "Excluir conta e e-mail?"
              : accountDialog?.action === "block"
                ? "Bloquear usuário?"
                : "Desbloquear usuário?"}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {accountDialog?.action === "delete"
              ? "O e-mail de acesso e o login serão removidos. A exclusão não pode ser desfeita. O histórico de pedidos e pagamentos será preservado."
              : accountDialog?.action === "block"
                ? "Este usuário perderá o acesso à plataforma. Você poderá desbloqueá-lo depois."
                : "Este usuário poderá entrar novamente com o mesmo e-mail e senha."}
          </DialogDescription>
          <div className="flex min-w-0 items-start gap-2 rounded-xl bg-muted/50 p-3 text-sm">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-all font-medium">{accountDialog?.email}</span>
          </div>
          {accountDialog?.action === "delete" && (
            <div className="space-y-2">
              <Label htmlFor="delete-account-email">Digite o e-mail para confirmar</Label>
              <Input
                id="delete-account-email"
                type="email"
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={accountMut.isPending}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={accountMut.isPending}
              onClick={() => setAccountDialog(null)}
            >
              Cancelar
            </Button>
            <Button
              variant={accountDialog?.action === "delete" ? "destructive" : "default"}
              disabled={
                !accountDialog ||
                accountMut.isPending ||
                (accountDialog.action === "delete" &&
                  confirmation.trim().toLowerCase() !== accountDialog.email.toLowerCase())
              }
              onClick={() => {
                if (accountDialog)
                  accountMut.mutate({
                    targetUserId: accountDialog.id,
                    action: accountDialog.action,
                    confirmedEmail:
                      accountDialog.action === "delete" ? confirmation.trim() : accountDialog.email,
                  });
              }}
            >
              {accountMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : accountDialog?.action === "delete" ? (
                "Excluir conta"
              ) : accountDialog?.action === "block" ? (
                "Bloquear"
              ) : (
                "Desbloquear"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
