// Toque contínuo de nova corrida (estilo Uber/99).
// Fica tocando em loop até a corrida ser aceita, recusada ou pega por outro.
import {
  readDevicePreferences,
  subscribeDevicePreferences,
  vibrateDevice,
} from "@/lib/device-preferences";

const RINGTONE_URL = "/audio/pedetrem-alert-v1.mp3";
let musicBuffer: AudioBuffer | null = null;
let musicLoad: Promise<AudioBuffer | null> | null = null;
let retryMusicAfter = 0;
let activeMusic: AudioBufferSourceNode | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;
let previewEpoch = 0;
let stopPreviewPreferenceListener: (() => void) | null = null;
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
    if (!ctx || ctx.state === "closed") {
      stopMusic();
      ctx = new AC();
    }
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
  const initialContext = getCtx();
  if (initialContext && readDevicePreferences().som) void loadMusic(initialContext);
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
  if (musicBuffer) {
    playMusic(ac, true);
    return;
  }
  void loadMusic(ac).then((buffer) => {
    if (buffer && loopTimer && readDevicePreferences().som && ctx?.state === "running")
      playMusic(ctx, true);
  });
  if (activeMusic) return;
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
  previewEpoch++;
  burst();
  loopTimer = setInterval(burst, 1500);
  stopPreferenceListener = subscribeDevicePreferences(() => {
    const prefs = readDevicePreferences();
    if (!prefs.som) {
      stopMusic();
      silenceActiveNodes();
    } else if (loopTimer) burst();
    if (!prefs.vibracao) navigator.vibrate?.(0);
  });
  // Retoma o áudio se o app voltar ao foco durante a corrida
  document.addEventListener("visibilitychange", resumeIfPlaying);
}

function resumeIfPlaying() {
  if (loopTimer && document.visibilityState === "visible") burst();
}

/** Para o toque imediatamente (corta inclusive bipes já agendados). */
export function stopRideRingtone() {
  previewEpoch++;
  stopMusic();
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

/** Cached, same-origin music; the synthesized alert remains available on load failure. */
function loadMusic(ac: AudioContext): Promise<AudioBuffer | null> {
  if (musicBuffer) return Promise.resolve(musicBuffer);
  if (musicLoad) return musicLoad;
  if (Date.now() < retryMusicAfter) return Promise.resolve(null);
  musicLoad = fetch(RINGTONE_URL, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("Ringtone unavailable");
      return response.arrayBuffer();
    })
    .then((bytes) => ac.decodeAudioData(bytes))
    .then((buffer) => {
      musicBuffer = buffer;
      return buffer;
    })
    .catch(() => {
      retryMusicAfter = Date.now() + 30000;
      return null;
    })
    .finally(() => {
      musicLoad = null;
    });
  return musicLoad;
}

function stopMusic() {
  stopPreviewPreferenceListener?.();
  stopPreviewPreferenceListener = null;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = null;
  const source = activeMusic;
  activeMusic = null;
  if (!source) return;
  source.onended = null;
  try {
    source.stop();
  } catch {
    /* Already ended. */
  }
  source.disconnect();
}

function playMusic(ac: AudioContext, loop: boolean) {
  if (!musicBuffer || ac.state !== "running" || !readDevicePreferences().som) return;
  if (activeMusic) {
    if (loop) {
      activeMusic.loop = true;
      stopPreviewPreferenceListener?.();
      stopPreviewPreferenceListener = null;
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = null;
    }
    return;
  }
  silenceActiveNodes();
  const source = ac.createBufferSource();
  source.buffer = musicBuffer;
  source.loop = loop;
  source.connect(ac.destination);
  source.onended = () => {
    if (activeMusic === source) {
      activeMusic = null;
      stopPreviewPreferenceListener?.();
      stopPreviewPreferenceListener = null;
    }
    source.disconnect();
  };
  activeMusic = source;
  source.start();
  if (!loop) {
    stopPreviewPreferenceListener = subscribeDevicePreferences(() => {
      if (!readDevicePreferences().som) stopMusic();
    });
    previewTimer = setTimeout(() => {
      if (activeMusic === source && !loopTimer) stopMusic();
    }, 5000);
  }
}

/** Five-second local preview; never stops or replaces a pending-order loop. */
export async function previewRideRingtone(): Promise<
  "playing" | "muted" | "unsupported" | "blocked"
> {
  if (!readDevicePreferences().som) return "muted";
  ensureRingtoneUnlocked();
  const ac = getCtx();
  if (!ac) return "unsupported";
  const epoch = previewEpoch;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([ac.resume().catch(() => {}), loadMusic(ac)]),
      new Promise<void>((resolve) => {
        watchdog = setTimeout(resolve, 1200);
      }),
    ]);
  } finally {
    if (watchdog) clearTimeout(watchdog);
  }
  if (ac.state !== "running" || (epoch !== previewEpoch && !loopTimer)) return "blocked";
  if (!readDevicePreferences().som) return "muted";
  if (!loopTimer) {
    if (musicBuffer) playMusic(ac, false);
    else burst();
  }
  return "playing";
}
