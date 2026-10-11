import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/admin-shell";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [
    { title: "Admin | PedeTrem" },
    { name: "description", content: "PedeTrem: admin." },
    { property: "og:title", content: "Admin | PedeTrem" },
    { property: "og:description", content: "PedeTrem: admin." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth", search: { perfil: "cliente" } });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/app" });
  },
  component: AdminShell,
});
