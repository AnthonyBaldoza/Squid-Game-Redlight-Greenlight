import * as THREE from 'three';

// Tiny fixed-size particle pool (single Points draw call, zero allocations per frame).
const C = new THREE.Color();

export class Particles {
  constructor(scene, n = 160) {
    this.n = n; this.cur = 0; this.active = false;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -999;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, r, g, b, vx, vy, vz, life) {
    const i = this.cur, j = i * 3; this.cur = (i + 1) % this.n;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    this.col[j] = r; this.col[j + 1] = g; this.col[j + 2] = b;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.life[i] = life; this.active = true;
  }

  burst(x, y, z, hex, n = 20, speed = 5) {
    C.setHex(hex);
    for (let i = 0; i < n; i++) this.emit(x, y, z, C.r, C.g, C.b, (Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed, 0.6 + Math.random() * 0.5);
  }

  confetti(x, y, z) {
    for (let i = 0; i < 70; i++) {
      C.setHSL(Math.random(), 0.9, 0.6);
      this.emit(x + (Math.random() - 0.5) * 3, y + 1 + Math.random() * 2, z + (Math.random() - 0.5) * 3, C.r, C.g, C.b, (Math.random() - 0.5) * 7, 4 + Math.random() * 6, (Math.random() - 0.5) * 7, 1.6 + Math.random());
    }
  }

  update(dt) {
    if (!this.active) return;
    let alive = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3;
      this.life[i] -= dt;
      this.vel[j + 1] -= 9 * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.life[i] <= 0 || this.pos[j + 1] < 0.05) { this.life[i] = 0; this.pos[j + 1] = -999; } else alive = true;
    }
    this.active = alive;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
