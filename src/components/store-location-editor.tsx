import { lazy, Suspense, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveStoreMapLocation, locateStoreAddress } from "@/lib/admin-map.functions";
import { deliveryPoint } from "@/lib/map-utils";
import { toast } from "sonner";
const Map = lazy(() => import("@/components/open-street-map"));
export function StoreLocationEditor({
  store,
}: {
  store: { id: string; nome: string; lat?: number | null; lng?: number | null };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" type="button" onClick={() => setOpen(true)}>
        Ajustar localização
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogTitle>Localização de {store.nome}</DialogTitle>
          <DialogDescription>
            Marque a entrada da loja no mapa e salve. Esse ponto será usado na coleta e no
            acompanhamento.
          </DialogDescription>
          {open && <LocationForm store={store} onSaved={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
function LocationForm({
  store,
  onSaved,
}: {
  store: { id: string; lat?: number | null; lng?: number | null };
  onSaved: () => void;
}) {
  const [lat, setLat] = useState(store.lat?.toString() ?? "");
  const [lng, setLng] = useState(store.lng?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = useServerFn(saveStoreMapLocation);
  const locate = useServerFn(locateStoreAddress);
  const qc = useQueryClient();
  const point = deliveryPoint({ lat: lat.replace(",", "."), lng: lng.replace(",", ".") });
  async function search() {
    setBusy(true);
    setError("");
    try {
      const p = await locate({ data: { id: store.id } });
      setLat(String(p.lat));
      setLng(String(p.lng));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível localizar o endereço.");
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!point || busy) return;
    setBusy(true);
    setError("");
    try {
      await save({ data: { id: store.id, ...point } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["map-establishments"] }),
        qc.invalidateQueries({ queryKey: ["myEstab"] }),
      ]);
      toast.success("Localização salva.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" onClick={search} disabled={busy}>
        Localizar endereço cadastrado
      </Button>
      <p className="text-xs text-muted-foreground">
        Toque no mapa para posicionar o ponto. Use + para aproximar.
      </p>
      <div className="h-64 overflow-hidden rounded-xl border">
        <Suspense fallback={<p className="p-4">Carregando mapa…</p>}>
          <Map
            markers={
              point
                ? [{ id: "store-location", ...point, title: "Entrada da loja", color: "#059669" }]
                : []
            }
            onSelectLocation={(p) => {
              setLat(p.lat.toFixed(6));
              setLng(p.lng.toFixed(6));
            }}
          />
        </Suspense>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="store-lat">Latitude</Label>
          <Input
            id="store-lat"
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="-23.550520"
          />
        </div>
        <div>
          <Label htmlFor="store-lng">Longitude</Label>
          <Input
            id="store-lng"
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="-46.633308"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button className="min-h-11 w-full" type="button" disabled={!point || busy} onClick={submit}>
        {busy ? "Aguarde…" : "Salvar localização"}
      </Button>
    </div>
  );
}
