import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listAppUsers, grantAppRole, revokeAppRole } from "@/lib/admin-users.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldOff, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  component: AdminUsers,
});

const ROLES = ["cliente", "estabelecimento", "entregador", "admin"] as const;
type Role = (typeof ROLES)[number];

function AdminUsers() {
  const list = useServerFn(listAppUsers);
  const grant = useServerFn(grantAppRole);
  const revoke = useServerFn(revokeAppRole);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => list({ data: { search } }),
  });

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-orange-500" />
          Usuários & Admins
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie contas e conceda ou remova o papel de administrador master.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por e-mail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3">E-mail</th>
              <th className="text-left p-3">Papéis</th>
              <th className="text-left p-3">Criado</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  Nenhum usuário encontrado
                </td>
              </tr>
            )}
            {users.map((u) => {
              const roles = u.roles as Role[];
              const isAdmin = roles.includes("admin");
              return (
                <tr key={u.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{u.email}</div>
                    {!u.confirmed && (
                      <div className="text-xs text-amber-600">E-mail não confirmado</div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {roles.length === 0 && (
                        <span className="text-xs text-muted-foreground">nenhum</span>
                      )}
                      {roles.map((r) => (
                        <Badge
                          key={r}
                          variant={r === "admin" ? "default" : "secondary"}
                          className={r === "admin" ? "bg-orange-500 hover:bg-orange-600" : ""}
                        >
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="p-3 text-right">
                    {isAdmin ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm(`Remover admin de ${u.email}?`))
                            revokeMut.mutate({ targetUserId: u.id, role: "admin" });
                        }}
                      >
                        <ShieldOff className="h-4 w-4 mr-1" />
                        Remover admin
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-orange-500 hover:bg-orange-600"
                        onClick={() => {
                          if (confirm(`Tornar ${u.email} administrador master?`))
                            grantMut.mutate({ targetUserId: u.id, role: "admin" });
                        }}
                      >
                        <Shield className="h-4 w-4 mr-1" />
                        Tornar admin
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
