import './ui/theme.css';
import { CELL } from './core/constants';
import { randomSeed, seedFromString } from './core/rng';
import type { Hole, WindZone } from './core/types';
import type { Ball, World } from './core/physics';
import { TiltInput } from './input/tilt';
import { GameAudio } from './audio/audio';
import { haptics } from './audio/haptics';
import { Renderer } from './render/renderer';
import { loadLevel, type LoadedLevel } from './levels/loader';
import { generateQuickLevel, PRESETS, type Preset } from './levels/quick';
import { TUTORIAL_LEVELS } from './levels/tutorial';
import { CAMPAIGN_LEVELS, CAMPAIGN_IDS, WORLDS } from './levels/campaign';
import { generateDailyLevel, todayUTC, formatDate } from './levels/daily';
import type { LevelDef } from './levels/schema';
import { profile } from './profile';
import { setupUpdates } from './ui/update';
import { setupGallery } from './ui/gallery';
import { setupInstallHint, hideInstallHint } from './ui/install';

const HOLE_HEAR = CELL * 2; // Hörweite des Loch-Grollens
const WIND_HEAR = CELL * 1.8;
const PING_RANGE = 260; // Reichweite des Echo-Pings
const PING_SPEED = 600; // px/s – Wellenfront visuell & Echo-Verzögerung
const GUARD_HEAR = CELL * 2.2;
const KEY_HEAR = CELL * 2.5;
const PORTAL_HEAR = CELL * 2;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const overlay = $('overlay');
const hud = $('hud');
const statusEl = $('status');
const timerEl = $('timer');
const pingsEl = $('pings');
const gemsEl = $('gems');
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

type GameState = 'menu' | 'playing' | 'fell' | 'warp' | 'won';
type Mode =
  | { kind: 'quick' }
  | { kind: 'tutorial'; index: number }
  | { kind: 'campaign'; index: number }
  | { kind: 'daily'; date: string; target?: number };

const TUT_IDS = TUTORIAL_LEVELS.map((l) => l.id);

let world: World | null = null;
let loaded: LoadedLevel | null = null;
let activeFloor = 0;
let warpReady = true;
let state: GameState = 'menu';
let mode: Mode | null = null;
let currentDef: LevelDef | null = null;
let sensorsReady = false;
let debug = false;
let revealUntil = 0;
let maxDist = 1;
let respawnPoint = { floor: 0, x: 0, y: 0 };
let t0 = 0;
let message = '';
let messageUntil = 0;
let pings = 0;
let pingMax = 3;
let falls = 0;
let levelCols = 0;
let levelRows = 0;

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
  $('campaignStars').textContent = `(${profile.totalStars(CAMPAIGN_IDS)}/${CAMPAIGN_IDS.length * 3}★)`;
  const today = todayUTC();
  const daily = profile.dailyInfo(today);
  const streak = profile.streakInfo();
  const streakText = streak && streak.count > 1 && streak.last === today ? ` · 🔥 ${streak.count} Tage` : '';
  $('dailyStatus').textContent = daily?.first != null ? `Heute: ${fmtTime(daily.first)}${streakText}` : 'Heute noch offen';
}

/* --- Kampagnen-Levelauswahl ------------------------------------------------ */

const campaignPanel = $('campaign');
const campaignList = $('campaignList');

const UNLOCK_ALL = new URLSearchParams(location.search).has('unlock');

function levelUnlocked(index: number): boolean {
  return UNLOCK_ALL || index === 0 || profile.starsFor(CAMPAIGN_IDS[index - 1]!) > 0;
}

function refreshCampaignList(): void {
  campaignList.replaceChildren();
  let flat = 0;
  for (const world of WORLDS) {
    const header = document.createElement('h3');
    header.className = 'world-header';
    header.textContent = world.name;
    campaignList.append(header);
    world.levels.forEach((def, local) => appendLevelItem(def, flat++, local + 1));
  }
}

function appendLevelItem(def: LevelDef, i: number, num: number): void {
  {
    const unlocked = levelUnlocked(i);
    const item = document.createElement('button');
    item.className = 'panel level-item' + (unlocked ? '' : ' locked');
    const name = document.createElement('span');
    name.textContent = `${num}. ${unlocked ? def.name : '???'}`;
    const meta = document.createElement('span');
    meta.className = 'level-meta';
    if (unlocked) {
      const stars = profile.starsFor(def.id);
      const best = profile.bestFor(def.id);
      meta.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars) + (best !== null ? ` · ${fmtTime(best)}` : '');
    } else {
      meta.textContent = '🔒';
    }
    item.append(name, meta);
    if (unlocked) {
      item.addEventListener('click', () => {
        campaignPanel.classList.add('hidden');
        void startMode({ kind: 'campaign', index: i });
      });
    }
    campaignList.append(item);
  }
}

$('campaignBtn').addEventListener('click', () => {
  refreshCampaignList();
  campaignPanel.classList.remove('hidden');
});
$('campaignClose').addEventListener('click', () => campaignPanel.classList.add('hidden'));

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
  audio.setGuard(0, 0, 0);
  audio.setPortal(0, 0, 0);
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
$('dailyBtn').addEventListener('click', () => void startMode({ kind: 'daily', date: todayUTC() }));
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
  const def =
    mode.kind === 'tutorial'
      ? TUTORIAL_LEVELS[mode.index]!
      : mode.kind === 'campaign'
        ? CAMPAIGN_LEVELS[mode.index]!
        : mode.kind === 'daily'
          ? generateDailyLevel(mode.date)
          : generateQuickLevel(nextSeed(), profile.preset);
  currentDef = def;
  if (def.intro) {
    const title =
      mode.kind === 'daily'
        ? `📅 Challenge ${formatDate(mode.date)}`
        : mode.kind === 'tutorial'
        ? `${TUT_IDS.indexOf(def.id) + 1}/${TUT_IDS.length} · ${def.name}`
        : mode.kind === 'campaign'
          ? `${WORLDS[mode.index < WORLDS[0]!.levels.length ? 0 : 1]!.name.split(' – ')[0]} · Level ${
              mode.index < WORLDS[0]!.levels.length ? mode.index + 1 : mode.index + 1 - WORLDS[0]!.levels.length
            } · ${def.name}`
          : def.name;
    const targetLine =
      mode.kind === 'daily' && mode.target !== undefined ? `\n\n🎯 Herausforderung: schlag ${fmtTime(mode.target)}!` : '';
    showInterstitial({
      title,
      text: def.intro + targetLine,
      primary: { label: 'Los!', onClick: () => launch(def) },
      secondary: { label: 'Menü', onClick: showMenu },
    });
  } else {
    launch(def);
  }
}

function activateFloor(index: number): void {
  if (!loaded) return;
  activeFloor = index;
  const floor = loaded.floors[index]!;
  world = floor.world;
  levelCols = floor.cols;
  levelRows = floor.rows;
  maxDist = Math.hypot(floor.cols * CELL, floor.rows * CELL);
  renderer.setWorld(floor.cols * CELL, floor.rows * CELL);
  renderer.follow(world.ball.x, world.ball.y, true);
  $('floor').textContent = loaded.floors.length > 1 ? `⬍ E${index + 1}` : '';
}

function launch(def: LevelDef): void {
  loaded = loadLevel(def);
  pingMax = loaded.pingBudget;
  pings = pingMax;
  falls = 0;
  warpReady = true;
  activateFloor(0);
  respawnPoint = { floor: 0, x: loaded.world.ball.x, y: loaded.world.ball.y };
  t0 = performance.now();
  state = 'playing';
  revealUntil = 0;
  statusEl.textContent = '';
  if (mode?.kind === 'daily' && mode.target !== undefined) flash(`🎯 Schlag ${fmtTime(mode.target)}!`, 4000);
  input.calibrate();
}

// Ebenenwechsel: kurzes Innehalten, Schimmern in Richtung der Reise,
// dann steht der Ball ruhig auf der Ziel-Ebene.
function startWarp(tx: number, ty: number, targetFloor: number, dir: 'up' | 'down' | 'same'): void {
  if (!world) return;
  state = 'warp';
  audio.setRolling(0);
  audio.setPortal(0, 0, 0);
  audio.warp(dir);
  haptics.checkpoint();
  setTimeout(() => {
    if (!loaded || state !== 'warp') return;
    activateFloor(targetFloor);
    const b = world!.ball;
    b.x = tx;
    b.y = ty;
    b.vx = 0;
    b.vy = 0;
    warpReady = false; // erst wieder scharf, wenn der Ball das Ziel-Pad verlassen hat
    state = 'playing';
    flash(dir === 'down' ? `⬇ Ebene ${targetFloor + 1}` : dir === 'up' ? `⬆ Ebene ${targetFloor + 1}` : '✦ Portal');
  }, 700);
}

function respawn(): void {
  if (!world || state !== 'fell') return;
  if (respawnPoint.floor !== activeFloor) activateFloor(respawnPoint.floor);
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
  if (mode.kind === 'daily') {
    const date = mode.date;
    const target = mode.target;
    const today = todayUTC();
    const { isFirst, first } = profile.submitDaily(date, seconds, today);
    const streak = profile.streakInfo();
    const lines = [
      isFirst ? 'Dein Tageswert! 🏁' : `Training – dein Tageswert bleibt ${fmtTime(first)}.`,
      target !== undefined
        ? seconds < target
          ? `🎯 Herausforderung geschlagen (${fmtTime(target)})!`
          : `🎯 Nicht geschlagen – Vorgabe war ${fmtTime(target)}.`
        : '',
      isFirst && date === today && streak ? `🔥 Serie: ${streak.count} ${streak.count === 1 ? 'Tag' : 'Tage'}` : '',
    ].filter(Boolean);
    setTimeout(() => {
      showInterstitial({
        title: `Challenge ${formatDate(date)} – ${fmtTime(seconds)}`,
        text: lines.join('\n'),
        primary: {
          label: '📤 Herausfordern',
          onClick: () => {
            showMenu();
            void shareDaily(date, isFirst ? seconds : Math.min(first, seconds));
          },
        },
        secondary: { label: 'Menü', onClick: showMenu },
      });
    }, 1800);
  } else if (mode.kind === 'tutorial') {
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
  } else if (mode.kind === 'campaign') {
    const index = mode.index;
    // Gems über ALLE Ebenen zählen, nicht nur die aktive
    const allGems = loaded?.floors.flatMap((f) => f.world.gems) ?? [];
    const gemsTotal = allGems.length;
    const gemsGot = allGems.filter((g) => g.collected).length;
    // Sterne: 1 = geschafft, 2 = unter Par, 3 = alle Gems (bzw. sturzfrei ohne Gems)
    const stars =
      1 +
      (def.parTimeS !== undefined && seconds <= def.parTimeS ? 1 : 0) +
      (gemsTotal > 0 ? (gemsGot === gemsTotal ? 1 : 0) : falls === 0 ? 1 : 0);
    profile.submitStars(def.id, stars);
    const isRecord = profile.submitTime(def.id, seconds);
    const hasNext = index + 1 < CAMPAIGN_LEVELS.length;
    const lines = [
      `Zeit: ${fmtTime(seconds)}${def.parTimeS ? ` (Par ${def.parTimeS} s)` : ''}${isRecord ? ' – neue Bestzeit!' : ''}`,
      gemsTotal > 0 ? `💎 ${gemsGot}/${gemsTotal}` : `Stürze: ${falls}`,
    ];
    setTimeout(() => {
      showInterstitial({
        title: `${def.name} ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`,
        text: lines.join('\n'),
        primary: hasNext
          ? {
              label: 'Weiter',
              onClick: () => {
                mode = { kind: 'campaign', index: index + 1 };
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

  const reflections: Array<{ dx: number; dy: number; dist: number; freq: number; double?: boolean }> = [];
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
  const reveal = (o: { x: number; y: number; litFrom?: number; litUntil?: number }, freq: number, double = false) => {
    const dist = Math.hypot(b.x - o.x, b.y - o.y);
    if (dist > PING_RANGE) return;
    o.litFrom = now + (dist / PING_SPEED) * 1000;
    o.litUntil = o.litFrom + 1200;
    reflections.push({ dx: o.x - b.x, dy: o.y - b.y, dist, freq, double });
  };
  for (const key of world.keys) if (!key.collected) reveal(key, 1650);
  for (const gem of world.gems) if (!gem.collected) reveal(gem, 2093, true);
  for (const g of world.guards) reveal(g, 240);
  for (const t of world.transporters) {
    const dist = Math.hypot(b.x - t.x, b.y - t.y);
    if (dist > PING_RANGE) continue;
    t.litFrom = now + (dist / PING_SPEED) * 1000;
    t.litUntil = t.litFrom + 1200;
    // zwei Blips, der zweite höher und später: "hier geht es weiter"
    reflections.push({ dx: t.x - b.x, dy: t.y - b.y, dist, freq: 700 });
    reflections.push({ dx: t.x - b.x, dy: t.y - b.y, dist: dist + 55, freq: 1400 });
  }

  // Durchgänge der aktuellen Zelle antworten hell und doppelt ("offen").
  const cx0 = Math.floor(b.x / CELL);
  const cy0 = Math.floor(b.y / CELL);
  const dirs: Array<[number, number]> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  for (const [ddx, ddy] of dirs) {
    const nx = cx0 + ddx,
      ny = cy0 + ddy;
    if (nx < 0 || ny < 0 || nx >= levelCols || ny >= levelRows) continue;
    const px = (cx0 + 0.5) * CELL + (ddx * CELL) / 2;
    const py = (cy0 + 0.5) * CELL + (ddy * CELL) / 2;
    const blocked = world.walls.some((w) => px > w.x - 1 && px < w.x + w.w + 1 && py > w.y - 1 && py < w.y + w.h + 1);
    if (!blocked) reflections.push({ dx: ddx, dy: ddy, dist: CELL / 2, freq: 1300, double: true });
  }

  reflections.sort((a, c) => a.dist - c.dist);
  audio.echoPing(
    reflections.slice(0, 10).map((r) => ({
      dx: r.dx,
      dy: r.dy,
      freq: r.freq,
      double: r.double,
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

// Teilen: Web Share API, sonst Zwischenablage.
async function shareDaily(date: string, seconds: number): Promise<void> {
  const url = `${location.origin}${location.pathname}#daily=${date}&t=${seconds.toFixed(1)}`;
  const text = `tiltr Tages-Challenge ${formatDate(date)}: ${fmtTime(seconds)} – schaffst du das schneller?`;
  try {
    if (navigator.share) {
      await navigator.share({ text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      $('dailyStatus').textContent = 'Link kopiert! 📋';
    }
  } catch {
    /* abgebrochen */
  }
}

// Empfangene Herausforderung (#daily=DATUM&t=SEKUNDEN) anbieten.
function checkChallengeHash(): void {
  const m = location.hash.match(/^#daily=(\d{4}-\d{2}-\d{2})(?:&t=([\d.]+))?$/);
  if (!m) return;
  const date = m[1]!;
  const target = m[2] !== undefined ? parseFloat(m[2]) : undefined;
  history.replaceState(null, '', location.pathname + location.search);
  showInterstitial({
    title: '🎯 Herausforderung!',
    text:
      `Jemand fordert dich in der Tages-Challenge vom ${formatDate(date)} heraus` +
      (target !== undefined ? `:\nSchlag ${fmtTime(target)}!` : '.'),
    primary: { label: 'Annehmen', onClick: () => void startMode({ kind: 'daily', date, target }) },
    secondary: { label: 'Später', onClick: () => undefined },
  });
}
checkChallengeHash();

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

    const gdx = loaded!.goalPos.x - world.ball.x;
    const gdy = loaded!.goalPos.y - world.ball.y;
    const gdist = Math.hypot(gdx, gdy);
    audio.beacon(gdx, gdy, Math.min(1, gdist / maxDist), activeFloor !== loaded!.goalFloor);

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
    // Wächter: Brummen aus seiner Richtung, fließt in die Gefahr (Herzschlag) ein
    let guardDanger = 0;
    let nearGuard: { dx: number; dy: number } | null = null;
    for (const g of world.guards) {
      const d = Math.max(0, Math.hypot(g.x - world.ball.x, g.y - world.ball.y) - g.r);
      const c = Math.max(0, 1 - d / GUARD_HEAR);
      if (c > guardDanger) {
        guardDanger = c;
        nearGuard = { dx: g.x - world.ball.x, dy: g.y - world.ball.y };
      }
    }
    if (nearGuard) audio.setGuard(guardDanger, nearGuard.dx, nearGuard.dy);
    else audio.setGuard(0, 0, 0);

    if (danger > 0.55) haptics.holeWarning(danger);
    audio.heartbeat(Math.max(danger, guardDanger));

    // Schlüssel: Klimpern in Hörweite, Einsammeln öffnet die Tür
    for (const key of world.keys) {
      if (key.collected) continue;
      const kdx = key.x - world.ball.x,
        kdy = key.y - world.ball.y;
      const kd = Math.hypot(kdx, kdy);
      if (kd < key.r + world.ball.r) {
        key.collected = true;
        audio.collectKey();
        haptics.checkpoint();
        for (let i = world.walls.length - 1; i >= 0; i--) {
          const w = world.walls[i]!;
          if (w.door?.id === key.opens) {
            world.walls.splice(i, 1);
            world.debris.push({ ...w, litUntil: now + 2000 });
            audio.doorOpen(w.x + w.w / 2 - world.ball.x, w.y + w.h / 2 - world.ball.y);
          }
        }
        flash('Tür geöffnet! 🔑');
      } else if (kd < KEY_HEAR) {
        audio.keyTinkle(kdx, kdy, Math.min(1, kd / KEY_HEAR));
      }
    }

    // Gems einsammeln
    for (const gem of world.gems) {
      if (gem.collected) continue;
      if (Math.hypot(gem.x - world.ball.x, gem.y - world.ball.y) < gem.r + world.ball.r) {
        gem.collected = true;
        audio.collectGem();
        haptics.checkpoint();
        flash('💎 Gem!');
      }
    }

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
        respawnPoint = { floor: activeFloor, x: cp.x, y: cp.y };
        pings = Math.min(pingMax, pings + 1);
        audio.checkpoint();
        haptics.checkpoint();
        flash('Checkpoint! ✓ +1 Ping');
      }
    }

    // Transporter: Schweben in Hörweite; Betreten löst den Ebenenwechsel aus
    let portalCloseness = 0;
    let nearPortal: { dx: number; dy: number } | null = null;
    for (const t of world.transporters) {
      const d = Math.max(0, Math.hypot(t.x - world.ball.x, t.y - world.ball.y) - t.r);
      const c = Math.max(0, 1 - d / PORTAL_HEAR);
      if (c > portalCloseness) {
        portalCloseness = c;
        nearPortal = { dx: t.x - world.ball.x, dy: t.y - world.ball.y };
      }
    }
    if (nearPortal) audio.setPortal(portalCloseness, nearPortal.dx, nearPortal.dy);
    else audio.setPortal(0, 0, 0);

    if (!warpReady && !world.transporters.some((t) => Math.hypot(t.x - world!.ball.x, t.y - world!.ball.y) < t.r + world!.ball.r + 10)) {
      warpReady = true;
    }
    const pad = warpReady ? world.transporterHit() : null;
    if (pad) {
      pad.litFrom = 0;
      pad.litUntil = now + 1200;
      startWarp(pad.tx, pad.ty, pad.targetFloor, pad.dir);
      renderer.follow(world.ball.x, world.ball.y);
      renderer.draw(world, { debug, revealAll: revealUntil > now, now });
      return;
    }

    timerEl.textContent = fmtTime((now - t0) / 1000);
    pingsEl.textContent = '● '.repeat(pings) + '○ '.repeat(Math.max(0, pingMax - pings));
    const allGems = loaded!.floors.flatMap((f) => f.world.gems);
    gemsEl.textContent = allGems.length
      ? `💎 ${allGems.filter((g) => g.collected).length}/${allGems.length}`
      : '';

    const fallen = world.fallenHole();
    const caught = fallen ? null : world.guardCaught();
    if (fallen) {
      state = 'fell';
      falls++;
      fallen.litFrom = 0;
      fallen.litUntil = now + 1500;
      audio.fall();
      haptics.fall();
      statusEl.textContent = 'In ein Loch gestürzt! 🕳';
      setTimeout(respawn, 1300);
    } else if (caught) {
      state = 'fell';
      falls++;
      caught.litFrom = 0;
      caught.litUntil = now + 1500;
      audio.caught();
      haptics.fall();
      statusEl.textContent = 'Erwischt! 👁';
      setTimeout(respawn, 1300);
    } else if (world.goalReached()) {
      state = 'won';
      revealUntil = now + 4000;
      const seconds = (now - t0) / 1000;
      audio.setRolling(0);
      audio.setWind(0, 0, 0);
      audio.setHoleRumble(0, 0, 0);
      audio.setGuard(0, 0, 0);
      audio.setPortal(0, 0, 0);
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
