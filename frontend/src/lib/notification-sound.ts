let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  gain: number = 0.15
) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  gainNode.gain.setValueAtTime(0, ctx.currentTime + start);
  gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

export function playMessageAlert() {
  const ctx = getCtx();
  if (!ctx) return;
  playTone(ctx, 1568, 0, 0.12, "sine", 0.18);
  playTone(ctx, 1319, 0.13, 0.18, "sine", 0.16);
}

export function playSendAlert() {
  const ctx = getCtx();
  if (!ctx) return;
  playTone(ctx, 1319, 0, 0.1, "sine", 0.14);
  playTone(ctx, 1568, 0.11, 0.12, "sine", 0.14);
}
