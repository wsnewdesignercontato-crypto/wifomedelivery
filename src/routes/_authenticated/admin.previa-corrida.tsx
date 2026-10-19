import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { RideOfferCard, type Offer } from "@/components/entregador/new-ride-offer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/previa-corrida")({
  component: Preview,
});
const offer: Offer = {
  is_test: true,
  deliveryId: "preview-only",
  orderId: "preview-only",
  valorCents: 1250,
  totalPedidoCents: 3900,
  formaPagamento: "pix",
  pickup: {
    lat: -23.5505,
    lng: -46.6333,
    nome: "Hamburgueria Central",
    endereco: "Avenida das Flores, 250, Centro, São Paulo, SP",
  },
  dropoff: {
    lat: -23.5615,
    lng: -46.6559,
    endereco: "Rua das Palmeiras, 1180, Jardim Primavera, São Paulo, SP",
    bairro: "Jardim Primavera",
    complemento: "Bloco 2, apartamento 304",
    referencia: "Portaria principal",
  },
  cliente: { nome: "Cliente de demonstração", telefone: null },
  distanciaColeta: 1.2,
  distanciaEntrega: 2.8,
  observacoes: "Prévia visual. Os dados são fictícios e nenhuma corrida será enviada.",
};
function Preview() {
  const [open, setOpen] = useState(true);
  return (
    <div className="mx-auto max-w-lg space-y-4 py-4">
      <h1 className="text-xl font-bold">Prévia do card de corrida</h1>
      <p className="text-sm text-muted-foreground">
        Confira a apresentação no celular. Esta prévia usa dados fictícios e não cria pedidos,
        entregas ou notificações.
      </p>
      <Button onClick={() => setOpen(true)}>
        <Eye className="mr-2 h-4 w-4" />
        Ver card
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="theme-entregador flex w-[calc(100%-2rem)] min-w-0 max-w-[26rem] max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-3xl border border-white/10 p-0 shadow-2xl sm:w-[calc(100%-2rem)] sm:p-0"
        >
          <RideOfferCard
            offer={offer}
            offerMarkers={[
              { id: "pickup", lat: -23.5505, lng: -46.6333, title: "A · Coleta", color: "#10b981" },
              {
                id: "dropoff",
                lat: -23.5615,
                lng: -46.6559,
                title: "B · Entrega",
                color: "#ef4444",
              },
            ]}
            myPos={null}
            distanciaColetaLive={1.2}
            totalKm={4}
            eta={3}
            accepting={false}
            canAccept={true}
            aceitar={() => setOpen(false)}
            recusar={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
