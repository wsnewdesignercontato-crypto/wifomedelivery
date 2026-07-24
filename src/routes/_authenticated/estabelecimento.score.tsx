import { createFileRoute } from "@tanstack/react-router";
import { useMyEstab } from "@/hooks/use-my-estab";
import { ScoreHistory } from "@/components/score-history";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/score")({
  component: Page,
});

function Page() {
  const { estab } = useMyEstab();
  if (!estab) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <ScoreHistory entityType="establishment" entityId={estab.id} />
    </div>
  );
}
