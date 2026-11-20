// Graphics presets, persisted settings and best-time storage (all wrapped in try/catch).
const KEY = 'rlgl.settings.v1';
const BEST = 'rlgl.best.v1';

export const isTouch = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const PRESETS = {
  low:    { label: 'LOW',    cap: 1.0,  shadows: false, shadowSize: 512,  grass: 250,  clouds: 6,  drawDist: 50,  details: false },
  medium: { label: 'MEDIUM', cap: 1.25, shadows: true,  shadowSize: 1024, grass: 900,  clouds: 12, drawDist: 90,  details: true  },
  high:   { label: 'HIGH',   cap: 1.5,  shadows: true,  shadowSize: 2048, grass: 1800, clouds: 18, drawDist: 160, details: true  }
};

function recommend() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (isTouch) return (cores >= 8 && mem >= 6) ? 'medium' : 'low';
  return (cores >= 8 && mem >= 8) ? 'high' : (cores >= 4 ? 'medium' : 'low');
}
export const RECOMMENDED = recommend();

function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
export const settings = Object.assign({ preset: RECOMMENDED, volume: 0.7, muted: false }, read());
if (!PRESETS[settings.preset]) settings.preset = RECOMMENDED;

export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage blocked */ } }
export function getBest() { try { const v = parseFloat(localStorage.getItem(BEST)); return isNaN(v) ? null : v; } catch (e) { return null; } }
export function setBest(t) { try { localStorage.setItem(BEST, String(t)); } catch (e) { /* storage blocked */ } }
