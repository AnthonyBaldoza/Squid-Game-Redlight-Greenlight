import * as THREE from "three";
import { ARENA } from "./environment.js";
import { Sound } from "./audio.js";
import {
  PIV,
  torsoGeo,
  headGeo,
  faceGeo,
  hairGeo,
  armGeo,
  handGeo,
  legGeo,
} from "./models.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Player {
  constructor(scene, canvas, touch) {
    this.pos = new THREE.Vector3(0, 0, 3.4);
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.yaw = 0;
    this.pitch = 0.3;
    this.inputMag = 0;
    this.disp = 0;
    this.sprinting = false;
    this.finished = false;
    this.down = false;
    this.phase = 0;
    this.fallA = 0;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.sprintTouch = false;
    this.active = false;
    this.build(scene);
    this.bind(canvas, touch);
    this.reset();
  }

  build(scene) {
    // Roblox-style character made of merged, vertex-coloured parts (see models.js). Faces -Z, back is +Z.
    const g = (this.group = new THREE.Group());
    g.rotation.order = "YXZ";
    g.scale.setScalar(0.85);
    scene.add(g);
    const C = {
      suit: 0x23c9b4,
      suitDark: 0x15998a,
      trim: 0xffffff,
      skin: 0xf5cd9b,
      hair: 0x1a1210,
      shoe: 0xffffff,
      sole: 0x222226,
      dark: 0x1a1a1a,
      armband: 0xed1b76,
    };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = (geo, parent, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      parent.add(m);
      return m;
    };
    mesh(torsoGeo(C), g);
    mesh(headGeo(C), g);
    mesh(faceGeo(C), g, false);
    mesh(hairGeo(C), g, false);
    this.legs = [];
    this.arms = [];
    for (const s of [-1, 1]) {
      const l = new THREE.Group();
      l.position.set(s * PIV.legX, PIV.legY, 0);
      g.add(l);
      mesh(legGeo(C, s), l);
      this.legs.push(l);
      const a = new THREE.Group();
      a.position.set(s * PIV.armX, PIV.armY, 0);
      g.add(a);
      mesh(armGeo(C, s, s < 0), a);
      mesh(handGeo(C), a, false);
      this.arms.push(a);
    }

    // Number plate on the back
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 64, 64);
    x.strokeStyle = "#111";
    x.lineWidth = 3;
    x.strokeRect(2, 2, 60, 60);
    x.fillStyle = "#111";
    x.font = "700 28px Arial";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText("456", 32, 34);
    const pt = new THREE.CanvasTexture(c);
    pt.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ map: pt }),
    );
    plate.position.set(0, 1.38, 0.235);
    g.add(plate);

    // Marker above the player so they stay easy to spot in the crowd
    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.3, 4),
      new THREE.MeshBasicMaterial({ color: 0xed1b76 }),
    );
    this.marker.rotation.x = Math.PI;
    g.add(this.marker);
  }

  reset() {
    this.pos.set(0, 0, 3.4);
    this.vel.set(0, 0, 0);
    this.heading = 0;
    this.yaw = 0;
    this.pitch = 0.3;
    this.phase = 0;
    this.fallA = 0;
    this.finished = false;
    this.down = false;
    this.inputMag = 0;
    this.disp = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.jumpBuf = 0;
    this.knock = { x: 0, z: 0 };
    this.stunT = 0;
    this.stagger = 0;
    this.jumpCount = 0;
    this.fallT = 0;
    this.fallRoll = 0;
    for (const a of this.arms) a.rotation.z = 0;
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, 0, 0);
  }

  // Shot. dir = +1 / -1: the side the bullet pushes the body toward (X). Only used after elimination, so it never affects fairness.
  fall(dir = 1) {
    this.down = true;
    this.fallT = 0;
    this.fallRoll = dir * 0.5;
    this.vel.x += dir * 9; // the impact throws the body a little
    this.vel.z -= 1.5;
  }

  // Shoved by a collision / falling body. Applied outside update(), so it never counts as "movement" on Red Light.
  bump(nx, nz, power, stun = 0) {
    this.knock.x += nx * power;
    this.knock.z += nz * power;
    if (stun > this.stunT) this.stunT = stun;
    this.stagger = clamp(nx, -1, 1) * (stun > 0 ? 1.4 : 0.7);
  }
  applyKnock(dt) {
    const k = this.knock;
    if (Math.abs(k.x) + Math.abs(k.z) > 0.05) {
      this.pos.x += k.x * dt;
      this.pos.z += k.z * dt;
      const d = Math.exp(-dt * 5);
      k.x *= d;
      k.z *= d;
    } else k.x = k.z = 0;
    this.stagger *= Math.exp(-dt * 4);
    this.clampPos();
  }
  clampPos() {
    this.pos.x = clamp(this.pos.x, -(ARENA.halfW - 2), ARENA.halfW - 2);
    this.pos.z = clamp(this.pos.z, ARENA.finishZ - 6, 9);
  }
  speedFrac() {
    return Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 8.2);
  }

  bind(canvas, t) {
    addEventListener("keydown", (e) => {
      if (e.target && e.target.tagName === "INPUT") return; // typing a name / room code
      if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
      if (e.code === "Space" && !e.repeat) this.jumpBuf = 0.15;
      this.keys.add(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());

    // Pointer input.
    // Mouse: pointer lock / drag to look. Touch: left side = floating joystick (appears where the thumb lands),
    // right side = drag to look. Sprint/Jump buttons sit on top.
    let dragId = null,
      lx = 0,
      ly = 0,
      stickId = null,
      ox = 0,
      oy = 0;
    const look = (dx, dy, sx, sy) => {
      this.yaw -= dx * sx;
      this.pitch = clamp(this.pitch + dy * sy, 0.08, 0.85);
    };
    const rad = () => t.stick.getBoundingClientRect().width / 2 || 60;
    const cap = (e) => {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
    };
    const setStick = (e) => {
      const r = rad();
      let dx = (e.clientX - ox) / r,
        dy = (e.clientY - oy) / r;
      const m = Math.hypot(dx, dy);
      if (m > 1) {
        dx /= m;
        dy /= m;
      }
      this.joy.x = dx;
      this.joy.y = -dy;
      t.knob.style.transform = `translate(${dx * r * 0.55}px,${dy * r * 0.55}px)`;
    };
    const stickEnd = () => {
      stickId = null;
      this.joy.x = this.joy.y = 0;
      t.knob.style.transform = "";
      t.stick.style.left = t.stick.style.top = t.stick.style.bottom = "";
    };
    this.releaseTouch = () => {
      if (stickId !== null) stickEnd();
      dragId = null;
      this.sprintTouch = false;
    };

    canvas.addEventListener("pointerdown", (e) => {
      if (!this.active) return;
      if (e.pointerType === "mouse") {
        if (!document.pointerLockElement && canvas.requestPointerLock) {
          try {
            const r = canvas.requestPointerLock();
            if (r && r.catch) r.catch(() => {});
          } catch (err) {
            /* ignore */
          }
        }
      } else if (e.clientX < innerWidth * 0.45) {
        if (stickId !== null) return;
        stickId = e.pointerId;
        ox = e.clientX;
        oy = e.clientY;
        cap(e);
        const r = rad();
        t.stick.style.left = ox - r + "px";
        t.stick.style.top = oy - r + "px";
        t.stick.style.bottom = "auto";
        setStick(e);
        return;
      }
      if (dragId !== null) return;
      dragId = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      cap(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (document.pointerLockElement === canvas) {
        look(e.movementX, e.movementY, 0.0025, 0.0025);
        return;
      }
      if (e.pointerId === stickId) {
        setStick(e);
        return;
      }
      if (e.pointerId !== dragId) return;
      look(
        e.clientX - lx,
        e.clientY - ly,
        e.pointerType === "mouse" ? 0.004 : 0.006,
        0.004,
      );
      lx = e.clientX;
      ly = e.clientY;
    });
    const end = (e) => {
      if (e.pointerId === dragId) dragId = null;
      if (e.pointerId === stickId) stickEnd();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("lostpointercapture", end);

    // Sprint button
    const sp = (on) => {
      this.sprintTouch = on;
      t.sprint.classList.toggle("on", on);
    };
    t.sprint.addEventListener("pointerdown", (e) => {
      t.sprint.setPointerCapture(e.pointerId);
      sp(true);
    });
    t.sprint.addEventListener("pointerup", () => sp(false));
    t.sprint.addEventListener("lostpointercapture", () => sp(false));
    t.sprint.addEventListener("pointercancel", () => sp(false));

    // Jump button
    t.jump.addEventListener("pointerdown", (e) => {
      t.jump.setPointerCapture(e.pointerId);
      this.jumpBuf = 0.15;
    });
  }

  // locked = true -> input ignored and the player brakes hard (Red Light / countdown / end screens)
  update(dt, locked) {
    if (this.stunT > 0) {
      this.stunT -= dt;
      locked = true;
    } // stumbling: no control for a moment
    const px = this.pos.x,
      pz = this.pos.z,
      k = this.keys;
    let ix = 0,
      iy = 0;
    if (!this.down) {
      ix =
        (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) -
        (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) +
        this.joy.x;
      iy =
        (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) -
        (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) +
        this.joy.y;
    }
    let m = Math.hypot(ix, iy);
    if (m > 1) {
      ix /= m;
      iy /= m;
      m = 1;
    }
    this.inputMag = m < 0.15 ? 0 : m;
    this.sprinting =
      this.inputMag > 0 &&
      (k.has("ShiftLeft") ||
        k.has("ShiftRight") ||
        this.sprintTouch ||
        Math.hypot(this.joy.x, this.joy.y) > 0.92);

    let tx = 0,
      tz = 0;
    if (!locked && !this.finished && this.inputMag > 0) {
      const spd = this.sprinting ? 8.2 : 5.2,
        sy = Math.sin(this.yaw),
        cy = Math.cos(this.yaw);
      tx = (-sy * iy + cy * ix) * spd;
      tz = (-cy * iy - sy * ix) * spd;
    }
    const a = 1 - Math.exp(-dt * (locked || this.finished ? 22 : 11));
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.z += (tz - this.vel.z) * a;
    this.pos.x = clamp(
      this.pos.x + this.vel.x * dt,
      -(ARENA.halfW - 2),
      ARENA.halfW - 2,
    );
    this.pos.z = clamp(this.pos.z + this.vel.z * dt, ARENA.finishZ - 6, 9);
    if (this.pos.z <= ARENA.finishZ) this.finished = true;
    this.disp =
      Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-4);

    // Jump: only on Green Light (ignored while locked). Vertical motion never counts as movement on Red.
    if (locked || this.finished || this.down) this.jumpBuf = 0;
    else this.jumpBuf -= dt;
    if (this.jumpBuf > 0 && this.grounded) {
      this.vy = 7.2;
      this.grounded = false;
      this.jumpBuf = 0;
      this.jumpCount++;
      Sound.jump();
    }
    if (!this.grounded) {
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }

    // Visuals
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.4) {
      const target = Math.atan2(-this.vel.x, -this.vel.z);
      const d =
        ((((target - this.heading + Math.PI) % (Math.PI * 2)) + Math.PI * 2) %
          (Math.PI * 2)) -
        Math.PI;
      this.heading += d * (1 - Math.exp(-dt * 14));
    }
    this.phase += sp * dt * 1.9;
    const sw = Math.sin(this.phase) * 0.9 * Math.min(sp / 5, 1.4);
    this.legs[0].rotation.x = sw;
    this.legs[1].rotation.x = -sw;
    this.arms[0].rotation.x = -sw;
    this.arms[1].rotation.x = sw;
    if (this.down) {
      // hit reaction: jerk backwards from the impact, drop face-first (accelerating), settle with a small bounce
      const ft = (this.fallT += dt);
      const hit = ft < 0.16 ? -0.32 * Math.sin((ft / 0.16) * Math.PI) : 0;
      const u = clamp((ft - 0.12) / 0.5, 0, 1);
      const bounce =
        ft > 0.62
          ? Math.exp(-(ft - 0.62) * 8) * Math.sin((ft - 0.62) * 24) * 0.06
          : 0;
      this.fallA = hit + (Math.PI / 2) * u * u + bounce;
      const flare = Math.sin(Math.min(1, ft / 0.3) * (Math.PI / 2)); // arms fling outward
      this.arms[0].rotation.z = -flare;
      this.arms[1].rotation.z = flare;
    }
    this.group.position.set(
      this.pos.x,
      this.y +
        Math.sin(Math.max(0, this.fallA)) * 0.3 +
        (this.grounded
          ? Math.abs(Math.sin(this.phase)) * 0.06 * Math.min(sp / 5, 1)
          : 0),
      this.pos.z,
    );
    this.group.rotation.set(
      -this.fallA + clamp(this.stunT / 0.3, 0, 1) * 0.4,
      this.heading,
      this.stagger * 0.3 +
        (this.down ? this.fallRoll * clamp(this.fallT / 0.5, 0, 1) : 0),
    );
    this.marker.visible = !this.down;
    this.marker.position.set(
      0,
      2.75 + Math.sin(performance.now() * 0.005) * 0.08,
      0,
    );
  }
}

export class CameraRig {
  constructor(cam, player) {
    this.cam = cam;
    this.p = player;
    this.mode = "menu";
    this.t = 0;
    this.modeT = 0;
    this.shakeA = 0;
    this.kick = 0;
    this.fov = 52;
    this.pos = new THREE.Vector3(0, 5, -60);
    this.look = new THREE.Vector3(4, 7, -113);
    this.des = new THREE.Vector3();
    this.lt = new THREE.Vector3();
    this.fp = new THREE.Vector3();
  }
  setMode(m) {
    this.mode = m;
    this.modeT = 0;
    this.snap = m === "doll" || m === "dead" || m === "shot";
  } // doll / dead / shot are hard cuts
  shake(a) {
    this.shakeA = Math.max(this.shakeA, a);
  }
  punch() {
    this.kick = 1;
  }

  followPos(out) {
    const p = this.p,
      d = 7.4,
      cp = Math.cos(p.pitch),
      sp = Math.sin(p.pitch);
    out.set(
      p.pos.x + Math.sin(p.yaw) * cp * d,
      1.6 + sp * d,
      p.pos.z + Math.cos(p.yaw) * cp * d,
    );
  }

  update(dt) {
    this.t += dt;
    this.modeT += dt;
    const p = this.p,
      cam = this.cam,
      t = this.t;
    let k = 1 - Math.exp(-dt * 3),
      fovT = cam.aspect < 1 ? 74 : 62;

    if (this.mode === "menu") {
      this.des.set(
        Math.sin(t * 0.12) * 12,
        4.5 + Math.sin(t * 0.2),
        -62 + Math.cos(t * 0.1) * 8,
      );
      this.lt.set(4, 7, -113);
      fovT = 52;
    } else if (this.mode === "intro") {
      const u = Math.min(this.modeT / 3, 1),
        e = u * u * (3 - 2 * u);
      this.followPos(this.des);
      this.des.x = 14 + (this.des.x - 14) * e;
      this.des.y = 10 + (this.des.y - 10) * e;
      this.des.z = -96 + (this.des.z + 96) * e;
      this.lt.set(
        4 + (p.pos.x - 4) * e,
        6 + (1.9 - 6) * e,
        -110 + (p.pos.z - 3 + 110) * e,
      );
      k = 1;
      if (this.modeT >= 3) this.setMode("follow");
    } else if (this.mode === "cinema") {
      // Shot 1: orbit the doll. Shot 2: long pull-back flight down the track. Shot 3: hold behind the player.
      const T1 = 2.8,
        T2 = 6.6,
        m = this.modeT,
        ease = (u) => u * u * (3 - 2 * u);
      const orbit = (e) => {
        const a = 0.2 + e,
          R = 16 + 3 * e;
        return [4 + R * Math.cos(a), 7 + 4 * e, -113 + R * Math.sin(a)];
      };
      const fl = [
        p.pos.x - Math.sin(p.yaw) * 3,
        1.9,
        p.pos.z - Math.cos(p.yaw) * 3,
      ];
      this.followPos(this.fp);
      if (m < T1) {
        const e = ease(m / T1),
          o = orbit(e);
        this.des.set(o[0], o[1], o[2]);
        this.lt.set(4, 13 - 4 * e, -113 + 8 * e);
      } else if (m < T2) {
        const e = ease((m - T1) / (T2 - T1)),
          s1 = orbit(1),
          sw = Math.sin(e * Math.PI);
        this.des.set(
          s1[0] + (this.fp.x - s1[0]) * e - sw * 8,
          s1[1] + (this.fp.y - s1[1]) * e + sw * 2,
          s1[2] + (this.fp.z - s1[2]) * e,
        );
        this.lt.set(
          4 + (fl[0] - 4) * e,
          9 + (fl[1] - 9) * e,
          -105 + (fl[2] + 105) * e,
        );
      } else {
        this.des.copy(this.fp);
        this.lt.set(fl[0], fl[1], fl[2]);
      }
      fovT *= 0.72 + 0.28 * ease(Math.min(1, m / T2));
      k = 1;
    } else if (this.mode === "follow") {
      this.followPos(this.des);
      this.des.y += Math.sin(p.phase * 2) * 0.05 * p.speedFrac();
      this.lt.set(
        p.pos.x - Math.sin(p.yaw) * 3,
        1.9 + p.y * 0.6,
        p.pos.z - Math.cos(p.yaw) * 3,
      );
      k = 1 - Math.exp(-dt * (this.modeT < 0.9 ? 5 : 9)); // gentle settle after the cinematic / skip
      fovT += 6 * p.speedFrac();
    } else if (this.mode === "victory") {
      const a = Math.sin(this.modeT * 0.6) * 0.8;
      this.des.set(p.pos.x + Math.sin(a) * 6, 2.4, p.pos.z - 7);
      this.lt.set(p.pos.x, 1.7, p.pos.z);
    } else if (this.mode === "shot") {
      // the moment of the hit: low camera in front of the player, punching in on the face
      const s = Math.min(this.modeT / 0.1, 1);
      this.des.set(p.pos.x + 0.9 - s * 0.5, 1.6, p.pos.z - 3.4 + s * 1.0);
      this.lt.set(p.pos.x, 1.7, p.pos.z);
      fovT = (cam.aspect < 1 ? 54 : 44) - s * 10;
      k = 1;
    } else if (this.mode === "doll") {
      // close-up of the doll staring at you (in the red state her face points toward +Z)
      this.des.set(6.5, 12.6, Math.min(-99 + this.modeT * 1.2, -96));
      this.lt.set(4, 13.4, -113);
      fovT = cam.aspect < 1 ? 46 : 33;
      k = 1;
    } else {
      // dead
      this.des.set(
        p.pos.x + 4,
        3.5 + this.modeT * 0.4,
        p.pos.z + 6 + this.modeT * 0.5,
      );
      this.lt.set(p.pos.x, 0.6, p.pos.z);
    }

    // Keep the camera inside the arena (no clipping through walls)
    this.des.x = clamp(this.des.x, -28.4, 28.4);
    this.des.z = clamp(this.des.z, -124, 13.4);
    this.des.y = Math.max(0.8, this.des.y);

    if (this.snap) {
      this.pos.copy(this.des);
      this.look.copy(this.lt);
      this.fov = fovT;
      this.snap = false;
    } else {
      this.pos.lerp(this.des, k);
      this.look.lerp(this.lt, Math.min(1, k * 1.3));
    }
    this.shakeA *= Math.exp(-dt * 5);
    cam.position.set(
      this.pos.x + (Math.random() - 0.5) * this.shakeA,
      this.pos.y + (Math.random() - 0.5) * this.shakeA,
      this.pos.z,
    );
    cam.lookAt(this.look);

    this.kick *= Math.exp(-dt * 7);
    if (this.mode === "shot")
      this.fov = fovT; // slow motion would make the usual smoothing crawl
    else this.fov += (fovT - this.fov) * (1 - Math.exp(-dt * 6));
    const f = this.fov - this.kick * 8;
    if (Math.abs(cam.fov - f) > 0.01) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  }
}
