import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  listAppUsers,
  grantAppRole,
  revokeAppRole,
  manageAppUser,
} from "@/lib/admin-users.functions";
import {
  UsersDirectory,
  type AccountAction,
  type DirectoryUser,
} from "@/components/admin/users-directory";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Shield, ShieldOff, Ban, LockKeyholeOpen, Trash2, Mail, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários & Admins | PedeTrem" },
      {
        name: "description",
        content: "Gerencie contas, perfis e permissões de acesso no PedeTrem.",
      },
    ],
  }),
  component: AdminUsers,
});

const actionCopy = {
  delete: {
    title: "Excluir conta e e-mail?",
    description:
      "O e-mail de acesso e o login serão removidos. A exclusão não pode ser desfeita. O histórico de pedidos e pagamentos será preservado.",
    button: "Excluir conta",
    icon: Trash2,
  },
  block: {
    title: "Bloquear usuário?",
    description: "Este usuário perderá o acesso à plataforma. Você poderá desbloqueá-lo depois.",
    button: "Bloquear usuário",
    icon: Ban,
  },
  unblock: {
    title: "Desbloquear usuário?",
    description: "Este usuário poderá entrar novamente com o mesmo e-mail e senha.",
    button: "Desbloquear usuário",
    icon: LockKeyholeOpen,
  },
  grant: {
    title: "Tornar administrador?",
    description:
      "Esta conta terá acesso ao painel administrativo e poderá gerenciar a plataforma. Conceda acesso apenas a pessoas de confiança.",
    button: "Tornar administrador",
    icon: Shield,
  },
  revoke: {
    title: "Remover administrador?",
    description:
      "Esta conta perderá o acesso administrativo. Seus outros perfis serão mantidos. O último administrador não pode ser removido.",
    button: "Remover administrador",
    icon: ShieldOff,
  },
};

function AdminUsers() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const list = useServerFn(listAppUsers);
  const manage = useServerFn(manageAppUser);
  const grant = useServerFn(grantAppRole);
  const revoke = useServerFn(revokeAppRole);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [accountDialog, setAccountDialog] = useState<{
    id: string;
    email: string;
    action: AccountAction;
  } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const {
    data: result,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin-users", user.id, searchTerm, page, role, status],
    queryFn: () => list({ data: { search: searchTerm, page, role, status } }),
  });

  const actionMut = useMutation({
    mutationFn: async (data: {
      targetUserId: string;
      action: AccountAction;
      confirmedEmail: string;
    }) => {
      if (data.action === "grant")
        return grant({ data: { targetUserId: data.targetUserId, role: "admin" } });
      if (data.action === "revoke")
        return revoke({ data: { targetUserId: data.targetUserId, role: "admin" } });
      return manage({ data: { ...data, action: data.action } });
    },
    onSuccess: (_result, variables) => {
      const messages = {
        delete: "Conta e e-mail de acesso excluídos",
        block: "Usuário bloqueado",
        unblock: "Usuário desbloqueado",
        grant: "Administrador adicionado",
        revoke: "Acesso administrativo removido",
      };
      toast.success(messages[variables.action]);
      setAccountDialog(null);
      setConfirmation("");
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const openAction = (account: DirectoryUser, action: AccountAction) => {
    if (!account.email || account.id === user.id) return;
    if (account.roles.includes("admin") && (action === "delete" || action === "block")) return;
    setConfirmation("");
    setAccountDialog({ id: account.id, email: account.email, action });
  };
  const copy = accountDialog ? actionCopy[accountDialog.action] : null;
  const ActionIcon = copy?.icon ?? Shield;
  return (
    <>
      <UsersDirectory
        users={result?.users ?? []}
        summary={result?.summary}
        currentUserId={user.id}
        total={result?.total ?? 0}
        page={result?.page ?? page}
        totalPages={result?.totalPages ?? 1}
        search={search}
        role={role}
        status={status}
        loading={isLoading}
        refreshing={isFetching}
        error={isError}
        pending={actionMut.isPending}
        onSearch={setSearch}
        onRole={(value) => {
          setRole(value);
          setPage(1);
        }}
        onStatus={(value) => {
          setStatus(value);
          setPage(1);
        }}
        onPage={setPage}
        onRefresh={() => {
          void refetch();
        }}
        onReset={() => {
          setSearch("");
          setSearchTerm("");
          setRole("all");
          setStatus("all");
          setPage(1);
        }}
        onAction={openAction}
      />
      <Dialog
        open={!!accountDialog}
        onOpenChange={(open) => {
          if (!open && !actionMut.isPending) setAccountDialog(null);
        }}
      >
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-md rounded-3xl p-5 sm:p-6"
          onEscapeKeyDown={(event) => {
            if (actionMut.isPending) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (actionMut.isPending) event.preventDefault();
          }}
        >
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
            <ActionIcon className="size-6" />
          </div>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription className="leading-relaxed">{copy?.description}</DialogDescription>
          <div className="flex min-w-0 items-start gap-2 rounded-xl bg-muted/50 p-3 text-sm">
            <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
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
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={actionMut.isPending}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={actionMut.isPending}
              onClick={() => setAccountDialog(null)}
            >
              Cancelar
            </Button>
            <Button
              variant={accountDialog?.action === "delete" ? "destructive" : "default"}
              className="rounded-xl"
              disabled={
                !accountDialog ||
                actionMut.isPending ||
                (accountDialog.action === "delete" &&
                  confirmation.trim().toLowerCase() !== accountDialog.email.toLowerCase())
              }
              onClick={() => {
                if (accountDialog)
                  actionMut.mutate({
                    targetUserId: accountDialog.id,
                    action: accountDialog.action,
                    confirmedEmail:
                      accountDialog.action === "delete" ? confirmation.trim() : accountDialog.email,
                  });
              }}
            >
              {actionMut.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Aguarde...
                </>
              ) : (
                copy?.button
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
