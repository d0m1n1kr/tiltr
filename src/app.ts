import './ui/theme.css';
import { CELL } from './core/constants';
import { randomSeed, seedFromString } from './core/rng';
import type { Hole, WindZone } from './core/types';
import type { Ball, World } from './core/physics';
import { TiltInput } from './input/tilt';
import { GameAudio } from './audio/audio';
import { haptics } from './audio/haptics';
import { Renderer } from './render/renderer';
import { loadLevel } from './levels/loader';
import { generateQuickLevel, PRESETS, type Preset } from './levels/quick';
import { TUTORIAL_LEVELS } from './levels/tutorial';
import type { LevelDef } from './levels/schema';
import { profile } from './profile';
import { setupUpdates } from './ui/update';
import { setupGallery } from './ui/gallery';
import { setupInstallHint, hideInstallHint } from './ui/install';

const HOLE_HEAR = CELL * 2; // Hörweite des Loch-Grollens
const WIND_HEAR = CELL * 1.8;
const PING_RANGE = 260; // Reichweite des Echo-Pings
const PING_SPEED = 600; // px/s – Wellenfront visuell & Echo-Verzögerung

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const overlay = $('overlay');
const hud = $('hud');
const statusEl = $('status');
const timerEl = $('timer');
const pingsEl = $('pings');
const quickBtn = $('quickBtn');
const tutorialBtn = $('tutorialBtn');
const calibrateBtn = $('calibrateBtn');
const debugBtn = $('debugBtn');
const homeBtn = $('homeBtn');
const interstitial = $('interstitial');
const interTitle = $('interTitle');
const interText = $('interText');
const interPrimary = $<HTMLButtonElement>('interPrimary');
const interSecondary = $<HTMLButtonElement>('interSecondary');

$('version').textContent = `v${__APP_VERSION__} · ${__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC`;
setupUpdates();
setupInstallHint();

const input = new TiltInput();
const audio = new GameAudio();
const renderer = new Renderer(canvas);
setupGallery(audio);

type GameState = 'menu' | 'playing' | 'fell' | 'won';
type Mode = { kind: 'quick' } | { kind: 'tutorial'; index: number };

const TUT_IDS = TUTORIAL_LEVELS.map((l) => l.id);

let world: World | null = null;
let state: GameState = 'menu';
let mode: Mode | null = null;
let currentDef: LevelDef | null = null;
let sensorsReady = false;
let debug = false;
let revealUntil = 0;
let maxDist = 1;
let respawnPoint = { x: 0, y: 0 };
let t0 = 0;
let message = '';
let messageUntil = 0;
let pings = 0;
let pingMax = 3;

// Seed aus der URL (?seed=…) macht Läufe reproduzierbar (Tests, später Daily).
function nextSeed(): number {
  const s = new URLSearchParams(location.search).get('seed');
  if (s === null) return randomSeed();
  const n = Number(s);
  return Number.isFinite(n) ? n >>> 0 : seedFromString(s);
}

const flash = (text: string, ms = 1800) => {
  message = text;
  messageUntil = performance.now() + ms;
};

const fmtTime = (s: number) => `${s.toFixed(1)} s`;

/* --- Interstitial (Intro-/Ergebnis-Karte) -------------------------------- */

interface InterAction {
  label: string;
  onClick: () => void;
}

function showInterstitial(opts: { title: string; text: string; primary?: InterAction; secondary?: InterAction }): void {
  interTitle.textContent = opts.title;
  interText.textContent = opts.text;
  for (const [btn, action] of [
    [interPrimary, opts.primary],
    [interSecondary, opts.secondary],
  ] as const) {
    if (action) {
      btn.textContent = action.label;
      btn.onclick = () => {
        hideInterstitial();
        action.onClick();
      };
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
      btn.onclick = null;
    }
  }
  interstitial.classList.remove('hidden');
}

function hideInterstitial(): void {
  interstitial.classList.add('hidden');
}

// Nach dem Menü-Tap erst kalibrieren: Beim Tippen hält man das Handy steil
// zum Gesicht – würde diese Lage als Null gelten, wäre die Vor/Zurück-Achse
// beim flachen Spielen dauerhaft am Anschlag (Ball klebt an der Wand).
async function calibrationCountdown(): Promise<void> {
  interPrimary.classList.add('hidden');
  interSecondary.classList.add('hidden');
  interTitle.textContent = 'Kalibrierung';
  interstitial.classList.remove('hidden');
  for (let i = 3; i > 0; i--) {
    interText.innerHTML = `Halte das Handy jetzt <b>flach wie ein Tablett</b> –<br>so, wie du spielen willst.<br><br><span style="font-size:34px">${i}</span>`;
    await new Promise((r) => setTimeout(r, 1000));
  }
  hideInterstitial();
}

/* --- Menü ----------------------------------------------------------------- */

const presetChips = [...document.querySelectorAll<HTMLButtonElement>('#presetRow .chip')];

function refreshMenu(): void {
  const { done, total } = profile.tutorialProgress(TUT_IDS.length);
  $('tutorialProgress').textContent = `(${done}/${total})`;
  for (const chip of presetChips) {
    chip.classList.toggle('active', chip.dataset.preset === profile.preset);
  }
  const best = profile.bestFor(`quick-${profile.preset}`);
  $('quickBest').textContent = best !== null ? `Bestzeit (${PRESETS[profile.preset].label}): ${fmtTime(best)}` : '';
}

for (const chip of presetChips) {
  chip.addEventListener('click', () => {
    profile.preset = chip.dataset.preset as Preset;
    refreshMenu();
  });
}

function showMenu(): void {
  state = 'menu';
  mode = null;
  world = null;
  currentDef = null;
  audio.setRolling(0);
  audio.setWind(0, 0, 0);
  audio.setHoleRumble(0, 0, 0);
  hideInterstitial();
  hud.classList.add('hidden');
  overlay.classList.remove('hidden');
  refreshMenu();
}

async function startMode(m: Mode): Promise<void> {
  mode = m;
  overlay.classList.add('hidden');
  hideInstallHint(); // im Spiel nicht im Weg stehen
  if (!sensorsReady) {
    await Promise.all([input.start(), audio.start()]);
    sensorsReady = true;
    await calibrationCountdown();
  } else {
    await audio.start();
  }
  hud.classList.remove('hidden');
  beginLevel();
}

quickBtn.addEventListener('click', () => void startMode({ kind: 'quick' }));
tutorialBtn.addEventListener('click', () =>
  void startMode({ kind: 'tutorial', index: profile.nextTutorialIndex(TUT_IDS) }),
);

calibrateBtn.addEventListener('click', () => input.calibrate());
debugBtn.addEventListener('click', () => {
  debug = !debug;
});
homeBtn.addEventListener('click', showMenu);

window.addEventListener('resize', () => renderer.resize());

/* --- Level-Lebenszyklus ---------------------------------------------------- */

function beginLevel(): void {
  if (!mode) return;
  const def = mode.kind === 'tutorial' ? TUTORIAL_LEVELS[mode.index]! : generateQuickLevel(nextSeed(), profile.preset);
  currentDef = def;
  if (def.intro) {
    showInterstitial({
      title: mode.kind === 'tutorial' ? `${TUT_IDS.indexOf(def.id) + 1}/${TUT_IDS.length} · ${def.name}` : def.name,
      text: def.intro,
      primary: { label: 'Los!', onClick: () => launch(def) },
      secondary: { label: 'Menü', onClick: showMenu },
    });
  } else {
    launch(def);
  }
}

function launch(def: LevelDef): void {
  const loaded = loadLevel(def);
  world = loaded.world;
  pingMax = loaded.pingBudget;
  pings = pingMax;
  maxDist = Math.hypot(loaded.cols * CELL, loaded.rows * CELL);
  renderer.setWorld(loaded.cols * CELL, loaded.rows * CELL);
  renderer.follow(world.ball.x, world.ball.y, true);
  respawnPoint = { x: world.ball.x, y: world.ball.y };
  t0 = performance.now();
  state = 'playing';
  revealUntil = 0;
  statusEl.textContent = '';
  input.calibrate();
}

function respawn(): void {
  if (!world || state !== 'fell') return;
  const b = world.ball;
  b.x = respawnPoint.x;
  b.y = respawnPoint.y;
  b.vx = 0;
  b.vy = 0;
  state = 'playing';
  statusEl.textContent = '';
}

function onWin(seconds: number): void {
  if (!mode || !currentDef) return;
  const def = currentDef;
  if (mode.kind === 'tutorial') {
    profile.markTutorialDone(def.id);
    const isRecord = profile.submitTime(def.id, seconds);
    const index = TUT_IDS.indexOf(def.id);
    const hasNext = index + 1 < TUTORIAL_LEVELS.length;
    const { done, total } = profile.tutorialProgress(TUT_IDS.length);
    setTimeout(() => {
      showInterstitial({
        title: `${def.name} – geschafft! 🎉`,
        text:
          `Zeit: ${fmtTime(seconds)}${isRecord ? ' – neue Bestzeit!' : ''}\n` +
          (hasNext ? `Tutorial: ${done}/${total}` : 'Tutorial abgeschlossen – du bist bereit für die Dunkelheit!'),
        primary: hasNext
          ? {
              label: 'Weiter',
              onClick: () => {
                mode = { kind: 'tutorial', index: index + 1 };
                beginLevel();
              },
            }
          : { label: 'Zum Menü', onClick: showMenu },
        secondary: hasNext ? { label: 'Menü', onClick: showMenu } : undefined,
      });
    }, 1800);
  } else {
    const isRecord = profile.submitTime(`quick-${profile.preset}`, seconds);
    const best = profile.bestFor(`quick-${profile.preset}`);
    setTimeout(() => {
      showInterstitial({
        title: `Ziel in ${fmtTime(seconds)} 🎉`,
        text: isRecord
          ? 'Neue Bestzeit!'
          : best !== null
            ? `Bestzeit (${PRESETS[profile.preset].label}): ${fmtTime(best)}`
            : '',
        primary: { label: '⟳ Nochmal', onClick: beginLevel },
        secondary: { label: 'Menü', onClick: showMenu },
      });
    }, 1800);
  }
}

/* --- Atmende Löcher & Echo-Ping -------------------------------------------- */

// Atem-Zyklus der Löcher: öffnen (Rampe) -> offen -> schließen (Rampe) -> zu.
function updateHoles(nowMs: number): void {
  for (const h of world!.holes) {
    const br = h.breathing;
    if (!br) {
      h.openness = 1;
      continue;
    }
    const period = br.ramp * 2 + br.open + br.closed;
    const cyc = (nowMs / 1000 + br.offset) % period;
    if (cyc < br.ramp) h.openness = cyc / br.ramp;
    else if (cyc < br.ramp + br.open) h.openness = 1;
    else if (cyc < br.ramp * 2 + br.open) h.openness = 1 - (cyc - br.ramp - br.open) / br.ramp;
    else h.openness = 0;
  }
}

// Echo-Ping: Umgebung im Radius aufdecken (als Wellenfront) und die
// Reflexionen verzögert & räumlich zurückkommen lassen.
function firePing(now: number): void {
  if (!world || state !== 'playing' || pings <= 0) return;
  pings--;
  const b = world.ball;
  world.pings.push({ x: b.x, y: b.y, start: now, speed: PING_SPEED, range: PING_RANGE });

  const reflections: Array<{ dx: number; dy: number; dist: number; freq: number }> = [];
  for (const w of world.walls) {
    const cx = Math.max(w.x, Math.min(b.x, w.x + w.w));
    const cy = Math.max(w.y, Math.min(b.y, w.y + w.h));
    const dist = Math.hypot(b.x - cx, b.y - cy);
    if (dist > PING_RANGE) continue;
    w.litFrom = now + (dist / PING_SPEED) * 1000;
    w.litUntil = w.litFrom + 1000;
    reflections.push({ dx: cx - b.x, dy: cy - b.y, dist, freq: 950 });
  }
  for (const h of world.holes) {
    const dist = Math.max(0, Math.hypot(b.x - h.x, b.y - h.y) - h.r);
    if (dist > PING_RANGE) continue;
    h.litFrom = now + (dist / PING_SPEED) * 1000;
    h.litUntil = h.litFrom + 1200;
    reflections.push({ dx: h.x - b.x, dy: h.y - b.y, dist, freq: 280 });
  }
  reflections.sort((a, c) => a.dist - c.dist);
  audio.echoPing(
    reflections.slice(0, 8).map((r) => ({
      dx: r.dx,
      dy: r.dy,
      freq: r.freq,
      delay: r.dist / PING_SPEED,
      gain: 0.05 + 0.25 * (1 - r.dist / PING_RANGE),
    })),
  );
}

canvas.addEventListener('pointerdown', () => firePing(performance.now()));
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !e.repeat) firePing(performance.now());
});

// Nähe + Richtung zu einem Rechteck (für den Windzonen-Sound).
function zoneProximity(z: WindZone, b: Ball): { dist: number; dx: number; dy: number } {
  const cx = Math.max(z.x, Math.min(b.x, z.x + z.w));
  const cy = Math.max(z.y, Math.min(b.y, z.y + z.h));
  const dist = Math.hypot(b.x - cx, b.y - cy);
  const inside = dist === 0;
  // Drinnen kommt der Klang aus der Richtung, in die der Wind drückt.
  const dx = inside ? z.fx : cx - b.x;
  const dy = inside ? z.fy : cy - b.y;
  return { dist, dx, dy };
}

/* --- Hauptschleife ---------------------------------------------------------- */

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!world) return;

  updateHoles(now);
  world.pings = world.pings.filter((p) => ((now - p.start) / 1000) * p.speed < p.range);

  if (state === 'playing') {
    const tilt = input.tilt;
    const hits = world.step(dt, tilt);

    for (const hit of hits) {
      const wall = hit.wall;
      wall.litFrom = 0; // Berührung leuchtet sofort, ohne Ping-Verzögerung
      wall.litUntil = now + 1200; // Echo: berührte Wand kurz sichtbar machen
      const intensity = Math.min(1, hit.impact / 500);
      if (intensity <= 0.06) continue;
      audio.hit(intensity, hit.nx, hit.ny);
      haptics.hit(intensity);
      // Brüchige Wand: knirscht bei kräftigen Treffern, stürzt irgendwann ein.
      if (wall.hp !== undefined && intensity > 0.2) {
        wall.hp--;
        wall.cracked = true;
        if (wall.hp <= 0) {
          const i = world.walls.indexOf(wall);
          if (i !== -1) world.walls.splice(i, 1);
          world.debris.push({ ...wall, litUntil: now + 1500 });
          audio.crumble(hit.nx, hit.ny);
          haptics.crumble();
          flash('Wand eingestürzt! 🧱');
        } else {
          audio.crackle(hit.nx, hit.ny);
        }
      }
    }

    audio.setRolling(Math.min(1, world.ball.speed / world.maxSpeed));

    const { dx, dy, dist } = world.goalVector();
    audio.beacon(dx, dy, Math.min(1, dist / maxDist));

    // Gefahr = Nähe des bedrohlichsten OFFENEN Lochs: steuert Grollen
    // (Atmen = An- und Abschwellen mit dem Öffnungsgrad), Warnvibration
    // und den Herzschlag.
    let danger = 0;
    let dangerHole: Hole | null = null;
    for (const h of world.holes) {
      const d = Math.max(0, Math.hypot(h.x - world.ball.x, h.y - world.ball.y) - h.r);
      const c = Math.max(0, 1 - d / HOLE_HEAR) * (h.openness ?? 1);
      if (c > danger) {
        danger = c;
        dangerHole = h;
      }
    }
    if (dangerHole) {
      audio.setHoleRumble(danger, dangerHole.x - world.ball.x, dangerHole.y - world.ball.y);
    } else {
      audio.setHoleRumble(0, 0, 0);
    }
    if (danger > 0.55) haptics.holeWarning(danger);
    audio.heartbeat(danger);

    // Windzonen: hörbar in der Nähe, spürbar (Kraft) mittendrin
    let bestZone: { dist: number; dx: number; dy: number } | null = null;
    for (const z of world.windZones) {
      const p = zoneProximity(z, world.ball);
      if (!bestZone || p.dist < bestZone.dist) bestZone = p;
    }
    if (bestZone) {
      audio.setWind(Math.max(0, 1 - bestZone.dist / WIND_HEAR), bestZone.dx, bestZone.dy);
    }

    // Checkpoints: einmalig aktivieren, wird neuer Respawn-Punkt
    for (const cp of world.checkpoints) {
      if (cp.reached) continue;
      if (Math.hypot(cp.x - world.ball.x, cp.y - world.ball.y) < cp.r) {
        cp.reached = true;
        cp.litUntil = now + 2000;
        respawnPoint = { x: cp.x, y: cp.y };
        pings = Math.min(pingMax, pings + 1);
        audio.checkpoint();
        haptics.checkpoint();
        flash('Checkpoint! ✓ +1 Ping');
      }
    }

    timerEl.textContent = fmtTime((now - t0) / 1000);
    pingsEl.textContent = '● '.repeat(pings) + '○ '.repeat(Math.max(0, pingMax - pings));

    const fallen = world.fallenHole();
    if (fallen) {
      state = 'fell';
      fallen.litFrom = 0;
      fallen.litUntil = now + 1500;
      audio.fall();
      haptics.fall();
      statusEl.textContent = 'In ein Loch gestürzt! 🕳';
      setTimeout(respawn, 1300);
    } else if (world.goalReached()) {
      state = 'won';
      revealUntil = now + 4000;
      const seconds = (now - t0) / 1000;
      audio.setRolling(0);
      audio.setWind(0, 0, 0);
      audio.setHoleRumble(0, 0, 0);
      audio.win();
      haptics.win();
      statusEl.textContent = `Ziel in ${fmtTime(seconds)} 🎉`;
      onWin(seconds);
    } else if (messageUntil > now) {
      statusEl.textContent = message;
    } else {
      const modeLabel = input.hasSensor ? 'Neigung' : 'Tasten (WASD/Pfeile)';
      statusEl.textContent = debug ? `Debug · ${modeLabel} · x ${tilt.x.toFixed(2)} y ${tilt.y.toFixed(2)}` : '';
    }
  }

  renderer.follow(world.ball.x, world.ball.y);
  renderer.draw(world, { debug, revealAll: revealUntil > now, now });
  // Testbarkeits-Hook für E2E
  (window as unknown as { __tiltrBall?: { x: number; y: number } }).__tiltrBall = {
    x: world.ball.x,
    y: world.ball.y,
  };
}

refreshMenu();
requestAnimationFrame(frame);
