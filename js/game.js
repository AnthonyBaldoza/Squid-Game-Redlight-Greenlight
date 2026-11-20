import { Sound } from './audio.js';
import { UI } from './ui.js';
import { ARENA } from './environment.js';
import { getBest, setBest } from './settings.js';

export const S = { MENU: 'MENU', COUNTDOWN: 'COUNTDOWN', GREEN: 'GREEN', RED: 'RED', ELIMINATED: 'ELIMINATED', VICTORY: 'VICTORY', GAMEOVER: 'GAMEOVER' };

const LIMIT = 70;   // seconds to reach the finish line
const TURN_LEAD = 0.22; // the doll starts turning this long before the song ends, so her face arrives with the last note
const GRACE = 0.4;  // reaction window after Red Light starts (player is braked and locked meanwhile)
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = v => Math.max(0, Math.min(1, v));

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // player, contestants, doll, rig, particles
    this.state = S.MENU; this.mode = 'idle'; this.paused = false;
    this.phaseT = 0; this.phaseDur = 5; this.timeLeft = LIMIT; this.elapsed = 0;
    this.cd = 0; this.lastCd = 0; this.endT = 0; this.winInfo = null; this.winShown = false;
  }

  resetWorld() {
    this.player.reset(); this.contestants.reset(); this.doll.setState('green', true);
    this.timeLeft = LIMIT; this.elapsed = 0; this.winShown = false; this.mode = 'idle';
  }

  toMenu() {
    this.paused = false; Sound.resume();
    Sound.musicStop();
    this.resetWorld();
    this.state = S.MENU; this.player.active = false;
    UI.hud(false); UI.show('menu');
    this.rig.setMode('menu');
  }

  start() {
    this.paused = false;
    Sound.musicStop();
    this.resetWorld();
    this.state = S.COUNTDOWN; this.player.active = true;
    this.cd = 3; this.lastCd = 4; this.greens = 0;
    UI.show(null); UI.hud(true); UI.setLight('wait');
    UI.updateHud(LIMIT, this.contestants.alive + 1, 0, 0);
    this.rig.setMode('intro');
  }

  beginGreen() {
    this.state = S.GREEN; this.mode = 'green';
    this.phaseT = 0;
    // The doll sings "Mu-gung-hwa kkot-i pi-eot-seum-ni-da". Green lasts exactly as long as the song;
    // she gets faster as the game goes on (first round is calm).
    const rate = this.greens++ === 0 ? 0.85 : rand(0.7, 1.45);
    this.chant = Sound.chant(rate); this.chantIdx = -1; this.dollTurning = false;
    this.phaseDur = this.chant.total;
    this.doll.setState('green'); this.contestants.onGreen();
    UI.setLight('green'); UI.chantShow(this.chant.text); Sound.green(); Sound.musicStart();
  }

  beginRed() {
    this.state = S.RED; this.mode = 'red';
    this.phaseT = 0; this.phaseDur = rand(2, 5);
    if (!this.dollTurning) { this.doll.setState('red'); Sound.dollTurn(); }
    this.dollTurning = false;
    this.contestants.onRed();
    UI.setLight('red'); Sound.musicStop(); Sound.red();
    this.rig.punch();
  }

  canPause() { return this.state === S.COUNTDOWN || this.state === S.GREEN || this.state === S.RED; }

  pause() {
    if (this.paused || !this.canPause()) return;
    this.paused = true; Sound.suspend(); UI.show('pause');
  }

  resume() {
    if (!this.paused) return;
    this.paused = false; Sound.resume(); UI.show(null);
    this.player.keys.clear();
  }

  // Lyric highlight + head nod on every syllable, and the doll starts turning just before the song ends
  singAlong() {
    const c = this.chant; if (!c) return;
    while (this.chantIdx + 1 < c.times.length && this.phaseT >= c.times[this.chantIdx + 1]) {
      this.chantIdx++; UI.chantActive(this.chantIdx);
      this.doll.pulse(this.chantIdx === c.times.length - 1 ? 1.6 : 1);
    }
    if (!this.dollTurning && this.phaseT >= this.phaseDur - TURN_LEAD) {
      this.dollTurning = true; this.doll.setState('red'); Sound.dollTurn();
    }
  }

  tickClock(dt) { this.elapsed += dt; this.timeLeft -= dt; return this.timeLeft <= 0; }

  win() {
    this.state = S.VICTORY; this.mode = 'idle'; this.endT = 0;
    const time = this.elapsed, best = getBest(), isNew = best === null || time < best;
    if (isNew) setBest(time);
    this.winInfo = { time, best: isNew ? time : best, isNew };
    Sound.musicStop(); Sound.victory(); UI.chantHide();
    this.rig.setMode('victory');
    this.particles.confetti(this.player.pos.x, 0, this.player.pos.z);
    UI.notify('YOU MADE IT!', true);
    UI.setLight('green'); document.getElementById('light').textContent = 'SAFE';
  }

  eliminate() {
    this.state = S.ELIMINATED; this.mode = 'red'; this.endT = 0;
    this.player.fall();
    Sound.eliminate(false);
    UI.flash(); UI.notify('ELIMINATED');
    this.rig.setMode('dead'); this.rig.shake(0.6);
    this.particles.burst(this.player.pos.x, 1.2, this.player.pos.z, 0xff3355, 30, 6);
  }

  timeUp() {
    this.state = S.GAMEOVER; this.mode = 'idle';
    Sound.musicStop(); Sound.gameOver();
    UI.flash(); UI.showOver("TIME'S UP. YOU DIDN'T REACH THE FINISH LINE.");
  }

  update(dt, t) {
    const p = this.player;
    switch (this.state) {
      case S.COUNTDOWN: {
        p.update(dt, true);
        this.cd -= dt;
        const n = Math.ceil(this.cd);
        if (n > 0 && n !== this.lastCd) { this.lastCd = n; UI.countdown(String(n)); Sound.countdown(n); }
        if (this.cd <= 0) { UI.countdown('GO!'); Sound.countdown(0); this.beginGreen(); }
        break;
      }
      case S.GREEN:
        this.phaseT += dt; p.update(dt, false);
        this.singAlong();
        if (p.finished) this.win();
        else if (this.tickClock(dt)) this.timeUp();
        else if (this.phaseT >= this.phaseDur) this.beginRed();
        break;
      case S.RED:
        this.phaseT += dt; p.update(dt, true); // always locked: the player cannot move on Red
        // Fair check: only real input / real displacement counts, and only after the reaction window.
        if (this.phaseT > GRACE && (p.inputMag > 0.25 || p.disp > 0.8)) this.eliminate();
        else if (this.tickClock(dt)) this.timeUp();
        else if (this.phaseT >= this.phaseDur) this.beginGreen();
        break;
      case S.ELIMINATED:
        p.update(dt, true); this.endT += dt;
        if (this.endT > 1.9) { this.state = S.GAMEOVER; Sound.gameOver(); UI.showOver('YOU MOVED DURING RED LIGHT.'); }
        break;
      case S.VICTORY:
        p.update(dt, true); this.endT += dt;
        if (this.endT > 2.4 && !this.winShown) { this.winShown = true; const w = this.winInfo; UI.showVictory(w.time, w.best, w.isNew); }
        break;
      default:
        p.update(dt, true);
    }

    this.contestants.update(dt, this.mode, this.rig.cam.position.x, this.rig.cam.position.z, t);

    if (this.state !== S.MENU) {
      const span = ARENA.startZ - ARENA.finishZ;
      const pct = Math.round(clamp01((ARENA.startZ - p.pos.z) / span) * 100);
      const meters = Math.round(Math.max(0, Math.min(span, -p.pos.z)));
      UI.updateHud(Math.max(0, this.timeLeft), this.contestants.alive + (p.down ? 0 : 1), pct, meters);
      UI.sprint(p.sprinting && this.state === S.GREEN);
      this.footsteps(dt);
    }
  }

  // Footsteps: player on cadence, crowd as a soft background pattern while green
  footsteps(dt) {
    const p = this.player, sp = Math.hypot(p.vel.x, p.vel.z);
    this._fs = (this._fs || 0) - dt;
    if (sp > 1 && p.grounded && this.state === S.GREEN && this._fs <= 0) { Sound.footstep(); this._fs = p.sprinting ? 0.22 : 0.32; }
    this._cs = (this._cs || 0) - dt;
    if (this.mode === 'green' && this._cs <= 0) { Sound.crowdStep(); this._cs = 0.14; }
  }
}