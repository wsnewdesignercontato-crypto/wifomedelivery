import { useState } from "react";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useDevicePreferences } from "@/hooks/use-device-preferences";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { previewRideRingtone } from "@/lib/ride-ringtone";

export function RingtoneTestButton() {
  const [busy, setBusy] = useState(false);
  const { prefs, updatePreference } = useDevicePreferences();
  async function test() {
    setBusy(true);
    try {
      const result = await previewRideRingtone();
      if (result === "playing")
        toast.success("Toque de pedidos e corridas testado. Confira o volume do aparelho.");
      else if (result === "muted")
        toast.info(
          "O som está desativado neste aplicativo. Ative Som nas configurações do dispositivo.",
        );
      else if (result === "blocked")
        toast.info("O navegador bloqueou o som. Toque novamente para tentar liberar.");
      else toast.error("Este navegador não permite reproduzir o toque.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Som no aplicativo</p>
        <p className="text-xs text-muted-foreground">Toque de pedidos e corridas</p>
      </div>
      <Switch
        aria-label="Som no aplicativo"
        checked={prefs.som}
        onCheckedChange={(value) => updatePreference("som", value)}
      />
      <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => void test()}>
        <Volume2 aria-hidden="true" /> Testar toque
      </Button>
    </div>
  );
}
