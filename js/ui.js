import { Sound } from "./audio.js";
import { settings, touchy, getBest, RECOMMENDED, PRESETS } from "./settings.js";

const $ = (id) => document.getElementById(id);
const SCREENS = ["menu", "how", "settings", "pause", "over", "win"];
const fmt = (t) => (t == null ? "--" : t.toFixed(2) + "s");
let last = {},
  cdTimer = 0,
  noteTimer = 0,
  toastTimer = 0,
  chantEls = [];

export const UI = {
  init(h) {
    // First interaction unlocks audio; every button gets a click sound.
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "touch")
          document.documentElement.classList.add("has-touch");
        Sound.init();
        if (e.target.closest && e.target.closest(".btn,.seg button,.icon"))
          Sound.click();
      },
      true,
    );

    $("btnPlay").onclick = h.play;
    $("btnHow").onclick = () => UI.show("how");
    $("btnSettings").onclick = () => UI.show("settings");
    $("howBack").onclick = () => UI.show("menu");
    $("setBack").onclick = () => UI.show("menu");
    document.querySelectorAll("[data-p]").forEach((b) => {
      b.onclick = () => h.preset(b.dataset.p);
    });
    document.querySelectorAll("[data-t]").forEach((b) => {
      b.onclick = () => h.time(b.dataset.t);
    });
    $("vol").oninput = (e) => h.volume(e.target.value / 100);
    $("muteSet").onclick = h.mute;
    $("muteBtn").onclick = h.mute;
    $("quitBtn").onclick = h.menu;
    $("pauseBtn").onclick = h.pause;
    $("pauseResume").onclick = h.resume;
    $("pauseRestart").onclick = h.retry || h.play;
    $("pauseMenu").onclick = h.menu;
    $("overRestart").onclick = h.retry || h.play;
    $("overMenu").onclick = h.menu;
    $("winRestart").onclick = h.retry || h.play;
    $("winMenu").onclick = h.menu;
    $("overShare").onclick = h.share;
    $("winShare").onclick = h.share;

    UI.syncHint();
    $("vol").value = Math.round(settings.volume * 100);
    $("recNote").textContent =
      "Recommended for this device: " + PRESETS[RECOMMENDED].label;
    UI.syncPreset(settings.preset);
    UI.syncTime(settings.tod);
    UI.syncAudio();
    UI.menuBest();
  },

  intro(on) {
    const el = $("intro");
    el.classList.toggle("hidden", !on);
    el.classList.remove("title", "player");
    if (on) document.body.classList.add("playing");
  },
  introCard(name) {
    const el = $("intro");
    el.classList.toggle("title", name === "title");
    el.classList.toggle("player", name === "player");
  },

  toast(msg) {
    const el = $("toast");
    clearTimeout(toastTimer);
    el.textContent = msg;
    el.classList.remove("hidden");
    toastTimer = setTimeout(() => el.classList.add("hidden"), 4500);
  },

  chantShow(list) {
    const el = $("chant");
    el.innerHTML = list
      .map(
        (t, i) =>
          "<span" +
          (i === 2 || i === 4 ? ' class="sp"' : "") +
          ">" +
          t +
          "</span>",
      )
      .join("");
    chantEls = Array.from(el.children);
    el.classList.remove("hidden");
  },
  chantActive(i) {
    chantEls.forEach((s, j) => {
      s.classList.toggle("on", j === i);
      s.classList.toggle("done", j < i);
    });
  },
  chantHide() {
    $("chant").classList.add("hidden");
  },

  syncHint() {
    $("hint").textContent = touchy()
      ? "Left side: move (push far to sprint) · JUMP · Drag right side: look"
      : "WASD / Arrows: move · Shift: sprint · Space: jump · Mouse: look · P: pause";
  },

  show(id) {
    SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
    if (id && document.exitPointerLock) document.exitPointerLock();
    if (id === "menu") UI.menuBest();
  },
  hud(on) {
    $("hud").classList.toggle("hidden", !on);
    $("edge").className = "";
    document.body.classList.toggle("playing", on);
    if (on) UI.syncHint();
    $("touch").classList.toggle("hidden", !(on && touchy()));
    if (on) last = {};
    if (!on) {
      $("cd").classList.add("hidden");
      $("notice").classList.add("hidden");
      UI.chantHide();
    }
  },
  menuBest() {
    const b = getBest();
    $("menuBest").textContent = b == null ? "" : "BEST TIME  " + fmt(b);
  },

  syncTime(name) {
    document
      .querySelectorAll("[data-t]")
      .forEach((b) => b.classList.toggle("on", b.dataset.t === name));
  },
  syncPreset(name) {
    document
      .querySelectorAll("[data-p]")
      .forEach((b) => b.classList.toggle("on", b.dataset.p === name));
  },
  syncAudio() {
    $("muteSet").textContent = settings.muted ? "OFF" : "ON";
    $("muteBtn").textContent = settings.muted ? "🔇" : "🔊";
  },

  setLight(kind) {
    const el = $("light");
    if (kind !== "green") UI.chantHide();
    el.className = kind;
    el.textContent =
      kind === "green"
        ? "GREEN LIGHT"
        : kind === "red"
          ? "RED LIGHT"
          : "GET READY";
    void el.offsetWidth;
    el.classList.add("pop");
    $("edge").className = "edge-" + kind;
  },
  updateHud(time, remain, pct, meters) {
    const ts = Math.ceil(time);
    if (last.ts !== ts) {
      last.ts = ts;
      $("timer").textContent = ts;
      $("timer").classList.toggle("low", ts <= 10);
    }
    if (last.r !== remain) {
      last.r = remain;
      $("remain").textContent = remain;
    }
    if (last.p !== pct) {
      last.p = pct;
      $("pct").textContent = pct + "%";
      $("barfill").style.width = pct + "%";
      $("meters").textContent = meters + " / 100 m";
    }
  },
  sprint(on) {
    if (last.s !== on) {
      last.s = on;
      $("sprintInd").classList.toggle("on", on);
    }
  },

  countdown(txt) {
    const el = $("cd");
    clearTimeout(cdTimer);
    el.textContent = txt;
    el.classList.remove("hidden");
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    cdTimer = setTimeout(
      () => el.classList.add("hidden"),
      txt === "GO!" ? 800 : 950,
    );
  },
  notify(txt, good) {
    const el = $("notice");
    clearTimeout(noteTimer);
    el.textContent = txt;
    el.classList.toggle("good", !!good);
    el.classList.remove("hidden");
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    noteTimer = setTimeout(() => el.classList.add("hidden"), 1800);
  },
  // Dark red vignette that closes in on the fallen player (a plain overlay, no CSS filter over the canvas)
  deathFx(on) {
    $("edge").className = on ? "edge-dead" : "";
  },
  flash(hard) {
    const f = $("flash");
    f.classList.remove("on", "hard");
    void f.offsetWidth;
    f.classList.add(hard ? "hard" : "on");
  },

  showOver(reason) {
    $("overReason").textContent = reason;
    UI.hud(false);
    UI.show("over");
  },
  showVictory(time, best, isNew) {
    $("winTime").textContent = fmt(time);
    $("winBest").textContent = fmt(best);
    $("winNew").classList.toggle("hidden", !isNew);
    UI.hud(false);
    UI.show("win");
  },
};
