import { createFileRoute } from "@tanstack/react-router";
import { useMyCourier } from "@/hooks/use-courier";
import { ScoreHistory } from "@/components/score-history";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/entregador/score")({
  component: Page,
});

function Page() {
  const { courier } = useMyCourier();
  if (!courier) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <ScoreHistory entityType="courier" entityId={courier.user_id} />
    </div>
  );
}
