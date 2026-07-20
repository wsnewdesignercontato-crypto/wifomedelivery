import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertOctagon, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SOSButton({ orderId, deliveryId }: { orderId?: string | null; deliveryId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<string>("assalto");
  const [detalhes, setDetalhes] = useState("");
  const [sending, setSending] = useState(false);

  async function trigger() {
    setSending(true);
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 }),
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch { /* no-op */ }

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSending(false); return toast.error("Sessão expirada"); }

    void deliveryId;
    const { error } = await supabase.from("sos_events").insert({
      courier_id: u.user.id,
      order_id: orderId ?? null,
      tipo,
      descricao: detalhes.trim() || null,
      lat, lng,
    });
    setSending(false);
    if (error) return toast.error("Falha ao acionar SOS");
    toast.success("🚨 SOS acionado. Nossa equipe foi notificada.");
    setOpen(false);
    setDetalhes("");
  }

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => setOpen(true)}
        className="gap-2 bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
      >
        <AlertOctagon className="h-4 w-4" /> SOS
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertOctagon className="h-5 w-5" /> Botão de Emergência
            </DialogTitle>
            <DialogDescription>
              Só use em caso real de emergência. Sua localização e dados serão enviados imediatamente para a central WiFome.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { k: "assalto", label: "Assalto / Roubo" },
                { k: "acidente", label: "Acidente" },
                { k: "ameaca", label: "Ameaça" },
                { k: "outro", label: "Outro" },
              ].map((t) => (
                <button
                  key={t.k} type="button"
                  onClick={() => setTipo(t.k)}
                  className={`rounded-xl border-2 p-3 font-semibold transition ${
                    tipo === t.k ? "border-red-600 bg-red-600/10 text-red-600" : "border-border bg-background"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              className="w-full rounded-xl border border-border bg-background p-3 text-sm"
              rows={3}
              placeholder="Detalhes (opcional)"
              value={detalhes}
              onChange={(e) => setDetalhes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={trigger}
              disabled={sending}
              className="bg-red-600 hover:bg-red-700"
            >
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertOctagon className="mr-2 h-4 w-4" />}
              Acionar emergência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
