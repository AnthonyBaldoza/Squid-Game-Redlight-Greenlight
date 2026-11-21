import * as THREE from "three";

// Tiny fixed-size particle pool (single Points draw call, zero allocations per frame), plus a few cheap
// death effects: bullet tracers + muzzle sparks, a ground shockwave ring and blood-red ground stains
// (all stains share ONE instanced draw call).
const C = new THREE.Color();
const FLAT = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-Math.PI / 2, 0, 0),
);
const V3 = new THREE.Vector3(),
  S3 = new THREE.Vector3(),
  M4 = new THREE.Matrix4(),
  ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const SPLAT = [0xff2b3a, 0xd1102a, 0x8a0f1e]; // bright red, red, dark red
const STAINS = 12,
  RINGS = 3;
const easeOut = (u) => 1 - (1 - u) * (1 - u);

export class Particles {
  constructor(scene, n = 360) {
    this.n = n;
    this.cur = 0;
    this.active = false;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 0.3,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Bullet tracers (a small pool of thin glowing boxes)
    this.tracers = [];
    this.tr = 0;
    const tg = new THREE.BoxGeometry(0.07, 0.07, 1),
      tm = new THREE.MeshBasicMaterial({
        color: 0xffe9a8,
        transparent: true,
        depthWrite: false,
        fog: false,
      });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(tg, tm);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ m, t: 0 });
    }

    // Ground stains: one InstancedMesh, each stain grows quickly then stays until reset()
    this.stainMesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 20),
      new THREE.MeshBasicMaterial({
        color: 0x7d0c1a,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
      STAINS,
    );
    this.stainMesh.frustumCulled = false;
    scene.add(this.stainMesh);
    this.stainData = [];
    for (let i = 0; i < STAINS; i++)
      this.stainData.push({ x: 0, z: 0, r: 0, t: 1 });
    this.stainCur = 0;
    this.stainActive = false;

    // Ground shockwave rings (tiny pool, each with its own material so it can fade on its own)
    const rg = new THREE.RingGeometry(0.85, 1, 32);
    this.rings = [];
    this.ringCur = 0;
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.Mesh(
        rg,
        new THREE.MeshBasicMaterial({
          color: 0xff5060,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.rings.push({ m, t: 1 });
    }
    this.reset();
  }

  // Clear everything (new round / back to menu)
  reset() {
    this.life.fill(0);
    for (let i = 0; i < this.n; i++) this.pos[i * 3 + 1] = -999;
    this.geo.attributes.position.needsUpdate = true;
    this.active = false;
    for (const o of this.tracers) {
      o.t = 0;
      o.m.visible = false;
    }
    for (let i = 0; i < STAINS; i++) {
      this.stainData[i].t = 1;
      this.stainMesh.setMatrixAt(i, ZERO);
    }
    this.stainMesh.instanceMatrix.needsUpdate = true;
    this.stainActive = false;
    for (const r of this.rings) {
      r.t = 1;
      r.m.visible = false;
    }
  }

  shoot(x0, y0, z0, x1, y1, z1) {
    const o = this.tracers[this.tr];
    this.tr = (this.tr + 1) % this.tracers.length;
    o.m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    o.m.scale.set(1, 1, Math.hypot(x1 - x0, y1 - y0, z1 - z0));
    o.m.lookAt(x1, y1, z1);
    o.m.visible = true;
    o.t = 0.1;

    // muzzle flash: a quick fan of hot sparks leaving the barrel toward the target
    const dx = x1 - x0,
      dy = y1 - y0,
      dz = z1 - z0,
      l = Math.hypot(dx, dy, dz) || 1;
    C.setHex(0xfff0c0);
    for (let i = 0; i < 9; i++) {
      const s = 4 + Math.random() * 6;
      this.emit(
        x0,
        y0,
        z0,
        C.r,
        C.g,
        C.b,
        (dx / l) * s + (Math.random() - 0.5) * 2.5,
        (dy / l) * s + (Math.random() - 0.5) * 2.5 + 0.5,
        (dz / l) * s + (Math.random() - 0.5) * 2.5,
        0.14 + Math.random() * 0.1,
      );
    }
  }

  emit(x, y, z, r, g, b, vx, vy, vz, life) {
    const i = this.cur,
      j = i * 3;
    this.cur = (i + 1) % this.n;
    this.pos[j] = x;
    this.pos[j + 1] = y;
    this.pos[j + 2] = z;
    this.col[j] = r;
    this.col[j + 1] = g;
    this.col[j + 2] = b;
    this.vel[j] = vx;
    this.vel[j + 1] = vy;
    this.vel[j + 2] = vz;
    this.life[i] = life;
    this.active = true;
  }

  burst(x, y, z, hex, n = 20, speed = 5) {
    C.setHex(hex);
    for (let i = 0; i < n; i++)
      this.emit(
        x,
        y,
        z,
        C.r,
        C.g,
        C.b,
        (Math.random() - 0.5) * speed,
        Math.random() * speed,
        (Math.random() - 0.5) * speed,
        0.6 + Math.random() * 0.5,
      );
  }

  ring(x, z) {
    const o = this.rings[this.ringCur];
    this.ringCur = (this.ringCur + 1) % RINGS;
    o.m.position.set(x, 0.06, z);
    o.m.scale.setScalar(0.4);
    o.m.material.opacity = 0.8;
    o.m.visible = true;
    o.t = 0;
  }

  stain(x, z, r) {
    const s = this.stainData[this.stainCur];
    this.stainCur = (this.stainCur + 1) % STAINS;
    s.x = x;
    s.z = z;
    s.r = r * (0.85 + Math.random() * 0.3);
    s.t = 0;
    this.stainActive = true;
  }

  // The hit: red droplets thrown along the bullet direction (dir = +1 / -1 on X), dark chunks, hot sparks,
  // a ground shockwave and a stain where the body will land. k scales it (1 = player, ~0.6 = contestant).
  splat(x, y, z, dir = 1, k = 1) {
    const n = Math.round(34 * k);
    for (let i = 0; i < n; i++) {
      C.setHex(SPLAT[i % 3]);
      this.emit(
        x,
        y + Math.random() * 0.4,
        z,
        C.r,
        C.g,
        C.b,
        dir * (1 + Math.random() * 5) + (Math.random() - 0.5) * 2,
        1.5 + Math.random() * 4.5,
        (Math.random() - 0.5) * 4,
        0.5 + Math.random() * 0.7,
      );
    }
    C.setHex(0xfff0c0);
    for (let i = 0, m = Math.round(8 * k); i < m; i++)
      this.emit(
        x,
        y,
        z,
        C.r,
        C.g,
        C.b,
        dir * (3 + Math.random() * 6),
        1 + Math.random() * 4,
        (Math.random() - 0.5) * 6,
        0.18 + Math.random() * 0.2,
      );
    this.ring(x, z);
    this.stain(x, z - 0.9, 0.6 + 0.9 * k); // bodies fall toward -Z
  }

  confetti(x, y, z) {
    for (let i = 0; i < 70; i++) {
      C.setHSL(Math.random(), 0.9, 0.6);
      this.emit(
        x + (Math.random() - 0.5) * 3,
        y + 1 + Math.random() * 2,
        z + (Math.random() - 0.5) * 3,
        C.r,
        C.g,
        C.b,
        (Math.random() - 0.5) * 7,
        4 + Math.random() * 6,
        (Math.random() - 0.5) * 7,
        1.6 + Math.random(),
      );
    }
  }

  update(dt) {
    for (const o of this.tracers)
      if (o.t > 0) {
        o.t -= dt;
        if (o.t <= 0) o.m.visible = false;
      }
    for (const r of this.rings)
      if (r.t < 1) {
        r.t = Math.min(1, r.t + dt / 0.55);
        r.m.scale.setScalar(0.4 + easeOut(r.t) * 5.5);
        r.m.material.opacity = (1 - r.t) * 0.8;
        if (r.t >= 1) r.m.visible = false;
      }
    if (this.stainActive) {
      let growing = false;
      for (let i = 0; i < STAINS; i++) {
        const s = this.stainData[i];
        if (s.t >= 1) continue;
        s.t = Math.min(1, s.t + dt / 1.1);
        growing = true;
        const k = easeOut(s.t) * s.r;
        V3.set(s.x, 0.05, s.z);
        S3.set(k, k, k);
        M4.compose(V3, FLAT, S3);
        this.stainMesh.setMatrixAt(i, M4);
      }
      this.stainMesh.instanceMatrix.needsUpdate = true;
      this.stainActive = growing;
    }
    if (!this.active) return;
    let alive = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3;
      this.life[i] -= dt;
      this.vel[j + 1] -= 9 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.life[i] <= 0 || this.pos[j + 1] < 0.05) {
        this.life[i] = 0;
        this.pos[j + 1] = -999;
      } else alive = true;
    }
    this.active = alive;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
