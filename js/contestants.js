import * as THREE from "three";
import { ARENA } from "./environment.js";

// ~24 AI contestants with Roblox-style blocky bodies (torso, head, hair, 2 arms, 2 legs).
// Drawn with 5 InstancedMeshes total. No pathfinding, no physics.
const P = new THREE.Matrix4(),
  L = new THREE.Matrix4(),
  Q = new THREE.Quaternion(),
  E = new THREE.Euler();
const V = new THREE.Vector3(),
  SC = new THREE.Vector3(),
  C = new THREE.Color();
const SKIN = [0xf1cba8, 0xe0ac82, 0xc68a62, 0x8d5a3c, 0xf6d9c0];
const HAIR = [0x111111, 0x2a1a10, 0x3b2416, 0x5a3a22, 0x1a1a22];
const HALF = Math.PI / 2;
const BASE = 0.85; // same scale as the player model
const rnd = (a, b) => a + Math.random() * (b - a);

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

    // oy shifts the geometry so limbs pivot from the shoulder / hip
    const box = (w, h, d, oy) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(0, oy, 0);
      return g;
    };
    const mk = (geo, count, shadow) => {
      const m = new THREE.InstancedMesh(
        geo,
        new THREE.MeshLambertMaterial(),
        count,
      );
      m.castShadow = shadow;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.torso = mk(box(0.92, 0.9, 0.46, 0), N, true);
    this.head = mk(box(0.56, 0.56, 0.56, 0), N, true);
    this.hair = mk(box(0.6, 0.3, 0.62, 0), N, false);
    this.arms = mk(box(0.44, 0.9, 0.44, -0.45), N * 2, false);
    this.legs = mk(box(0.44, 0.9, 0.44, -0.45), N * 2, true);
    this.meshes = [this.torso, this.head, this.hair, this.arms, this.legs];

    this.list = spots.map((s, i) => ({
      i,
      sx: s[0] + rnd(-0.25, 0.25),
      sz: s[1] + rnd(-0.2, 0.2),
      speed: rnd(3.2, 6.2),
      fr: rnd(1, 2.5),
      ph: rnd(0, 6),
      h: rnd(0.93, 1.07),
      bodyCol: new THREE.Color().setHSL(
        rnd(0.46, 0.5),
        rnd(0.45, 0.6),
        rnd(0.22, 0.36),
      ),
      skinCol: new THREE.Color(SKIN[i % SKIN.length]),
      hairCol: new THREE.Color(HAIR[(i * 3) % HAIR.length]),
    }));
    this.reset();
  }

  paintBody(c, col) {
    const i = c.i;
    this.torso.setColorAt(i, col);
    this.arms.setColorAt(i * 2, col);
    this.arms.setColorAt(i * 2 + 1, col);
    this.legs.setColorAt(i * 2, col);
    this.legs.setColorAt(i * 2 + 1, col);
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
      this.paintBody(c, c.bodyCol);
      this.head.setColorAt(c.i, c.skinCol);
      this.hair.setColorAt(c.i, c.hairCol);
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
    this.paintBody(c, C.setHex(0x7a2430));
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

  // local part transform (relative to the body root P), written into an instance slot
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
      this.put(this.torso, i, 0, 1.35, 0, 0);
      this.put(this.head, i, 0, 2.1, 0, 0);
      this.put(this.hair, i, 0, 2.27, 0.02, 0);
      this.put(this.arms, i * 2, -0.69, 1.78, 0, -sw);
      this.put(this.arms, i * 2 + 1, 0.69, 1.78, 0, sw);
      this.put(this.legs, i * 2, -0.225, 0.9, 0, sw);
      this.put(this.legs, i * 2 + 1, 0.225, 0.9, 0, -sw);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
