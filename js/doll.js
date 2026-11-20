import * as THREE from 'three';

const TAU = Math.PI * 2;

// Giant robotic doll. Procedural geometry, spring-driven rotations.
// Green: faces away (yaw = PI). Red: head snaps toward the players, then the body follows.
export class Doll {
  constructor(scene) {
    const g = this.group = new THREE.Group();
    g.position.set(4, 0, -113);
    scene.add(g);

    const M = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
    const skin = M(0xf3d2b3), orange = M(0xff7a1a), yellow = M(0xffc933), white = M(0xffffff), shoe = M(0x15151a);
    const hair = M(0x0b0b0e, { side: THREE.DoubleSide }), pink = M(0xff8aa0);
    this.pupilMat = M(0x2a1608, { emissive: 0x000000 });
    const add = (p, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m; };
    const cyl = (a, b, h, s) => new THREE.CylinderGeometry(a, b, h, s || 16);
    const sph = (r, w, h, ...rest) => new THREE.SphereGeometry(r, w || 20, h || 14, ...rest);

    // Legs: white knee socks, skin knees, black shoes
    for (const s of [-1, 1]) {
      add(g, cyl(0.62, 0.62, 3.4, 12), white, s, 2.4, 0);
      add(g, cyl(0.58, 0.58, 0.7, 12), skin, s, 4.45, 0);
      add(g, new THREE.BoxGeometry(1.5, 0.7, 2.3), shoe, s, 0.35, 0.4);
    }
    add(g, cyl(1.5, 3, 3.1, 24), orange, 0, 5.95, 0); // skirt

    // Upper body pivots at the waist
    const up = this.up = new THREE.Group(); up.position.y = 7.3; g.add(up);
    add(up, cyl(1.45, 1.7, 3.2, 20), yellow, 0, 1.6, 0);
    add(up, cyl(1.2, 1.5, 0.3, 20), white, 0, 3.15, 0); // collar
    this.arms = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(s * 1.85, 2.7, 0); a.rotation.z = s * 0.12; up.add(a);
      add(a, cyl(0.5, 0.42, 2.6, 12), orange, 0, -1.3, 0);
      add(a, sph(0.48), skin, 0, -2.8, 0);
      this.arms.push(a);
    }
    const neck = new THREE.Group(); neck.position.y = 3.3; up.add(neck);
    add(neck, cyl(0.5, 0.5, 0.9, 10), skin, 0, 0.2, 0);

    // Big head (pivots independently of the upper body)
    const head = this.head = new THREE.Group(); head.position.y = 0.7; neck.add(head);
    add(head, sph(2.6, 28, 20), skin, 0, 2.4, 0);
    add(head, sph(2.76, 28, 18, Math.PI / 2 + 0.85, TAU - 1.7, 0, Math.PI * 0.72), hair, 0, 2.4, -0.1); // back hair, face window cut out
    add(head, sph(2.72, 28, 12, 0, TAU, 0, Math.PI * 0.38), hair, 0, 2.4, 0); // fringe / top
    for (const s of [-1, 1]) {
      add(head, sph(0.95, 12, 10), hair, s * 3, 1.2, -0.4);        // pigtails
      add(head, sph(0.38, 8, 6), yellow, s * 2.65, 2.2, -0.1);     // hair ties
      add(head, sph(0.55, 14, 10), white, s, 2.5, 2.3);            // eyes
      add(head, sph(0.34, 12, 10), this.pupilMat, s, 2.5, 2.65);   // pupils (glow red)
      const ch = add(head, sph(0.5, 10, 8), pink, s * 1.65, 1.55, 1.9); ch.scale.set(1, 0.7, 0.35);
    }
    add(head, new THREE.BoxGeometry(0.9, 0.18, 0.1), M(0x9a2030), 0, 0.95, 2.2); // mouth

    // Eye glow sprites (cheap, additive)
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const cx = c.getContext('2d'), rg = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(255,255,255,.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = rg; cx.fillRect(0, 0, 64, 64);
    this.glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: 0xff2020, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 });
    for (const s of [-1, 1]) { const sp = new THREE.Sprite(this.glowMat); sp.scale.set(3.4, 3.4, 1); sp.position.set(s, 2.5, 3.0); head.add(sp); }

    this.red = false; this.glow = 0;
    this.ua = this.ha = this.uT = this.hT = Math.PI;
    this.uv = this.hv = 0; this.nod = 0;
  }

  pulse(s = 1) { this.nod = Math.max(this.nod, s); } // little head nod on each sung syllable

  setState(s, instant) {
    this.red = s === 'red';
    if (this.red) this.uT = this.hT = Math.random() < 0.5 ? 0 : TAU;
    else this.uT = this.hT = Math.PI;
    if (instant) { this.ua = this.ha = this.uT; this.uv = this.hv = 0; }
  }

  update(dt, t) {
    const r = this.red;
    this.nod *= Math.exp(-dt * 9);
    const kh = r ? 520 : 70, dh = r ? 30 : 15, ku = r ? 170 : 55, du = r ? 17 : 14;
    const n = Math.ceil(dt / 0.016), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.hv += ((this.hT - this.ha) * kh - this.hv * dh) * h; this.ha += this.hv * h;
      this.uv += ((this.uT - this.ua) * ku - this.uv * du) * h; this.ua += this.uv * h;
    }
    this.up.rotation.y = this.ua;
    this.head.rotation.y = this.ha - this.ua;
    const k = r ? 1 : 0;
    this.glow += (k - this.glow) * (1 - Math.exp(-dt * (r ? 30 : 6)));
    this.glowMat.opacity = this.glow * (0.8 + 0.2 * Math.sin(t * 30));
    this.pupilMat.emissive.setRGB(this.glow, 0.03 * this.glow, 0.03 * this.glow);
    this.up.rotation.z = Math.sin(t * 1.4) * 0.02 * (1 - k);
    this.arms[0].rotation.x = Math.sin(t * 1.4) * 0.08 * (1 - k);
    this.arms[1].rotation.x = -Math.sin(t * 1.4) * 0.08 * (1 - k);
    this.head.rotation.x = r ? 0 : Math.sin(t * 2.6) * 0.04 + this.nod * 0.08;
    this.head.rotation.z = r ? Math.sin(t * 55) * 0.012 : 0;
  }
}