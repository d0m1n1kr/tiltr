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
import { generateQuickLevel, type Preset } from './levels/quick';
import { TUTORIAL_LEVELS } from './levels/tutorial';
import { CAMPAIGN_LEVELS, CAMPAIGN_IDS, WORLDS } from './levels/campaign';
import { generateDailyLevel, todayUTC } from './levels/daily';
import { t, applyI18n, setLang, currentLang, onLangChange, lvName, lvIntro, formatDate, type Lang, type Dict } from './i18n';
import { GhostRecorder, loadGhost, saveGhost, sampleGhost, type GhostData } from './ghost';
import { decodeDuel, duelUrl, validateGhostRun } from './levels/duel';
import { showSplash } from './ui/splash';
import { fixStandaloneViewport, viewportDiagnostics } from './ui/viewport';
import { COOP_LEVELS, RACE_LEVELS } from './levels/multiplayer';
import { generateMpLevel, parseMpQuickId } from './levels/mpQuick';
import { connect, makeRoomCode, type Transport } from './net/transport';
import { scanRoomCode } from './ui/scanner';
import { renderSVG } from 'uqr';
import { parseLevel, type LevelDef } from './levels/schema';
import { profile } from './profile';
import { setupUpdates } from './ui/update';
import { setupGallery } from './ui/gallery';
import { setupInstallHint, hideInstallHint } from './ui/install';
import { setupEditor, type RawLevel } from './ui/editor';
import { setupWorkshopPanel } from './ui/workshopPanel';
import { newCustomId, workshop } from './workshop';
import { decodeLevel } from './levels/shareCodec';

const HOLE_HEAR = CELL * 2; // Hörweite des Loch-Grollens
const WIND_HEAR = CELL * 1.8;
const PING_RANGE = 260; // Reichweite des Echo-Pings
const PING_SPEED = 600; // px/s – Wellenfront visuell & Echo-Verzögerung
const GUARD_HEAR = CELL * 2.2;
const KEY_HEAR = CELL * 2.5;
const PORTAL_HEAR = CELL * 2;
const CURRENT_HEAR = CELL * 2; // Hörweite des Strömungs-Pulsierens
const SLIDE_HEAR = CELL * 2.2; // Hörweite von Schleifen/Warn-Takt der Schiebewände
const LISTENER_HEAR = CELL * 2.4; // Hörweite des Horcher-Schnüffelns
const ANCHOR_HEAR = CELL * 0.8; // Zusatz-Hörweite ÜBER den Wirkradius hinaus

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
const interExtra = $<HTMLButtonElement>('interExtra');

fixStandaloneViewport();
document.documentElement.lang = currentLang();
applyI18n();
showSplash(__APP_VERSION__);
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
  | { kind: 'daily'; date: string; target?: number }
  | { kind: 'custom' }
  // Geist-Duell: fremdes Level + fremde Spur + Zielzeit. Schreibt bewusst
  // NICHTS mit (keine Sterne, keine Daily-Wertung, kein eigener Geist) –
  // der Lauf zählt nur gegen den Rivalen.
  | { kind: 'duel'; time: number; ghost: GhostData | null; by?: string }
  | { kind: 'mp' };

type MpMode = 'coop' | 'race';
interface MpSession {
  transport: Transport;
  code: string;
  host: boolean;
  mode: MpMode;
  level: LevelDef | null;
  phase: 'lobby' | 'intro' | 'playing' | 'done';
  selfReady: boolean;
  peerReady: boolean;
  rematchSelf: boolean;
  rematchPeer: boolean;
  remote: { x: number; y: number; floor: number; finished: boolean; elapsed: number | null };
  localFinished: boolean;
  localElapsed: number | null;
  localHolds: Set<string>;
  remoteHolds: Set<string>;
  lastStateSent: number;
  disconnectedAt: number | null;
}
let mp: MpSession | null = null;

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
let pingsUsed = 0; // Blind-Stern: Kampagnen-Sieg ohne einen einzigen Ping
let falls = 0;
let levelCols = 0;
let levelRows = 0;
// Geist-Replay: Bestzeit-Spur des aktuellen Levels + Rekorder des Laufs
let ghost: GhostData | null = null;
let duelDef: LevelDef | null = null;
/** Duell: Lag ich beim letzten Frame vorn? (null = noch nicht bestimmt) */
let rivalAhead: boolean | null = null;
let ghostRecorder: GhostRecorder | null = null;
// Werkstatt: aktuelles Custom-Level + ob der Lauf aus dem Editor kam (✏️)
let customDef: LevelDef | null = null;
let customFromEditor = false;

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

function showInterstitial(opts: {
  title: string;
  text: string;
  primary?: InterAction;
  secondary?: InterAction;
  /** Leise Zusatzaktion (Duell herausfordern/Revanche): Karte bleibt offen,
   *  man teilt den Link und entscheidet danach weiter. */
  extra?: InterAction;
}): void {
  interTitle.textContent = opts.title;
  interText.textContent = opts.text;
  if (opts.extra) {
    interExtra.textContent = opts.extra.label;
    interExtra.onclick = () => opts.extra!.onClick();
    interExtra.classList.remove('hidden');
  } else {
    interExtra.classList.add('hidden');
    interExtra.onclick = null;
  }
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
  interTitle.textContent = t('calib.title');
  interstitial.classList.remove('hidden');
  for (let i = 3; i > 0; i--) {
    interText.innerHTML = `${t('calib.text')}<br><br><span style="font-size:34px">${i}</span>`;
    await new Promise((r) => setTimeout(r, 1000));
  }
  hideInterstitial();
}

/* --- Menü ----------------------------------------------------------------- */

const presetChips = [...document.querySelectorAll<HTMLButtonElement>('#presetRow .chip')];

function refreshMenu(): void {
  const { done, total } = profile.tutorialProgress(TUT_IDS.length);
  $('tutorialProgress').textContent = `(${done}/${total})`;
  // Neuen Spielenden den Einstieg zeigen: Tutorial-Karte hervorheben.
  tutorialBtn.classList.toggle('suggest', done === 0);
  $('tutorialSub').textContent = done === 0 ? t('menu.tutorial.new') : t('menu.tutorial.sub');
  for (const chip of presetChips) {
    chip.classList.toggle('active', chip.dataset.preset === profile.preset);
  }
  for (const chip of document.querySelectorAll<HTMLButtonElement>('#langRow .chip')) {
    chip.classList.toggle('active', chip.dataset.lang === currentLang());
  }
  const best = profile.bestFor(`quick-${profile.preset}`);
  $('quickBest').textContent =
    best !== null ? t('menu.quick.best', { preset: t(`preset.${profile.preset}`), time: fmtTime(best) }) : '';
  const blind = profile.blindCount(CAMPAIGN_IDS);
  $('campaignStars').textContent =
    `(${profile.totalStars(CAMPAIGN_IDS)}/${CAMPAIGN_IDS.length * 3}★${blind > 0 ? ` · ${blind}🌑` : ''})`;
  const wsCount = workshop.list().length;
  $('workshopCount').textContent = wsCount > 0 ? `(${wsCount})` : '';
  const today = todayUTC();
  const daily = profile.dailyInfo(today);
  const streak = profile.streakInfo();
  const streakText =
    streak && streak.count > 1 && streak.last === today ? t('menu.daily.streak', { n: streak.count }) : '';
  $('dailyStatus').textContent =
    daily?.first != null ? `${t('menu.daily.done', { time: fmtTime(daily.first) })}${streakText}` : t('menu.daily.open');
}

for (const chip of document.querySelectorAll<HTMLButtonElement>('#langRow .chip')) {
  chip.addEventListener('click', () => setLang(chip.dataset.lang as Lang));
}
onLangChange(() => {
  refreshMenu();
  if (!campaignPanel.classList.contains('hidden')) refreshCampaignList();
  if (!mpPanel.classList.contains('hidden') && !mpChoose.classList.contains('hidden')) refreshMpPanel();
});

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
  WORLDS.forEach((world, wi) => {
    const header = document.createElement('h3');
    header.className = 'world-header';
    header.textContent = t(`world.w${wi + 1}` as keyof Dict);
    campaignList.append(header);
    world.levels.forEach((def, local) => appendLevelItem(def, flat++, local + 1));
  });
}

// Flachen Kampagnen-Index in (Welt, lokale Nummer) auflösen.
function campaignPos(index: number): { world: number; local: number } {
  let i = index;
  for (let w = 0; w < WORLDS.length; w++) {
    const n = WORLDS[w]!.levels.length;
    if (i < n) return { world: w, local: i };
    i -= n;
  }
  return { world: 0, local: index };
}

function appendLevelItem(def: LevelDef, i: number, num: number): void {
  {
    const unlocked = levelUnlocked(i);
    const item = document.createElement('button');
    item.className = 'panel level-item' + (unlocked ? '' : ' locked');
    const name = document.createElement('span');
    name.textContent = `${num}. ${unlocked ? lvName(def) : '???'}`;
    const meta = document.createElement('span');
    meta.className = 'level-meta';
    if (unlocked) {
      const stars = profile.starsFor(def.id);
      const best = profile.bestFor(def.id);
      meta.textContent =
        '★'.repeat(stars) +
        '☆'.repeat(3 - stars) +
        (profile.isBlind(def.id) ? '🌑' : '') +
        (best !== null ? ` · ${fmtTime(best)}` : '');
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
  if (mp) {
    mp.transport.leave();
    mp = null;
  }
  state = 'menu';
  mode = null;
  world = null;
  currentDef = null;
  audio.setRolling(0);
  audio.setWind(0, 0, 0);
  audio.setHoleRumble(0, 0, 0);
  audio.setGuard(0, 0, 0);
  audio.setRival(0, 0, 0);
  audio.setPortal(0, 0, 0);
  audio.setCurrent(0, 0, 0);
  audio.setListener(0, 0, 0, 0);
  audio.setIce(0);
  audio.setFog(0);
  audio.setAnchor(0, 0, 0);
  hideInterstitial();
  hud.classList.add('hidden');
  $('editBtn').classList.add('hidden');
  homeBtn.classList.remove('hidden');
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

/* --- Werkstatt: Bibliothek + Editor + Preview ------------------------------ */

// Rohe Def spielen: parseLevel validiert; fromEditor blendet den ✏️-Knopf ein.
function startCustom(raw: RawLevel, fromEditor: boolean): void {
  try {
    customDef = parseLevel(raw);
  } catch {
    return; // Bibliothek zeigt kaputte Level mit ⚠, der Editor blockt Testen
  }
  customFromEditor = fromEditor;
  $('editor').classList.add('hidden');
  $('workshop').classList.add('hidden');
  void startMode({ kind: 'custom' });
}

/* --- Geist-Duell ----------------------------------------------------------- */

const RIVAL_HEAR = 520; // Welteinheiten, ab denen man den Rivalen hört

/** Empfangenes Duell starten: Level + Spur kommen komplett aus dem Link. */
function startDuel(payload: { def: Record<string, unknown>; time: number; ghost: GhostData | null; by?: string }): void {
  try {
    duelDef = parseLevel(payload.def);
  } catch {
    return;
  }
  $('editor').classList.add('hidden');
  $('workshop').classList.add('hidden');
  void startMode({ kind: 'duel', time: payload.time, ghost: payload.ghost, by: payload.by });
}

/** Link zum eigenen Lauf teilen (Herausforderung bzw. Revanche). */
function shareDuel(def: LevelDef, seconds: number, btn: HTMLButtonElement, label: string): void {
  const frames = ghostRecorder?.result() ?? null;
  void (async () => {
    const url = await duelUrl(
      def as unknown as Record<string, unknown>,
      seconds,
      frames && frames.length ? { time: seconds, frames } : null,
      profile.name || undefined,
    );
    // Testbarkeits-Hook (E2E): der Link, den Teilen erzeugt hätte.
    (window as unknown as { __tiltrDuelUrl?: string }).__tiltrDuelUrl = url;
    const flash = (text: string): void => {
      btn.textContent = text;
      setTimeout(() => (btn.textContent = label), 2500);
    };
    try {
      if (navigator.share) await navigator.share({ title: t('duel.shareTitle'), url });
      else {
        await navigator.clipboard.writeText(url);
        flash(t('duel.copied'));
      }
    } catch {
      /* abgebrochen */
    }
  })();
}

/** „🏁 Herausfordern" für die Ergebnis-Karten aller geist-fähigen Modi:
 *  nur mit vollständiger Aufzeichnung (sehr lange Läufe haben keine). */
function challengeAction(def: LevelDef, seconds: number, label: string): InterAction | undefined {
  if (!ghostRecorder?.result()?.length) return undefined;
  return { label, onClick: () => shareDuel(def, seconds, interExtra, label) };
}

const editorApi = setupEditor({
  onTest: (def) => startCustom(def, true),
  onSaved: () => {
    workshopPanel.refresh();
    refreshMenu();
  },
});
const workshopPanel = setupWorkshopPanel({
  onPlay: (def) => startCustom(def, false),
  onEdit: (def) => editorApi.open(def),
});

// ✏️ im HUD: aus dem Preview zurück in den Editor (Entwurf bleibt erhalten).
$('editBtn').addEventListener('click', () => {
  if (!customFromEditor) return;
  showMenu();
  editorApi.reopen();
});
// Anzeigename für Duell-Links (optional; leer = anonymer „Rivale").
const playerNameInput = $<HTMLInputElement>('playerName');
playerNameInput.value = profile.name;
playerNameInput.addEventListener('change', () => {
  profile.name = playerNameInput.value;
  playerNameInput.value = profile.name;
});

$('dailyBtn').addEventListener('click', () => void startMode({ kind: 'daily', date: todayUTC() }));
tutorialBtn.addEventListener('click', () =>
  void startMode({ kind: 'tutorial', index: profile.nextTutorialIndex(TUT_IDS) }),
);

calibrateBtn.addEventListener('click', () => input.calibrate());
debugBtn.addEventListener('click', () => {
  debug = !debug;
});

// Debug-Ansicht ist versteckt: 5 Taps auf die Versionsnummer schalten sie
// frei – samt Viewport-Diagnose (Geräte-Wahrheit für Safe-Area-Fragen).
let versionTaps = 0;
$('version').addEventListener('click', () => {
  if (!debugBtn.classList.contains('hidden')) return;
  if (++versionTaps < 5) return;
  debugBtn.classList.remove('hidden');
  $('version').textContent += ' · 🔧';
  const diag = document.createElement('p');
  diag.id = 'diag';
  diag.className = 'menu-meta';
  $('menuFooter').append(diag);
  const update = (): void => {
    diag.textContent = viewportDiagnostics();
  };
  update();
  setInterval(update, 1000);
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
          : mode.kind === 'custom'
            ? customDef!
            : mode.kind === 'duel'
              ? duelDef!
              : generateQuickLevel(nextSeed(), profile.preset);
  currentDef = def;
  const intro = lvIntro(def);
  if (intro) {
    const title =
      mode.kind === 'daily'
        ? t('daily.introTitle', { date: formatDate(mode.date) })
        : mode.kind === 'tutorial'
        ? `${TUT_IDS.indexOf(def.id) + 1}/${TUT_IDS.length} · ${lvName(def)}`
        : mode.kind === 'campaign'
          ? `${t(`world.w${campaignPos(mode.index).world + 1}` as keyof Dict).split(' – ')[0]} · ${t('common.level')} ${
              campaignPos(mode.index).local + 1
            } · ${lvName(def)}`
          : lvName(def);
    const targetLine =
      mode.kind === 'daily' && mode.target !== undefined
        ? `\n\n${t('daily.targetLine', { time: fmtTime(mode.target) })}`
        : mode.kind === 'duel'
          ? `\n\n${t('daily.targetLine', { time: fmtTime(mode.time) })}`
          : '';
    showInterstitial({
      title,
      text: intro + targetLine,
      primary: { label: t('common.go'), onClick: () => launch(def) },
      secondary: { label: t('common.menu'), onClick: showMenu },
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
  // Geist-Replay: nur in Quick/Daily/Kampagne (nicht Tutorial, nicht MP) –
  // die Level-ID trägt bei Quick den Seed, der Geist erscheint also nur auf
  // exakt demselben Level.
  const ghostable =
    mode !== null &&
    (mode.kind === 'quick' ||
      mode.kind === 'daily' ||
      mode.kind === 'campaign' ||
      mode.kind === 'custom' ||
      mode.kind === 'duel');
  // Im Duell IST der Geist der Rivale aus dem Link – nicht die eigene
  // Bestzeit. Aufgezeichnet wird trotzdem: daraus wird die Revanche.
  ghost = mode?.kind === 'duel' ? mode.ghost : ghostable ? loadGhost(def.id) : null;
  ghostRecorder = ghostable ? new GhostRecorder() : null;
  rivalAhead = null;
  audio.setRival(0, 0, 0);
  pingMax = loaded.pingBudget;
  pings = pingMax;
  pingsUsed = 0;
  falls = 0;
  warpReady = true;
  activateFloor(0);
  respawnPoint = { floor: 0, x: loaded.world.ball.x, y: loaded.world.ball.y };
  t0 = performance.now();
  state = 'playing';
  revealUntil = 0;
  statusEl.textContent = '';
  // Editor-Preview: der EINZIGE Weg hinaus führt zurück in den Editor –
  // ✏️ ersetzt 🏠, damit niemand versehentlich im Hauptmenü landet
  // (der ungespeicherte Entwurf lebt nur im Editor).
  const editorPreview = mode?.kind === 'custom' && customFromEditor;
  $('editBtn').classList.toggle('hidden', !editorPreview);
  homeBtn.classList.toggle('hidden', editorPreview);
  if (mode?.kind === 'daily' && mode.target !== undefined) flash(t('daily.targetFlash', { time: fmtTime(mode.target) }), 4000);
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
    flash(
      dir === 'down'
        ? t('st.floorDown', { n: targetFloor + 1 })
        : dir === 'up'
          ? t('st.floorUp', { n: targetFloor + 1 })
          : t('st.portal'),
    );
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
  // Geist-Replay: die schnellste Spur pro Level-ID aufheben. Im Duell NICHT –
  // dort ist der Geist der Rivale, und der Lauf zählt nirgends mit.
  if (ghostRecorder && mode.kind !== 'duel' && (ghost === null || seconds < ghost.time)) {
    const frames = ghostRecorder.result();
    if (frames) saveGhost(def.id, seconds, frames);
  }
  if (mode.kind === 'duel') {
    const rival = mode.by || t('duel.rival');
    const won = seconds < mode.time;
    const delta = fmtTime(Math.abs(seconds - mode.time));
    const target = mode.time;
    setTimeout(() => {
      showInterstitial({
        title: won ? t('duel.wonTitle', { time: fmtTime(seconds) }) : t('duel.lostTitle', { time: fmtTime(seconds) }),
        text: won
          ? t('duel.wonText', { delta, by: rival, time: fmtTime(target) })
          : t('duel.lostText', { by: rival, delta, time: fmtTime(target) }),
        // Zurückschlagen kann nur, wer schneller war – sonst wäre die
        // „Revanche" ein Link mit schlechterer Zeit.
        extra: won ? challengeAction(def, seconds, t('duel.rematch')) : undefined,
        primary: { label: t('common.again'), onClick: beginLevel },
        secondary: { label: t('common.menu'), onClick: showMenu },
      });
    }, 1800);
  } else if (mode.kind === 'daily') {
    const date = mode.date;
    const target = mode.target;
    const today = todayUTC();
    const { isFirst, first } = profile.submitDaily(date, seconds, today);
    const streak = profile.streakInfo();
    const lines = [
      isFirst ? t('daily.first') : t('daily.training', { time: fmtTime(first) }),
      target !== undefined
        ? seconds < target
          ? t('daily.beat', { time: fmtTime(target) })
          : t('daily.notBeat', { time: fmtTime(target) })
        : '',
      isFirst && date === today && streak
        ? streak.count === 1
          ? t('daily.streakOne')
          : t('daily.streakMany', { n: streak.count })
        : '',
    ].filter(Boolean);
    setTimeout(() => {
      showInterstitial({
        title: t('daily.resultTitle', { date: formatDate(date), time: fmtTime(seconds) }),
        text: lines.join('\n'),
        extra: challengeAction(def, seconds, t('duel.challenge')),
        primary: {
          label: t('daily.share'),
          onClick: () => {
            showMenu();
            void shareDaily(date, isFirst ? seconds : Math.min(first, seconds));
          },
        },
        secondary: { label: t('common.menu'), onClick: showMenu },
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
        title: t('res.tutTitle', { name: lvName(def) }),
        text:
          `${t('res.time', { time: fmtTime(seconds) })}${isRecord ? t('res.newBest') : ''}\n` +
          (hasNext ? t('res.tutProgress', { done, total }) : t('res.tutDone')),
        primary: hasNext
          ? {
              label: t('common.next'),
              onClick: () => {
                mode = { kind: 'tutorial', index: index + 1 };
                beginLevel();
              },
            }
          : { label: t('common.toMenu'), onClick: showMenu },
        secondary: hasNext ? { label: t('common.menu'), onClick: showMenu } : undefined,
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
    // Blind-Stern 🌑: der optionale vierte Stern – ohne einen einzigen Ping.
    if (pingsUsed === 0) profile.markBlind(def.id);
    const isRecord = profile.submitTime(def.id, seconds);
    const hasNext = index + 1 < CAMPAIGN_LEVELS.length;
    const lines = [
      `${t('res.time', { time: fmtTime(seconds) })}${def.parTimeS ? t('res.par', { n: def.parTimeS }) : ''}${isRecord ? t('res.newBest') : ''}`,
      gemsTotal > 0 ? `💎 ${gemsGot}/${gemsTotal}` : t('res.falls', { n: falls }),
      pingsUsed === 0 ? t('res.blind') : '',
    ].filter(Boolean);
    setTimeout(() => {
      showInterstitial({
        title: `${lvName(def)} ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`,
        text: lines.join('\n'),
        extra: challengeAction(def, seconds, t('duel.challenge')),
        primary: hasNext
          ? {
              label: t('common.next'),
              onClick: () => {
                mode = { kind: 'campaign', index: index + 1 };
                beginLevel();
              },
            }
          : { label: t('common.toMenu'), onClick: showMenu },
        secondary: hasNext ? { label: t('common.menu'), onClick: showMenu } : undefined,
      });
    }, 1800);
  } else if (mode.kind === 'custom') {
    const isRecord = profile.submitTime(def.id, seconds);
    const best = profile.bestFor(def.id);
    const fromEditor = customFromEditor;
    setTimeout(() => {
      showInterstitial({
        title: t('res.winTitle', { time: fmtTime(seconds) }),
        text: isRecord ? t('res.newBestLine') : best !== null ? t('res.time', { time: fmtTime(best) }) : '',
        // Im Editor-Preview gibt es nichts zu teilen (der Entwurf ist noch
        // nicht mal gespeichert) – im normalen Spiel schon.
        extra: fromEditor ? undefined : challengeAction(def, seconds, t('duel.challenge')),
        primary: fromEditor
          ? {
              label: t('ed.backToEditor'),
              onClick: () => {
                showMenu();
                editorApi.reopen();
              },
            }
          : { label: t('common.again'), onClick: beginLevel },
        // Im Editor-Preview gibt es KEINEN Menü-Ausstieg: zurück geht es
        // immer in den Editor (verlassen wird der über ‹).
        secondary: fromEditor ? undefined : { label: t('common.menu'), onClick: showMenu },
      });
    }, 1800);
  } else {
    const isRecord = profile.submitTime(`quick-${profile.preset}`, seconds);
    const best = profile.bestFor(`quick-${profile.preset}`);
    setTimeout(() => {
      showInterstitial({
        title: t('res.winTitle', { time: fmtTime(seconds) }),
        extra: challengeAction(def, seconds, t('duel.challenge')),
        text: isRecord
          ? t('res.newBestLine')
          : best !== null
            ? t('menu.quick.best', { preset: t(`preset.${profile.preset}`), time: fmtTime(best) })
            : '',
        primary: { label: t('common.again'), onClick: beginLevel },
        secondary: { label: t('common.menu'), onClick: showMenu },
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

// Schiebewände: Zyklus wie die atmenden Löcher (openness 1 = Lücke offen),
// dazu die Klang-Steuerung – Schleifen bei jedem Zustandswechsel, in den
// letzten Sekunden des offenen Plateaus ein beschleunigender Warn-Takt.
function updateSlidingWalls(nowMs: number): void {
  const b = world!.ball;
  for (const w of world!.walls) {
    const sl = w.slide;
    if (!sl) continue;
    const c = sl.cycle;
    const period = c.ramp * 2 + c.open + c.closed;
    const cyc = (nowMs / 1000 + c.offset) % period;
    let state: NonNullable<typeof sl.lastState>;
    if (cyc < c.ramp) {
      sl.openness = cyc / c.ramp;
      state = 'opening';
    } else if (cyc < c.ramp + c.open) {
      sl.openness = 1;
      state = 'open';
    } else if (cyc < c.ramp * 2 + c.open) {
      sl.openness = 1 - (cyc - c.ramp - c.open) / c.ramp;
      state = 'closing';
    } else {
      sl.openness = 0;
      state = 'closed';
    }
    const cx = Math.max(w.x, Math.min(b.x, w.x + w.w));
    const cy = Math.max(w.y, Math.min(b.y, w.y + w.h));
    const dx = cx - b.x,
      dy = cy - b.y;
    const audible = Math.hypot(dx, dy) < SLIDE_HEAR;
    if (state !== sl.lastState) {
      if (audible && (state === 'opening' || state === 'closing')) audio.slideGrind(dx, dy, state === 'opening');
      sl.lastState = state;
      sl.nextTick = undefined;
    }
    if (state === 'open' && audible) {
      const remaining = c.ramp + c.open - cyc;
      if (remaining < 1.3 && (sl.nextTick === undefined || nowMs >= sl.nextTick)) {
        audio.slideTick(dx, dy);
        sl.nextTick = nowMs + 130 + remaining * 220;
      }
    }
  }
}

// Echo-Ping: Umgebung im Radius aufdecken (als Wellenfront) und die
// Reflexionen verzögert & räumlich zurückkommen lassen.
function firePing(now: number): void {
  if (!world || state !== 'playing' || pings <= 0) return;
  pings--;
  pingsUsed++;
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
    // Schiebewände antworten tiefer, steinerner als normale Wände.
    reflections.push({ dx: cx - b.x, dy: cy - b.y, dist, freq: w.slide ? 500 : 950 });
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
  // Zeitschloss-Schalter: dumpfes Tick-Tock als Doppel-Blip.
  for (const sw of world.switches) reveal(sw, 520, true);
  // Horcher: dunkler als der Wächter (der antwortet mit 240).
  for (const l of world.listeners) reveal(l, 360);
  // Echo-Kristall: heller, einzelner Glockenton – noch über dem Gem.
  for (const c of world.crystals) if (!c.collected) reveal(c, 2637);
  // Sog-Anker: tiefes, elektrisches Echo.
  for (const a of world.anchors) reveal(a, 200);
  // Glasboden: gläsern-heller Einzelblip.
  for (const g of world.glass) {
    if (g.state === 2) continue;
    const gx = g.x + g.w / 2,
      gy = g.y + g.h / 2;
    const dist = Math.hypot(b.x - gx, b.y - gy);
    if (dist > PING_RANGE) continue;
    g.litFrom = now + (dist / PING_SPEED) * 1000;
    g.litUntil = g.litFrom + 1200;
    reflections.push({ dx: gx - b.x, dy: gy - b.y, dist, freq: 1150 });
  }
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
  const text = t('daily.shareText', { date: formatDate(date), time: fmtTime(seconds) });
  try {
    if (navigator.share) {
      await navigator.share({ text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      $('dailyStatus').textContent = t('daily.copied');
    }
  } catch {
    /* abgebrochen */
  }
}

// Geteiltes Werkstatt-Level (#level=TOKEN): dekodieren, anbieten.
function offerSharedLevel(token: string): void {
  history.replaceState(null, '', location.pathname + location.search);
  void (async () => {
    let raw: Record<string, unknown>;
    let def: LevelDef;
    try {
      raw = await decodeLevel(token);
      def = parseLevel(raw);
    } catch {
      showInterstitial({
        title: t('share.title'),
        text: t('share.bad'),
        primary: { label: t('common.ok'), onClick: () => undefined },
      });
      return;
    }
    showInterstitial({
      title: t('share.title'),
      text: t('share.text', { name: def.name }),
      primary: { label: t('share.try'), onClick: () => startCustom(raw as never, false) },
      secondary: {
        label: t('share.keep'),
        onClick: () => {
          // Fremde/kollidierende IDs bekommen eine frische Werkstatt-ID.
          if (typeof raw.id !== 'string' || !raw.id.startsWith('custom-') || workshop.get(raw.id)) {
            raw.id = newCustomId();
          }
          workshop.save(raw);
          refreshMenu();
          workshopPanel.show();
        },
      },
    });
  })();
}

// Empfangenes Geist-Duell (#duel=TOKEN): Level + Spur + Zielzeit stecken im
// Link. Die Spur wird auf Plausibilität geprüft, bevor sie antritt.
function offerDuel(token: string): void {
  history.replaceState(null, '', location.pathname + location.search);
  void (async () => {
    let payload: Awaited<ReturnType<typeof decodeDuel>>;
    let def: LevelDef;
    try {
      payload = await decodeDuel(token);
      def = parseLevel(payload.def);
    } catch {
      showInterstitial({
        title: t('duel.introTitle'),
        text: t('duel.bad'),
        primary: { label: t('common.ok'), onClick: () => undefined },
      });
      return;
    }
    // Unplausible Spur (Teleport, Zeit passt nicht, Ziel nie erreicht) tritt
    // nicht als unschlagbares Phantom an – dann lieber ohne Geist laufen.
    if (payload.ghost && validateGhostRun(def, payload.ghost, payload.time) !== null) {
      payload = { ...payload, ghost: null };
    }
    const rival = payload.by || t('duel.rival');
    const accepted = payload;
    showInterstitial({
      title: t('duel.introTitle'),
      text: `${t('duel.introText', { by: rival, name: lvName(def), time: fmtTime(payload.time) })}\n${
        payload.ghost ? t('duel.introGhost') : t('duel.introNoGhost')
      }`,
      primary: { label: t('duel.accept'), onClick: () => startDuel(accepted) },
      secondary: { label: t('duel.later'), onClick: () => undefined },
    });
  })();
}

// Empfangene Herausforderung (#daily=DATUM&t=SEKUNDEN) anbieten.
function checkChallengeHash(): void {
  const levelMatch = location.hash.match(/^#level=([A-Za-z0-9_-]{8,})$/);
  if (levelMatch) {
    offerSharedLevel(levelMatch[1]!);
    return;
  }
  const duelMatch = location.hash.match(/^#duel=([A-Za-z0-9_-]{8,})$/);
  if (duelMatch) {
    offerDuel(duelMatch[1]!);
    return;
  }
  const joinMatch = location.hash.match(/^#join=([A-Za-z0-9-]{4,12})$/);
  if (joinMatch) {
    history.replaceState(null, '', location.pathname + location.search);
    refreshMpPanel();
    mpPanel.classList.remove('hidden');
    mpCodeInput.value = joinMatch[1]!.toUpperCase();
    void mpJoin(joinMatch[1]!);
    return;
  }
  const m = location.hash.match(/^#daily=(\d{4}-\d{2}-\d{2})(?:&t=([\d.]+))?$/);
  if (!m) return;
  const date = m[1]!;
  const target = m[2] !== undefined ? parseFloat(m[2]) : undefined;
  history.replaceState(null, '', location.pathname + location.search);
  showInterstitial({
    title: t('daily.challengeTitle'),
    text:
      target !== undefined
        ? t('daily.challengeTextTarget', { date: formatDate(date), time: fmtTime(target) })
        : t('daily.challengeText', { date: formatDate(date) }),
    primary: { label: t('daily.accept'), onClick: () => void startMode({ kind: 'daily', date, target }) },
    secondary: { label: t('daily.later'), onClick: () => undefined },
  });
}
checkChallengeHash();
// Auch wenn die App SCHON OFFEN ist: Tippt man einen tiltr-Link an (PWA,
// wiederverwendeter Tab), ändert sich nur der Hash – ohne Neuladen. Ohne
// diesen Listener passierte dann gar nichts. (replaceState beim Aufräumen
// feuert kein hashchange, es gibt also keine Schleife.)
window.addEventListener('hashchange', checkChallengeHash);


/* --- Multiplayer ------------------------------------------------------------ */

const mpPanel = $('mp');
const mpChoose = $('mpChoose');
const mpLobby = $('mpLobby');
const mpLevelList = $('mpLevelList');
const mpCodeInput = $<HTMLInputElement>('mpCodeInput');
let mpModeSel: MpMode = 'coop';

const mpModeHint = (m: MpMode): string => t(m === 'coop' ? 'mp.hint.coop' : 'mp.hint.race');

function refreshMpPanel(): void {
  mpChoose.classList.remove('hidden');
  mpLobby.classList.add('hidden');
  $('mpModeHint').textContent = mpModeHint(mpModeSel);
  for (const chip of document.querySelectorAll<HTMLButtonElement>('#mpModeRow .chip')) {
    chip.classList.toggle('active', chip.dataset.mpmode === mpModeSel);
  }
  mpLevelList.replaceChildren();
  // Zufallslevel (wie beim Schnellen Spiel, mit Multiplayer-Elementen):
  // der Gast regeneriert es deterministisch aus der ID (mpq-<modus>-<seed>).
  const rndItem = document.createElement('button');
  rndItem.id = 'mpRandomBtn';
  rndItem.className = 'panel level-item';
  const rndName = document.createElement('span');
  rndName.textContent = `🎲 ${t('mp.random')}`;
  const rndMeta = document.createElement('span');
  rndMeta.className = 'level-meta';
  rndMeta.textContent = '∞';
  rndItem.append(rndName, rndMeta);
  rndItem.addEventListener('click', () => void mpHost(generateMpLevel(randomSeed(), mpModeSel)));
  mpLevelList.append(rndItem);

  const levels = mpModeSel === 'coop' ? COOP_LEVELS : RACE_LEVELS;
  levels.forEach((def, i) => {
    const item = document.createElement('button');
    item.className = 'panel level-item';
    const name = document.createElement('span');
    name.textContent = `${i + 1}. ${lvName(def)}`;
    const meta = document.createElement('span');
    meta.className = 'level-meta';
    const [c, r] = def.floors[0]!.size;
    meta.textContent = `${def.floors.length > 1 ? `${t('mp.floors', { n: def.floors.length })} · ` : ''}${c}×${r}`;
    item.append(name, meta);
    item.addEventListener('click', () => void mpHost(def));
    mpLevelList.append(item);
  });
}

function mpShowLobby(status: string): void {
  mpChoose.classList.add('hidden');
  mpLobby.classList.remove('hidden');
  $('mpLobbyStatus').textContent = status;
}

function mpJoinUrl(code: string): string {
  return `${location.origin}${location.pathname}#join=${code}`;
}

// Lobby SOFORT zeigen, dann verbinden: Der Relay-Aufbau darf weder die UI
// blockieren noch bei einem Fehler stumm bleiben. Das Token erkennt einen
// Abbruch (Abbrechen/Schließen) während des Verbindens.
let mpPending: string | null = null;

async function mpHost(level: LevelDef): Promise<void> {
  // ?mpcode=TEST… erzwingt den Raumcode (E2E: TEST-Präfix wählt den LocalTransport)
  const code = new URLSearchParams(location.search).get('mpcode')?.toUpperCase() ?? makeRoomCode();
  $('mpLobbyTitle').textContent = `${mpModeSel === 'coop' ? '🤝' : '🏁'} ${lvName(level)}`;
  $('mpQr').innerHTML = renderSVG(mpJoinUrl(code));
  $('mpQr').classList.remove('hidden');
  $('mpCode').textContent = code;
  mpShowLobby(t('mp.connecting'));
  mpPending = code;
  try {
    const transport = await connect(code);
    if (mpPending !== code) {
      transport.leave();
      return;
    }
    mpInit(transport, code, true, mpModeSel, level);
    $('mpLobbyStatus').textContent = t('mp.waiting');
  } catch {
    if (mpPending === code) $('mpLobbyStatus').textContent = t('mp.error');
  }
}

async function mpJoin(code: string): Promise<void> {
  code = code.toUpperCase();
  $('mpLobbyTitle').textContent = t('mp.join');
  $('mpQr').classList.add('hidden');
  $('mpCode').textContent = code;
  mpShowLobby(t('mp.connecting'));
  mpPending = code;
  try {
    const transport = await connect(code);
    if (mpPending !== code) {
      transport.leave();
      return;
    }
    mpInit(transport, code, false, 'coop', null);
    $('mpLobbyStatus').textContent = t('mp.connecting');
  } catch {
    if (mpPending === code) $('mpLobbyStatus').textContent = t('mp.error');
  }
}

function mpInit(transport: Transport, code: string, host: boolean, mpmode: MpMode, level: LevelDef | null): void {
  mp?.transport.leave();
  mp = {
    transport,
    code,
    host,
    mode: mpmode,
    level,
    phase: 'lobby',
    selfReady: false,
    peerReady: false,
    rematchSelf: false,
    rematchPeer: false,
    remote: { x: 0, y: 0, floor: 0, finished: false, elapsed: null },
    localFinished: false,
    localElapsed: null,
    localHolds: new Set(),
    remoteHolds: new Set(),
    lastStateSent: 0,
    disconnectedAt: null,
  };
  transport.onPeer((event) => {
    if (!mp) return;
    if (event === 'join') {
      if (mp.disconnectedAt !== null) {
        // Kurzer Aussetzer: weiterspielen, aktuelle Platten erneut melden
        mp.disconnectedAt = null;
        for (const id of mp.localHolds) mp.transport.send('plate', { id, held: true });
        flash(t('mp.rejoined'));
        return;
      }
      if (mp.host && mp.level) {
        mp.transport.send('setup', { mode: mp.mode, levelId: mp.level.id });
        $('mpLobbyStatus').textContent = t('mp.connected');
        mpShowIntro();
      } else {
        $('mpLobbyStatus').textContent = t('mp.waitLevel');
      }
    } else {
      mpPeerLeft();
    }
  });
  transport.onMessage((type, payload) => mpOnMessage(type, payload));
}

function mpPeerLeft(): void {
  if (!mp) return;
  if (mp.phase === 'playing' || mp.phase === 'done') {
    mp.disconnectedAt = performance.now();
  } else {
    $('mpLobbyStatus').textContent = t('mp.leftLobby');
    if (interstitial && !interstitial.classList.contains('hidden')) hideInterstitial();
    mpPanel.classList.remove('hidden');
    mpShowLobby(t('mp.leftWait'));
  }
}

function mpOnMessage(type: string, payload: unknown): void {
  if (!mp) return;
  if (type === 'setup') {
    const p = payload as { mode: MpMode; levelId: string };
    const pool = p.mode === 'coop' ? COOP_LEVELS : RACE_LEVELS;
    // Zufallslevel stehen nicht im Pool: aus der ID deterministisch regenerieren.
    const level = pool.find((l) => l.id === p.levelId) ?? parseMpQuickId(p.levelId);
    if (!level) return;
    mp.mode = p.mode;
    mp.level = level;
    mpShowIntro();
  } else if (type === 'ready') {
    mp.peerReady = true;
    mpMaybeStart();
  } else if (type === 'state') {
    const p = payload as { x: number; y: number; f: number; fin: boolean };
    mp.remote.x = p.x;
    mp.remote.y = p.y;
    mp.remote.floor = p.f;
    mp.remote.finished = p.fin;
  } else if (type === 'plate') {
    const p = payload as { id: string; held: boolean };
    if (p.held) mp.remoteHolds.add(p.id);
    else mp.remoteHolds.delete(p.id);
  } else if (type === 'finish') {
    const p = payload as { elapsed: number };
    if (!mp.remote.finished) flash(t('mp.partnerFinished'));
    mp.remote.finished = true;
    mp.remote.elapsed = p.elapsed;
    mpCheckResult();
  } else if (type === 'rematch') {
    mp.rematchPeer = true;
    mpMaybeRematch();
  }
}

function mpShowIntro(): void {
  if (!mp?.level) return;
  mp.phase = 'intro';
  mpPanel.classList.add('hidden');
  const icon = mp.mode === 'coop' ? '🤝' : '🏁';
  showInterstitial({
    title: `${icon} ${lvName(mp.level)}`,
    text: `${lvIntro(mp.level) ?? ''}\n\n${mpModeHint(mp.mode)}`,
    primary: {
      label: t('mp.ready'),
      onClick: () => {
        void (async () => {
          if (!mp) return;
          if (!sensorsReady) {
            await Promise.all([input.start(), audio.start()]);
            sensorsReady = true;
            await calibrationCountdown();
          } else {
            await audio.start();
          }
          mp.selfReady = true;
          mp.transport.send('ready', null);
          if (!mpMaybeStart()) {
            showInterstitial({ title: t('mp.readyTitle'), text: t('mp.waitPartner') });
          }
        })();
      },
    },
    secondary: { label: t('mp.leave'), onClick: showMenu },
  });
}

function mpMaybeStart(): boolean {
  if (!mp?.level || !mp.selfReady || !mp.peerReady || mp.phase === 'playing') return false;
  mp.phase = 'playing';
  mp.localFinished = false;
  mp.localElapsed = null;
  mp.rematchSelf = false;
  mp.rematchPeer = false;
  mp.localHolds = new Set();
  mp.remoteHolds = new Set();
  mp.remote = { x: 0, y: 0, floor: 0, finished: false, elapsed: null };
  mode = { kind: 'mp' };
  hideInterstitial();
  overlay.classList.add('hidden');
  hideInstallHint();
  hud.classList.remove('hidden');
  launch(mp.level);
  return true;
}

function mpMaybeRematch(): void {
  if (!mp || !mp.rematchSelf || !mp.rematchPeer) return;
  mp.selfReady = true;
  mp.peerReady = true;
  mp.phase = 'intro';
  mpMaybeStart();
}

// Pro Frame im MP: Zustand senden, Platten/Türen synchronisieren.
function mpFrame(now: number): void {
  if (!mp || !world || !loaded) return;

  if (now - mp.lastStateSent > 80) {
    mp.lastStateSent = now;
    mp.transport.send('state', {
      x: world.ball.x,
      y: world.ball.y,
      f: activeFloor,
      fin: mp.localFinished,
    });
  }

  // Lokale Platten unter dem Ball (auch ein Ball im Ziel hält seine Platte!)
  const holds = new Set(world.platesUnderBall().map((p) => p.opens));
  for (const id of holds) {
    if (!mp.localHolds.has(id)) {
      mp.transport.send('plate', { id, held: true });
      audio.plate(true);
      haptics.hit(0.3);
    }
  }
  for (const id of mp.localHolds) {
    if (!holds.has(id)) {
      mp.transport.send('plate', { id, held: false });
      audio.plate(false);
    }
  }
  mp.localHolds = holds;

  // Türen über alle Ebenen: offen, solange irgendwer eine passende Platte hält
  for (const floor of loaded.floors) {
    for (const w of floor.world.walls) {
      if (!w.door) continue;
      const shouldOpen = holds.has(w.door.id) || mp.remoteHolds.has(w.door.id);
      if (shouldOpen !== (w.door.open ?? false)) {
        w.door.open = shouldOpen;
        w.litFrom = 0;
        w.litUntil = now + 1500;
        if (floor.world === world) {
          const dx = w.x + w.w / 2 - world.ball.x;
          const dy = w.y + w.h / 2 - world.ball.y;
          if (shouldOpen) audio.doorOpen(dx, dy);
          else audio.doorClose(dx, dy);
        }
      }
    }
    for (const pl of floor.world.plates) {
      pl.held = holds.has(pl.opens) || mp.remoteHolds.has(pl.opens);
    }
  }
}

function mpLocalFinish(now: number): void {
  if (!mp || mp.localFinished) return;
  mp.localFinished = true;
  mp.localElapsed = (now - t0) / 1000;
  if (world) {
    world.ball.vx = 0;
    world.ball.vy = 0;
  }
  audio.checkpoint();
  haptics.checkpoint();
  mp.transport.send('finish', { elapsed: mp.localElapsed });
  mpCheckResult();
}

function mpCheckResult(): void {
  if (!mp || mp.phase !== 'playing' || !mp.localFinished || !mp.remote.finished) return;
  mp.phase = 'done';
  state = 'won';
  revealUntil = performance.now() + 4000;
  audio.setRolling(0);
  audio.setWind(0, 0, 0);
  audio.setHoleRumble(0, 0, 0);
  audio.setGuard(0, 0, 0);
  audio.setRival(0, 0, 0);
  audio.setPortal(0, 0, 0);
  audio.setCurrent(0, 0, 0);
  audio.setListener(0, 0, 0, 0);
  audio.setIce(0);
  audio.setFog(0);
  audio.setAnchor(0, 0, 0);
  const mine = mp.localElapsed ?? 0;
  const theirs = mp.remote.elapsed ?? 0;
  let title: string;
  let text: string;
  if (mp.mode === 'coop') {
    audio.win();
    haptics.win();
    title = t('mp.coopWin');
    text = t('mp.teamTime', { team: fmtTime(Math.max(mine, theirs)), you: fmtTime(mine), partner: fmtTime(theirs) });
  } else {
    const won = mine < theirs;
    if (won) {
      audio.win();
      haptics.win();
    } else {
      audio.caught();
    }
    title = mine === theirs ? t('mp.draw') : won ? t('mp.raceWin') : t('mp.raceLose');
    text = t('mp.raceTimes', { you: fmtTime(mine), rival: fmtTime(theirs) });
  }
  setTimeout(() => {
    if (!mp) return;
    showInterstitial({
      title,
      text,
      primary: {
        label: t('common.again'),
        onClick: () => {
          if (!mp) return;
          mp.rematchSelf = true;
          mp.transport.send('rematch', null);
          if (mp.rematchPeer) mpMaybeRematch();
          else
            showInterstitial({
              title: t('common.again'),
              text: t('mp.waitPartner'),
              secondary: { label: t('common.menu'), onClick: showMenu },
            });
        },
      },
      secondary: { label: t('common.menu'), onClick: showMenu },
    });
  }, 1800);
}

$('mpBtn').addEventListener('click', () => {
  refreshMpPanel();
  mpPanel.classList.remove('hidden');
});
$('mpClose').addEventListener('click', () => {
  if (mp && mp.phase === 'lobby') {
    mp.transport.leave();
    mp = null;
  }
  mpPending = null;
  mpPanel.classList.add('hidden');
});
$('mpCancelBtn').addEventListener('click', () => {
  mpPending = null;
  mp?.transport.leave();
  mp = null;
  refreshMpPanel();
});
for (const chip of document.querySelectorAll<HTMLButtonElement>('#mpModeRow .chip')) {
  chip.addEventListener('click', () => {
    mpModeSel = chip.dataset.mpmode as MpMode;
    refreshMpPanel();
  });
}
$('mpJoinBtn').addEventListener('click', () => {
  const code = mpCodeInput.value.trim().toUpperCase();
  if (code.length >= 4) void mpJoin(code);
});
// Tab/App wird geschlossen: dem Partner sofort Bescheid geben statt Timeout.
window.addEventListener('pagehide', () => mp?.transport.leave());

$('mpScanBtn').addEventListener('click', () => {
  void scanRoomCode().then((code) => {
    if (code) {
      mpCodeInput.value = code;
      void mpJoin(code);
    }
  });
});

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!world) return;

  updateHoles(now);
  updateSlidingWalls(now);
  world.pings = world.pings.filter((p) => ((now - p.start) / 1000) * p.speed < p.range);

  if (state === 'playing') {
    // MP: Ball im Ziel liegt still; bei Verbindungsverlust pausiert das Spiel.
    const frozen = mp?.localFinished === true;
    const disconnected = mp?.disconnectedAt != null;
    const tilt = frozen || disconnected ? { x: 0, y: 0 } : input.tilt;
    const hits = frozen || disconnected ? [] : world.step(dt, tilt);

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
          flash(t('st.wallDown'));
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

    // Horcher: Schnüffeln schwillt mit der EIGENEN Rollgeschwindigkeit an –
    // Stillstehen nimmt ihn (fast) aus dem Herzschlag heraus.
    const activity = Math.min(1, world.ball.speed / 300);
    let listenerClose = 0;
    let nearListener: { dx: number; dy: number } | null = null;
    for (const l of world.listeners) {
      const d = Math.max(0, Math.hypot(l.x - world.ball.x, l.y - world.ball.y) - l.r);
      const c = Math.max(0, 1 - d / LISTENER_HEAR);
      if (c > listenerClose) {
        listenerClose = c;
        nearListener = { dx: l.x - world.ball.x, dy: l.y - world.ball.y };
      }
    }
    if (nearListener) audio.setListener(listenerClose, activity, nearListener.dx, nearListener.dy);
    else audio.setListener(0, 0, 0, 0);
    const listenerDanger = listenerClose * (0.25 + 0.75 * activity);

    // Nebel: im Kern klingt alles wie durch Watte (ein Lowpass hinter dem Master).
    const b0 = world.ball;
    const inFog = world.fogZones.some((z) => b0.x > z.x && b0.x < z.x + z.w && b0.y > z.y && b0.y < z.y + z.h);
    audio.setFog(inFog ? 1 : 0);

    // Eis: kristallines Sirren, solange der Ball darauf gleitet.
    audio.setIce(world.onIce() ? Math.min(1, world.ball.speed / 500) : 0);

    if (danger > 0.55) haptics.holeWarning(danger);
    audio.heartbeat(Math.max(danger, guardDanger, listenerDanger));

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
        // Öffnet die Tür auf ALLEN Ebenen – das Lösbarkeits-Modell
        // (coopReachable) behandelt Öffner ebenenübergreifend, das Spiel
        // muss dasselbe tun. Hörbar ist nur die Tür der aktuellen Ebene.
        for (const fl of loaded!.floors) {
          for (let i = fl.world.walls.length - 1; i >= 0; i--) {
            const w = fl.world.walls[i]!;
            if (w.door?.id === key.opens) {
              fl.world.walls.splice(i, 1);
              fl.world.debris.push({ ...w, litUntil: now + 2000 });
              if (fl.world === world) audio.doorOpen(w.x + w.w / 2 - world.ball.x, w.y + w.h / 2 - world.ball.y);
            }
          }
        }
        flash(t('st.door'));
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
        flash(t('st.gem'));
      }
    }

    // Echo-Kristalle: +1 Ping, auch über das Rundenbudget hinaus.
    for (const c of world.crystals) {
      if (c.collected) continue;
      if (Math.hypot(c.x - world.ball.x, c.y - world.ball.y) < c.r + world.ball.r) {
        c.collected = true;
        pings++;
        audio.collectCrystal();
        haptics.checkpoint();
        flash(t('st.crystal'));
      }
    }

    // Glasboden: Überrollen zählen (Kanten-Trigger). 1. Mal knackt es,
    // 2. Mal zerbricht die Zelle zum offenen Loch – der reguläre
    // Loch-Sturz greift im nächsten Frame.
    for (const g of world.glass) {
      if (g.state === 2) continue;
      const bOn =
        world.ball.x > g.x && world.ball.x < g.x + g.w && world.ball.y > g.y && world.ball.y < g.y + g.h;
      if (bOn && !g.wasOn) {
        if (g.state === 0) {
          g.state = 1;
          g.litFrom = 0;
          g.litUntil = now + 2000;
          audio.glassCrack();
          haptics.hit(0.5);
          flash(t('st.glass'));
        } else {
          g.state = 2;
          world.holes.push({ x: g.x + g.w / 2, y: g.y + g.h / 2, r: world.ball.r * 1.05, openness: 1 });
          audio.glassShatter();
          haptics.crumble();
        }
      }
      g.wasOn = bOn;
    }

    // Sog-Anker: elektrisches Brummen, hörbar etwas über den Wirkradius hinaus.
    let anchorClose = 0;
    let nearAnchor: { dx: number; dy: number } | null = null;
    for (const a of world.anchors) {
      const d = Math.hypot(a.x - world.ball.x, a.y - world.ball.y);
      const c = Math.max(0, 1 - d / (a.r + ANCHOR_HEAR));
      if (c > anchorClose) {
        anchorClose = c;
        nearAnchor = { dx: a.x - world.ball.x, dy: a.y - world.ball.y };
      }
    }
    if (nearAnchor) audio.setAnchor(anchorClose, nearAnchor.dx, nearAnchor.dy);
    else audio.setAnchor(0, 0, 0);

    // Windzonen: hörbar in der Nähe, spürbar (Kraft) mittendrin
    let bestZone: { dist: number; dx: number; dy: number } | null = null;
    for (const z of world.windZones) {
      const p = zoneProximity(z, world.ball);
      if (!bestZone || p.dist < bestZone.dist) bestZone = p;
    }
    if (bestZone) {
      audio.setWind(Math.max(0, 1 - bestZone.dist / WIND_HEAR), bestZone.dx, bestZone.dy);
    }

    // Strömungen: pulsierendes Rauschen in Hörweite (Richtung wie beim Wind).
    let bestCurrent: { dist: number; dx: number; dy: number } | null = null;
    for (const z of world.currents) {
      const p = zoneProximity(z, world.ball);
      if (!bestCurrent || p.dist < bestCurrent.dist) bestCurrent = p;
    }
    if (bestCurrent) {
      audio.setCurrent(Math.max(0, 1 - bestCurrent.dist / CURRENT_HEAR), bestCurrent.dx, bestCurrent.dy);
    }

    // Zeitschloss-Schalter: Betreten spannt das Uhrwerk (Draufbleiben frischt
    // stumm auf); die verknüpften Türen laufen unten über alle Ebenen synchron.
    for (const sw of world.switches) {
      const on = Math.hypot(sw.x - world.ball.x, sw.y - world.ball.y) < sw.r + world.ball.r / 2;
      if (on) {
        sw.openUntil = now + sw.durationS * 1000;
        if (!sw.held) {
          sw.held = true;
          sw.litFrom = 0;
          sw.litUntil = now + 2000;
          audio.switchPress();
          haptics.hit(0.4);
          flash(t('st.switch', { n: sw.durationS }));
        }
      } else {
        sw.held = false;
      }
    }
    if (!mp) {
      const allSwitches = loaded!.floors.flatMap((f) => f.world.switches);
      if (allSwitches.length) {
        const switchIds = new Set(allSwitches.map((s) => s.opens));
        const openIds = new Set<string>();
        let urgency = 0; // dringlichster laufender Timer (0 = keiner aktiv)
        for (const s of allSwitches) {
          if (s.openUntil !== null && s.openUntil > now) {
            openIds.add(s.opens);
            urgency = Math.max(urgency, 1 - (s.openUntil - now) / (s.durationS * 1000));
          }
        }
        for (const floor of loaded!.floors) {
          for (const w of floor.world.walls) {
            if (!w.door || !switchIds.has(w.door.id)) continue;
            const shouldOpen = openIds.has(w.door.id);
            if (shouldOpen !== (w.door.open ?? false)) {
              w.door.open = shouldOpen;
              w.litFrom = 0;
              w.litUntil = now + 1500;
              if (floor.world === world) {
                const ddx = w.x + w.w / 2 - world.ball.x;
                const ddy = w.y + w.h / 2 - world.ball.y;
                if (shouldOpen) audio.doorOpen(ddx, ddy);
                else audio.doorClose(ddx, ddy);
              }
            }
          }
        }
        if (openIds.size) audio.switchTick(urgency);
      }
    }

    // Checkpoints: einmalig aktivieren, wird neuer Respawn-Punkt
    for (const cp of world.checkpoints) {
      if (cp.reached) continue;
      if (Math.hypot(cp.x - world.ball.x, cp.y - world.ball.y) < cp.r) {
        cp.reached = true;
        cp.litUntil = now + 2000;
        respawnPoint = { floor: activeFloor, x: cp.x, y: cp.y };
        // Auffüllen bis zum Budget – ein Kristall-Überschuss bleibt erhalten.
        if (pings < pingMax) pings++;
        audio.checkpoint();
        haptics.checkpoint();
        flash(t('st.checkpoint'));
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
    const pad = warpReady && !frozen && !disconnected ? world.transporterHit() : null;
    if (pad) {
      pad.litFrom = 0;
      pad.litUntil = now + 1200;
      startWarp(pad.tx, pad.ty, pad.targetFloor, pad.dir);
      renderer.follow(world.ball.x, world.ball.y);
      renderer.draw(world, { debug, revealAll: revealUntil > now, now });
      return;
    }

    if (mp && mp.phase === 'playing' && !disconnected) mpFrame(now);
    if (mp && disconnected) {
      const remaining = Math.max(0, 10 - (now - mp.disconnectedAt!) / 1000);
      if (remaining <= 0) {
        const wasCoop = mp.mode === 'coop';
        showMenu();
        showInterstitial({
          title: t('mp.lostTitle'),
          text: wasCoop ? t('mp.lostCoop') : t('mp.lostRace'),
          primary: { label: t('common.ok'), onClick: () => undefined },
        });
        return;
      }
    }

    // Geist-Replay: eigenen Lauf auf dem 8-Hz-Raster mitschreiben.
    ghostRecorder?.add((now - t0) / 1000, activeFloor, world.ball.x, world.ball.y);

    timerEl.textContent = fmtTime((now - t0) / 1000);
    // Nur bei Änderung schreiben: erspart Layout-Arbeit pro Frame.
    const pingsTxt = '●'.repeat(pings) + '○'.repeat(Math.max(0, pingMax - pings));
    if (pingsEl.textContent !== pingsTxt) pingsEl.textContent = pingsTxt;
    const allGems = loaded!.floors.flatMap((f) => f.world.gems);
    const gemsTxt = allGems.length
      ? `💎 ${allGems.filter((g) => g.collected).length}/${allGems.length}`
      : '';
    if (gemsEl.textContent !== gemsTxt) gemsEl.textContent = gemsTxt;

    const fallen = frozen || disconnected ? null : world.fallenHole();
    const caught = fallen || frozen || disconnected ? null : world.guardCaught();
    const heard = fallen || caught || frozen || disconnected ? null : world.listenerCaught();
    if (heard) {
      // Horcher hat dich erwischt: zurück zum Checkpoint – und er kehrt heim,
      // damit der Respawn nicht sofort wieder in seinen Fängen landet.
      state = 'fell';
      falls++;
      heard.litFrom = 0;
      heard.litUntil = now + 1500;
      heard.x = heard.home.x;
      heard.y = heard.home.y;
      audio.caught();
      haptics.fall();
      statusEl.textContent = t('st.caught');
      setTimeout(respawn, 1300);
    } else if (fallen) {
      state = 'fell';
      falls++;
      fallen.litFrom = 0;
      fallen.litUntil = now + 1500;
      audio.fall();
      haptics.fall();
      statusEl.textContent = t('st.fell');
      setTimeout(respawn, 1300);
    } else if (caught) {
      state = 'fell';
      falls++;
      caught.litFrom = 0;
      caught.litUntil = now + 1500;
      audio.caught();
      haptics.fall();
      statusEl.textContent = t('st.caught');
      setTimeout(respawn, 1300);
    } else if (mp && !frozen && !disconnected && world.goalReached()) {
      mpLocalFinish(now);
    } else if (mp && disconnected) {
      const remaining = Math.max(0, 10 - (now - mp.disconnectedAt!) / 1000);
      statusEl.textContent = t('mp.lostCountdown', { n: remaining.toFixed(0) });
    } else if (frozen && state === 'playing') {
      statusEl.textContent = t(mp?.mode === 'coop' ? 'mp.frozenCoop' : 'mp.frozenRace');
    } else if (!mp && world.goalReached()) {
      state = 'won';
      revealUntil = now + 4000;
      const seconds = (now - t0) / 1000;
      audio.setRolling(0);
      audio.setWind(0, 0, 0);
      audio.setHoleRumble(0, 0, 0);
      audio.setGuard(0, 0, 0);
      audio.setRival(0, 0, 0);
      audio.setPortal(0, 0, 0);
      audio.setCurrent(0, 0, 0);
      audio.setListener(0, 0, 0, 0);
      audio.setIce(0);
      audio.setFog(0);
      audio.setAnchor(0, 0, 0);
      audio.win();
      haptics.win();
      statusEl.textContent = t('st.win', { time: fmtTime(seconds) });
      onWin(seconds);
    } else if (messageUntil > now) {
      statusEl.textContent = message;
    } else {
      const modeLabel = t(input.hasSensor ? 'hud.tilt' : 'hud.keys');
      statusEl.textContent = debug ? `Debug · ${modeLabel} · x ${tilt.x.toFixed(2)} y ${tilt.y.toFixed(2)}` : '';
    }
  }

  renderer.follow(world.ball.x, world.ball.y);
  const buddy =
    mp && (mp.phase === 'playing' || mp.phase === 'done')
      ? {
          x: mp.remote.x,
          y: mp.remote.y,
          sameFloor: mp.remote.floor === activeFloor,
          floorLabel: mp.remote.floor === activeFloor ? undefined : `E${mp.remote.floor + 1}`,
        }
      : null;
  // Geist-Replay: die Bestzeit rollt zeitsynchron mit (blasser Halo).
  const ghostPos = ghost && state === 'playing' ? sampleGhost(ghost, (now - t0) / 1000) : null;
  const ghostOpt = ghostPos ? { x: ghostPos.x, y: ghostPos.y, sameFloor: ghostPos.floor === activeFloor } : null;
  // Duell: Der Rivale ist zu HÖREN – Richtung und Nähe sagen alles, was man
  // im Rennen wissen muss (deshalb kein Zahlen-Delta im HUD).
  if (mode?.kind === 'duel') {
    if (ghostPos) {
      const rdx = ghostPos.x - world.ball.x;
      const rdy = ghostPos.y - world.ball.y;
      const near = Math.max(0, 1 - Math.hypot(rdx, rdy) / RIVAL_HEAR);
      audio.setRival(near, rdx, rdy, ghostPos.floor !== activeFloor);
      // Positionswechsel an der Ziel-Luftlinie gemessen: grob, aber für einen
      // Überhol-Jingle genau richtig – die Wahrheit sagt am Ende die Uhr.
      const goal = loaded!.goalPos;
      const ahead =
        Math.hypot(goal.x - world.ball.x, goal.y - world.ball.y) < Math.hypot(goal.x - ghostPos.x, goal.y - ghostPos.y);
      if (rivalAhead !== null && ahead !== rivalAhead) {
        audio.rivalPass(ahead);
        flash(t(ahead ? 'duel.passAhead' : 'duel.passBehind'), 1200);
      }
      rivalAhead = ahead;
    } else {
      audio.setRival(0, 0, 0);
    }
  }
  renderer.draw(world, { debug, revealAll: revealUntil > now, now, buddy, ghost: ghostOpt });
  // Testbarkeits-Hooks für E2E
  (window as unknown as { __tiltrBall?: { x: number; y: number } }).__tiltrBall = {
    x: world.ball.x,
    y: world.ball.y,
  };
  (window as unknown as { __tiltrWorld?: unknown }).__tiltrWorld = {
    crystals: world.crystals.length,
    anchors: world.anchors.length,
    glass: world.glass.length,
  };
  (window as unknown as { __tiltrGhost?: unknown }).__tiltrGhost = ghost
    ? { time: ghost.time, active: ghostPos !== null }
    : null;
  (window as unknown as { __tiltrMp?: unknown }).__tiltrMp = mp
    ? {
        phase: mp.phase,
        levelId: mp.level?.id ?? null,
        remote: { ...mp.remote },
        localFinished: mp.localFinished,
        localHolds: [...mp.localHolds],
        remoteHolds: [...mp.remoteHolds],
      }
    : null;
}

refreshMenu();
requestAnimationFrame(frame);
