import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Store, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/estabelecimento")({
  component: EstabelecimentoHome,
});

function EstabelecimentoHome() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center justify-between">
          <IFomeLogo size="md" />
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/", replace: true });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
        <div className="mt-10 rounded-3xl border border-border bg-card p-8 text-center shadow-card">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-brand">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground">
            Painel do estabelecimento
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cadastro de restaurante, cardápio e pedidos ao vivo chegarão aqui em breve.
          </p>
        </div>
      </div>
    </div>
  );
}
