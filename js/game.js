import { Sound } from "./audio.js";
import { UI } from "./ui.js";
import { ARENA } from "./environment.js";
import { getBest, setBest } from "./settings.js";
import { Net, slotX, slotIdx } from "../net.js";

export const S = {
  MENU: "MENU",
  INTRO: "INTRO",
  COUNTDOWN: "COUNTDOWN",
  GREEN: "GREEN",
  RED: "RED",
  ELIMINATED: "ELIMINATED",
  VICTORY: "VICTORY",
  GAMEOVER: "GAMEOVER",
};

const LIMIT = 70; // seconds to reach the finish line
const TURN_LEAD = 0.22; // the doll starts turning this long before the song ends, so her face arrives with the last note
const INTRO_DUR = 7.8; // cinematic intro length (camera shots are timed in CameraRig 'cinema')
const GRACE = 0.5; // reaction window after Red Light starts: the player must stop on their own (no auto-brake)
const SLIDE = 0.25; // after the window, the leftover slide from letting go is forgiven this long (only real input / a new jump counts first)
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // player, contestants, doll, rig, particles
    this.state = S.MENU;
    this.mode = "idle";
    this.paused = false;
    this.phaseT = 0;
    this.phaseDur = 5;
    this.timeLeft = LIMIT;
    this.elapsed = 0;
    this.timeScale = 1;
    this.doomCut = false;
    this.bumpCd = 0;
    this.introT = 0;
    this.introBeat = 0;
    this.introCard = "";
    this.cd = 0;
    this.lastCd = 0;
    this.endT = 0;
    this.winInfo = null;
    this.winShown = false;
    this.online = false; // playing a room round (see net.js)
    this.kind = "green"; // last phase started: 'green' | 'red'
    this.ref = null; // online host that is already out: keeps the rounds going for everybody else
  }

  resetWorld() {
    this.player.reset();
    this.contestants.reset();
    this.particles.reset();
    this.doll.setState("green", true);
    this.timeLeft = LIMIT;
    this.elapsed = 0;
    this.winShown = false;
    this.mode = "idle";
    this.timeScale = 1;
  }

  toMenu() {
    this.paused = false;
    this.online = false;
    this.ref = null;
    Sound.resume();
    Sound.musicStop();
    this.resetWorld();
    this.state = S.MENU;
    this.player.active = false;
    UI.intro(false);
    UI.hud(false);
    UI.show("menu");
    this.rig.setMode("menu");
  }

  // quick = true for retries (short camera swoop); false = full cinematic intro with title card
  start(quick) {
    this.paused = false;
    this.online = false;
    this.ref = null;
    Sound.resume(); // e.g. RESTART from the pause menu: audio was held suspended
    Sound.musicStop();
    this.resetWorld();
    this.player.active = true;
    this.greens = 0;
    if (quick) {
      this.beginCountdown(true);
      return;
    }
    this.state = S.INTRO;
    this.introT = 0;
    this.introBeat = 0;
    this.introCard = "";
    UI.show(null);
    UI.hud(false);
    UI.intro(true);
    this.rig.setMode("cinema");
    Sound.introSting();
  }

  // Online round: no cinematic, everybody gets the quick countdown. Each real player has their own lane on the
  // start line; the AI contestants fill every seat that no real player took.
  startOnline(msg) {
    this.paused = false;
    this.online = true;
    this.ref = null;
    Sound.resume();
    Sound.musicStop();
    this.resetWorld();
    this.player.active = true;
    this.greens = 0;
    const me = Net.slot;
    this.player.pos.x = slotX(me);
    this.contestants.configureOnline(
      slotIdx(me),
      (msg.players || [])
        .filter((p) => p.slot !== me)
        .map((p) => ({ idx: slotIdx(p.slot), x: slotX(p.slot) })),
    );
    this.beginCountdown(true);
  }

  // Clients follow the host's phase announcements instead of running their own timers
  followHost() {
    return this.online && Net.role === "client";
  }

  netPhase(m) {
    const s = this.state;
    if (m.t === "g" && (s === S.COUNTDOWN || s === S.RED)) {
      if (s === S.COUNTDOWN) {
        UI.countdown("GO!");
        Sound.countdown(0);
      }
      this.beginGreen(m.rate);
    } else if (m.t === "r" && s === S.GREEN) this.beginRed(m.dur);
  }

  netMsg(m) {
    if (!this.online) return;
    if (m.t === "g" || m.t === "r") return this.netPhase(m);
    if (m.t === "s") {
      for (const k in m.p) {
        const s = +k;
        if (s !== Net.slot)
          this.contestants.netPos(slotIdx(s), m.p[k][0], m.p[k][1]);
      }
    } else if (m.t === "e" && m.slot !== Net.slot)
      this.contestants.netEvent(slotIdx(m.slot), m.k);
  }

  // Online host that is eliminated / finished / out of time: keep Green and Red going for everyone else
  refStep(dt) {
    if (!this.ref)
      this.ref = { kind: this.kind, t: this.phaseT, dur: this.phaseDur };
    const r = this.ref;
    r.t += dt;
    if (r.t < r.dur) return;
    r.t = 0;
    if (r.kind === "green") {
      r.kind = "red";
      r.dur = rand(2, 5);
      Net.phase({ t: "r", dur: r.dur });
      this.doll.setState("red");
    } else {
      r.kind = "green";
      const rate = rand(0.7, 1.45);
      r.dur = Sound.chantLength(rate);
      Net.phase({ t: "g", rate });
      this.doll.setState("green");
    }
  }

  metersNow() {
    return Math.round(
      Math.max(
        0,
        Math.min(
          ARENA.startZ - ARENA.finishZ,
          ARENA.startZ - this.player.pos.z,
        ),
      ),
    );
  }

  skipIntro() {
    if (this.state === S.INTRO && !this.paused) this.introT = INTRO_DUR;
  }

  beginCountdown(quick) {
    this.state = S.COUNTDOWN;
    this.cd = 3;
    this.lastCd = 4;
    UI.intro(false);
    UI.show(null);
    UI.hud(true);
    UI.setLight("wait");
    UI.updateHud(LIMIT, this.contestants.alive + 1, 0, 0);
    this.rig.setMode(quick ? "intro" : "follow");
  }

  // Intro director: the doll briefly turns to show her glowing eyes, then title / player cards
  introDirector() {
    const t = this.introT;
    if (this.introBeat === 0 && t > 1.3) {
      this.introBeat = 1;
      this.doll.setState("red");
      Sound.dollTurn();
    }
    if (this.introBeat === 1 && t > 2.7) {
      this.introBeat = 2;
      this.doll.setState("green");
    }
    const card = t < 0.35 ? "" : t < 3.0 ? "title" : t > 6.5 ? "player" : "";
    if (card !== this.introCard) {
      this.introCard = card;
      UI.introCard(card);
    }
  }

  // Player <-> contestant collisions, plus the shove from a contestant who just got shot
  resolveCollisions(dt) {
    this.bumpCd -= dt;
    const p = this.player;
    if (
      (this.state !== S.GREEN && this.state !== S.RED) ||
      p.down ||
      p.finished
    )
      return;
    p.applyKnock(dt);
    const hit = this.contestants.collidePlayer(p);
    if (hit > 1.2 && this.bumpCd <= 0) {
      this.bumpCd = 0.4;
      Sound.bump();
      this.rig.shake(0.12);
    }
  }

  onContestantDown(c) {
    const p = this.player;
    if (
      p.down ||
      p.finished ||
      (this.state !== S.GREEN && this.state !== S.RED)
    )
      return;
    const fx = p.pos.x - c.x,
      fz = p.pos.z - c.z,
      dist = Math.hypot(fx, fz);
    // the body falls forward (toward -Z): anyone standing in its path gets tripped, unless they are in the air
    if (Math.abs(fx) < 1.0 && fz > -2.4 && fz < 0.7 && p.y < 0.7) {
      const dir = Math.sign(fx) || (Math.random() < 0.5 ? -1 : 1);
      p.bump(dir * 0.7, -0.7, 9, 0.6);
      Sound.bump();
      this.rig.shake(0.35);
    } else if (dist < 3.2) {
      const k = 1 - dist / 3.2;
      p.bump(fx / (dist || 1), fz / (dist || 1), 6 * k, 0);
      this.rig.shake(0.15 * k);
    }
  }

  beginGreen(forced) {
    this.state = S.GREEN;
    this.mode = "green";
    this.kind = "green";
    this.phaseT = 0;
    // The doll sings "Mu-gung-hwa kkot-i pi-eot-seum-ni-da". Green lasts exactly as long as the song;
    // she gets faster as the game goes on (first round is calm).
    const rate =
      forced !== undefined
        ? forced
        : this.greens === 0
          ? 0.85
          : rand(0.7, 1.45);
    this.greens++;
    if (this.online && Net.role === "host") Net.phase({ t: "g", rate });
    this.chant = Sound.chant(rate);
    this.chantIdx = -1;
    this.dollTurning = false;
    this.phaseDur = this.chant.total;
    this.doll.setState("green");
    this.contestants.onGreen();
    UI.setLight("green");
    UI.chantShow(this.chant.text);
    Sound.green();
    Sound.musicStart();
  }

  beginRed(forced) {
    this.state = S.RED;
    this.mode = "red";
    this.kind = "red";
    this.phaseT = 0;
    this.phaseDur = forced !== undefined ? forced : rand(2, 5);
    if (this.online && Net.role === "host")
      Net.phase({ t: "r", dur: this.phaseDur });
    if (!this.dollTurning) {
      this.doll.setState("red");
      Sound.dollTurn();
    }
    this.dollTurning = false;
    this.graceDone = false;
    this.warned = false;
    this.contestants.onRed();
    UI.setLight("red");
    Sound.musicStop();
    Sound.red();
    this.rig.punch();
  }

  canPause() {
    if (this.online) return false; // the other players cannot wait for you
    return (
      this.state === S.INTRO ||
      this.state === S.COUNTDOWN ||
      this.state === S.GREEN ||
      this.state === S.RED
    );
  }

  pause() {
    if (this.paused || !this.canPause()) return;
    this.paused = true;
    Sound.suspend();
    UI.show("pause");
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    Sound.resume();
    UI.show(null);
    this.player.keys.clear();
  }

  // Lyric highlight + head nod on every syllable, and the doll starts turning just before the song ends
  singAlong() {
    const c = this.chant;
    if (!c) return;
    while (
      this.chantIdx + 1 < c.times.length &&
      this.phaseT >= c.times[this.chantIdx + 1]
    ) {
      this.chantIdx++;
      UI.chantActive(this.chantIdx);
      this.doll.pulse(this.chantIdx === c.times.length - 1 ? 1.6 : 1);
    }
    if (!this.dollTurning && this.phaseT >= this.phaseDur - TURN_LEAD) {
      this.dollTurning = true;
      this.doll.setState("red");
      Sound.dollTurn();
    }
  }

  tickClock(dt) {
    this.elapsed += dt;
    this.timeLeft -= dt;
    return this.timeLeft <= 0;
  }

  win() {
    this.state = S.VICTORY;
    this.mode = "idle";
    this.endT = 0;
    const time = this.elapsed,
      best = getBest(),
      isNew = best === null || time < best;
    if (isNew) setBest(time);
    if (this.online) Net.sendEvent("f", { time });
    this.winInfo = { time, best: isNew ? time : best, isNew };
    this.result = {
      won: true,
      time,
      best: this.winInfo.best,
      isNew,
      meters: 100,
    };
    Sound.musicStop();
    Sound.victory();
    UI.chantHide();
    this.rig.setMode("victory");
    this.particles.confetti(this.player.pos.x, 0, this.player.pos.z);
    UI.notify("YOU MADE IT!", true);
    UI.setLight("green");
    document.getElementById("light").textContent = "SAFE";
  }

  eliminate() {
    this.state = S.ELIMINATED;
    this.mode = "red";
    this.endT = 0;
    this.result = {
      won: false,
      meters: this.metersNow(),
      reason: "MOVED DURING RED LIGHT",
    };
    const px = this.player.pos.x,
      pz = this.player.pos.z,
      dir = px >= 0 ? -1 : 1; // the guard is on the player's side of the track, the bullet travels toward the middle
    this.player.fall(dir);
    if (this.online) Net.sendEvent("d");
    // Drama, in beats (real time, see update()): 0 hit = gunshot + flash + slow motion + punch-in on the player,
    // 0.55 cut to the doll staring at you, 1.3 cut to the fallen player with the red vignette, 3.3 game over screen
    this.timeScale = 0.2;
    this.cutDoll = false;
    this.doomCut = false;
    Sound.gunshot(false);
    UI.flash(true);
    this.rig.setMode("shot");
    this.rig.shake(0.5);
    this.particles.shoot(px >= 0 ? 15.5 : -15.5, 1.6, pz - 3, px, 1.2, pz);
    this.particles.splat(px, 1.2, pz, dir, 1);
  }

  timeUp() {
    this.state = S.GAMEOVER;
    this.mode = "idle";
    this.result = { won: false, meters: this.metersNow(), reason: "TIME'S UP" };
    if (this.online) Net.sendEvent("x");
    Sound.musicStop();
    Sound.gameOver();
    UI.flash();
    UI.showOver("TIME'S UP. YOU DIDN'T REACH THE FINISH LINE.");
  }

  update(dt, t, rdt = dt) {
    // dt may be slowed down (slow-mo), rdt is real time
    const p = this.player;
    switch (this.state) {
      case S.INTRO:
        p.update(dt, true);
        this.introT += dt;
        this.introDirector();
        if (this.introT >= INTRO_DUR) this.beginCountdown(false);
        break;
      case S.COUNTDOWN: {
        p.update(dt, true);
        this.cd -= dt;
        const n = Math.ceil(this.cd);
        if (n > 0 && n !== this.lastCd) {
          this.lastCd = n;
          UI.countdown(String(n));
          Sound.countdown(n);
        }
        if (this.cd <= 0) {
          if (this.followHost())
            this.cd = 0; // wait for the host's green
          else {
            UI.countdown("GO!");
            Sound.countdown(0);
            this.beginGreen();
          }
        }
        break;
      }
      case S.GREEN:
        this.phaseT += dt;
        p.update(dt, false);
        this.singAlong();
        if (p.finished) this.win();
        else if (this.tickClock(dt)) this.timeUp();
        else if (this.phaseT >= this.phaseDur && !this.followHost())
          this.beginRed();
        break;
      case S.RED:
        this.phaseT += dt;
        p.update(dt, false); // NOT locked: you have to let go of the controls yourself
        // Fair check: only real input / real displacement / a new jump counts, and only after the reaction window.
        // Camera movement and being shoved by other contestants never count.
        if (this.phaseT > GRACE) {
          if (!this.graceDone) {
            this.graceDone = true;
            this.jumpMark = p.jumpCount;
          }
          if (
            p.inputMag > 0.25 ||
            p.jumpCount !== this.jumpMark ||
            (this.phaseT > GRACE + SLIDE && p.disp > 0.8) // creeping with a tiny stick tilt still gets caught
          ) {
            this.eliminate();
            break;
          }
        } else if (p.inputMag > 0.25 && this.phaseT > 0.12 && !this.warned) {
          this.warned = true;
          UI.notify("STOP!");
        }
        if (this.tickClock(dt)) this.timeUp();
        else if (this.phaseT >= this.phaseDur && !this.followHost())
          this.beginGreen();
        break;
      case S.ELIMINATED: {
        p.update(dt, true);
        this.endT += rdt; // timeline runs in real time
        if (!this.cutDoll && this.endT > 0.55) {
          this.cutDoll = true;
          this.rig.setMode("doll");
          UI.notify("ELIMINATED");
        } // cut to the doll
        if (!this.doomCut && this.endT > 1.3) {
          this.doomCut = true;
          this.rig.setMode("dead");
          UI.deathFx(true);
          Sound.deathSting();
        } // cut back to the fallen player
        this.timeScale =
          this.endT < 1.5
            ? 0.2
            : Math.min(1, 0.2 + ((this.endT - 1.5) / 0.8) * 0.8); // ease back to normal speed
        if (this.endT > 3.3) {
          this.state = S.GAMEOVER;
          this.timeScale = 1;
          Sound.gameOver();
          UI.showOver("YOU MOVED DURING RED LIGHT.");
        }
        break;
      }
      case S.VICTORY:
        p.update(dt, true);
        this.endT += dt;
        if (this.endT > 2.4 && !this.winShown) {
          this.winShown = true;
          const w = this.winInfo;
          UI.showVictory(w.time, w.best, w.isNew, this.online ? Net.rank : 0);
        }
        break;
      default:
        p.update(dt, true);
    }

    if (
      this.online &&
      Net.role === "host" &&
      (this.state === S.ELIMINATED ||
        this.state === S.GAMEOVER ||
        this.state === S.VICTORY)
    )
      this.refStep(rdt);

    this.resolveCollisions(dt);
    this.contestants.update(
      dt,
      this.mode,
      this.rig.cam.position.x,
      this.rig.cam.position.z,
      t,
    );

    if (this.state !== S.MENU) {
      const span = ARENA.startZ - ARENA.finishZ;
      const pct = Math.round(clamp01((ARENA.startZ - p.pos.z) / span) * 100);
      const meters = Math.round(Math.max(0, Math.min(span, -p.pos.z)));
      UI.updateHud(
        Math.max(0, this.timeLeft),
        this.contestants.alive + (p.down ? 0 : 1),
        pct,
        meters,
      );
      UI.sprint(p.sprinting && this.state === S.GREEN);
      this.footsteps(dt);
    }
  }

  // Footsteps: player on cadence, crowd as a soft background pattern while green
  footsteps(dt) {
    const p = this.player,
      sp = Math.hypot(p.vel.x, p.vel.z);
    this._fs = (this._fs || 0) - dt;
    if (sp > 1 && p.grounded && this.state === S.GREEN && this._fs <= 0) {
      Sound.footstep();
      this._fs = p.sprinting ? 0.22 : 0.32;
    }
    this._cs = (this._cs || 0) - dt;
    if (this.mode === "green" && this._cs <= 0) {
      Sound.crowdStep();
      this._cs = 0.14;
    }
  }
}
