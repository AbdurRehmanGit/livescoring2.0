// Synthesised sound effects via Web Audio API (no audio files needed).
let ctx: AudioContext | null = null;
function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noiseBuffer(c: AudioContext, seconds: number) {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function playClick() {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(900, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.05);
  g.gain.setValueAtTime(0.12, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.07);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.08);
}

export function playCheer() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 3);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1400;
  bp.Q.value = 0.6;
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 7;
  lfoGain.gain.value = 0.08;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.25);
  g.gain.setValueAtTime(0.5, t + 1.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.9);
  lfo.connect(lfoGain).connect(g.gain);
  src.connect(bp).connect(g).connect(c.destination);
  // whistles
  [0, 0.5, 1.1].forEach((d) => {
    const o = c.createOscillator();
    const og = c.createGain();
    o.frequency.setValueAtTime(1800, t + d);
    o.frequency.linearRampToValueAtTime(2600, t + d + 0.3);
    og.gain.setValueAtTime(0.0001, t + d);
    og.gain.exponentialRampToValueAtTime(0.05, t + d + 0.05);
    og.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
    o.connect(og).connect(c.destination);
    o.start(t + d);
    o.stop(t + d + 0.4);
  });
  lfo.start(t);
  src.start(t);
  lfo.stop(t + 3);
  src.stop(t + 3);
}

export function playBoo() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 2.5);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(500, t);
  lp.frequency.linearRampToValueAtTime(260, t + 2.2);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.7, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
  src.connect(lp).connect(g).connect(c.destination);
  [140, 165, 190].forEach((f) => {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 0.75, t + 2);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.03, t + 0.3);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    o.connect(lp);
    o.connect(og).connect(c.destination);
    o.start(t);
    o.stop(t + 2.2);
  });
  src.start(t);
  src.stop(t + 2.5);
}

export function playCoin() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  for (let i = 0; i < 14; i++) {
    const at = t + i * 0.09 * (1 + i * 0.04);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = 3200 + (i % 2) * 900;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.08, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    o.connect(g).connect(c.destination);
    o.start(at);
    o.stop(at + 0.14);
  }
}
