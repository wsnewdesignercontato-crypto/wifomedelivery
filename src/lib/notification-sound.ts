// Toca um "sininho" curto usando WebAudio (sem asset externo).
// Duas notas rápidas com decaimento suave — parecido com bell do iOS.
let ctx: AudioContext | null = null;
let lastPlay = 0;

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

function tone(ac: AudioContext, freq: number, start: number, dur = 0.35, gain = 0.18) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.02);
}

export function playBellChime() {
  const now = Date.now();
  if (now - lastPlay < 600) return; // debounce contra bursts
  lastPlay = now;
  const ac = getCtx();
  if (!ac) return;
  try {
    tone(ac, 1760, 0, 0.35, 0.16); // A6
    tone(ac, 1318.5, 0.12, 0.45, 0.14); // E6
  } catch {
    /* ignore */
  }
}
