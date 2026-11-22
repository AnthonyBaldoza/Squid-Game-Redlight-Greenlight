// Global leaderboard (Supabase REST, no SDK needed).
//
//   import { submitScore, openLeaderboard, mountLeaderboardButton } from "./leaderboard.js";
//   submitScore(timeInSeconds);   // call when the player FINISHES a run
//   openLeaderboard();            // show the top times
//   mountLeaderboardButton();     // optional floating button (remove once you add a menu button)
//
// Setup: see the SQL in the chat message, then fill in the two constants below.

const SUPABASE_URL = "https://sfuyhzmxcprksydptltk.supabase.co";
const SUPABASE_KEY = "sb_publishable_aCyeVvqIQ_NFF8s5TzJjWw_QLXd7aco"; // public key, safe in the browser
const NAME_KEY = "rlgl_player_name";
const TOP_N = 20;

const configured = () =>
  !SUPABASE_URL.includes("YOUR-PROJECT") && !SUPABASE_KEY.includes("YOUR_");

const cleanName = (n) =>
  String(n || "")
    .replace(/[^\w \-.]/g, "")
    .trim()
    .slice(0, 12);

async function api(path, opts = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  // Legacy anon keys are JWTs and go in Authorization too; new publishable keys only need `apikey`.
  if (SUPABASE_KEY.startsWith("eyJ"))
    headers.Authorization = "Bearer " + SUPABASE_KEY;
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...opts,
    headers,
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return opts.method === "POST" ? null : res.json();
}

// ------------------------------------------------------------------ UI helpers
const css = `
.lb-ov{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
  background:rgba(8,10,25,.78);font-family:inherit;color:#fff}
.lb-card{width:min(92vw,440px);max-height:86vh;overflow:auto;background:#1b2340;border-radius:16px;
  padding:22px 20px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.lb-card h2{margin:0 0 14px;text-align:center;letter-spacing:.12em;font-size:26px}
.lb-row{display:flex;gap:10px;padding:7px 10px;border-radius:8px;font-size:17px}
.lb-row:nth-child(odd){background:rgba(255,255,255,.05)}
.lb-row.me{background:rgba(233,30,99,.35)}
.lb-rank{width:34px;opacity:.8}.lb-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb-time{font-variant-numeric:tabular-nums}
.lb-msg{text-align:center;opacity:.8;padding:18px 0}
.lb-btn{display:block;width:100%;margin-top:14px;padding:11px;border:0;border-radius:10px;cursor:pointer;
  background:#e91e63;color:#fff;font:inherit;font-size:17px;letter-spacing:.1em}
.lb-btn.alt{background:#2c365c}
.lb-in{width:100%;box-sizing:border-box;padding:11px;border-radius:10px;border:1px solid #445;
  background:#0f1530;color:#fff;font:inherit;font-size:18px;margin-top:6px}
body.playing .lb-float{display:none}
.lb-float{position:fixed;top:10px;left:10px;z-index:50;padding:8px 12px;border:0;border-radius:10px;
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
function overlay(html) {
  ensureStyle();
  const ov = document.createElement("div");
  ov.className = "lb-ov";
  ov.innerHTML = '<div class="lb-card">' + html + "</div>";
  document.body.appendChild(ov);
  return ov;
}
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function askName() {
  return new Promise((resolve) => {
    const ov = overlay(
      '<h2>YOUR NAME</h2><div class="lb-msg">Enter a name for the leaderboard</div>' +
        '<input class="lb-in" maxlength="12" placeholder="Name" />' +
        '<button class="lb-btn">SAVE</button>' +
        '<button class="lb-btn alt">SKIP</button>',
    );
    if (document.exitPointerLock) document.exitPointerLock();
    const input = ov.querySelector("input");
    const [save, skip] = ov.querySelectorAll("button");
    for (const ev of ["keydown", "keyup", "keypress"])
      input.addEventListener(ev, (e) => {
        e.stopPropagation();
        if (ev === "keydown" && e.key === "Enter") save.click();
      });
    const done = (v) => {
      ov.remove();
      resolve(v);
    };
    save.onclick = () => {
      const n = cleanName(input.value);
      if (n) {
        localStorage.setItem(NAME_KEY, n);
        done(n);
      } else input.focus();
    };
    skip.onclick = () => done(null);
    input.focus();
  });
}

// ------------------------------------------------------------------ public API
export async function fetchTop(limit = TOP_N) {
  if (!configured()) throw new Error("Leaderboard is not set up yet.");
  return api(
    "leaderboard?select=name,time_seconds&order=time_seconds.asc&limit=" + limit,
  );
}

// Call when the player finishes. Returns true if saved.
export async function submitScore(seconds) {
  try {
    if (!configured() || !(seconds > 0)) return false;
    let name = localStorage.getItem(NAME_KEY);
    if (!name) name = await askName();
    if (!name) return false;
    await api("scores", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        name: cleanName(name),
        time_seconds: Math.round(seconds * 100) / 100,
      }),
    });
    return true;
  } catch (e) {
    console.warn("Leaderboard submit failed:", e);
    return false;
  }
}

export async function openLeaderboard() {
  const ov = overlay(
    '<h2>LEADERBOARD</h2><div class="lb-list"><div class="lb-msg">Loading…</div></div>' +
      '<button class="lb-btn">CLOSE</button>',
  );
  ov.querySelector(".lb-btn").onclick = () => ov.remove();
  const list = ov.querySelector(".lb-list");
  try {
    const rows = await fetchTop();
    if (!rows.length) {
      list.innerHTML = '<div class="lb-msg">No times yet. Be the first!</div>';
      return;
    }
    const me = (localStorage.getItem(NAME_KEY) || "").toLowerCase();
    list.innerHTML = rows
      .map(
        (r, i) =>
          '<div class="lb-row' +
          (r.name.toLowerCase() === me ? " me" : "") +
          '"><span class="lb-rank">#' +
          (i + 1) +
          '</span><span class="lb-name">' +
          esc(r.name) +
          '</span><span class="lb-time">' +
          Number(r.time_seconds).toFixed(2) +
          "s</span></div>",
      )
      .join("");
  } catch (e) {
    list.innerHTML =
      '<div class="lb-msg">Could not load the leaderboard. Check your internet.</div>';
  }
}

// Optional floating button; hidden while the mouse is captured during play.
export function mountLeaderboardButton() {
  ensureStyle();
  if (document.querySelector(".lb-float")) return;
  const b = document.createElement("button");
  b.className = "lb-float";
  b.textContent = "🏆 LEADERBOARD";
  b.onclick = openLeaderboard;
  document.body.appendChild(b);
  document.addEventListener("pointerlockchange", () => {
    b.style.display = document.pointerLockElement ? "none" : "";
  });
}