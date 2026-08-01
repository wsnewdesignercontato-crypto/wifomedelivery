// Toque contínuo de nova corrida (estilo Uber/99).
// Fica tocando em loop até a corrida ser aceita, recusada ou pega por outro.
let ctx: AudioContext | null = null;
let loopTimer: ReturnType<typeof setInterval> | null = null;
let unlocked = false;
let listenersBound = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
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
    if (unlocked) return;
    unlocked = true;
    const ac = getCtx();
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      g.gain.value = 0.0001;
      osc.connect(g).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 0.02);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("click", handler);
  window.addEventListener("touchstart", handler);
  window.addEventListener("keydown", handler);
  window.addEventListener("pointerdown", handler);
}

function burst() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  // 8 bipes alternados, bem audíveis (~1.3s)
  const pattern = [0, 0.14, 0.28, 0.42, 0.58, 0.74, 0.9, 1.06];
  pattern.forEach((t, i) => {
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "square";
      const base = i % 2 === 0 ? 980 : 1340;
      osc.frequency.setValueAtTime(base, now + t);
      osc.frequency.linearRampToValueAtTime(base + 460, now + t + 0.11);
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.95, now + t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.13);
      osc.connect(gain).connect(ac.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.15);
    } catch {
      /* ignore */
    }
  });
  try {
    navigator.vibrate?.([300, 100, 300, 100, 300, 100, 500]);
  } catch {
    /* ignore */
  }
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
  // Retoma o áudio se o app voltar ao foco durante a corrida
  document.addEventListener("visibilitychange", resumeIfPlaying);
}

function resumeIfPlaying() {
  if (loopTimer && ctx?.state === "suspended") void ctx.resume();
}

/** Para o toque. */
export function stopRideRingtone() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  try {
    document.removeEventListener("visibilitychange", resumeIfPlaying);
    navigator.vibrate?.(0);
  } catch {
    /* ignore */
  }
}
