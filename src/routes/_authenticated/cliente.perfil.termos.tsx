import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, FileText, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cliente/perfil/termos")({
  head: () => ({
    meta: [
      { title: "Cliente — Perfil — Termos | PedeTrem" },
      { name: "description", content: "PedeTrem: cliente, perfil, termos." },
      { property: "og:title", content: "Cliente — Perfil — Termos | PedeTrem" },
      { property: "og:description", content: "PedeTrem: cliente, perfil, termos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermosPage,
});

const DOCS = [
  { title: "Termos de uso", desc: "Funcionamento e uso do PedeTrem", href: "/termos" },
  {
    title: "Política de privacidade",
    desc: "Dados, localização e armazenamento no dispositivo",
    href: "/privacidade",
  },
];

function TermosPage() {
  return (
    <div className="space-y-5">
      <Link
        to="/cliente/perfil"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <FileText className="h-5 w-5 text-primary" /> Termos e privacidade
      </h1>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {DOCS.map((d, i) => (
          <a
            key={d.title}
            href={d.href}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 ${
              i > 0 ? "border-t border-border" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{d.title}</p>
              <p className="truncate text-xs text-muted-foreground">{d.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        © {new Date().getFullYear()} PedeTrem. Todos os direitos reservados.
      </p>
    </div>
  );
}
