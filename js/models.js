import * as THREE from "three";

// Shared Roblox-style character parts for the player and the AI contestants.
// Every part is a small set of boxes merged into ONE geometry with vertex colours.
// Pass WHITE for skin/hair to let an InstancedMesh tint them per instance (instanceColor multiplies vertex colour).
export const WHITE = 0xffffff;
export const PIV = { armX: 0.69, armY: 1.78, legX: 0.225, legY: 0.9 }; // shoulder / hip pivots (body-root space)

function merge(list) {
  const pos = [],
    nor = [],
    col = [],
    idx = [];
  let off = 0;
  for (const g of list) {
    const p = g.attributes.position,
      n = g.attributes.normal,
      c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.getX(i), c.getY(i), c.getZ(i));
    }
    const ix = g.index;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    off += p.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  m.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  m.setIndex(idx);
  return m;
}

class Parts {
  constructor() {
    this.list = [];
  }
  box(w, h, d, hex, x, y, z, rz = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    const c = new THREE.Color(hex),
      n = g.attributes.position.count,
      a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    this.list.push(g);
    return this;
  }
  done() {
    return merge(this.list);
  }
}

// Body-root space (feet at y = 0, model faces -Z, back is +Z)
export function torsoGeo(c) {
  return new Parts()
    .box(0.92, 0.9, 0.46, c.suit, 0, 1.35, 0) // jacket
    .box(0.94, 0.1, 0.48, c.suitDark, 0, 0.97, 0) // waistband
    .box(0.5, 0.1, 0.5, c.trim, 0, 1.77, 0) // white collar
    .box(0.07, 0.32, 0.03, c.trim, -0.09, 1.65, -0.238, 0.6) // V-neck trim (left)
    .box(0.07, 0.32, 0.03, c.trim, 0.09, 1.65, -0.238, -0.6) // V-neck trim (right)
    .box(0.035, 0.52, 0.02, c.suitDark, 0, 1.28, -0.235) // zipper line
    .done();
}
export function headGeo(c) {
  return new Parts()
    .box(0.56, 0.56, 0.56, c.skin, 0, 2.1, 0)
    .box(0.06, 0.14, 0.1, c.skin, -0.31, 2.06, 0) // ears
    .box(0.06, 0.14, 0.1, c.skin, 0.31, 2.06, 0)
    .box(0.07, 0.08, 0.06, c.skin, 0, 2.03, -0.3) // nose
    .done();
}
export function faceGeo(c) {
  const M = 0x7a2a2a;
  return new Parts()
    .box(0.07, 0.11, 0.02, c.dark, -0.13, 2.14, -0.285) // eyes
    .box(0.07, 0.11, 0.02, c.dark, 0.13, 2.14, -0.285)
    .box(0.13, 0.03, 0.02, c.dark, -0.13, 2.25, -0.285) // brows
    .box(0.13, 0.03, 0.02, c.dark, 0.13, 2.25, -0.285)
    .box(0.14, 0.025, 0.02, M, 0, 1.96, -0.285) // smile
    .box(0.035, 0.035, 0.02, M, -0.085, 1.985, -0.285)
    .box(0.035, 0.035, 0.02, M, 0.085, 1.985, -0.285)
    .done();
}
export function hairGeo(c) {
  return new Parts()
    .box(0.62, 0.16, 0.62, c.hair, 0, 2.4, 0) // top
    .box(0.62, 0.42, 0.14, c.hair, 0, 2.17, 0.33) // back
    .box(0.06, 0.16, 0.5, c.hair, -0.31, 2.3, 0.02) // sideburns
    .box(0.06, 0.16, 0.5, c.hair, 0.31, 2.3, 0.02)
    .box(0.62, 0.08, 0.1, c.hair, 0, 2.32, -0.28) // fringe
    .done();
}
export function hairLongGeo(c) {
  return new Parts()
    .box(0.66, 0.85, 0.14, c.hair, 0, 1.95, 0.34) // long hair hanging down the back
    .done();
}
// Limbs: origin at the joint, hanging down (-Y). side: -1 = left, +1 = right (stripe on the outer side)
export function armGeo(c, side, band) {
  const p = new Parts()
    .box(0.44, 0.76, 0.44, c.suit, 0, -0.38, 0)
    .box(0.05, 0.76, 0.2, c.trim, side * 0.225, -0.38, 0) // white sleeve stripe
    .box(0.46, 0.07, 0.46, c.suitDark, 0, -0.72, 0); // cuff
  if (band) p.box(0.47, 0.14, 0.47, c.armband, 0, -0.22, 0); // coloured armband
  return p.done();
}
export function handGeo(c) {
  return new Parts().box(0.42, 0.2, 0.42, c.skin, 0, -0.85, 0).done();
}
export function legGeo(c, side) {
  return new Parts()
    .box(0.44, 0.78, 0.44, c.suit, 0, -0.39, 0)
    .box(0.05, 0.78, 0.2, c.trim, side * 0.225, -0.39, 0) // white leg stripe
    .box(0.46, 0.06, 0.46, c.suitDark, 0, -0.74, 0) // hem
    .box(0.48, 0.17, 0.6, c.shoe, 0, -0.79, -0.06) // white sneaker
    .box(0.5, 0.05, 0.62, c.sole, 0, -0.875, -0.06) // sole
    .done();
}
