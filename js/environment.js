import * as THREE from "three";

// Arena layout (world units). Players run toward -Z.
export const ARENA = {
  halfW: 28,
  startZ: 0,
  finishZ: -100,
  backZ: -126,
  frontZ: 14,
};

const rnd = (a, b) => a + Math.random() * (b - a);
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });

function tex(w, h, draw, rep) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (rep) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
  }
  t.anisotropy = 2;
  return t;
}

// ---------- Roblox-style masked guards ----------
// Each mask type is baked into ONE merged geometry (vertex colours) and drawn with an InstancedMesh,
// so all guards together cost only 3 draw calls.
function mergeGeos(list) {
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

// kind: 0 = circle mask, 1 = triangle mask (pink jumpsuit), 2 = square mask (black "manager" suit)
function guardGeometry(kind) {
  const boss = kind === 2;
  const SUIT = boss ? 0x18181e : 0xf0447f,
    HOOD = boss ? 0x0d0d10 : 0xd9306a,
    MASK = boss ? 0x2b2b33 : 0x0b0b0e;
  const DARK = 0x0b0b0e,
    GUN = 0x1a1a1f,
    WOOD = 0x6b4a2b,
    MARK = 0xf2f2f2;
  const parts = [];
  const paint = (g, hex) => {
    const c = new THREE.Color(hex),
      n = g.attributes.position.count,
      a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    parts.push(g);
  };
  const pivot = (x, y, z, rx) =>
    new THREE.Matrix4()
      .makeTranslation(x, y, z)
      .multiply(new THREE.Matrix4().makeRotationX(rx));
  const box = (w, h, d, hex, x, y, z, base) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    if (base) g.applyMatrix4(base);
    paint(g, hex);
  };

  // legs + boots
  for (const s of [-1, 1]) {
    const lp = pivot(s * 0.225, 0.9, 0, 0);
    box(0.44, 0.9, 0.44, SUIT, 0, -0.45, 0, lp);
    box(0.48, 0.2, 0.6, DARK, 0, -0.82, -0.06, lp);
  }
  // torso + belt
  box(0.92, 0.9, 0.46, SUIT, 0, 1.35, 0);
  box(0.95, 0.12, 0.5, DARK, 0, 0.98, 0);
  // hood + mask plate
  box(0.64, 0.64, 0.64, HOOD, 0, 2.12, 0.03);
  box(0.5, 0.5, 0.1, MASK, 0, 2.1, -0.31);
  // white outline symbol on the mask (circle / triangle / square), faces -Z
  const ringArgs = [
    [0.12, 0.165, 28, 0, 0],
    [0.15, 0.22, 3, Math.PI / 2, -0.03],
    [0.177, 0.226, 4, Math.PI / 4, 0],
  ][kind];
  const ring = new THREE.RingGeometry(ringArgs[0], ringArgs[1], ringArgs[2]);
  ring.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(0, 2.1 + ringArgs[4], -0.365),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, Math.PI, ringArgs[3]),
      ),
      new THREE.Vector3(1, 1, 1),
    ),
  );
  paint(ring, MARK);

  // right arm raised holding the rifle (Roblox "tool" pose), left arm relaxed
  const ra = pivot(0.69, 1.78, 0, 1.5),
    la = pivot(-0.69, 1.78, 0, 0.15);
  for (const a of [ra, la]) {
    box(0.44, 0.9, 0.44, SUIT, 0, -0.45, 0, a);
    box(0.46, 0.22, 0.46, DARK, 0, -0.8, 0, a);
  }
  // rifle
  box(0.12, 0.15, 1.3, GUN, 0.69, 1.45, -0.9); // body
  box(0.1, 0.3, 0.14, GUN, 0.69, 1.55, -0.78); // grip
  box(0.1, 0.32, 0.16, GUN, 0.69, 1.25, -0.9); // magazine
  box(0.12, 0.2, 0.4, WOOD, 0.69, 1.5, -0.2); // stock
  box(0.14, 0.16, 0.45, WOOD, 0.69, 1.45, -1.2); // foregrip
  box(0.06, 0.1, 0.2, GUN, 0.69, 1.57, -1.3); // sight
  box(0.07, 0.07, 0.25, DARK, 0.69, 1.47, -1.6); // muzzle
  return mergeGeos(parts);
}

function buildGuards(parent, spots) {
  const kinds = spots.map((_, k) => (k % 7 === 3 ? 2 : k % 2));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const D = new THREE.Object3D();
  for (let kind = 0; kind < 3; kind++) {
    const mine = spots.filter((_, k) => kinds[k] === kind);
    if (!mine.length) continue;
    const mesh = new THREE.InstancedMesh(guardGeometry(kind), mat, mine.length);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mine.forEach((p, i) => {
      D.position.set(p[0], 0, p[1]);
      D.rotation.set(0, p[2] + rnd(-0.12, 0.12), 0);
      D.scale.setScalar(1.05);
      D.updateMatrix();
      mesh.setMatrixAt(i, D.matrix);
    });
    parent.add(mesh);
  }
}

export function createEnvironment(scene) {
  const A = ARENA,
    D = new THREE.Object3D(),
    col = new THREE.Color();
  const inst = (geo, mat, n) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };

  // ---- Sky, fog, light ----
  scene.fog = new THREE.Fog(0xbfdcf5, 60, 300);
  scene.background = tex(8, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#2f7fe0");
    g.addColorStop(0.55, "#7fb8f2");
    g.addColorStop(1, "#d6ecff");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5d7a3b, 1.05));
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.4);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {
    left: -26,
    right: 26,
    top: 26,
    bottom: -26,
    near: 1,
    far: 160,
  });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ---- Ground + track ----
  const grassTex = tex(
    128,
    128,
    (c) => {
      c.fillStyle = "#5aa83a";
      c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 900; i++) {
        c.fillStyle = `hsla(${85 + Math.random() * 30},55%,${30 + Math.random() * 22}%,.55)`;
        c.fillRect(Math.random() * 128, Math.random() * 128, 2, 3);
      }
    },
    80,
  );
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ map: grassTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = false;
  scene.add(ground);

  const track = new THREE.Mesh(new THREE.PlaneGeometry(26, 118), lam(0xcfae7c));
  track.rotation.x = -Math.PI / 2;
  track.position.set(0, 0.02, -51);
  track.receiveShadow = true;
  scene.add(track);

  const flat = (w, h, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, y, z);
    scene.add(m);
    return m;
  };
  const whiteBasic = new THREE.MeshBasicMaterial({ color: 0xffffff });
  flat(26, 0.6, 0.04, A.startZ, whiteBasic);
  const lanes = inst(new THREE.PlaneGeometry(0.12, 116), whiteBasic, 7);
  for (let i = 0; i < 7; i++) {
    D.position.set(-12 + i * 4, 0.04, -50);
    D.rotation.set(-Math.PI / 2, 0, 0);
    D.scale.set(1, 1, 1);
    D.updateMatrix();
    lanes.setMatrixAt(i, D.matrix);
  }
  const marks = inst(
    new THREE.PlaneGeometry(26, 0.25),
    new THREE.MeshBasicMaterial({ color: 0xf1e6cf }),
    4,
  );
  for (let i = 0; i < 4; i++) {
    D.position.set(0, 0.035, -20 - i * 20);
    D.rotation.set(-Math.PI / 2, 0, 0);
    D.updateMatrix();
    marks.setMatrixAt(i, D.matrix);
  }

  // Finish line (checker) + gantry banner
  const checker = tex(256, 16, (c, w, h) => {
    for (let x = 0; x < 16; x++)
      for (let y = 0; y < 2; y++) {
        c.fillStyle = (x + y) % 2 ? "#111" : "#fff";
        c.fillRect(x * 16, y * 8, 16, 8);
      }
  });
  flat(
    26,
    1.6,
    0.045,
    A.finishZ,
    new THREE.MeshBasicMaterial({ map: checker }),
  );
  const bannerTex = tex(512, 64, (c, w, h) => {
    c.fillStyle = "#ed1b76";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#fff";
    c.font = '700 46px Impact, "Arial Narrow", sans-serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("FINISH", w / 2, h / 2 + 2);
    for (let x = 0; x < w; x += 16) {
      c.fillStyle = (x / 16) % 2 ? "#111" : "#fff";
      c.fillRect(x, 0, 16, 6);
      c.fillRect(x, h - 6, 16, 6);
    }
  });
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(28, 3, 0.4),
    new THREE.MeshBasicMaterial({ map: bannerTex }),
  );
  banner.position.set(0, 9, A.finishZ);
  scene.add(banner);
  const postGeo = new THREE.CylinderGeometry(0.35, 0.35, 10, 8),
    postMat = lam(0xeeeeee);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set(s * 14, 5, A.finishZ);
    p.castShadow = true;
    scene.add(p);
  }

  // ---- Colorful walls (one instanced draw call) ----
  const wallTex = tex(64, 128, (c, w, h) => {
    c.fillStyle = "#fff";
    c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, "rgba(0,0,0,.32)");
    g.addColorStop(0.4, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(255,255,255,.18)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(0,0,0,.25)";
    c.fillRect(0, 0, 2, h);
    c.fillRect(w - 2, 0, 2, h);
  });
  const PAL = [
    0xff8fb1, 0x6fd6c8, 0xffd166, 0xb69cff, 0x6aa8ff, 0xff9f68, 0x9be37b,
  ];
  const wp = [];
  for (let i = 0; i < 20; i++) {
    const z = A.frontZ - 3.5 - 7 * i;
    wp.push([-30, z, Math.PI / 2], [30, z, Math.PI / 2]);
  }
  for (let i = 0; i < 9; i++) {
    const x = -28 + 7 * i;
    wp.push([x, A.backZ - 0.5, 0], [x, A.frontZ + 0.5, 0]);
  }
  const walls = inst(
    new THREE.BoxGeometry(7, 18, 1),
    new THREE.MeshLambertMaterial({ map: wallTex }),
    wp.length,
  );
  wp.forEach((w, i) => {
    D.position.set(w[0], 9, w[1]);
    D.rotation.set(0, w[2], 0);
    D.scale.set(1, 1, 1);
    D.updateMatrix();
    walls.setMatrixAt(i, D.matrix);
    walls.setColorAt(i, col.setHex(PAL[i % PAL.length]));
  });
  walls.receiveShadow = false;

  // ---- Hills (instanced) ----
  const hills = inst(new THREE.SphereGeometry(1, 16, 10), lam(0x6ea04a), 9);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd(-0.2, 0.2),
      R = rnd(220, 280);
    D.position.set(Math.sin(a) * R, 0, -55 + Math.cos(a) * R);
    D.rotation.set(0, 0, 0);
    D.scale.set(rnd(60, 100), rnd(14, 28), rnd(50, 80));
    D.updateMatrix();
    hills.setMatrixAt(i, D.matrix);
    hills.setColorAt(i, col.setHSL(rnd(0.22, 0.3), 0.4, rnd(0.34, 0.44)));
  }

  // ---- Clouds (instanced puffs, slow drift) ----
  const cloudGroup = new THREE.Group();
  cloudGroup.position.set(0, 0, -55);
  scene.add(cloudGroup);
  const clouds = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshLambertMaterial({
      color: 0xffffff,
      emissive: 0x9fb4cc,
      fog: false,
    }),
    90,
  );
  clouds.frustumCulled = false;
  cloudGroup.add(clouds);
  for (let i = 0; i < 18; i++) {
    const a = rnd(0, Math.PI * 2),
      R = rnd(80, 240),
      cx = Math.sin(a) * R,
      cz = Math.cos(a) * R,
      cy = rnd(45, 80);
    for (let p = 0; p < 5; p++) {
      const s = rnd(7, 12);
      D.position.set(cx + rnd(-12, 12), cy + rnd(-2, 3), cz + rnd(-8, 8));
      D.rotation.set(0, 0, 0);
      D.scale.set(s, s * 0.55, s);
      D.updateMatrix();
      clouds.setMatrixAt(i * 5 + p, D.matrix);
    }
  }

  // ---- Grass tufts (instanced, count scales with preset) ----
  const MAXG = 1800;
  const grass = inst(new THREE.ConeGeometry(0.18, 0.9, 4), lam(0x4f9a33), MAXG);
  for (let i = 0; i < MAXG; ) {
    const x = rnd(-27, 27),
      z = rnd(-124, 12);
    if (Math.abs(x) < 13.6 && z > -111 && z < 9) continue;
    const s = rnd(0.7, 1.6);
    D.position.set(x, 0.4 * s, z);
    D.rotation.set(0, rnd(0, 6), 0);
    D.scale.set(s, s, s);
    D.updateMatrix();
    grass.setMatrixAt(i, D.matrix);
    grass.setColorAt(i, col.setHSL(rnd(0.22, 0.32), 0.55, rnd(0.28, 0.42)));
    i++;
  }

  // ---- Giant tree beside the doll ----
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.9, 14, 8),
    lam(0x6b4a2b),
  );
  trunk.position.set(-9, 7, -114);
  trunk.castShadow = true;
  scene.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({
      color: 0x3f8f35,
      flatShading: true,
    }),
    leafGeo = new THREE.IcosahedronGeometry(1, 1);
  [
    [0, 19, 0, 8],
    [-5, 16, 2, 6],
    [5, 16.5, -2, 6.5],
    [1, 23, 1, 5],
  ].forEach((l) => {
    const m = new THREE.Mesh(leafGeo, leafMat);
    m.position.set(-9 + l[0], l[1], -114 + l[2]);
    m.scale.setScalar(l[3]);
    m.castShadow = true;
    scene.add(m);
  });

  // ---- Watchtowers + surveillance cameras ----
  const legGeo = new THREE.CylinderGeometry(0.25, 0.32, 10, 6),
    woodMat = lam(0x5b4a3a),
    cabinMat = lam(0x394150),
    roofMat = lam(0xb23a48);
  const camBox = new THREE.BoxGeometry(0.7, 0.5, 1.1),
    camMat = lam(0x1b1b1f),
    lensGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8),
    lensMat = new THREE.MeshBasicMaterial({ color: 0xff2b3a });
  const cams = [];
  function tower(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    scene.add(g);
    const add = (geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) add(legGeo, woodMat, sx * 1.6, 5, sz * 1.6);
    add(new THREE.BoxGeometry(4.6, 0.4, 4.6), woodMat, 0, 10, 0);
    add(new THREE.BoxGeometry(3.6, 2.4, 3.6), cabinMat, 0, 11.4, 0);
    add(new THREE.BoxGeometry(4.8, 0.4, 4.8), roofMat, 0, 12.8, 0);
    const cg = new THREE.Group();
    cg.position.set(0, 10.8, x > 0 ? -2.4 : -2.4);
    g.add(cg);
    const cb = new THREE.Mesh(camBox, camMat);
    cg.add(cb);
    const ln = new THREE.Mesh(lensGeo, lensMat);
    ln.rotation.x = Math.PI / 2;
    ln.position.z = -0.65;
    cg.add(ln);
    cams.push({ g: cg, ph: Math.random() * 6, base: x > 0 ? 0.5 : -0.5 });
  }
  tower(-26, -40);
  tower(26, -40);
  tower(-26, -95);
  tower(26, -95);

  // ---- Detail group (guards, booths): hidden on LOW ----
  const details = new THREE.Group();
  scene.add(details);
  const guardSpots = [];
  [-16, 16].forEach((x) => {
    for (let i = 0; i < 4; i++)
      guardSpots.push([x, -88 - i * 6, x < 0 ? -Math.PI / 2 : Math.PI / 2]);
  });
  [-15, 15].forEach((x) => {
    for (let i = 0; i < 3; i++)
      guardSpots.push([x, -20 - i * 25, x < 0 ? -Math.PI / 2 : Math.PI / 2]);
  });
  buildGuards(details, guardSpots);
  const boothGeo = new THREE.BoxGeometry(4, 3.4, 4);
  [-20, 20].forEach((x) => {
    const b = new THREE.Mesh(boothGeo, lam(0x4c5566));
    b.position.set(x, 1.7, 8);
    b.castShadow = true;
    details.add(b);
    const r = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 4.6), roofMat);
    r.position.set(x, 3.5, 8);
    details.add(r);
  });

  return {
    light: sun,
    details,
    grass,
    update(dt, t, fx, fz) {
      cloudGroup.rotation.y += dt * 0.003;
      for (const c of cams)
        c.g.rotation.y = c.base + Math.sin(t * 0.6 + c.ph) * 0.7;
      sun.position.set(fx - 30, 55, fz + 35);
      sun.target.position.set(fx, 0, fz);
      sun.target.updateMatrixWorld();
    },
    applyPreset(p) {
      sun.castShadow = p.shadows;
      if (sun.shadow.mapSize.x !== p.shadowSize) {
        sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
        if (sun.shadow.map) {
          sun.shadow.map.dispose();
          sun.shadow.map = null;
        }
      }
      details.visible = p.details;
      grass.count = Math.min(p.grass, MAXG);
      clouds.count = p.clouds * 5;
    },
  };
}
