// Toque contínuo de nova corrida (estilo Uber/99).
// Fica tocando em loop até a corrida ser aceita, recusada ou pega por outro.
import {
  readDevicePreferences,
  subscribeDevicePreferences,
  vibrateDevice,
} from "@/lib/device-preferences";

let ctx: AudioContext | null = null;
let loopTimer: ReturnType<typeof setInterval> | null = null;
let activeNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
let listenersBound = false;
let stopPreferenceListener: (() => void) | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      (
        window as unknown as {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        }
      ).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx || ctx.state === "closed") ctx = new AC();
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Destrava o áudio no primeiro gesto do usuário (política de autoplay). */
export function ensureRingtoneUnlocked() {
  if (typeof window === "undefined" || listenersBound) return;
  listenersBound = true;
  const handler = () => {
    if (!readDevicePreferences().som) return;
    const needsResume = !ctx || ctx.state !== "running";
    if (!needsResume) return;
    const ac = getCtx();
    if (!ac) return;
    // Every later gesture may retry if the browser rejected an earlier unlock.
    void ac
      .resume()
      .then(() => {
        if (loopTimer) burst();
      })
      .catch(() => {});
  };
  window.addEventListener("click", handler);
  window.addEventListener("touchstart", handler);
  window.addEventListener("keydown", handler);
  window.addEventListener("pointerdown", handler);
}

function burst() {
  vibrateDevice([300, 100, 300, 100, 300, 100, 500]);
  if (!readDevicePreferences().som) return;
  const ac = getCtx();
  if (!ac || ac.state !== "running") return;
  const now = ac.currentTime;
  // 8 bipes alternados, bem audíveis (~1.3s)
  const pattern = [0, 0.14, 0.28, 0.42, 0.58, 0.74, 0.9, 1.06];
  pattern.forEach((t, i) => {
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "triangle";
      const base = [659, 784, 880, 784][i % 4];
      osc.frequency.setValueAtTime(base, now + t);
      osc.frequency.linearRampToValueAtTime(base + 40, now + t + 0.11);
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.28, now + t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.13);
      osc.connect(gain).connect(ac.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.15);
      activeNodes.push({ osc, gain });
      osc.onended = () => {
        activeNodes = activeNodes.filter((n) => n.osc !== osc);
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      /* ignore */
    }
  });
}

export function isRideRingtonePlaying() {
  return loopTimer != null;
}

/** Inicia o toque contínuo. Idempotente. */
export function startRideRingtone() {
  if (typeof window === "undefined") return;
  ensureRingtoneUnlocked();
  if (loopTimer) return;
  burst();
  loopTimer = setInterval(burst, 1500);
  stopPreferenceListener = subscribeDevicePreferences(() => {
    const prefs = readDevicePreferences();
    if (!prefs.som) silenceActiveNodes();
    if (!prefs.vibracao) navigator.vibrate?.(0);
  });
  // Retoma o áudio se o app voltar ao foco durante a corrida
  document.addEventListener("visibilitychange", resumeIfPlaying);
}

function resumeIfPlaying() {
  if (loopTimer && ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
}

/** Para o toque imediatamente (corta inclusive bipes já agendados). */
export function stopRideRingtone() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  stopPreferenceListener?.();
  stopPreferenceListener = null;
  silenceActiveNodes();
  try {
    document.removeEventListener("visibilitychange", resumeIfPlaying);
    navigator.vibrate?.(0);
  } catch {
    /* ignore */
  }
}

function silenceActiveNodes() {
  // Corta na hora tudo que já foi agendado no grafo de áudio
  const nodes = activeNodes;
  activeNodes = [];
  const t = ctx?.currentTime ?? 0;
  nodes.forEach(({ osc, gain }) => {
    try {
      osc.onended = null;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(0, t);
      osc.stop(t);
    } catch {
      /* ignore */
    }
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      /* ignore */
    }
  });
}

/** Short local preview; never stops or replaces an actual pending-order loop. */
export async function previewRideRingtone(): Promise<
  "playing" | "muted" | "unsupported" | "blocked"
> {
  if (!readDevicePreferences().som) return "muted";
  ensureRingtoneUnlocked();
  const ac = getCtx();
  if (!ac) return "unsupported";
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ac.resume().catch(() => {}),
      new Promise<void>((resolve) => {
        watchdog = setTimeout(resolve, 1200);
      }),
    ]);
  } finally {
    if (watchdog) clearTimeout(watchdog);
  }
  if (ac.state !== "running") return "blocked";
  if (!loopTimer) burst();
  return "playing";
}
