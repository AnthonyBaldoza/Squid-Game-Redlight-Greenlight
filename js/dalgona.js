// Dalgona (honeycomb) round: carve along the shape without cracking the cookie.
//
//   import { startDalgona, mountDalgonaButton } from "./dalgona.js";
//   mountDalgonaButton();                       // floating button (hidden while a run is playing)
//   startDalgona({ onDone: (r) => {...} });     // r = { won, time, shape }   (optional)
//
// How it plays: hold the mouse / finger and trace the grooved line. Staying on the line carves it.
// Drifting away from it while pressed builds up cracks; a full crack meter or the timer ending = eliminated.
// Touch: the needle tip is drawn above your finger so you can see what you are carving.

import { settings } from "./settings.js";

const BEST_KEY = "rlgl_dalgona_best_";
const TAU = Math.PI * 2;
const WIN_AT = 0.97; // share of the line that must be carved

// ------------------------------------------------------------------ shapes (unit coordinates, cookie radius = 1)
const arc = (cx, cy, r, a0, a1, n = 64) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
const closed = (pts) => pts.concat([pts[0]]);

const SHAPES = [
  {
    id: "circle",
    name: "CIRCLE",
    time: 45,
    lines: () => [arc(0, 0, 0.62, 0, TAU, 96)],
  },
  {
    id: "triangle",
    name: "TRIANGLE",
    time: 55,
    lines: () => [
      closed(
        [-90, 30, 150].map((d) => [
          Math.cos((d * Math.PI) / 180) * 0.72,
          Math.sin((d * Math.PI) / 180) * 0.72 + 0.12,
        ]),
      ),
    ],
  },
  {
    id: "star",
    name: "STAR",
    time: 70,
    lines: () => [
      closed(
        Array.from({ length: 10 }, (_, i) => {
          const a = -Math.PI / 2 + (i * Math.PI) / 5,
            r = i % 2 ? 0.3 : 0.74;
          return [Math.cos(a) * r, Math.sin(a) * r + 0.04];
        }),
      ),
    ],
  },
  {
    id: "umbrella",
    name: "UMBRELLA",
    time: 80,
    lines: () => {
      const y0 = -0.08,
        R = 0.62,
        sr = R / 3;
      let body = arc(0, y0, R, Math.PI, TAU, 48); // the dome
      for (let k = 0; k < 3; k++)
        body = body.concat(arc(R - sr * (2 * k + 1), y0, sr, 0, Math.PI, 20)); // scalloped edge
      const handle = [
        [0, y0 + sr],
        [0, 0.58],
      ].concat(
        arc(-0.11, 0.58, 0.11, 0, Math.PI, 16), // the hook
      );
      return [body, handle];
    },
  },
];

// Evenly spaced points along the grooves; each one is carved when the needle passes close to it
function sample(lines, step = 0.014) {
  const out = [];
  for (const pts of lines) {
    out.push({ x: pts[0][0], y: pts[0][1], done: false });
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1],
        [x1, y1] = pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      let d = step - carry;
      while (d <= len) {
        const t = d / len;
        out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, done: false });
        d += step;
      }
      carry = len - (d - step);
    }
  }
  return out;
}

function makeCracks() {
  const all = [];
  for (let i = 0; i < 16; i++) {
    let a = Math.random() * TAU,
      x = Math.cos(a) * 0.15,
      y = Math.sin(a) * 0.15;
    const seg = [[x, y]];
    for (let j = 0; j < 5; j++) {
      a += (Math.random() - 0.5) * 0.9;
      x += Math.cos(a) * 0.17;
      y += Math.sin(a) * 0.17;
      seg.push([x, y]);
    }
    all.push(seg);
  }
  return all;
}

// ------------------------------------------------------------------ tiny sound helper
let ac = null;
function tone(f, d, type = "sine", v = 0.05, delay = 0) {
  if (settings && settings.muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ac.currentTime + delay,
      o = ac.createOscillator(),
      g = ac.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g);
    g.connect(ac.destination);
    o.start(t0);
    o.stop(t0 + d);
  } catch (e) {
    /* ignore */
  }
}

// ------------------------------------------------------------------ styles
const css = `
.dg-ov{position:fixed;inset:0;z-index:9998;background:#120a05;touch-action:none;user-select:none;
  -webkit-user-select:none;font-family:inherit;color:#fff}
.dg-c{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair}
.dg-x{position:absolute;top:10px;right:10px;padding:8px 14px;border:0;border-radius:10px;cursor:pointer;
  background:rgba(255,255,255,.12);color:#fff;font:inherit;font-size:14px;letter-spacing:.1em}
.dg-end{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  background:rgba(8,5,2,.72)}
.dg-end[hidden]{display:none}
.dg-card{width:min(90vw,380px);background:#2a1a0c;border-radius:16px;padding:24px 20px;text-align:center;
  box-shadow:0 10px 40px rgba(0,0,0,.6)}
.dg-card h2{margin:0 0 6px;font-size:30px;letter-spacing:.1em}
.dg-card p{margin:4px 0 12px;opacity:.85}
.dg-btn{display:block;width:100%;margin-top:10px;padding:11px;border:0;border-radius:10px;cursor:pointer;
  background:#e91e63;color:#fff;font:inherit;font-size:17px;letter-spacing:.1em}
.dg-btn.alt{background:#4a3320}
body.playing .dg-float{display:none}
.dg-float{position:fixed;top:52px;left:10px;z-index:50;padding:8px 12px;border:0;border-radius:10px;
  background:rgba(27,35,64,.85);color:#fff;font:inherit;font-size:14px;letter-spacing:.08em;cursor:pointer}
`;
let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);
}

// ------------------------------------------------------------------ the game
export function startDalgona(opts = {}) {
  ensureStyle();
  const ov = document.createElement("div");
  ov.className = "dg-ov";
  ov.innerHTML =
    '<canvas class="dg-c"></canvas><button class="dg-x">EXIT</button><div class="dg-end" hidden></div>';
  document.body.appendChild(ov);
  const cv = ov.querySelector("canvas"),
    ctx = cv.getContext("2d"),
    endEl = ov.querySelector(".dg-end");

  let W = 0,
    H = 0,
    R = 1,
    cx = 0,
    cy = 0,
    tolN = 0.065;
  let idx = Math.floor(Math.random() * SHAPES.length);
  let shape, polys, samples, cracks, crack, timeLeft, elapsed, state, carvedAny;
  const ptr = { has: false, down: false, px: 0, py: 0, nx: 0, ny: 0, dist: 0 };
  const specks = Array.from({ length: 70 }, () => {
    const a = Math.random() * TAU,
      r = Math.sqrt(Math.random()) * 0.93;
    return [Math.cos(a) * r, Math.sin(a) * r, 0.006 + Math.random() * 0.012];
  });
  let raf = 0,
    last = performance.now(),
    lastTick = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W * 0.44, H * 0.36);
    cx = W / 2;
    cy = H / 2 + H * 0.04;
    tolN = Math.max(0.065, 11 / R); // keeps the line forgiving on small screens
  }

  function reset(i) {
    idx = (i + SHAPES.length) % SHAPES.length;
    shape = SHAPES[idx];
    polys = shape.lines();
    samples = sample(polys);
    cracks = makeCracks();
    crack = 0;
    timeLeft = shape.time;
    elapsed = 0;
    state = "play";
    carvedAny = false;
    ptr.down = false;
    ptr.dist = 0;
    endEl.hidden = true;
  }

  const progress = () =>
    samples.reduce((n, s) => n + (s.done ? 1 : 0), 0) / samples.length;
  const bestOf = (id) =>
    parseFloat(localStorage.getItem(BEST_KEY + id)) || null;

  // ---- input
  function point(e) {
    const off = e.pointerType === "touch" ? 56 : 0; // tip floats above the finger
    ptr.has = true;
    ptr.px = e.clientX;
    ptr.py = e.clientY - off;
    ptr.nx = (ptr.px - cx) / R;
    ptr.ny = (ptr.py - cy) / R;
  }
  function onMove(e) {
    point(e);
    if (state !== "play" || !ptr.down) return;
    let dmin = Infinity,
      fresh = 0;
    for (const s of samples) {
      const d = Math.hypot(s.x - ptr.nx, s.y - ptr.ny);
      if (d < dmin) dmin = d;
      if (!s.done && d <= tolN) {
        s.done = true;
        fresh++;
      }
    }
    ptr.dist = dmin;
    if (fresh) {
      carvedAny = true;
      const now = performance.now();
      if (now - lastTick > 70) {
        lastTick = now;
        tone(900 + Math.random() * 200, 0.03, "square", 0.02);
      }
    }
  }
  const onDown = (e) => {
    try {
      cv.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    ptr.down = true;
    onMove(e);
  };
  const onUp = () => {
    ptr.down = false;
  };
  cv.addEventListener("pointerdown", onDown);
  cv.addEventListener("pointermove", onMove);
  cv.addEventListener("pointerup", onUp);
  cv.addEventListener("pointercancel", onUp);
  cv.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---- end of a run
  function finish(kind) {
    state = kind;
    const won = kind === "clear";
    let sub;
    if (won) {
      const t = shape.time - timeLeft,
        best = bestOf(shape.id),
        isNew = best === null || t < best;
      if (isNew) localStorage.setItem(BEST_KEY + shape.id, t.toFixed(2));
      sub =
        t.toFixed(2) +
        "s" +
        (isNew ? " (new best!)" : " (best " + best.toFixed(2) + "s)");
      tone(660, 0.14, "triangle", 0.07);
      tone(880, 0.14, "triangle", 0.07, 0.14);
      tone(1175, 0.3, "triangle", 0.07, 0.28);
    } else {
      sub = kind === "broken" ? "The cookie cracked." : "Time ran out.";
      tone(140, 0.4, "sawtooth", 0.1);
      tone(90, 0.5, "square", 0.06, 0.08);
    }
    const title = won ? "CLEAR!" : kind === "broken" ? "CRACKED" : "TIME'S UP";
    endEl.innerHTML =
      '<div class="dg-card"><h2>' +
      title +
      "</h2><p>" +
      shape.name +
      " · " +
      sub +
      "</p>" +
      '<button class="dg-btn" data-a="retry">RETRY</button>' +
      '<button class="dg-btn alt" data-a="next">NEXT SHAPE</button>' +
      '<button class="dg-btn alt" data-a="exit">EXIT</button></div>';
    endEl.hidden = false;
    if (opts.onDone)
      opts.onDone({
        won,
        time: won ? shape.time - timeLeft : null,
        shape: shape.id,
      });
  }
  endEl.addEventListener("click", (e) => {
    const a = e.target && e.target.dataset && e.target.dataset.a;
    if (a === "retry") reset(idx);
    else if (a === "next") reset(idx + 1);
    else if (a === "exit") exit();
  });

  function exit() {
    cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
    removeEventListener("keydown", onKey);
    ov.remove();
    if (opts.onExit) opts.onExit();
  }
  ov.querySelector(".dg-x").onclick = exit;
  const onKey = (e) => {
    if (e.code === "Escape") exit();
  };
  addEventListener("keydown", onKey);
  addEventListener("resize", resize);

  // ---- update + draw
  function update(dt) {
    if (state !== "play") return;
    timeLeft -= dt;
    elapsed += dt;
    if (ptr.down && ptr.dist > tolN * 1.9) {
      const first = crack < 0.34 && ptr.dist > tolN * 1.9;
      crack += dt * 0.9;
      if (first && crack >= 0.34) tone(220, 0.12, "sawtooth", 0.06); // warning crack
    } else crack = Math.max(0, crack - dt * 0.12);
    if (crack >= 1) return finish("broken");
    if (progress() >= WIN_AT) return finish("clear");
    if (timeLeft <= 0) {
      timeLeft = 0;
      finish("timeup");
    }
  }

  const P = (x, y) => [cx + x * R, cy + y * R];
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(
      cx,
      cy,
      R * 0.2,
      cx,
      cy,
      Math.max(W, H) * 0.7,
    );
    bg.addColorStop(0, "#3a1f0a");
    bg.addColorStop(1, "#120a05");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const shake = state === "play" ? crack * crack * 5 : 0;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // cookie
    const cg = ctx.createRadialGradient(
      cx - R * 0.25,
      cy - R * 0.3,
      R * 0.1,
      cx,
      cy,
      R,
    );
    cg.addColorStop(0, "#f2c86e");
    cg.addColorStop(1, "#c68628");
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.lineWidth = R * 0.05;
    ctx.strokeStyle = "#9a6118";
    ctx.stroke();
    ctx.fillStyle = "rgba(150,95,25,.35)";
    for (const [x, y, r] of specks) {
      const [px, py] = P(x, y);
      ctx.beginPath();
      ctx.arc(px, py, r * R, 0, TAU);
      ctx.fill();
    }

    // groove
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(120,70,15,.55)";
    ctx.lineWidth = Math.max(3, R * 0.03);
    for (const pts of polys) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const [px, py] = P(x, y);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.stroke();
    }
    // carved part
    ctx.fillStyle = "#5b2c06";
    for (const s of samples) {
      if (!s.done) continue;
      const [px, py] = P(s.x, s.y);
      ctx.beginPath();
      ctx.arc(px, py, R * 0.022, 0, TAU);
      ctx.fill();
    }
    // cracks grow with the meter
    const shown = Math.ceil(crack * cracks.length);
    ctx.strokeStyle = "rgba(60,25,0,.9)";
    ctx.lineWidth = Math.max(2, R * 0.018);
    for (let i = 0; i < shown; i++) {
      ctx.beginPath();
      cracks[i].forEach(([x, y], j) => {
        const [px, py] = P(x, y);
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.stroke();
    }
    ctx.restore();

    // needle
    if (ptr.has && state === "play") {
      ctx.strokeStyle = "#e6e6e6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ptr.px, ptr.py);
      ctx.lineTo(ptr.px + 34, ptr.py - 34);
      ctx.stroke();
      ctx.fillStyle = ptr.down ? "#ff3b3b" : "#bbb";
      ctx.beginPath();
      ctx.arc(ptr.px, ptr.py, 4, 0, TAU);
      ctx.fill();
    }

    // HUD
    const bw = Math.min(W * 0.6, 420),
      bx = (W - bw) / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(shape.name + "  ·  " + Math.ceil(timeLeft) + "s", W / 2, 34);
    ctx.fillStyle = "rgba(255,255,255,.15)";
    ctx.fillRect(bx, 46, bw, 8);
    ctx.fillStyle = timeLeft < 10 ? "#ff5252" : "#4caf50";
    ctx.fillRect(bx, 46, (bw * Math.max(0, timeLeft)) / shape.time, 8);
    ctx.font = "13px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fillText("CRACK", bx - 30, 78);
    ctx.fillStyle = "rgba(255,255,255,.15)";
    ctx.fillRect(bx, 70, bw, 8);
    ctx.fillStyle = crack > 0.6 ? "#ff5252" : "#ffb300";
    ctx.fillRect(bx, 70, bw * Math.min(1, crack), 8);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fillText(Math.round(progress() * 100) + "%", bx + bw + 28, 78);
    if (!carvedAny && state === "play") {
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.fillText(
        "Hold and trace the line. Wander off and the cookie cracks.",
        W / 2,
        H - 28,
      );
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
  }

  resize();
  reset(idx);
  raf = requestAnimationFrame(loop);
  return { exit };
}

// Optional floating button (below the leaderboard button); hidden while the main game is being played
export function mountDalgonaButton() {
  ensureStyle();
  if (document.querySelector(".dg-float")) return;
  const b = document.createElement("button");
  b.className = "dg-float";
  b.textContent = "🍪 DALGONA";
  b.onclick = () => startDalgona();
  document.body.appendChild(b);
  document.addEventListener("pointerlockchange", () => {
    b.style.display = document.pointerLockElement ? "none" : "";
  });
}
