// Fully procedural audio (Web Audio API). Starts only after a user gesture via Sound.init().
let ctx = null,
  master,
  sfx,
  mus,
  noiseBuf;
let timer = null,
  nextT = 0,
  step = 0,
  musicOn = false;
let volume = 0.7,
  muted = false,
  held = false; // true while the game is paused / tab hidden: a stray click must not wake the audio

const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const BASS = [45, 45, 57, 45, 48, 45, 57, 52, 45, 45, 57, 45, 43, 45, 55, 50];
const LEAD = [69, 0, 72, 0, 76, 72, 0, 69, 67, 0, 71, 0, 74, 0, 71, 0];
const STEP = 60 / 136 / 2;

function osc(type, f0, f1, dur, vol, dest, delay = 0) {
  const t = ctx.currentTime + delay,
    o = ctx.createOscillator(),
    g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest || sfx);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur, vol, type, f0, q, delay = 0, dest, f1) {
  const t = ctx.currentTime + delay,
    s = ctx.createBufferSource(),
    f = ctx.createBiquadFilter(),
    g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(dest || sfx);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.03);
}

function schedule() {
  while (nextT < ctx.currentTime + 0.18) {
    const s = step % 16,
      d = nextT - ctx.currentTime;
    if (s % 2 === 0) osc("sine", 150, 45, 0.16, 0.55, mus, d);
    else noise(0.04, 0.09, "highpass", 7000, 1, d, mus);
    osc("square", mtof(BASS[s]), 0, STEP * 0.9, 0.1, mus, d);
    if (LEAD[s]) osc("triangle", mtof(LEAD[s]), 0, STEP * 1.6, 0.16, mus, d);
    nextT += STEP;
    step++;
  }
}

// ---- Doll chant: "Mu-gung-hwa kkot-i pi-eot-seum-ni-da" (formant-synthesised child voice, no samples) ----
const VOW = {
  u: [330, 900, 2400],
  wa: [760, 1250, 2700],
  o: [520, 900, 2500],
  i: [320, 2400, 3200],
  eo: [620, 1050, 2600],
  eu: [360, 1300, 2500],
  a: [820, 1350, 2800],
};
// t = lyric, v = vowel, c = onset consonant, n = MIDI note, d = length in seconds at rate 1 (includes the gap before the next syllable)
const CHANT = [
  { t: "Mu", v: "u", c: "m", n: 72, d: 0.3 },
  { t: "gung", v: "u", c: "g", n: 72, d: 0.3 },
  { t: "hwa", v: "wa", c: "h", n: 76, d: 0.46, from: "u" },
  { t: "kkot", v: "o", c: "kk", n: 74, d: 0.3 },
  { t: "i", v: "i", c: "", n: 72, d: 0.46 },
  { t: "pi", v: "i", c: "p", n: 69, d: 0.26 },
  { t: "eot", v: "eo", c: "", n: 72, d: 0.26 },
  { t: "seum", v: "eu", c: "ss", n: 74, d: 0.26 },
  { t: "ni", v: "i", c: "n", n: 72, d: 0.26 },
  { t: "da", v: "a", c: "d", n: 67, d: 0.7, glide: -4 },
];
let chantBus = null;

function stopChant() {
  if (!ctx || !chantBus) return;
  const b = chantBus;
  chantBus = null;
  b.gain.cancelScheduledValues(ctx.currentTime);
  b.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
  setTimeout(() => {
    try {
      b.disconnect();
    } catch (e) {
      /* already gone */
    }
  }, 400);
}

function chantSyl(bus, t, dur, s) {
  const f0 = mtof(s.n),
    fs = 1.12; // fs shifts the formants up for a small, child-like voice
  const att = s.c === "m" || s.c === "n" ? 0.06 : 0.025;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.6, t + att);
  env.gain.setValueAtTime(0.6, t + Math.max(att, dur - 0.08));
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  env.connect(bus);

  const lfo = ctx.createOscillator(),
    lg = ctx.createGain(); // vibrato
  lfo.frequency.value = 5.6;
  lg.gain.value = f0 * 0.012;
  lfo.connect(lg);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);

  const F = VOW[s.v],
    Q = [9, 11, 13],
    G = [1.3, 0.9, 0.45];
  for (const det of [0, 9]) {
    // two slightly detuned saws = "doll" chorus
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.detune.value = det;
    o.frequency.setValueAtTime(f0, t);
    if (s.glide)
      o.frequency.exponentialRampToValueAtTime(mtof(s.n + s.glide), t + dur);
    lg.connect(o.frequency);
    F.forEach((f, k) => {
      const bp = ctx.createBiquadFilter(),
        g = ctx.createGain();
      bp.type = "bandpass";
      bp.Q.value = Q[k];
      g.gain.value = G[k];
      if (s.from) {
        bp.frequency.setValueAtTime(VOW[s.from][k] * fs, t);
        bp.frequency.linearRampToValueAtTime(f * fs, t + 0.1);
      } else bp.frequency.setValueAtTime(f * fs, t);
      o.connect(bp);
      bp.connect(g);
      g.connect(env);
    });
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const d = Math.max(0, t - ctx.currentTime - 0.01); // consonant noise bursts
  switch (s.c) {
    case "kk":
      noise(0.03, 0.28, "highpass", 2500, 1, d, bus);
      break;
    case "p":
      noise(0.035, 0.22, "lowpass", 1400, 1, d, bus);
      break;
    case "g":
      noise(0.03, 0.1, "lowpass", 900, 1, d, bus);
      break;
    case "d":
      noise(0.025, 0.18, "bandpass", 3000, 2, d, bus);
      break;
    case "h":
      noise(0.08, 0.16, "bandpass", 1800, 0.8, d, bus);
      break;
    case "ss":
      noise(0.09, 0.14, "highpass", 6500, 1, d, bus);
      break;
    default:
      break;
  }
}

export const Sound = {
  init() {
    if (ctx) {
      if (ctx.state === "suspended" && !held) ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);
    mus = ctx.createGain();
    mus.gain.value = 0;
    mus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Ambient wind bed (one persistent chain)
    const s = ctx.createBufferSource(),
      f = ctx.createBiquadFilter(),
      g = ctx.createGain();
    s.buffer = noiseBuf;
    s.loop = true;
    f.type = "bandpass";
    f.frequency.value = 380;
    f.Q.value = 0.4;
    g.gain.value = 0.05;
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start();
  },
  suspend() {
    held = true;
    if (ctx && ctx.state === "running") ctx.suspend();
  },
  resume() {
    held = false;
    if (ctx && ctx.state === "suspended") ctx.resume();
  },
  setVolume(v) {
    volume = v;
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : v, ctx.currentTime, 0.02);
  },
  setMuted(m) {
    muted = m;
    if (ctx) master.gain.setTargetAtTime(m ? 0 : volume, ctx.currentTime, 0.02);
  },

  musicStart() {
    if (!ctx || musicOn) return;
    musicOn = true;
    step = 0;
    nextT = ctx.currentTime + 0.05;
    mus.gain.cancelScheduledValues(ctx.currentTime);
    mus.gain.setTargetAtTime(0.35, ctx.currentTime, 0.02); // kept low so the chant stays on top
    timer = setInterval(schedule, 40);
  },
  musicStop() {
    if (!ctx) return;
    stopChant();
    musicOn = false;
    clearInterval(timer);
    mus.gain.cancelScheduledValues(ctx.currentTime);
    mus.gain.setTargetAtTime(0, ctx.currentTime, 0.012); // abrupt cut
  },

  // Sings the chant at the given speed (1 = normal). Returns when each syllable starts so the game can sync to it.
  chant(rate = 1) {
    const times = [],
      text = [];
    let acc = 0;
    for (const s of CHANT) {
      times.push(acc);
      text.push(s.t);
      acc += s.d / rate;
    }
    if (ctx) {
      stopChant();
      chantBus = ctx.createGain();
      chantBus.gain.value = 1;
      chantBus.connect(sfx);
      const t0 = ctx.currentTime + 0.03;
      CHANT.forEach((s, i) =>
        chantSyl(chantBus, t0 + times[i], (s.d / rate) * 0.88, s),
      );
    }
    return { times, text, total: acc };
  },
  chantStop() {
    stopChant();
  },
  // Length of the song at this speed without playing it (the online host keeps the rounds going after it is out)
  chantLength(rate = 1) {
    let acc = 0;
    for (const s of CHANT) acc += s.d / rate;
    return acc;
  },

  // Gunshot: crack + boom + echo; for the player also ringing ears, a slow heartbeat and the body dropping
  gunshot(far) {
    if (!ctx) return;
    const v = far ? 0.35 : 1;
    noise(0.09, 1.0 * v, "highpass", 1800, 0.7, 0, null, 300);
    osc("sine", 150, 38, 0.45, 0.95 * v);
    noise(0.9, 0.3 * v, "lowpass", 900, 0.8, 0.05, null, 120);
    osc("sine", 2400, 1000, 0.22, 0.08 * v, null, 0.14);
    if (!far) {
      osc("sine", 3100, 3000, 1.2, 0.05, null, 0.1);
      osc("sine", 55, 40, 0.18, 0.7, null, 0.55);
      osc("sine", 55, 40, 0.18, 0.55, null, 1.0);
      osc("sine", 120, 40, 0.3, 0.6, null, 0.45);
    }
  },
  bump() {
    if (ctx) {
      osc("sine", 130, 45, 0.16, 0.5);
      noise(0.07, 0.18, "lowpass", 600, 1);
    }
  },
  introSting() {
    if (!ctx) return;
    osc("sawtooth", 55, 110, 2.4, 0.12);
    noise(2.2, 0.12, "bandpass", 300, 1, 0, null, 2500);
    osc("sine", 90, 35, 0.9, 0.6, null, 0.35); // title hit
    osc("triangle", mtof(57), 0, 1.6, 0.14, null, 0.35);
    osc("triangle", mtof(60), 0, 1.6, 0.12, null, 0.35);
  },

  jump() {
    if (ctx) {
      osc("sine", 280, 620, 0.16, 0.22);
      noise(0.08, 0.08, "lowpass", 900, 1);
    }
  },
  click() {
    if (ctx) osc("sine", 700, 1000, 0.07, 0.2);
  },
  countdown(n) {
    if (!ctx) return;
    if (n > 0) osc("square", 440, 0, 0.16, 0.22);
    else {
      osc("square", 880, 0, 0.4, 0.26);
      osc("triangle", 1320, 0, 0.4, 0.2);
    }
  },
  green() {
    if (!ctx) return;
    osc("triangle", 523, 0, 0.14, 0.35);
    osc("triangle", 784, 0, 0.22, 0.35, null, 0.12);
  },
  red() {
    if (!ctx) return;
    osc("sawtooth", 260, 70, 0.6, 0.45);
    for (let i = 0; i < 3; i++)
      osc("square", 900, 0, 0.08, 0.22, null, i * 0.14);
    noise(0.5, 0.3, "lowpass", 2000, 1, 0, null, 200);
  },
  dollTurn() {
    if (!ctx) return;
    noise(0.45, 0.3, "bandpass", 500, 4, 0, null, 1400);
    osc("sawtooth", 80, 200, 0.4, 0.18);
  },
  footstep() {
    if (ctx) noise(0.07, 0.22, "lowpass", 600 + Math.random() * 500, 1);
  },
  crowdStep() {
    if (ctx) noise(0.09, 0.05, "lowpass", 500 + Math.random() * 300, 1);
  },
  eliminate(far) {
    if (!ctx) return;
    const v = far ? 0.3 : 1;
    noise(0.3, 0.8 * v, "bandpass", 1800, 0.8, 0, null, 250);
    osc("sine", 140, 40, 0.35, 0.8 * v);
  },
  victory() {
    if (!ctx) return;
    [72, 76, 79, 84].forEach((n, i) =>
      osc("triangle", mtof(n), 0, 0.35, 0.3, null, i * 0.12),
    );
    osc("sine", mtof(88), 0, 0.8, 0.2, null, 0.5);
  },
  gameOver() {
    if (ctx) osc("sawtooth", 220, 55, 0.9, 0.35);
  },
  // Low sinking drone under the fallen-player shot (the gunshot already has the ringing + heartbeat)
  deathSting() {
    if (!ctx) return;
    osc("sawtooth", 196, 49, 1.8, 0.12);
    osc("sine", 98, 33, 1.7, 0.35);
    noise(1.4, 0.1, "lowpass", 1200, 1, 0, null, 120);
  },
};
