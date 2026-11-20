// Fully procedural audio (Web Audio API). Starts only after a user gesture via Sound.init().
let ctx = null, master, sfx, mus, noiseBuf;
let timer = null, nextT = 0, step = 0, musicOn = false;
let volume = 0.7, muted = false;

const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
const BASS = [45, 45, 57, 45, 48, 45, 57, 52, 45, 45, 57, 45, 43, 45, 55, 50];
const LEAD = [69, 0, 72, 0, 76, 72, 0, 69, 67, 0, 71, 0, 74, 0, 71, 0];
const STEP = 60 / 136 / 2;

function osc(type, f0, f1, dur, vol, dest, delay = 0) {
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || sfx);
  o.start(t); o.stop(t + dur + 0.03);
}

function noise(dur, vol, type, f0, q, delay = 0, dest, f1) {
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest || sfx);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.03);
}

function schedule() {
  while (nextT < ctx.currentTime + 0.18) {
    const s = step % 16, d = nextT - ctx.currentTime;
    if (s % 2 === 0) osc('sine', 150, 45, 0.16, 0.55, mus, d);
    else noise(0.04, 0.09, 'highpass', 7000, 1, d, mus);
    osc('square', mtof(BASS[s]), 0, STEP * 0.9, 0.1, mus, d);
    if (LEAD[s]) osc('triangle', mtof(LEAD[s]), 0, STEP * 1.6, 0.16, mus, d);
    nextT += STEP; step++;
  }
}

export const Sound = {
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : volume; master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
    mus = ctx.createGain(); mus.gain.value = 0; mus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Ambient wind bed (one persistent chain)
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.4; g.gain.value = 0.05;
    s.connect(f); f.connect(g); g.connect(master); s.start();
  },
  suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
  resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
  setVolume(v) { volume = v; if (ctx) master.gain.setTargetAtTime(muted ? 0 : v, ctx.currentTime, 0.02); },
  setMuted(m) { muted = m; if (ctx) master.gain.setTargetAtTime(m ? 0 : volume, ctx.currentTime, 0.02); },

  musicStart() {
    if (!ctx || musicOn) return;
    musicOn = true; step = 0; nextT = ctx.currentTime + 0.05;
    mus.gain.cancelScheduledValues(ctx.currentTime);
    mus.gain.setTargetAtTime(1, ctx.currentTime, 0.02);
    timer = setInterval(schedule, 40);
  },
  musicStop() {
    if (!ctx) return;
    musicOn = false; clearInterval(timer);
    mus.gain.cancelScheduledValues(ctx.currentTime);
    mus.gain.setTargetAtTime(0, ctx.currentTime, 0.012); // abrupt cut
  },

  click() { if (ctx) osc('sine', 700, 1000, 0.07, 0.2); },
  countdown(n) {
    if (!ctx) return;
    if (n > 0) osc('square', 440, 0, 0.16, 0.22);
    else { osc('square', 880, 0, 0.4, 0.26); osc('triangle', 1320, 0, 0.4, 0.2); }
  },
  green() { if (!ctx) return; osc('triangle', 523, 0, 0.14, 0.35); osc('triangle', 784, 0, 0.22, 0.35, null, 0.12); },
  red() {
    if (!ctx) return;
    osc('sawtooth', 260, 70, 0.6, 0.45);
    for (let i = 0; i < 3; i++) osc('square', 900, 0, 0.08, 0.22, null, i * 0.14);
    noise(0.5, 0.3, 'lowpass', 2000, 1, 0, null, 200);
  },
  dollTurn() { if (!ctx) return; noise(0.45, 0.3, 'bandpass', 500, 4, 0, null, 1400); osc('sawtooth', 80, 200, 0.4, 0.18); },
  footstep() { if (ctx) noise(0.07, 0.22, 'lowpass', 600 + Math.random() * 500, 1); },
  crowdStep() { if (ctx) noise(0.09, 0.05, 'lowpass', 500 + Math.random() * 300, 1); },
  eliminate(far) {
    if (!ctx) return;
    const v = far ? 0.3 : 1;
    noise(0.3, 0.8 * v, 'bandpass', 1800, 0.8, 0, null, 250);
    osc('sine', 140, 40, 0.35, 0.8 * v);
  },
  victory() {
    if (!ctx) return;
    [72, 76, 79, 84].forEach((n, i) => osc('triangle', mtof(n), 0, 0.35, 0.3, null, i * 0.12));
    osc('sine', mtof(88), 0, 0.8, 0.2, null, 0.5);
  },
  gameOver() { if (ctx) osc('sawtooth', 220, 55, 0.9, 0.35); }
};
