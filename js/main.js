import * as THREE from "three";
import { createEnvironment } from "./environment.js";
import { Doll } from "./doll.js";
import { Player, CameraRig } from "./player.js";
import { Contestants } from "./contestants.js";
import { Particles } from "./particles.js";
import { Game } from "./game.js";
import { UI } from "./ui.js";
import { Sound } from "./audio.js";
import { settings, saveSettings, PRESETS, isTouch } from "./settings.js";

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
});
const contestants = new Contestants(scene, (c) => {
  Sound.eliminate(Math.abs(c.z - player.pos.z) > 25);
  particles.burst(c.x, 1.2, c.z, 0xff3355, 18, 4);
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

// ---- UI wiring ----
function startGame() {
  Sound.init();
  if (!isTouch && canvas.requestPointerLock) {
    try {
      canvas.requestPointerLock();
    } catch (e) {
      /* ignore */
    }
  }
  game.start();
}
function toggleMute() {
  settings.muted = !settings.muted;
  saveSettings();
  Sound.setMuted(settings.muted);
  UI.syncAudio();
}
UI.init({
  play: startGame,
  menu: () => game.toMenu(),
  preset: applyPreset,
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
game.toMenu();

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
  t += dt;

  game.update(dt, t);
  doll.update(dt, t);
  particles.update(dt);
  rig.update(dt);
  env.update(dt, t, player.pos.x, player.pos.z);
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
    cancelAnimationFrame(raf);
    Sound.suspend();
  } else {
    last = performance.now();
    raf = requestAnimationFrame(frame);
    Sound.resume();
  }
});
last = performance.now();
raf = requestAnimationFrame(frame);
