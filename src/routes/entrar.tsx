import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/entrar")({
  beforeLoad: () => {
    throw redirect({ to: "/auth", search: { perfil: "cliente" } });
  },
});
