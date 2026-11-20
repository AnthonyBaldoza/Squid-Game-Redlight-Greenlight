import * as THREE from "three";
import { ARENA } from "./environment.js";
import {
  PIV,
  WHITE,
  torsoGeo,
  headGeo,
  faceGeo,
  hairGeo,
  hairLongGeo,
  armGeo,
  handGeo,
  legGeo,
} from "./models.js";

// ~24 AI contestants with detailed Roblox-style bodies: tracksuit with white collar + stripes, sneakers,
// hands, ears, face, hair (short or long) and a unique number plate. Everything is drawn with InstancedMeshes.
const P = new THREE.Matrix4(),
  L = new THREE.Matrix4(),
  Q = new THREE.Quaternion(),
  E = new THREE.Euler();
const V = new THREE.Vector3(),
  SC = new THREE.Vector3(),
  C = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const DEAD = new THREE.Color().setRGB(0.5, 0.28, 0.3);
const SKIN = [0xf1cba8, 0xe0ac82, 0xc68a62, 0x8d5a3c, 0xf6d9c0];
const HAIR = [0x111111, 0x2a1a10, 0x3b2416, 0x5a3a22, 0x1a1a22, 0x6b4a2b];
const HALF = Math.PI / 2;
const BASE = 0.85; // same scale as the player model
const COLS = 8,
  ROWS = 4;
const rnd = (a, b) => a + Math.random() * (b - a);

// Palette: skin / hair are WHITE here because they are tinted per instance
const PAL = {
  suit: 0x2f9f90,
  suitDark: 0x1f7a6e,
  trim: 0xffffff,
  skin: WHITE,
  hair: WHITE,
  shoe: 0xffffff,
  sole: 0x222226,
  dark: 0x1a1a1a,
};

// Number plate atlas (8 x 4 cells of 64px): each contestant picks its own cell via an instanced attribute
function makeAtlas(nums) {
  const c = document.createElement("canvas");
  c.width = COLS * 64;
  c.height = ROWS * 64;
  const x = c.getContext("2d");
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = "700 26px Arial";
  nums.forEach((n, i) => {
    const cx = (i % COLS) * 64,
      cy = Math.floor(i / COLS) * 64;
    x.fillStyle = "#f4f4f4";
    x.fillRect(cx, cy, 64, 64);
    x.strokeStyle = "#111";
    x.lineWidth = 3;
    x.strokeRect(cx + 2, cy + 2, 60, 60);
    x.fillStyle = "#111";
    x.fillText(String(n).padStart(3, "0"), cx + 32, cy + 34);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  t.repeat.set(1 / COLS, 1 / ROWS);
  return t;
}

export class Contestants {
  constructor(scene, onEliminated) {
    this.onEliminated = onEliminated;
    this.drawDist = 90;
    this.acc = 0;
    this.alive = 0;

    const spots = [];
    for (let i = 0; i < 14; i++) spots.push([-12 + i * (24 / 13), -0.3]);
    for (let i = 0; i < 12; i++) {
      const x = -11 + i * 2;
      if (Math.abs(x) >= 1.6) spots.push([x, 1.6]);
    }
    const N = (this.n = spots.length);

    // unique random numbers (the player is 456)
    const pool = [];
    while (pool.length < N) {
      const v = 1 + Math.floor(Math.random() * 455);
      if (!pool.includes(v)) pool.push(v);
    }
    const offs = new Float32Array(N * 2);
    pool.forEach((_, i) => {
      offs[i * 2] = (i % COLS) / COLS;
      offs[i * 2 + 1] = 1 - (Math.floor(i / COLS) + 1) / ROWS;
    });
    const plateGeo = new THREE.PlaneGeometry(0.5, 0.5);
    plateGeo.setAttribute(
      "cellOff",
      new THREE.InstancedBufferAttribute(offs, 2),
    );
    const plateMat = new THREE.MeshBasicMaterial({ map: makeAtlas(pool) });
    plateMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace(
          "#include <common>",
          "attribute vec2 cellOff;\n#include <common>",
        )
        .replace(
          "#include <uv_vertex>",
          "#include <uv_vertex>\n  vMapUv += cellOff;",
        );
    };

    const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mk = (geo, mat, count, shadow) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.castShadow = shadow;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.torso = mk(torsoGeo(PAL), lam, N, true);
    this.head = mk(headGeo(PAL), lam, N, true);
    this.face = mk(faceGeo(PAL), lam, N, false);
    this.hair = mk(hairGeo(PAL), lam, N, false);
    this.hairLong = mk(hairLongGeo(PAL), lam, N, false);
    this.armL = mk(armGeo(PAL, -1), lam, N, false);
    this.armR = mk(armGeo(PAL, 1), lam, N, false);
    this.hands = mk(handGeo(PAL), lam, N * 2, false);
    this.legL = mk(legGeo(PAL, -1), lam, N, true);
    this.legR = mk(legGeo(PAL, 1), lam, N, true);
    this.plate = mk(plateGeo, plateMat, N, false);
    this.meshes = [
      this.torso,
      this.head,
      this.face,
      this.hair,
      this.hairLong,
      this.armL,
      this.armR,
      this.hands,
      this.legL,
      this.legR,
      this.plate,
    ];

    this.list = spots.map((s, i) => {
      const b = rnd(0.86, 1.06);
      return {
        i,
        sx: s[0] + rnd(-0.25, 0.25),
        sz: s[1] + rnd(-0.2, 0.2),
        speed: rnd(3.2, 6.2),
        fr: rnd(1, 2.5),
        ph: rnd(0, 6),
        h: rnd(0.93, 1.07),
        tint: new THREE.Color().setRGB(b, b, b),
        long: Math.random() < 0.35,
        skinCol: new THREE.Color(SKIN[i % SKIN.length]),
        hairCol: new THREE.Color(HAIR[(i * 3) % HAIR.length]),
      };
    });
    this.reset();
  }

  paintBody(c, col) {
    const i = c.i;
    this.torso.setColorAt(i, col);
    this.armL.setColorAt(i, col);
    this.armR.setColorAt(i, col);
    this.legL.setColorAt(i, col);
    this.legR.setColorAt(i, col);
  }
  flushColors() {
    for (const m of this.meshes)
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  reset() {
    this.alive = this.n;
    this.acc = 0;
    for (const c of this.list) {
      c.x = c.sx;
      c.z = c.sz;
      c.alive = true;
      c.finished = false;
      c.moving = false;
      c.delay = 0;
      c.fall = 0;
      c.lean = 0;
      c.drift = 0;
      c.redT = 0;
      c.stopAt = 0;
      c.dieAt = 0;
      c.doomed = false;
      c.phase = 0;
      c.amp = 0;
      c.finishZ = ARENA.finishZ - 1.5 - rnd(0, 6);
      this.paintBody(c, c.tint);
      this.head.setColorAt(c.i, c.skinCol);
      this.hands.setColorAt(c.i * 2, c.skinCol);
      this.hands.setColorAt(c.i * 2 + 1, c.skinCol);
      this.hair.setColorAt(c.i, c.hairCol);
      this.hairLong.setColorAt(c.i, c.hairCol);
      if (!c.long) this.hairLong.setMatrixAt(c.i, ZERO);
    }
    this.flushColors();
    this.write(0, 0, true);
  }

  onGreen() {
    for (const c of this.list) {
      c.doomed = false;
      c.delay = rnd(0.05, 0.7);
    }
  }

  onRed() {
    let budget = Math.max(0, this.alive - 4);
    for (const c of this.list) {
      c.redT = 0;
      c.doomed = false;
      if (!c.alive || c.finished || !c.moving) continue;
      if (budget > 0 && Math.random() < 0.07) {
        c.doomed = true;
        c.dieAt = 0.55 + Math.random() * 0.35;
        budget--;
      } else c.stopAt = 0.06 + Math.random() * 0.3; // everyone else stops before the doll's check
    }
  }

  kill(c) {
    c.alive = false;
    c.moving = false;
    c.fall = 0;
    this.alive--;
    this.paintBody(c, DEAD);
    this.flushColors();
    this.onEliminated(c);
  }

  update(dt, mode, camX, camZ, t) {
    this.acc += dt;
    const tick = this.acc >= 0.1;
    if (tick) this.acc = 0; // AI decisions throttled to 10 Hz
    const ka = 1 - Math.exp(-dt * 12),
      kl = 1 - Math.exp(-dt * 10);
    for (const c of this.list) {
      if (c.alive && !c.finished) {
        if (mode === "green") {
          if (!c.moving) {
            c.delay -= dt;
            if (c.delay <= 0) c.moving = true;
          }
        } else if (mode === "red") {
          c.redT += dt;
          if (c.doomed) {
            if (c.redT >= c.dieAt) this.kill(c);
          } else if (c.moving && c.redT >= c.stopAt) c.moving = false;
        } else c.moving = false;

        if (c.alive && c.moving) {
          if (tick) c.drift = (Math.random() - 0.5) * 0.8;
          const sp = c.speed * (0.88 + 0.12 * Math.sin(t * c.fr + c.ph));
          c.z -= sp * dt;
          c.x = Math.max(-12.5, Math.min(12.5, c.x + c.drift * dt));
          c.phase += sp * dt * 2.2;
          if (c.z <= c.finishZ) {
            c.finished = true;
            c.moving = false;
          }
        }
      }
      c.amp += ((c.moving ? 1 : 0) - c.amp) * ka; // arm/leg swing fades in and out
      c.lean += ((c.moving ? 0.12 : 0) - c.lean) * kl;
      if (!c.alive && c.fall < HALF) c.fall = Math.min(HALF, c.fall + dt * 4.5);
    }
    this.write(camX, camZ, false);
  }

  // part transform relative to the body root P, written into an instance slot
  put(mesh, idx, x, y, z, rx) {
    E.set(rx, 0, 0);
    Q.setFromEuler(E);
    V.set(x, y, z);
    SC.set(1, 1, 1);
    L.compose(V, Q, SC);
    L.premultiply(P);
    mesh.setMatrixAt(idx, L);
  }

  write(camX, camZ, all) {
    const dd = this.drawDist * this.drawDist;
    for (const c of this.list) {
      const dx = c.x - camX,
        dz = c.z - camZ,
        vis = all || dx * dx + dz * dz < dd;
      const a = c.fall + c.lean,
        s = vis ? BASE * c.h : 0;
      const bob = c.moving ? Math.abs(Math.sin(c.phase)) * 0.05 : 0;
      E.set(-a, 0, 0);
      Q.setFromEuler(E);
      V.set(c.x, bob, c.z);
      SC.set(s, s, s);
      P.compose(V, Q, SC);
      const sw = Math.sin(c.phase) * 0.9 * c.amp,
        i = c.i;
      this.put(this.torso, i, 0, 0, 0, 0);
      this.put(this.head, i, 0, 0, 0, 0);
      this.put(this.face, i, 0, 0, 0, 0);
      this.put(this.hair, i, 0, 0, 0, 0);
      if (c.long) this.put(this.hairLong, i, 0, 0, 0, 0);
      this.put(this.plate, i, 0, 1.38, 0.235, 0);
      this.put(this.armL, i, -PIV.armX, PIV.armY, 0, -sw);
      this.put(this.armR, i, PIV.armX, PIV.armY, 0, sw);
      this.put(this.hands, i * 2, -PIV.armX, PIV.armY, 0, -sw);
      this.put(this.hands, i * 2 + 1, PIV.armX, PIV.armY, 0, sw);
      this.put(this.legL, i, -PIV.legX, PIV.legY, 0, sw);
      this.put(this.legR, i, PIV.legX, PIV.legY, 0, -sw);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
