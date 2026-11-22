import * as THREE from "three";
import { createEnvironment } from "./environment.js";
import { Doll } from "./doll.js";
import { Player, CameraRig } from "./player.js";
import { Contestants } from "./contestants.js";
import { Particles } from "./particles.js";
import { Game } from "./game.js";
import { UI } from "./ui.js";
import { Sound } from "./audio.js";
import { shareResult } from "./share.js";
import { mountLeaderboardButton } from "./leaderboard.js";
import { mountDalgonaButton } from "./dalgona.js";
import { Net } from "../net.js";
import {
  settings,
  saveSettings,
  PRESETS,
  isTouch,
  touchy,
} from "./settings.js";

const $ = (id) => document.getElementById(id);
const canvas = $("c");

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    stencil: false,
    powerPreference: "high-performance",
  });
} catch (e) {
  $("loading").innerHTML = "WebGL is not available in this browser.";
  throw e;
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 600);

const env = createEnvironment(scene);
const doll = new Doll(scene);
const particles = new Particles(scene);
const player = new Player(scene, canvas, {
  stick: $("stick"),
  knob: $("knob"),
  sprint: $("sprintBtn"),
  jump: $("jumpBtn"),
});
const contestants = new Contestants(scene, (c) => {
  Sound.gunshot(Math.abs(c.z - player.pos.z) > 25);
  particles.shoot(c.x >= 0 ? 15.5 : -15.5, 1.6, c.z - 2, c.x, 1.1, c.z);
  particles.splat(c.x, 1.2, c.z, c.x >= 0 ? -1 : 1, 0.6);
  game.onContestantDown(c);
});
const rig = new CameraRig(camera, player);
const game = new Game({ player, contestants, doll, rig, particles });

// ---- Resolution / presets ----
let resScale = 1;
function applyRes() {
  const pr =
    Math.min(window.devicePixelRatio || 1, PRESETS[settings.preset].cap) *
    resScale;
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
function applyPreset(name, persist = true) {
  settings.preset = name;
  if (persist) saveSettings();
  const p = PRESETS[name];
  env.applyPreset(p);
  contestants.drawDist = p.drawDist;
  resScale = 1;
  applyRes();
  UI.syncPreset(name);
}
addEventListener("resize", applyRes);
addEventListener("orientationchange", () => setTimeout(applyRes, 150));

function applyTime(name, persist = true) {
  settings.tod = name;
  if (persist) saveSettings();
  const T = env.applyTime(name);
  renderer.toneMappingExposure = T.exposure;
  UI.syncTime(name);
}

// Adaptive resolution: lower the render scale when FPS drops, restore it when stable.
let accT = 0,
  accF = 0,
  warm = 2,
  lowStreak = 0;
const ORDER = ["high", "medium", "low"];
function adapt(dt) {
  accT += dt;
  accF++;
  if (accT < 1.2) return;
  const fps = accF / accT;
  accT = 0;
  accF = 0;
  if (warm > 0) {
    warm -= 1.2;
    return;
  }
  if (fps < 45) {
    lowStreak++;
    if (resScale > 0.55) {
      resScale = Math.max(0.55, resScale - 0.15);
      applyRes();
    } else if (lowStreak >= 2) {
      // still slow at minimum resolution -> drop one graphics preset automatically
      const i = ORDER.indexOf(settings.preset);
      if (i < ORDER.length - 1) {
        applyPreset(ORDER[i + 1], false);
        lowStreak = 0;
        warm = 2;
      }
    }
  } else {
    lowStreak = 0;
    if (fps > 57 && resScale < 1) {
      resScale = Math.min(1, resScale + 0.05);
      applyRes();
    }
  }
}

// Grab the current frame (rendered right now so the WebGL buffer is still valid) for the share card
function frameShot() {
  renderer.render(scene, camera);
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  c.getContext("2d").drawImage(canvas, 0, 0);
  return c;
}

// ---- UI wiring ----
// Pointer lock returns a Promise in current browsers and rejects without a user gesture / in some contexts
function lockPointer() {
  try {
    const r = canvas.requestPointerLock && canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (e) {
    /* ignore */
  }
}
function goFullscreen() {
  try {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen()
      .then(() => {
        if (screen.orientation && screen.orientation.lock)
          screen.orientation.lock("landscape").catch(() => {});
      })
      .catch(() => {});
  } catch (e) {
    /* ignore */
  }
}
function checkPortrait() {
  if (touchy() && innerWidth <= 820 && innerHeight > innerWidth) game.pause();
}
function startGame(quick) {
  Sound.init();
  if (touchy()) goFullscreen();
  else lockPointer();
  game.start(quick === true);
  player.releaseTouch();
  checkPortrait();
}
// ---- Online (see net.js) ----
function startOnline(msg) {
  Sound.init();
  if (touchy()) goFullscreen();
  else lockPointer(); // only works right after a click (the host); the others click the game once
  game.startOnline(msg);
  player.releaseTouch();
}
function backToLobby() {
  game.toMenu();
  Net.toLobby();
  UI.lobby();
  UI.show("lobby");
}
function leaveRoom() {
  Net.leave();
  game.toMenu();
}
let netBusy = false;
async function netGo(fn) {
  if (netBusy) return;
  netBusy = true;
  UI.netStatus("Connecting…");
  UI.netName(); // remember the name
  try {
    await fn();
    UI.netStatus("");
    UI.lobby();
    UI.show("lobby");
  } catch (e) {
    UI.netStatus((e && e.message) || "Could not connect.");
  }
  netBusy = false;
}
Net.onLobby = () => {
  if (Net.active && !game.online) UI.lobby();
};
Net.onStart = startOnline;
Net.onMsg = (m) => game.netMsg(m);
Net.onClosed = (why) => {
  game.toMenu();
  UI.toast(why || "Disconnected from the room.");
};
function toggleMute() {
  settings.muted = !settings.muted;
  saveSettings();
  Sound.setMuted(settings.muted);
  UI.syncAudio();
}
UI.init({
  play: () => startGame(false),
  retry: () => (Net.active ? backToLobby() : startGame(true)),
  netCreate: () => netGo(() => Net.host(UI.netName())),
  netJoin: () => netGo(() => Net.join(UI.netCode(), UI.netName())),
  lobbyStart: () => Net.start(),
  lobbyLeave: leaveRoom,
  lobbyCopy: () => {
    const link =
      location.origin +
      location.pathname +
      "?room=" +
      encodeURIComponent(Net.code);
    const done = () => UI.toast("Invite link copied: " + link);
    try {
      navigator.clipboard.writeText(link).then(done, () => UI.toast(link));
    } catch (e) {
      UI.toast(link);
    }
  },
  share: () => shareResult(frameShot(), game.result, (m) => UI.toast(m)),
  pause: () => game.pause(),
  resume: () => {
    game.resume();
    if (!touchy()) lockPointer();
  },
  menu: () => {
    Net.leave(); // no-op when offline
    game.toMenu();
  },
  preset: applyPreset,
  time: (name) => applyTime(name),
  volume: (v) => {
    settings.volume = v;
    saveSettings();
    Sound.setVolume(v);
  },
  mute: toggleMute,
});
Sound.setVolume(settings.volume);
Sound.setMuted(settings.muted);
applyPreset(settings.preset);
applyTime(settings.tod, false);
game.toMenu();
// Invite link: ?room=ABCD opens the online screen with the code filled in
{
  const room = new URLSearchParams(location.search).get("room");
  if (room) {
    UI.setCode(room);
    UI.show("online");
  }
}

// Skip the cinematic intro with any click / tap / key
addEventListener("pointerdown", () => game.skipIntro(), true);
addEventListener("keydown", (e) => {
  if (e.code !== "KeyP" && e.code !== "Escape") game.skipIntro();
});

// Pause: P or Esc, auto-pause when the mouse lock is released or the tab is hidden
addEventListener("keydown", (e) => {
  if (e.repeat || (e.code !== "KeyP" && e.code !== "Escape")) return;
  if (game.paused) $("pauseResume").click();
  else game.pause();
});
document.addEventListener("pointerlockchange", () => {
  if (!touchy() && !document.pointerLockElement) game.pause();
});
addEventListener("blur", () => {
  if (!touchy()) game.pause();
});
addEventListener("resize", checkPortrait);
addEventListener("orientationchange", () => setTimeout(checkPortrait, 250));

// Touch: stop the browser from hijacking gestures (scroll / zoom / long-press menu) while playing
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener(
  "touchmove",
  (e) => {
    if (document.body.classList.contains("playing")) e.preventDefault();
  },
  { passive: false },
);

// ---- Main loop (requestAnimationFrame, paused while the tab is hidden) ----
let t = 0,
  last = 0,
  raf = 0,
  first = true;
function frame(now) {
  raf = requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt <= 0) return;
  if (dt > 0.05) dt = 0.05;
  if (!game.paused) {
    const sdt = dt * game.timeScale; // slow motion on elimination
    t += sdt;
    game.update(sdt, t, dt);
    doll.update(sdt, t);
    particles.update(sdt);
    rig.update(sdt);
    env.update(sdt, t, player.pos.x, player.pos.z);
    const st = game.state;
    Net.tick(dt, player, st === "COUNTDOWN" || st === "GREEN" || st === "RED");
  }
  renderer.render(scene, camera);
  adapt(dt);

  if (first) {
    first = false;
    const l = $("loading");
    if (l) l.remove();
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    game.pause();
    cancelAnimationFrame(raf);
    Sound.suspend();
  } else {
    last = performance.now();
    raf = requestAnimationFrame(frame);
    if (!game.paused) Sound.resume();
  }
});
last = performance.now();
raf = requestAnimationFrame(frame);
mountLeaderboardButton();
mountDalgonaButton();
