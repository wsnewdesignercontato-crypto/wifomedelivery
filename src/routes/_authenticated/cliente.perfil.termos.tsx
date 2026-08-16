import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, FileText, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cliente/perfil/termos")({
  component: TermosPage,
});

const DOCS = [
  {
    title: "Termos de uso",
    desc: "Regras para usar o aplicativo WiFome",
    href: "https://wifome.com.br/termos",
  },
  {
    title: "Política de privacidade",
    desc: "Como tratamos seus dados",
    href: "https://wifome.com.br/privacidade",
  },
  {
    title: "Política de cookies",
    desc: "Uso de cookies e tecnologias similares",
    href: "https://wifome.com.br/cookies",
  },
  {
    title: "LGPD — Seus direitos",
    desc: "Consulta, exclusão e portabilidade de dados",
    href: "https://wifome.com.br/lgpd",
  },
  {
    title: "Código de conduta",
    desc: "Boas práticas para clientes, lojas e entregadores",
    href: "https://wifome.com.br/conduta",
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
        © {new Date().getFullYear()} WiFome. Todos os direitos reservados.
      </p>
    </div>
  );
}
