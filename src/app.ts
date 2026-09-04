import './ui/theme.css';
import { applyBackup, backupFileName, collectBackup, decodeBackup, encodeBackup, summarizeBackup, type BackupPayload } from './backup';
import { saveTextFile } from './ui/download';
import { CELL } from './core/constants';
import { buddySound, smoothSpeed } from './core/buddy';
import { FEATURES, canDo, needsFor } from './core/features';
import { partnerWaiting, togetherWin } from './core/together';
import {
  centsToHz,
  guideCents,
  holdTuned,
  inTune,
  tuneAim,
  tuneStep,
  type Interval,
} from './core/resonance';
import { MARK_HEAR, applyPartnerMark, nearestMark, ownCount, toggleMark, type Mark } from './core/marks';
import { ABSORB_GAIN, shielded } from './core/occlusion';
import { collectOpeners, doorState } from './core/doors';
import { brittleBreakable } from './core/brittle';
import { randomSeed, seedFromString } from './core/rng';
import type { Hole, Jukebox, Plate, PlaylistEntry, WindZone } from './core/types';
import type { Ball } from './core/physics';
import { TiltInput } from './input/tilt';
import { GameAudio } from './audio/audio';
import { haptics } from './audio/haptics';
import { Renderer } from './render/renderer';
import { loadLevel, type LoadedLevel } from './levels/loader';
import { generateQuickLevel, type Preset } from './levels/quick';
import { TUTORIAL_LEVELS } from './levels/tutorial';
import { CAMPAIGN_LEVELS, CAMPAIGN_IDS, WORLDS } from './levels/campaign';
import { levelFeatures, newFeaturesIn } from './levels/firstAppearances';
import { starsFor, effectivePar } from './core/stars';
import { forkTone } from './core/fork';
import { mirrorReflection } from './core/occlusion';
import { World } from './core/physics';
import { galleryEntries } from './elements/registry';
import { generateDailyLevel, todayUTC } from './levels/daily';
import { t, applyI18n, setLang, currentLang, onLangChange, lvName, lvIntro, formatDate, type Lang, type Dict } from './i18n';
import { GhostRecorder, loadGhost, saveGhost, sampleGhost, type GhostData } from './ghost';
import { decodeDuel, duelUrl, validateGhostRun } from './levels/duel';
import { showSplash } from './ui/splash';
import { fixStandaloneViewport, viewportDiagnostics } from './ui/viewport';
import { COOP_LEVELS, RACE_LEVELS } from './levels/multiplayer';
import { generateMpLevel, parseMpQuickId } from './levels/mpQuick';
import { connect, makeRoomCode, type Transport } from './net/transport';
import { lobbyHint, relayHealth } from './net/health';
import {
  formatIceServers,
  hasTurn,
  iceHosts,
  iceVerdict,
  loadTurnText,
  parseIceServers,
  saveTurnText,
  turnServers,
  type IceReport,
} from './net/ice';
import { probeIce } from './net/iceProbe';
import { scanRoomCode } from './ui/scanner';
import { renderSVG } from 'uqr';
import { parseLevel, type LevelDef } from './levels/schema';
import { profile } from './profile';
import { setupUpdates } from './ui/update';
import { setupGallery, extraEntries } from './ui/gallery';
import { setupInstallHint, hideInstallHint } from './ui/install';
import { setupEditor, type RawLevel, type TestRun, type TestStart } from './ui/editor';
import { isShareable, validateLevel } from './levels/validate';
import { promoCaption, promoShare } from './promo';
import { setupWorkshopPanel } from './ui/workshopPanel';
import { setupHearingTest } from './ui/hearing';
import { setupWakeLock } from './ui/wakelock';
import { setupConfetti } from './ui/confetti';
import { fpInitial, fpStep } from './core/fp';
import { breathAt, breathOpenRemaining } from './core/breathing';
import { advance, compileTune, notesAt, type CompiledTune } from './audio/chiptune';
import { compiledById } from './music';
import { bundleProgress, bundles, importRaw, workshop } from './workshop';
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
const MUSIC_HEAR = CELL * 3.2; // Hörweite der Jukebox – weiter als alles andere
/** Lookahead des Musik-Schedulers: So weit im Voraus liegen Noten im
 *  Audio-Takt. 250 ms überbrücken jeden Frame-Ruckler; viel mehr würde einen
 *  Titelwechsel träge machen, weil er alles Eingeplante wegwirft. */
const MUSIC_LOOKAHEAD_S = 0.25;
/** Zwei Treffer in kurzer Folge sind EIN Rempler (Substeps, Nachfassen). */
const SKIP_DEBOUNCE_MS = 350;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const overlay = $('overlay');
const hud = $('hud');
const statusEl = $('status');
const timerEl = $('timer');
const pingsEl = $('pings');
const gemsEl = $('gems');
const waitChipEl = $('waitChip');
const quickBtn = $('quickBtn');
const tutorialBtn = $('tutorialBtn');
const calibrateBtn = $('calibrateBtn');
const debugBtn = $('debugBtn');
const homeBtn = $('homeBtn');
const swapBtn = $('swapBtn') as HTMLButtonElement;
const markBtn = $('markBtn') as HTMLButtonElement;
const interstitial = $('interstitial');
const interTitle = $('interTitle');
const interText = $('interText');
const interStars = $('interStars');
const interNew = $('interNew');
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
// Gespielt wird durch NEIGEN – ohne Bildschirmsperre dimmt Android mitten
// im Lauf. Die Sperre gilt, solange gespielt oder gehört wird.
const wake = setupWakeLock();
// Musik-Bus als Getter: Der E2E-Lauf liest ihn jederzeit frisch – auch OHNE
// geladenes Level (der Frame-Haken __tiltrJukebox friert im Menü ein, weil die
// Schleife dort früh aussteigt; „ist der Automat wirklich still?" muss aber
// gerade dann prüfbar sein).
Object.defineProperty(window, '__tiltrMusic', { get: () => audio.musicState(), configurable: true });
// Stimm-Modus (M91b): Wie weit die Welt zurückweicht, während man stimmt.
Object.defineProperty(window, '__tiltrDuck', { get: () => audio.worldDuckValue(), configurable: true });
// Konfetti zum Sieg – gefeiert wird in JEDEM Modus, Tutorial eingeschlossen.
const confetti = setupConfetti('confetti');

/** Ein geschaffter Lauf: Jubel-Klang plus Konfetti-Salve. Eine Stelle für
 *  alle Modi – Single-Player-Sieg (Quick, Daily, Kampagne, Tutorial, eigene
 *  Level, Duell) und der gewonnene Multiplayer. */
function celebrate(): void {
  audio.win();
  audio.confetti();
  haptics.win();
  confetti.burst();
}
// Hörtest: der echte Echo-Ping aus zufälliger Richtung, Antwort auf der
// Kompassrose – macht messbar, wie gut die HRTF-Ortung beim eigenen Gehör
// (und den eigenen Kopfhörern) trägt.
const hearingTest = setupHearingTest({ audio, onClose: () => showMenu() });
$('hearingBtn').addEventListener('click', () => {
  wake.want();
  hearingTest.open();
});

type GameState = 'menu' | 'playing' | 'fell' | 'warp' | 'won';
type Mode =
  | { kind: 'quick' }
  | { kind: 'tutorial'; index: number }
  | { kind: 'campaign'; index: number }
  | { kind: 'daily'; date: string; target?: number }
  | { kind: 'custom' }
  // Level-Bundle aus der Werkstatt (M40): wie eine Kampagne, Fortschritt im Profil.
  | { kind: 'bundle'; bundleId: string; index: number }
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
  /** Level aus der Werkstatt (M57): Der Host hängt die Def an `setup`, der
   *  Gast prüft sie und darf sie am Ende in seine Werkstatt übernehmen. */
  custom: boolean;
  phase: 'lobby' | 'intro' | 'playing' | 'done';
  selfReady: boolean;
  peerReady: boolean;
  rematchSelf: boolean;
  rematchPeer: boolean;
  /** Zuletzt gemeldeter Stand des Partners. `speed`/`lastAt` sind NICHT
   *  übertragen, sondern aus zwei Meldungen abgeleitet (M88). */
  remote: {
    x: number;
    y: number;
    floor: number;
    finished: boolean;
    elapsed: number | null;
    speed: number;
    lastAt: number;
    /** Gemeinsam ankommen (M90): wann er zuletzt „ich bin im Ziel" meldete
     *  (0 = nie oder gerade verlassen). */
    goalAt: number;
  };
  localFinished: boolean;
  localElapsed: number | null;
  localHolds: Set<string>;
  remoteHolds: Set<string>;
  /** Coop (M59): Zeitschalter, die wir dem Partner zuletzt gemeldet haben
   *  (Schlüssel `floor:index` → Zeitpunkt), damit ein gehaltener Schalter
   *  gedrosselt nachgemeldet wird statt in jedem Frame. */
  switchSyncAt: Map<string, number>;
  lastStateSent: number;
  disconnectedAt: number | null;
}
let mp: MpSession | null = null;

const TUT_IDS = TUTORIAL_LEVELS.map((l) => l.id);

let world: World | null = null;
/* First Person (M23): Heading + geglättete Drehrate des laufenden Levels.
   Respawn und Ebenenwechsel erhalten die Blickrichtung; ein neues Level
   startet nach Norden (Screen-oben), damit Richtungsbezüge in Intros beim
   Start stimmen. */
let fpState = fpInitial();
const fpOn = (): boolean => profile.controls === 'fp';
let loaded: LoadedLevel | null = null;
let activeFloor = 0;
let warpReady = true;
let state: GameState = 'menu';
let mode: Mode | null = null;
let currentDef: LevelDef | null = null;
let sensorsReady = false;
let debug = false;
/** Wurde die Debug-Ansicht dauerhaft freigeschaltet (5 Taps auf die Version)?
 *  In der Editor-Vorschau ist sie unabhängig davon immer da. */
let debugUnlocked = false;
let revealUntil = 0;
let maxDist = 1;
let respawnPoint = { floor: 0, x: 0, y: 0 };
// Dämmerung (M43): Zeitpunkt der ersten Wandberührung auf einer dusk-Ebene,
// null = das Licht brennt noch.
let duskStart: number | null = null;
const DUSK_MS = 2000;
// Aufleuchten (M43): Element-Typen, die dieses Level zum ersten Mal bringt,
// und bis wann sie leuchten. Lehr-Reihenfolge: Tutorial, dann Kampagne.
let spotTypes = new Set<string>();
let spotUntil = 0;
const SPOT_MS = 4000;
const TEACH_LEVELS = [...TUTORIAL_LEVELS, ...CAMPAIGN_LEVELS];
let t0 = 0;
let message = '';
let messageUntil = 0;
let pings = 0;
let pingMax = 3;
let pingsUsed = 0; // Blind-Stern: Kampagnen-Sieg ohne einen einzigen Ping
let falls = 0;
/** Sanduhr-Sekunden dieses Laufs (M45): verlängern die Par. */
let bonusS = 0;
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
/** ⚑ Editor-Vorschau ab einer anderen Stelle (Ebene + Zelle) statt am Start. */
let customFrom: TestStart | null = null;
/** Vorschau eines Zwei-Spieler-Entwurfs (M57): als welcher Spieler sie beginnt. */
let customPlayer: 1 | 2 = 1;

/* --- MP-Testmodus (M69) -----------------------------------------------------
   Editor-Vorschau eines Zwei-Spieler-Levels: BEIDE Welten sind geladen, EINE
   ist am Zug, die andere steht still (die Kugel ohne Schwung, ihre Welt läuft
   weiter). 👥 im HUD (oder Taste „p") wechselt. Damit prüft einer allein einen
   Coop-Plan: Platte halten, wechseln, durch die Tür. Der frühere Phantom-
   Partner („hält ALLE Platten") ist damit weg – es hält, wer wirklich drauf
   steht. Öffner gelten wie im echten Spiel: Platten für beide (die Nachricht
   'plate' kennt keinen Modus), Schlüssel und Zeitschalter nur im Coop (M59).
   Jede Seite hat ihre eigene Ebene, ihren Respawn und ihr Ping-Budget – wie
   zwei Geräte, nur abwechselnd. */
interface TestSide {
  loaded: LoadedLevel;
  /** Ebene, auf der diese Kugel steht (die Kugel ist über alle Ebenen EINE). */
  floor: number;
  respawn: { floor: number; x: number; y: number };
  pings: number;
  done: boolean;
  elapsed: number | null;
  /** DUETT (M91): letzter Ton dieser Seite in Cent (null = steht auf keinem
   *  Resonanzfeld). Er BLEIBT stehen, wenn die Seite ruht – die Kugel liegt in
   *  ihrer Schale, also klingt sie weiter; sonst wäre ein Duett im Editor
   *  überhaupt nicht spielbar (man stimmt A, wechselt, stimmt B). */
  tone: number | null;
}
let mpTest: { sides: [TestSide, TestSide]; active: 0 | 1; coop: boolean; held: Set<string> } | null = null;

/** Die ruhende Seite – im Testmodus immer die andere als `active`. */
function mpTestOther(): TestSide {
  return mpTest!.sides[mpTest!.active === 0 ? 1 : 0]!;
}

/** Für wen die Welt gebaut wird: Host = 1, Gast = 2; Editor-Vorschau wählt. */
function playerRole(): 1 | 2 {
  if (mp) return mp.host ? 1 : 2;
  if (mode?.kind === 'custom' && customFromEditor) return customPlayer;
  return 1;
}

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

// „Neu hier" (M43): Titel und Klang-Demo eines Merkmals aus der Galerie-
// Registry – dieselbe Signatur, die Galerie und Editor spielen. Die brüchige
// Wand hat keinen eigenen Eintrag, sie klingt wie die Wand mit Echo.
const galleryDemos = new Map([...galleryEntries(), ...extraEntries()].map((e) => [e.type, e.demoSound] as const));
function featureTitle(type: string): string {
  return t(`el.${type}.title` as keyof Dict);
}
function featureDemo(type: string): ((a: GameAudio) => void) | undefined {
  return galleryDemos.get(type === 'wallBrittle' ? 'wallEcho' : type) ?? undefined;
}
/** Sterne-Vorschau (M43): Par und die Bedingung des dritten Sterns. */
function starLine(def: LevelDef): string | undefined {
  if (def.parTimeS === undefined) return undefined;
  const gems = def.floors.reduce((n, f) => n + f.elements.filter((e) => e.type === 'gem').length, 0);
  return t('inter.stars', { par: def.parTimeS, third: gems > 0 ? t('inter.gems', { n: gems }) : t('inter.noFall') });
}

function showInterstitial(opts: {
  title: string;
  text: string;
  primary?: InterAction;
  secondary?: InterAction;
  /** Leise Zusatzaktion (Duell herausfordern/Revanche): Karte bleibt offen,
   *  man teilt den Link und entscheidet danach weiter. */
  extra?: InterAction;
  /** Sterne-Vorschau (M43): was der zweite und dritte Stern verlangen. */
  stars?: string;
  /** „Neu hier" (M43): Element-Typen, die dieses Level zum ersten Mal bringt –
   *  je ein Chip, Tap spielt die Galerie-Signatur. */
  news?: string[];
}): void {
  interTitle.textContent = opts.title;
  interText.textContent = opts.text;
  interStars.textContent = opts.stars ?? '';
  interStars.classList.toggle('hidden', !opts.stars);
  interNew.replaceChildren();
  for (const type of opts.news ?? []) {
    const chip = document.createElement('button');
    chip.className = 'btn chip';
    const demo = featureDemo(type);
    chip.textContent = `${t('inter.new')}: ${featureTitle(type)}${demo ? ' 🔊' : ''}`;
    if (demo) chip.addEventListener('click', () => void audio.start().then(() => demo(audio)));
    interNew.append(chip);
  }
  interNew.classList.toggle('hidden', !opts.news?.length);
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
    interText.innerHTML = `${t(fpOn() ? 'calib.textFp' : 'calib.text')}<br><br><span style="font-size:34px">${i}</span>`;
    await new Promise((r) => setTimeout(r, 1000));
  }
  hideInterstitial();
}

/* Die Haltungs-Ansage gehört zur STEUERUNG, nicht nur zum ersten Start:
   Draufsicht heißt „flach wie ein Tablett", First Person „~45° vor dir".
   Nach einem Moduswechsel läuft der Countdown deshalb einmal erneut. */
let calibratedFor: string | null = null;
async function ensureSensors(): Promise<void> {
  if (!sensorsReady) {
    await Promise.all([input.start(), audio.start()]);
    sensorsReady = true;
  } else {
    await audio.start();
  }
  if (calibratedFor !== profile.controls) {
    await calibrationCountdown();
    calibratedFor = profile.controls;
  }
}

/* --- Menü ----------------------------------------------------------------- */

const presetChips = [...document.querySelectorAll<HTMLButtonElement>('#presetRow .chip')];

function refreshMenu(): void {
  const { done, total } = profile.tutorialProgress(TUT_IDS.length);
  $('tutorialProgress').textContent = `(${done}/${total})`;
  // Neuen Spielenden den Einstieg zeigen: Tutorial-Karte hervorheben.
  tutorialBtn.classList.toggle('suggest', done === 0);
  $('tutorialSub').textContent = done === 0 ? t('menu.tutorial.new') : t('menu.tutorial.sub');
  // Aus den Daten, nicht aus dem Wörterbuch: „4 Welten, 28 Level" stand dort
  // noch, als es längst fünf und 36 waren (gefunden auf einem README-Screenshot).
  $('campaignSub').textContent = t('menu.campaign.sub', { worlds: WORLDS.length, levels: CAMPAIGN_LEVELS.length });
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
    const title = document.createElement('span');
    title.textContent = t(`world.w${wi + 1}` as keyof Dict);
    header.append(title);
    // Debug (5× Version): Welt als Bundle in die Werkstatt – zum Überarbeiten
    // der eingebauten Kampagne. Feste ID builtin-w<n>, App-Version als Version.
    const imp = document.createElement('button');
    imp.className = 'btn btn-ghost debug-only camp-import' + (debugUnlocked ? '' : ' hidden');
    imp.textContent = t('camp.toWorkshop');
    imp.addEventListener('click', () => {
      const b = bundles.importBuiltin(
        wi + 1,
        t(`world.w${wi + 1}` as keyof Dict),
        t('ws.bundle.builtinDesc', { world: t(`world.w${wi + 1}` as keyof Dict), version: __APP_VERSION__ }),
        world.levels,
        __APP_VERSION__,
      );
      // Kurze Rückmeldung (v3.0.2): Die Weltzeile ist eine Flex-Zeile neben dem
      // Titel – der lange Satz mit dem Bundle-Titel brach sie auf dem Phone.
      void b;
      imp.textContent = t('camp.imported');
      setTimeout(() => (imp.textContent = t('camp.toWorkshop')), 2500);
      workshopPanel.refresh();
      refreshMenu();
    });
    header.append(imp);
    campaignList.append(header);
    world.levels.forEach((def, local) => appendLevelItem(def, flat++, local + 1));
  });
  // Eigene Bundles: jedes wie eine Welt, Freischaltung folgt der Bestzeit des Vorgängers.
  const own = bundles.list();
  if (own.length) {
    const h = document.createElement('h3');
    h.className = 'world-header camp-bundles-head';
    h.textContent = t('camp.bundles');
    campaignList.append(h);
  }
  for (const b of own) {
    const header = document.createElement('h3');
    header.className = 'world-header camp-bundle';
    header.textContent = `${b.title || t('ed.untitled')}${b.levels.length ? '' : ` ${t('camp.bundleEmpty')}`}`;
    campaignList.append(header);
    const prog = bundleProgress(b, (id) => profile.bestFor(id));
    b.levels.forEach((lvl, i) => {
      // Zwei-Spieler-Level (M57): nie gesperrt, nie Teil der Reihe – der Tap
      // öffnet die Lobby mit diesem Level.
      const isMp = prog.skipped(i);
      const unlocked = isMp || UNLOCK_ALL || prog.unlocked(i);
      const item = document.createElement('button');
      item.className = 'panel level-item bundle-level' + (unlocked ? '' : ' locked');
      const name = document.createElement('span');
      name.textContent = `${i + 1}. ${unlocked ? String(lvl.def.name ?? lvl.id) : '???'}`;
      const meta = document.createElement('span');
      meta.className = 'level-meta';
      const best = profile.bestFor(lvl.id);
      meta.textContent = isMp ? t('ws.mpMeta') : unlocked ? (best !== null ? `✓ · ${fmtTime(best)}` : '') : '🔒';
      item.append(name, meta);
      if (isMp) {
        item.addEventListener('click', () => {
          campaignPanel.classList.add('hidden');
          try {
            mpOpenCustom(parseLevel(lvl.def));
          } catch {
            /* kaputtes Level: die Werkstatt zeigt ⚠ */
          }
        });
      } else if (unlocked) {
        item.addEventListener('click', () => {
          campaignPanel.classList.add('hidden');
          void startMode({ kind: 'bundle', bundleId: b.id, index: i });
        });
      }
      campaignList.append(item);
    });
  }
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

/** Alle STETIGEN Weltklänge auf null – EINE Stelle für Menü und jeden Sieg
 *  (Menü und mpCheckResult hatten je eine eigene Liste; im Solo-Sieg fehlten
 *  Schnarchen und Stimmgabel, die dann über die Ergebniskarte weiterliefen). */
function silenceWorld(): void {
  audio.setRolling(0);
  audio.setWind(0, 0, 0);
  audio.setHoleRumble(0, 0, 0);
  audio.setGuard(0, 0, 0);
  audio.setSnore(0, 0, 0);
  audio.setFork(0, 0);
  audio.setRival(0, 0, 0);
  audio.setBuddy(0, 0, 0, 0);
  audio.setPortal(0, 0, 0);
  audio.setCurrent(0, 0, 0);
  audio.setListener(0, 0, 0, 0);
  audio.setIce(0);
  audio.setFog(0);
  audio.setReverb(0);
  audio.setAnchor(0, 0, 0);
  audio.setResonance(null, null, 0, 0, 0);
}

function showMenu(): void {
  if (mp) {
    mp.transport.leave();
    mp = null;
  }
  state = 'menu';
  mode = null;
  mpTest = null;
  world = null;
  currentDef = null;
  silenceWorld();
  audio.setHeading(0);
  audio.stopMusic();
  confetti.clear();
  hideInterstitial();
  wake.release();
  hud.classList.add('hidden');
  swapBtn.classList.add('hidden');
  $('editBtn').classList.add('hidden');
  homeBtn.classList.remove('hidden');
  overlay.classList.remove('hidden');
  refreshMenu();
}

/** Level eines Bundles als LevelDef – null, wenn Bundle/Index fehlen oder
 *  die rohe Def nicht mehr parst (der Editor zeigt so etwas mit ⚠). */
function bundleDef(bundleId: string, index: number): LevelDef | null {
  const raw = bundles.get(bundleId)?.levels[index]?.def;
  if (!raw) return null;
  try {
    return parseLevel(raw);
  } catch {
    return null;
  }
}

async function startMode(m: Mode): Promise<void> {
  if (m.kind === 'bundle' && !bundleDef(m.bundleId, m.index)) {
    showMenu();
    return;
  }
  mode = m;
  wake.want();
  overlay.classList.add('hidden');
  hideInstallHint(); // im Spiel nicht im Weg stehen
  await ensureSensors();
  hud.classList.remove('hidden');
  beginLevel();
}

quickBtn.addEventListener('click', () => void startMode({ kind: 'quick' }));

/* --- Werkstatt: Bibliothek + Editor + Preview ------------------------------ */

// Rohe Def spielen: parseLevel validiert; fromEditor blendet den ✏️-Knopf ein.
function startCustom(raw: RawLevel, fromEditor: boolean, run: TestRun | null = null): void {
  try {
    customDef = parseLevel(raw);
  } catch {
    return; // Bibliothek zeigt kaputte Level mit ⚠, der Editor blockt Testen
  }
  customFromEditor = fromEditor;
  customFrom = fromEditor ? run?.from ?? null : null;
  customPlayer = fromEditor ? run?.player ?? 1 : 1;
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
  audio,
  onTest: (def, run) => startCustom(def, true, run),
  onSaved: () => {
    workshopPanel.refresh();
    refreshMenu();
  },
  onClose: () => workshopPanel.show(),
});
const workshopPanel = setupWorkshopPanel({
  onPlay: (def) => startCustom(def, false),
  onPlayMp: (def) => {
    try {
      mpOpenCustom(parseLevel(def));
    } catch {
      /* Bibliothek zeigt kaputte Level mit ⚠ */
    }
  },
  onPlayBundle: (bundleId, index) => void startMode({ kind: 'bundle', bundleId, index }),
  onEdit: (def) => editorApi.open(def),
  onChanged: refreshMenu,
});

// ✏️ im HUD: aus dem Preview zurück in den Editor (Entwurf bleibt erhalten).
$('editBtn').addEventListener('click', () => {
  if (!customFromEditor) return;
  showMenu();
  editorApi.reopen();
});
// Steuerungsmodus (M23): global wie die Sprache, darum im Menü-Footer.
// Der Wechsel wirkt ab dem nächsten Start – dort läuft dann auch der
// Kalibrier-Countdown mit der passenden Haltungs-Ansage erneut.
const ctlChips = [...document.querySelectorAll<HTMLButtonElement>('#controlsRow .chip')];

// --- Weitersagen (M85–M86b, src/promo.ts) --------------------------------
// EINE Nachricht, und zwar die, die ANKOMMT: Werbetext + Link.
//
// M86 hatte das GIF als Datei mitgeschickt (Bild + Bildunterschrift). AUF DEM
// GERÄT GEMESSEN kam davon nur das Bild an – der Text mit dem Link fiel weg,
// genau wie 2.11.4 es für Felder neben einer Datei beschreibt. Ein Promo ohne
// Link ist wertlos, also gewinnt der Link: `title`/`text`/`url` gehen raus, und
// die Animation reist in der Vorschau (og:image zeigt auf promo.gif, dessen
// ERSTES Bild deshalb das Schaubild ist – tools/promo.mjs setzt es davor).
// Ohne Web Share landet alles in der Zwischenablage.
{
  const status = $('promoStatus');
  const say = (text: string): void => {
    status.textContent = text;
    setTimeout(() => (status.textContent === text ? (status.textContent = '') : undefined), 4000);
  };
  $('promoShare').addEventListener('click', () => {
    void (async () => {
      const share = promoShare(t('promo.title'), t('promo.text'));
      try {
        if (typeof navigator.share === 'function') {
          await navigator.share(share);
          return;
        }
        await navigator.clipboard.writeText(promoCaption(share));
        say(t('promo.copied'));
      } catch {
        /* abgebrochen – der Nutzer weiß es, keine Meldung */
      }
    })();
  });
}

// --- Backup & Restore (src/backup.ts) -------------------------------------
// Sichern: Datei per Web Share (iOS: „In Dateien sichern") oder Download.
// Wiederherstellen: Datei wählen → Zusammenfassung → ZWEITER Tap ersetzt den
// Stand → Reload, damit Profil und Werkstatt ihre Daten neu lesen.
{
  const status = $('backupStatus');
  const fileInput = $<HTMLInputElement>('backupFile');
  const loadBtn = $<HTMLButtonElement>('backupLoad');
  let pending: BackupPayload | null = null;
  let armTimer: ReturnType<typeof setTimeout> | null = null;
  const disarm = (): void => {
    pending = null;
    loadBtn.textContent = t('bk.load');
    loadBtn.classList.remove('warn');
    if (armTimer) clearTimeout(armTimer);
    armTimer = null;
  };
  $('backupSave').addEventListener('click', () => {
    void (async () => {
      const at = new Date().toISOString();
      const payload = collectBackup(localStorage, __APP_VERSION__, at);
      const text = await encodeBackup(payload);
      const how = await saveTextFile(backupFileName(at), text, 'file');
      status.textContent = t(how === 'share' ? 'bk.shared' : 'bk.saved', { n: Object.keys(payload.data).length, kb: Math.max(1, Math.round(text.length / 1024)) });
    })();
  });
  loadBtn.addEventListener('click', () => {
    if (!pending) {
      fileInput.click();
      return;
    }
    // Zweiter Tap: ersetzen und neu laden.
    const r = applyBackup(localStorage, pending);
    status.textContent = t('bk.restored', { n: r.restored });
    disarm();
    setTimeout(() => location.reload(), 300);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    void (async () => {
      try {
        const payload = await decodeBackup(await file.text());
        const sum = summarizeBackup(payload);
        pending = payload;
        status.textContent = t('bk.summary', {
          date: payload.at ? new Date(payload.at).toLocaleDateString() : '?',
          levels: sum.levels,
          best: sum.best,
          ghosts: sum.ghosts,
        });
        loadBtn.textContent = `⚠ ${t('bk.confirm')}`;
        loadBtn.classList.add('warn');
        armTimer = setTimeout(() => {
          disarm();
          status.textContent = '';
        }, 8000);
      } catch (e) {
        disarm();
        status.textContent = t('bk.bad', { why: e instanceof Error ? e.message : String(e) });
      }
    })();
  });
}
function refreshCtl(): void {
  for (const chip of ctlChips) chip.classList.toggle('active', chip.dataset.ctl === profile.controls);
}
for (const chip of ctlChips) {
  chip.addEventListener('click', () => {
    profile.controls = chip.dataset.ctl === 'fp' ? 'fp' : 'top';
    refreshCtl();
  });
}
refreshCtl();

// Zugänglichkeit (M43): Tutorial hell spielen – nur das Tutorial.
const tutBrightBtn = $('tutBrightBtn');
const refreshTutBright = (): void => {
  tutBrightBtn.classList.toggle('active', profile.tutorialBright);
};
tutBrightBtn.addEventListener('click', () => {
  profile.tutorialBright = !profile.tutorialBright;
  refreshTutBright();
});
refreshTutBright();

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

/**
 * Sichtbarkeit des 👁-Knopfs. Im SPIEL ist die Debug-Ansicht versteckt
 * (5 Taps auf die Versionsnummer schalten sie frei) – in der
 * EDITOR-VORSCHAU gehört sie IMMER dazu: Dort testet man den eigenen
 * Entwurf, und wer bauen will, muss sehen dürfen, was er gebaut hat.
 *
 * Aufgerufen wird sie bei JEDEM Levelstart – und nur dort, denn nur dort kann
 * sie etwas bewirken: Beim Verlassen der Vorschau geht der Knopf damit wieder
 * weg UND die Ansicht aus. Sonst nähme man ein aufgedecktes Labyrinth in den
 * nächsten Lauf mit und könnte es ohne Knopf nicht mehr abschalten.
 * (Ein zusätzlicher Aufruf in showMenu() stand hier zuerst – der
 * Sabotage-Lauf zeigte, dass ihn niemand bemerkt: Im Menü ist das HUD
 * versteckt, und gezeichnet wird dort nichts mehr.)
 */
function updateDebugButton(editorPreview: boolean): void {
  const visible = editorPreview || debugUnlocked;
  debugBtn.classList.toggle('hidden', !visible);
  if (!visible) debug = false;
}

// Debug-Ansicht ist versteckt: 5 Taps auf die Versionsnummer schalten sie
// frei – samt Viewport-Diagnose (Geräte-Wahrheit für Safe-Area-Fragen).
let versionTaps = 0;
$('version').addEventListener('click', () => {
  if (debugUnlocked) return;
  if (++versionTaps < 5) return;
  debugUnlocked = true;
  debugBtn.classList.remove('hidden');
  for (const el of document.querySelectorAll('.debug-only')) el.classList.remove('hidden');
  $('version').textContent += ' · 🔧';
  const diag = document.createElement('p');
  diag.id = 'diag';
  diag.className = 'menu-meta';
  $('menuFooter').append(diag);
  // Sensor-Diagnose (v3.0.4): Der 5. Tap ist eine Geste – der Sensor darf
  // starten, damit die Zeile schon im Menü lebt (iOS fragt hier nach).
  void input.start();
  const update = (): void => {
    diag.textContent = `${viewportDiagnostics()}\n${input.diagnostics()}`;
  };
  update();
  setInterval(update, 250);
});
// ?debug in der URL: dieselbe Freischaltung ohne fünf Taps – für Sensor-
// Diagnosen auf fremden Geräten (Screenshot der Menü-Zeile genügt).
if (new URLSearchParams(location.search).has('debug')) {
  versionTaps = 4;
  $('version').click();
}
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
          : mode.kind === 'bundle'
            ? bundleDef(mode.bundleId, mode.index)!
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
          : mode.kind === 'bundle'
            ? `${bundles.get(mode.bundleId)?.title ?? ''} · ${t('common.level')} ${mode.index + 1} · ${lvName(def)}`
            : lvName(def);
    const targetLine =
      mode.kind === 'daily' && mode.target !== undefined
        ? `\n\n${t('daily.targetLine', { time: fmtTime(mode.target) })}`
        : mode.kind === 'duel'
          ? `\n\n${t('daily.targetLine', { time: fmtTime(mode.time) })}`
          : '';
    const teaching = mode.kind === 'tutorial' || mode.kind === 'campaign';
    showInterstitial({
      title,
      text: intro + targetLine,
      stars: mode.kind === 'campaign' ? starLine(def) : undefined,
      news: teaching ? newFeaturesIn(TEACH_LEVELS, def.id) : undefined,
      primary: { label: t('common.go'), onClick: () => launch(def) },
      secondary: { label: t('common.menu'), onClick: showMenu },
    });
  } else {
    launch(def);
  }
}

/** Licht auf der aktiven Ebene, 0–1: helle Ebene (floor.bright), die
 *  Tutorial-Option „hell" oder Dämmerung (floor.dusk) – die blendet nach der
 *  ersten Wandberührung über DUSK_MS aus. */
function lightGain(now: number): number {
  const floor = loaded?.floors[activeFloor];
  if (!floor) return 0;
  if (floor.bright) return 1;
  if (mode?.kind === 'tutorial' && profile.tutorialBright) return 1;
  if (floor.dusk) return duskStart === null ? 1 : Math.max(0, 1 - (now - duskStart) / DUSK_MS);
  return 0;
}
function bright(): boolean {
  return lightGain(performance.now()) > 0;
}
/** Renderer-Optionen für Licht und Aufleuchten (M43) – an EINER Stelle für
 *  beide draw()-Aufrufe. Der Ping deckt voll auf, das Licht mit seinem Gain;
 *  das Aufleuchten pulst und blendet in den letzten 800 ms aus. */
function lightOpts(now: number): {
  revealAll: boolean;
  revealGain: number;
  spotlight: { types: ReadonlySet<string>; gain: number } | null;
} {
  const light = lightGain(now);
  const pinged = revealUntil > now;
  const left = spotUntil - now;
  const spotlight =
    left > 0 && spotTypes.size > 0 ? { types: spotTypes, gain: (0.6 + 0.4 * Math.sin(now / 110)) * Math.min(1, left / 800) } : null;
  return { revealAll: pinged || light > 0, revealGain: pinged ? 1 : light, spotlight };
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
  loaded = loadLevel(def, { player: playerRole() });
  // MP-Testmodus (M69): Die Vorschau eines Zwei-Spieler-Entwurfs lädt die
  // Welt des ANDEREN gleich mit – er ist kein Phantom, sondern eine Kugel,
  // die wartet, wo man sie stehen lässt.
  mpTest = null;
  if (mode?.kind === 'custom' && customFromEditor && def.players === 2) {
    const mine = loaded;
    const theirs = loadLevel(def, { player: customPlayer === 1 ? 2 : 1 });
    const side = (l: LoadedLevel): TestSide => ({
      loaded: l,
      floor: 0,
      respawn: { floor: 0, x: l.world.ball.x, y: l.world.ball.y },
      pings: l.pingBudget,
      done: false,
      elapsed: null,
      tone: null,
    });
    // 'any' testet als Coop: Der Modus steht erst in der Lobby fest, und die
    // schwerere Frage ist immer „geht es zusammen?".
    mpTest = {
      sides: customPlayer === 1 ? [side(mine), side(theirs)] : [side(theirs), side(mine)],
      active: customPlayer === 1 ? 0 : 1,
      coop: def.mpMode !== 'race',
      held: new Set(),
    };
  }
  // Geist-Replay: nur in Quick/Daily/Kampagne (nicht Tutorial, nicht MP) –
  // die Level-ID trägt bei Quick den Seed, der Geist erscheint also nur auf
  // exakt demselben Level.
  const ghostable =
    mode !== null &&
    (mode.kind === 'quick' ||
      mode.kind === 'daily' ||
      mode.kind === 'campaign' ||
      mode.kind === 'custom' ||
      mode.kind === 'bundle' ||
      mode.kind === 'duel');
  // Im Duell IST der Geist der Rivale aus dem Link – nicht die eigene
  // Bestzeit. Aufgezeichnet wird trotzdem: daraus wird die Revanche.
  // Im MP-Testmodus gibt es keinen Geist: Eine Spur, die zwischen zwei Kugeln
  // springt, wäre keine Bestzeit, sondern ein Rätsel.
  ghost = mpTest ? null : mode?.kind === 'duel' ? mode.ghost : ghostable ? loadGhost(def.id) : null;
  ghostRecorder = ghostable && !mpTest ? new GhostRecorder() : null;
  rivalAhead = null;
  audio.setRival(0, 0, 0);
  audio.setBuddy(0, 0, 0, 0);
  marks = []; // Wegmarken (M89) gehören dem LAUF, nicht dem Level
  // Duett (M91): Töne und Halte-Uhr gehören ebenfalls dem LAUF.
  duet = DUET_NONE;
  duetTone = null;
  duetSince = null;
  duetPartnerTone = null;
  duetPartnerAt = 0;
  pingMax = loaded.pingBudget;
  pings = pingMax;
  pingsUsed = 0;
  falls = 0;
  bonusS = 0;
  warpReady = true;
  activateFloor(0);
  // ⚑ Editor-Vorschau ab gewählter Stelle: Ebene wechseln und die (EINE,
  // geteilte) Kugel dort absetzen – so testet man eine kritische Passage,
  // ohne jedes Mal vom Start zu rollen. Der Respawn liegt ebenfalls dort.
  const editorPreviewFrom = mode?.kind === 'custom' && customFromEditor ? customFrom : null;
  if (editorPreviewFrom && editorPreviewFrom.floor < loaded.floors.length) {
    activateFloor(editorPreviewFrom.floor);
    const ball = loaded.floors[editorPreviewFrom.floor]!.world.ball;
    ball.x = (editorPreviewFrom.cell[0] + 0.5) * CELL;
    ball.y = (editorPreviewFrom.cell[1] + 0.5) * CELL;
    ball.vx = 0;
    ball.vy = 0;
    renderer.follow(ball.x, ball.y, true);
  }
  respawnPoint = { floor: activeFloor, x: loaded.world.ball.x, y: loaded.world.ball.y };
  // Jede Seite merkt sich ihren eigenen Respawn – der ⚑-Teststart gilt für
  // die Seite, die beginnt (sie steht ja dort).
  if (mpTest) {
    for (const s of mpTest.sides) s.respawn = { floor: 0, x: s.loaded.world.ball.x, y: s.loaded.world.ball.y };
    mpTest.sides[mpTest.active]!.respawn = respawnPoint;
    mpTest.sides[mpTest.active]!.floor = activeFloor;
  }
  duskStart = null;
  // Aufleuchten (M43): Nur Tutorial und Kampagne lehren – dort leuchtet, was
  // das Level neu bringt, und die erste Signatur spielt einmal.
  const teaching = mode?.kind === 'tutorial' || mode?.kind === 'campaign';
  spotTypes = new Set(teaching ? newFeaturesIn(TEACH_LEVELS, def.id) : []);
  spotUntil = spotTypes.size > 0 ? performance.now() + SPOT_MS : 0;
  const firstNew = [...spotTypes][0];
  const demo = firstNew !== undefined ? featureDemo(firstNew) : undefined;
  if (demo) void audio.start().then(() => demo(audio));
  // Bundle: „weiter, wo ich aufgehört habe" – der Stand ist der zuletzt GESTARTETE Level.
  if (mode?.kind === 'bundle') profile.setBundlePos(mode.bundleId, mode.index);
  t0 = performance.now();
  state = 'playing';
  revealUntil = 0;
  statusEl.textContent = '';
  // Editor-Preview: der EINZIGE Weg hinaus führt zurück in den Editor –
  // ✏️ ersetzt 🏠, damit niemand versehentlich im Hauptmenü landet
  // (der ungespeicherte Entwurf lebt nur im Editor).
  const editorPreview = mode?.kind === 'custom' && customFromEditor;
  $('editBtn').classList.toggle('hidden', !editorPreview);
  updateDebugButton(editorPreview);
  homeBtn.classList.toggle('hidden', editorPreview);
  swapBtn.classList.toggle('hidden', mpTest === null);
  updateSwapChip();
  updateMarkChip();
  if (mode?.kind === 'daily' && mode.target !== undefined) flash(t('daily.targetFlash', { time: fmtTime(mode.target) }), 4000);
  if (mpTest) flash(t('st.mpTestStart', { n: mpTest.active + 1 }), 3000);
  input.calibrate();
  fpState = fpInitial();
  renderer.setFpView(fpOn());
  audio.setHeading(0);
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
    // Landeplatz = Respawn (M43): Ein Sturz auf der neuen Ebene führt hierher
    // zurück, nicht auf die Ebene des letzten Checkpoints – sonst wäre jeder
    // Fehler auf Ebene 3 eine Wiederholung von Ebene 1 samt Transporterfahrt.
    respawnPoint = { floor: targetFloor, x: tx, y: ty };
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
    const stars = starsFor({ seconds, parS: def.parTimeS, bonusS, gemsTotal, gemsGot, falls });
    profile.submitStars(def.id, stars);
    // Blind-Stern 🌑: der optionale vierte Stern – ohne einen einzigen Ping.
    if (pingsUsed === 0) profile.markBlind(def.id);
    const isRecord = profile.submitTime(def.id, seconds);
    const hasNext = index + 1 < CAMPAIGN_LEVELS.length;
    const lines = [
      `${t('res.time', { time: fmtTime(seconds) })}${
        def.parTimeS ? (bonusS > 0 ? t('res.parBonus', { n: effectivePar(def.parTimeS, bonusS)!, bonus: bonusS }) : t('res.par', { n: def.parTimeS })) : ''
      }${isRecord ? t('res.newBest') : ''}`,
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
  } else if (mode.kind === 'bundle') {
    const { bundleId, index } = mode;
    const isRecord = profile.submitTime(def.id, seconds);
    const bundle = bundles.get(bundleId);
    const hasNext = !!bundle && index + 1 < bundle.levels.length;
    setTimeout(() => {
      showInterstitial({
        title: hasNext ? t('res.winTitle', { time: fmtTime(seconds) }) : `${t('res.bundleDone')} ${fmtTime(seconds)}`,
        text: isRecord ? t('res.newBestLine') : bundle ? `${bundle.title} · ${index + 1}/${bundle.levels.length}` : '',
        extra: challengeAction(def, seconds, t('duel.challenge')),
        primary: hasNext
          ? {
              label: t('common.next'),
              onClick: () => {
                mode = { kind: 'bundle', bundleId, index: index + 1 };
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
    h.openness = h.breathing ? breathAt(h.breathing, nowMs / 1000).openness : 1;
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
    const phase = breathAt(c, nowMs / 1000);
    sl.openness = phase.openness;
    const state = phase.state;
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
      const remaining = breathOpenRemaining(c, nowMs / 1000);
      if (remaining < 1.3 && (sl.nextTick === undefined || nowMs >= sl.nextTick)) {
        audio.slideTick(dx, dy);
        sl.nextTick = nowMs + 130 + remaining * 220;
      }
    }
  }
}

/* --- Jukebox (M27) ---------------------------------------------------------
   Der Automat spielt Noten, keine Datei: Pro Frame wird ein Fenster von
   MUSIC_LOOKAHEAD_S in den AUDIO-Takt gelegt (nicht in performance.now – die
   beiden driften, und nach Wanduhr gesetzte Noten eiern hörbar). */

/** Übersetzte EINGEBETTETE Titel. WeakMap, nicht Map: Ein eingebetteter Titel
 *  ist bei jedem Levelladen ein NEUES Objekt – eine Map hielte alle je
 *  geladenen für immer fest. Titel aus dem Ordner cacht die Registry selbst.
 *  `null` = unlesbar/unbekannt (dann bleibt der Automat stumm; der
 *  'jukebox'-Beweis in validate.ts sagt es im Editor). */
const embeddedTunes = new WeakMap<object, CompiledTune | null>();
function tuneOf(entry: PlaylistEntry | undefined): CompiledTune | null {
  if (entry === undefined) return null;
  if (typeof entry === 'string') return compiledById(entry) ?? null;
  const hit = embeddedTunes.get(entry);
  if (hit !== undefined) return hit;
  let compiled: CompiledTune | null = null;
  try {
    compiled = compileTune(entry);
  } catch {
    compiled = null;
  }
  embeddedTunes.set(entry, compiled);
  return compiled;
}

/** Titel zurückspulen (Titelwechsel, Levelstart, Rückkehr aus dem Hintergrund). */
function rewindJukebox(j: Jukebox): void {
  j.epoch = null;
  j.scheduledS = 0;
  j.bpm = undefined;
}

function updateJukeboxes(nowMs: number): void {
  if (!world || !world.jukeboxes.length) return;
  const b = world.ball;
  // ES SPIELT DER NÄCHSTE. Der Musik-Bus ist EINER, und das ist Absicht: Zwei
  // Automaten gleichzeitig wären Krach ohne Richtung – und die Richtung ist
  // hier der Sinn (ein Wahrzeichen, an dem man sich orientiert). Dasselbe
  // Muster wie beim Loch-Grollen und beim Wächter: Es klingt, was zählt.
  let nearest: Jukebox | null = null;
  let nearestD = Infinity;
  for (const j of world.jukeboxes) {
    const d = Math.hypot(j.x - b.x, j.y - b.y);
    if (d < nearestD) {
      nearestD = d;
      nearest = j;
    }
  }
  for (const j of world.jukeboxes) if (j !== nearest) rewindJukebox(j);
  if (!nearest) return;

  const closeness = Math.max(0, 1 - nearestD / MUSIC_HEAR) * nearest.volume;
  const tune = tuneOf(nearest.playlist[nearest.index]);
  const playing = state === 'playing' && audio.running && tune !== null && closeness > 0.02;
  audio.setMusic(playing ? closeness * shield(nearest.x - b.x, nearest.y - b.y) : 0, nearest.x - b.x, nearest.y - b.y);
  if (!playing || !tune) {
    nearest.bpm = undefined;
    return;
  }
  nearest.bpm = tune.bpm;

  const now = audio.now();
  if (nearest.epoch === null) {
    nearest.epoch = now + 0.06;
    nearest.scheduledS = 0;
  }
  // Zurückgekommener Hintergrund-Tab: Wir sind Sekunden hinterher. NICHT
  // nachplanen – das wären hunderte Noten auf einen Schlag, alle in der
  // Vergangenheit und damit auf `now` geklemmt. Stattdessen neu ansetzen.
  if (now - nearest.epoch - nearest.scheduledS > 1) {
    nearest.epoch = now + 0.06;
    nearest.scheduledS = 0;
  }
  const until = now + MUSIC_LOOKAHEAD_S - nearest.epoch;
  if (until > nearest.scheduledS) {
    for (const n of notesAt(tune, nearest.scheduledS, until)) {
      audio.musicNote(n.voice, n.freq, nearest.epoch + n.atS, n.durS, n.gain * nearest.volume);
    }
    nearest.scheduledS = until;
  }
  // Ein Titel ohne Loop ist irgendwann durch – dann legt der Automat von
  // selbst den nächsten auf (das tut eine Jukebox). Eine halbe Sekunde
  // Nachklang, damit der Titelwechsel nicht die letzte Note abschneidet.
  if (!tune.loop && nearest.scheduledS > tune.durationS + 0.5) skipJukebox(nearest, 0, nowMs, true);
}

/** Anrempeln: nächster Titel. Der Plattenkratzer ist kein Schmuck – er sagt
 *  „ich habe verstanden", noch bevor der neue Titel einsetzt. */
function skipJukebox(j: Jukebox, hard01: number, nowMs: number, auto = false): void {
  if (!world) return;
  if (j.lastSkip !== undefined && nowMs - j.lastSkip < SKIP_DEBOUNCE_MS) return;
  j.lastSkip = nowMs;
  audio.stopMusic();
  // Kein Kratzer, wenn der Automat von selbst weiterlegt – niemand hat ihn
  // angestoßen. Der Titelname erscheint trotzdem: Er ist die Information.
  if (!auto) audio.scratch(hard01, j.x - world.ball.x, j.y - world.ball.y);
  j.index = advance(j.playlist, j.index);
  rewindJukebox(j);
  const next = tuneOf(j.playlist[j.index]);
  if (next) flash(`♫ ${next.title}`);
}

/** Abschirmung einer Klangquelle im Versatz (dx,dy) vom Ball: 1 = frei,
 *  ABSORB_GAIN = eine Schallschutzwand steht dazwischen (core/occlusion.ts).
 *  Stetige Quellen skalieren ihre Nähe damit, der Beacon nimmt den
 *  „muffled"-Zweig, der Schlüssel klingt entsprechend weiter weg. */
function shield(dx: number, dy: number): number {
  if (!world) return 1;
  const b = world.ball;
  return shielded(world.walls, b.x, b.y, b.x + dx, b.y + dy) ? ABSORB_GAIN : 1;
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
    // Schallschutzwand: die Wellenfront deckt sie auf (Licht), aber sie
    // antwortet NICHT – ein stilles Stück Richtung ist ihr Signal.
    if (w.absorb) continue;
    // Echo-Spiegel (M45): antwortet vom GESPIEGELTEN Punkt, metallisch.
    if (w.mirror) {
      const m = mirrorReflection(cx - b.x, cy - b.y, dist);
      reflections.push({ ...m, freq: 1800 });
      continue;
    }
    // Schiebewände antworten tiefer, steinerner als normale Wände; der
    // Jukebox-Kasten hohl-hölzern dazwischen (er IST ein Möbel).
    reflections.push({
      dx: cx - b.x,
      dy: cy - b.y,
      dist,
      freq: w.jukebox !== undefined ? 620 : w.slide ? 500 : 950,
    });
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
  // Stimmgabel antwortet als reiner Ton (880), das Klimpern hell (1650).
  for (const key of world.keys) if (!key.collected) reveal(key, key.voice === 'fork' ? 880 : 1650);
  // Sanduhr (M45): feines Rieseln als Doppel-Blip.
  for (const hg of world.hourglasses) if (!hg.collected) reveal(hg, 1480, true);
  // Lockglocke (M46): kurzer Glockenblip.
  for (const bl of world.bells) reveal(bl, 2400);
  // Rollstein (M47): antwortet steinern-tief, wie eine Wand mit Gewicht.
  for (const st of world.boulders) if (!st.sunk) reveal(st, 420);
  for (const gem of world.gems) if (!gem.collected) reveal(gem, 2093, true);
  for (const g of world.guards) reveal(g, 240);
  // Schläfer (M45): der Ping weckt, wer in Hörweite schläft – mit Zischen.
  for (const g of world.wakeSleepers(b.x, b.y)) {
    audio.sleeperWake(g.x - b.x, g.y - b.y);
    flash(t('st.sleeperWake'));
  }
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
  // „p" wie player: Spieler wechseln im MP-Testmodus (Desktop-Testen).
  if ((e.key === 'p' || e.key === 'P') && !e.repeat) mpTestSwap();
  // „m" wie Marke: Wegmarke legen/aufnehmen (Desktop-Testen).
  if ((e.key === 'm' || e.key === 'M') && !e.repeat) placeMark();
});
swapBtn.addEventListener('click', mpTestSwap);
markBtn.addEventListener('click', placeMark);

/* --- Wegmarken (M89) -------------------------------------------------------
   Klangbojen, die BEIDE Spieler hören: Der Sehende auf der hellen Ebene
   markiert dem Blinden den Weg um die Löcher, und man kann sich an einer
   Marke verabreden. Der Vorrat steht im LEVEL (`marks`), gilt je Spieler und
   lebt nur im Lauf – nichts davon wird gespeichert oder geteilt.
   NUR im echten Netz: Im MP-Testmodus wäre „meine" und „seine" Boje dieselbe
   Hand, und im Solo hört sie niemand außer dir. */
let marks: Mark[] = [];
const markMax = (): number => (mp && mp.phase === 'playing' ? (loaded?.def.marks ?? 0) : 0);

function updateMarkChip(): void {
  const max = markMax();
  markBtn.classList.toggle('hidden', max === 0 || state !== 'playing');
  markBtn.textContent = `\u{1F4CD}${max - ownCount(marks)}`;
}

function placeMark(): void {
  if (!world || !loaded || state !== 'playing') return;
  const max = markMax();
  if (max === 0) return;
  const r = toggleMark(marks, activeFloor, world.ball.x, world.ball.y, max);
  if (r.action === 'full') {
    flash(t('hud.markEmpty'));
    return;
  }
  marks = r.list;
  updateMarkChip();
  audio.markSet(r.action === 'placed');
  haptics.checkpoint();
  flash(t(r.action === 'placed' ? 'st.markSet' : 'st.markTook'));
  mp?.transport.send('mark', { f: activeFloor, x: r.spot.x, y: r.spot.y, on: r.action === 'placed' });
}

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
    // Ein DIAGNOSE-Link (M80) trägt ein Level mit roten Badges: Das Angebot
    // sagt es, sonst wäre „Ausprobieren" ein Versprechen, das das Level nicht
    // hält. Geteilt wird so etwas absichtlich – zum Anschauen.
    const diag = !isShareable(validateLevel(raw));
    showInterstitial({
      title: t('share.title'),
      text: t('share.text', { name: def.name }) + (diag ? `\n\n${t('share.diag')}` : ''),
      primary: { label: t('share.try'), onClick: () => startCustom(raw as never, false) },
      secondary: {
        label: t('share.keep'),
        onClick: () => {
          // Ziel-Bundle wählt der Nutzer im Import-Feld (M40) – die Def
          // steht dort vorbelegt, IDs vergibt importRaw beim Übernehmen.
          workshopPanel.showImport(JSON.stringify(raw));
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
// Der AUFRUF steht weiter unten, HINTER dem Multiplayer-Block: Der #join=-Pfad
// greift auf mpPanel/mpCodeInput/mpJoin zu, und module-level `const`/`let`
// sind vor ihrer Zeile in der TDZ. Bis 3.0.7 stand der Aufruf hier – ein
// gescannter QR-Code beim Kaltstart warf „Cannot access … before
// initialization", die App blieb schwarz (E2E Lauf 33 fährt den Link).

/* --- Multiplayer ------------------------------------------------------------ */

const mpPanel = $('mp');
const mpChoose = $('mpChoose');
const mpLobby = $('mpLobby');
const mpLevelList = $('mpLevelList');
const mpCodeInput = $<HTMLInputElement>('mpCodeInput');
let mpModeSel: MpMode = 'coop';
/** Eigenes Level aus der Werkstatt (M57), in der Lobby vorgewählt. */
let mpCustomLevel: LevelDef | null = null;

const mpModeHint = (m: MpMode): string => t(m === 'coop' ? 'mp.hint.coop' : 'mp.hint.race');

/** Zwei-Spieler-Level aus der Werkstatt in die Lobby heben: Der Modus folgt
 *  dem Level (fest oder frei), das Level steht als erste Karte. */
function mpOpenCustom(def: LevelDef): void {
  mpCustomLevel = def;
  if (def.mpMode !== 'any') mpModeSel = def.mpMode;
  $('workshop').classList.add('hidden');
  refreshMpPanel();
  mpPanel.classList.remove('hidden');
}

function refreshMpPanel(): void {
  mpChoose.classList.remove('hidden');
  mpLobby.classList.add('hidden');
  mpHideLobby();
  const fixedMode = mpCustomLevel && mpCustomLevel.mpMode !== 'any' ? mpCustomLevel.mpMode : null;
  if (fixedMode) mpModeSel = fixedMode;
  $('mpModeHint').textContent = `${mpModeHint(mpModeSel)}${fixedMode ? ` ${t('mp.modeFixed')}` : ''}`;
  for (const chip of document.querySelectorAll<HTMLButtonElement>('#mpModeRow .chip')) {
    chip.classList.toggle('active', chip.dataset.mpmode === mpModeSel);
    chip.disabled = fixedMode !== null && chip.dataset.mpmode !== fixedMode;
  }
  mpLevelList.replaceChildren();
  if (mpCustomLevel) {
    const def = mpCustomLevel;
    const item = document.createElement('button');
    item.id = 'mpCustomItem';
    item.className = 'panel level-item';
    const name = document.createElement('span');
    name.textContent = `${t('mp.custom')} · ${lvName(def)}`;
    const meta = document.createElement('span');
    meta.className = 'level-meta';
    const [c, r] = def.floors[0]!.size;
    meta.textContent = `${t('ws.mpMeta')} · ${c}×${r}`;
    item.append(name, meta);
    item.addEventListener('click', () => void mpHost(def, true));
    mpLevelList.append(item);
  }
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

/* --- Lobby-Diagnose (M70) ---------------------------------------------------
   „Sie finden sich manchmal nicht" war bis jetzt nicht zu unterscheiden von
   „kein Vermittler erreichbar", „falscher Raum" oder „Partner schläft":
   `connect()` liefert ein Raum-Objekt, ohne dass ein einziger Handshake-Server
   antworten muss – die Lobby sagte trotzdem „warte auf Partner". Jetzt tickt
   sie: Sie fragt den Transport (info()), entscheidet über `lobbyHint` und
   sagt, was los ist. Der WAKE LOCK gehört ebenfalls hierher – ohne ihn sperrt
   das Phone beim Warten den Bildschirm, und mit ihm schlafen die WebSockets
   ein: Der Host war weg, ohne es zu merken. */
let mpLobbyAt = 0;
let mpTick: number | null = null;
/* ICE-SELBSTTEST (M75): Der Handshake über die Vermittler kann laufen und die
   STRECKE trotzdem fehlen – im Mobilfunk ist das der Normalfall. Der Test
   fragt ohne Partner, welche Kandidaten dieses Gerät überhaupt bekommt:
   'relay' heißt „der Weiterleiter trägt". Einmal je Lobby-Öffnung, und neu
   nach jedem Eintrag. */
let iceReport: IceReport | null = null;
let iceProbing = false;

function iceProbeStart(): void {
  if (iceProbing) return;
  iceProbing = true;
  iceReport = null;
  void probeIce(turnServers(), { timeout: 5000 }).then((r) => {
    iceReport = r;
    iceProbing = false;
    mpLobbyTick();
  });
}

/** Die Weiterleiter DIESES Geräts (Wirte, nie Zugangsdaten). Quelle ist der
 *  Eintrag, nicht der Transport: Was trystero bekam, steht im Protokoll. */
function turnHosts(): string[] {
  return iceHosts(turnServers());
}

/** Ergebnis des Selbsttests als Satz – dieselbe Aussage in Kasten und Debug. */
function iceLine(): string {
  if (iceProbing) return t('mp.iceTesting');
  const verdict = iceVerdict(iceReport, hasTurn(turnServers()));
  if (verdict === 'ok') return t('mp.iceOk', { ms: iceReport?.ms ?? 0 });
  if (verdict === 'turnDead') return t('mp.iceDead');
  if (verdict === 'blind') return t('mp.iceBlind');
  if (verdict === 'noTurn') return t('mp.iceNone');
  return '';
}

function mpLobbyTick(): void {
  if (mpLobby.classList.contains('hidden')) return;
  const info = mp?.transport.info() ?? null;
  const waitingS = (performance.now() - mpLobbyAt) / 1000;
  const health = relayHealth(info?.relays ?? []);
  const hint = info === null ? 'connecting' : lobbyHint(health, waitingS, info.iceFailed);
  const connected = (info?.peers.length ?? 0) > 0;
  const netStatus = $('mpNetStatus');
  const reconnect = $('mpReconnectBtn');
  // Kurze Zeile nur, wenn es etwas zu sagen gibt: Vermittler unerreichbar
  // oder es hängt. Sonst bleibt die Lobby ruhig.
  const say = connected
    ? null
    : hint === 'blocked'
      ? t('mp.netBlocked')
      : hint === 'offline'
        ? t('mp.netOffline')
        : hint === 'stalled'
          ? t('mp.netStalled')
          : null;
  netStatus.textContent = say ?? '';
  netStatus.classList.toggle('hidden', say === null);
  netStatus.classList.toggle('warn', say !== null);
  // „Neu verbinden" steht die ganze Wartezeit da (nicht erst im Alarmfall):
  // Wer vor einem stummen QR-Code steht, soll etwas tun können, ohne die
  // Lobby zu verlassen – der Raumcode bleibt derselbe.
  reconnect.classList.toggle('hidden', connected);
  const dbg = $('mpNetDebug');
  const show = debug || debugUnlocked || new URLSearchParams(location.search).has('netdebug');
  // Der TURN-Kasten erscheint, WO er gebraucht wird: wenn die Strecke
  // gescheitert ist (dann ist er die einzige Abhilfe) – und im Debug-Modus.
  const turnBox = $('mpTurnBox');
  const showTurn = !connected && (hint === 'blocked' || show);
  if (showTurn && turnBox.classList.contains('hidden')) {
    ($('mpTurnText') as HTMLTextAreaElement).value = loadTurnText();
  }
  turnBox.classList.toggle('hidden', !showTurn);
  if (showTurn && $('mpTurnStatus').textContent === '') $('mpTurnStatus').textContent = iceLine();
  dbg.classList.toggle('hidden', !show);
  if (show) {
    const lines = info
      ? [
          `${info.kind} · ich ${info.selfId.slice(0, 8)} · Raum ${mp?.code ?? '?'} · ${mp?.host ? 'Host' : 'Gast'}`,
          `Partner: ${info.peers.length ? info.peers.map((x) => x.slice(0, 8)).join(', ') : '–'} · warte ${waitingS.toFixed(0)} s · ${hint}`,
          `Vermittler ${health.open}/${health.total} offen${health.connecting ? `, ${health.connecting} im Aufbau` : ''}`,
          `Weiterleiter: ${turnHosts().length ? turnHosts().join(', ') : '–'} · ${iceLine()}`,
          ...info.relays.map((r) => `  ${r.state === 'open' ? '✓' : r.state === 'connecting' ? '…' : '✗'} ${r.url.replace('wss://', '')}`),
          ...info.events.map((e) => `  ${(e.at / 1000).toFixed(1)}s ${e.text}`),
        ]
      : [t('mp.connecting')];
    dbg.textContent = lines.join('\n');
  }
}

function mpShowLobby(status: string): void {
  mpChoose.classList.add('hidden');
  mpLobby.classList.remove('hidden');
  $('mpLobbyStatus').textContent = status;
  mpLobbyAt = performance.now();
  iceProbeStart();
  // Gespielt wird durch Neigen, gewartet wird mit dem Bildschirm an: Sperrt
  // das Phone in der Lobby, stirbt die Verbindung zu den Vermittlern.
  wake.want();
  if (mpTick === null) mpTick = window.setInterval(mpLobbyTick, 500);
  mpLobbyTick();
}

/** Lobby verlassen: Ticker aus, Diagnose-Zeilen zurücksetzen. */
function mpHideLobby(): void {
  if (mpTick !== null) {
    clearInterval(mpTick);
    mpTick = null;
  }
  $('mpNetStatus').classList.add('hidden');
  $('mpReconnectBtn').classList.add('hidden');
  $('mpNetDebug').classList.add('hidden');
  $('mpTurnBox').classList.add('hidden');
  $('mpTurnStatus').textContent = '';
}

function mpJoinUrl(code: string): string {
  return `${location.origin}${location.pathname}#join=${code}`;
}

// Lobby SOFORT zeigen, dann verbinden: Der Relay-Aufbau darf weder die UI
// blockieren noch bei einem Fehler stumm bleiben. Das Token erkennt einen
// Abbruch (Abbrechen/Schließen) während des Verbindens.
let mpPending: string | null = null;

async function mpHost(level: LevelDef, custom = false, keepCode?: string): Promise<void> {
  // ?mpcode=TEST… erzwingt den Raumcode (E2E: TEST-Präfix wählt den LocalTransport).
  // `keepCode` ist das Neuverbinden: Der Gast hat den QR-Code schon – ein
  // neuer Raum würde ihn ins Leere schicken.
  const code = keepCode ?? new URLSearchParams(location.search).get('mpcode')?.toUpperCase() ?? makeRoomCode();
  $('mpLobbyTitle').textContent = `${mpModeSel === 'coop' ? '🤝' : '🏁'} ${lvName(level)}`;
  $('mpQr').innerHTML = renderSVG(mpJoinUrl(code));
  $('mpQr').classList.remove('hidden');
  $('mpShareBtn').classList.remove('hidden'); // nur der Host lädt ein
  $('mpCode').textContent = code;
  mpShowLobby(t('mp.connecting'));
  mpPending = code;
  try {
    const transport = await connect(code);
    if (mpPending !== code) {
      transport.leave();
      return;
    }
    mpInit(transport, code, true, mpModeSel, level, custom);
    $('mpLobbyStatus').textContent = t('mp.waiting');
  } catch {
    if (mpPending === code) $('mpLobbyStatus').textContent = t('mp.error');
  }
}

async function mpJoin(code: string): Promise<void> {
  code = code.toUpperCase();
  $('mpLobbyTitle').textContent = t('mp.join');
  $('mpQr').classList.add('hidden');
  $('mpShareBtn').classList.add('hidden');
  $('mpCode').textContent = code;
  mpShowLobby(t('mp.connecting'));
  mpPending = code;
  try {
    const transport = await connect(code);
    if (mpPending !== code) {
      transport.leave();
      return;
    }
    mpInit(transport, code, false, 'coop', null, false);
    $('mpLobbyStatus').textContent = t('mp.connecting');
  } catch {
    if (mpPending === code) $('mpLobbyStatus').textContent = t('mp.error');
  }
}

function mpInit(transport: Transport, code: string, host: boolean, mpmode: MpMode, level: LevelDef | null, custom: boolean): void {
  mp?.transport.leave();
  mp = {
    transport,
    code,
    host,
    mode: mpmode,
    level,
    custom,
    phase: 'lobby',
    selfReady: false,
    peerReady: false,
    rematchSelf: false,
    rematchPeer: false,
    remote: { x: 0, y: 0, floor: 0, finished: false, elapsed: null, speed: 0, lastAt: 0, goalAt: 0 },
    localFinished: false,
    localElapsed: null,
    localHolds: new Set(),
    remoteHolds: new Set(),
    switchSyncAt: new Map(),
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
        // Werkstatt-Level (M57): die komplette Def reist mit – der Gast hat sie
        // nicht. Alte Clients ignorieren das Feld und finden die ID nicht.
        mp.transport.send('setup', {
          mode: mp.mode,
          levelId: mp.level.id,
          def: mp.custom ? mp.level : undefined,
          needs: needsFor(mp.level.marks, mp.level.together, levelFeatures(mp.level).has('resonance')),
        });
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
    const p = payload as { mode: MpMode; levelId: string; def?: unknown; needs?: string[] };
    // Verlangt das Level etwas, das diese Version nicht kennt, ist die Antwort
    // ein klarer Satz in der Lobby – nicht ein stilles Spiel mit halben Regeln.
    if (!canDo(p.needs, FEATURES)) {
      $('mpLobbyStatus').textContent = t('mp.needsUpdate');
      return;
    }
    let level: LevelDef | null = null;
    if (p.def !== undefined) {
      // Werkstatt-Level des Hosts (M57): Schema UND Pflicht-Badges prüfen –
      // dieselbe Schranke wie beim Teilen. Ein unbeweisbares Level spielt
      // der Gast nicht; die Lobby sagt warum.
      try {
        const checks = validateLevel(p.def);
        if (isShareable(checks)) level = parseLevel(p.def);
      } catch {
        level = null;
      }
      if (!level) {
        $('mpLobbyStatus').textContent = t('mp.badLevel');
        return;
      }
      mp.custom = true;
    } else {
      const pool = p.mode === 'coop' ? COOP_LEVELS : RACE_LEVELS;
      // Zufallslevel stehen nicht im Pool: aus der ID deterministisch regenerieren.
      level = pool.find((l) => l.id === p.levelId) ?? parseMpQuickId(p.levelId);
    }
    if (!level) return;
    mp.mode = p.mode;
    mp.level = level;
    mpShowIntro();
  } else if (type === 'ready') {
    const p = payload as { features?: string[] } | null;
    if (
      mp.host &&
      mp.level &&
      !canDo(needsFor(mp.level.marks, mp.level.together, levelFeatures(mp.level).has('resonance')), p?.features)
    ) {
      $('mpLobbyStatus').textContent = t('mp.needsUpdate');
      return;
    }
    mp.peerReady = true;
    mpMaybeStart();
  } else if (type === 'state') {
    const p = payload as { x: number; y: number; f: number; fin: boolean; g?: boolean; tn?: number | null };
    // Partner-Klang (M88): Die Geschwindigkeit kommt NICHT über das Netz – sie
    // folgt aus zwei Meldungen (alle 80 ms) und wird geglättet. Ein Feld mehr
    // hätte beide Seiten ohne Not auf dieselbe Version festgelegt. Ein Sprung
    // über eine Ebene ist keine Bewegung, sondern ein Warp: dann nichts messen.
    const at = performance.now();
    const dt = (at - mp.remote.lastAt) / 1000;
    if (mp.remote.lastAt > 0 && dt < 1 && p.f === mp.remote.floor)
      mp.remote.speed = smoothSpeed(mp.remote.speed, Math.hypot(p.x - mp.remote.x, p.y - mp.remote.y) / dt, dt);
    mp.remote.lastAt = at;
    mp.remote.x = p.x;
    mp.remote.y = p.y;
    mp.remote.floor = p.f;
    mp.remote.finished = p.fin;
    // Gemeinsam ankommen (M90): Verlässt er das Ziel, sagt es die NÄCHSTE
    // Meldung sofort (goalAt zurück auf 0) – die Nachsicht in core/together.ts
    // deckt ausgefallene Nachrichten, nicht das Weiterrollen. Eine alte
    // Gegenstelle schickt `g` nicht; ein `together`-Level lässt das Gate
    // (`needs`) gar nicht erst starten.
    mp.remote.goalAt = p.g ? at : 0;
    // DUETT (M91): sein Ton. Eine alte Gegenstelle schickt `tn` nicht – ein
    // Level mit Resonanz-Tor lässt das Merkmals-Gate (`needs`) dann gar nicht
    // erst starten, sonst ginge das Tor nie auf.
    if (mp.phase === 'playing') {
      const was = duetPartnerTone;
      duetPartnerTone = p.tn ?? null;
      duetPartnerAt = at;
      if (was === null && duetPartnerTone !== null) flash(t('mp.partnerTone'));
    }
  } else if (type === 'plate') {
    const p = payload as { id: string; held: boolean };
    if (p.held) mp.remoteHolds.add(p.id);
    else mp.remoteHolds.delete(p.id);
  } else if (type === 'key') {
    // Coop (M59): Der Partner hat einen Schlüssel geholt – er zählt für
    // beide (der Öffner-Zustand lebt in der Welt, updateDoors liest ihn).
    const p = payload as { f: number; i: number };
    const key = loaded?.floors[p.f]?.world.keys[p.i];
    if (key && !key.collected) {
      key.collected = true;
      updateDoors(performance.now());
      flash(t('mp.partnerKey'));
    }
  } else if (type === 'switch') {
    // Coop (M59): Zeitschalter des Partners – läuft hier mit derselben Dauer.
    const p = payload as { f: number; i: number; ms: number };
    const sw = loaded?.floors[p.f]?.world.switches[p.i];
    if (sw) {
      const fresh = sw.openUntil === null || sw.openUntil <= performance.now();
      sw.openUntil = performance.now() + p.ms;
      if (fresh) {
        sw.litFrom = 0;
        sw.litUntil = performance.now() + 2000;
        flash(t('mp.partnerSwitch'));
      }
      updateDoors(performance.now());
    }
  } else if (type === 'boulder') {
    // Stein des Partners (M84): derselbe Stoß in meiner Welt. Klang und
    // Platte kommen aus der eigenen Physik (consumeBoulderEvents im Frame),
    // deshalb hier nur die Meldung – und nur, wenn er sich wirklich bewegt.
    const p = payload as { f: number; i: number; d: [number, number] };
    if (loaded?.floors[p.f]?.world.pushBoulderAt(p.i, p.d)) flash(t('mp.partnerBoulder'));
  } else if (type === 'mark') {
    // Wegmarke des Partners (M89): Sie liegt bei BEIDEN – das ist der Sinn.
    // Sein Vorrat ist seine Sache; hier wird nur gesetzt oder weggenommen.
    const p = payload as { f: number; x: number; y: number; on: boolean };
    marks = applyPartnerMark(marks, p.f, p.x, p.y, p.on);
    if (p.on) flash(t('mp.partnerMark'));
  } else if (type === 'bell') {
    // Coop UND Race (M83): Die Glocke ist Ablenkung, keine Progression – sie
    // wirkt in beiden Modi, wie die Platten. Gehört wird sie aus ihrer
    // Richtung, aber nur, wenn ich auf derselben Ebene stehe.
    const p = payload as { f: number; i: number };
    const bl = loaded?.floors[p.f]?.world.ringBellAt(p.i);
    if (bl) {
      if (p.f === activeFloor && world) audio.bellRing(bl.x - world.ball.x, bl.y - world.ball.y);
      flash(t('mp.partnerBell'));
    }
  } else if (type === 'finish') {
    const p = payload as { elapsed: number };
    // Nach einem Rendezvous (M90) steht das Ergebnis schon – seine Meldung
    // kommt eine Nachrichtenlaufzeit später und darf die Karte nicht anfassen.
    if (mp.phase === 'done') return;
    if (!mp.remote.finished) flash(t('mp.partnerFinished'));
    mp.remote.finished = true;
    mp.remote.elapsed = p.elapsed;
    mpCheckResult();
    // GEMEINSAM ANKOMMEN (M90): WER GEWINNT, VERSTUMMT. Ab dem Sieg läuft die
    // Schleife nicht mehr im Spielzweig, also geht auch keine `state`-Meldung
    // mehr hinaus – seine letzte kann noch `g: false` getragen haben (Takt
    // 80 ms). Dann sähe ich das Rendezvous NIE und wartete für immer, während
    // er feiert (in der CI unter Last genau so gefallen: er „done", ich
    // „playing", `sees: false`). Deshalb ist seine `finish`-Meldung der
    // verlässliche Anlass: Sie kommt nur, wenn er MICH im Ziel gesehen hat –
    // dieselbe Beweislage, die auch meine Seite benutzt.
    if (togetherMode() && !mp.localFinished) mpTogetherWin(performance.now());
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
  // Zwei-Spieler-Level (M57): jeder erfährt seine Rolle – Host ●, Gast ●².
  const role = mp.level.players === 2 ? `\n${t(mp.host ? 'mp.role1' : 'mp.role2')}` : '';
  showInterstitial({
    title: `${icon} ${lvName(mp.level)}`,
    text: `${lvIntro(mp.level) ?? ''}\n\n${mpModeHint(mp.mode)}${role}`,
    primary: {
      label: t('mp.ready'),
      onClick: () => {
        void (async () => {
          if (!mp) return;
          await ensureSensors();
          mp.selfReady = true;
          mp.transport.send('ready', { features: FEATURES });
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
  mp.remote = { x: 0, y: 0, floor: 0, finished: false, elapsed: null, speed: 0, lastAt: 0, goalAt: 0 };
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

/* --- DUETT (M91) ------------------------------------------------------------
   Zwei Resonanzfelder, ein Tor: Wer auf einem Feld steht, erzeugt einen Ton
   aus seiner NEIGUNGSRICHTUNG (das Feld hält die Kugel wie ein Anker, damit
   Stimmen nicht Wegrollen heißt). Das Tor geht auf, wenn die beiden Töne im
   Zielintervall stehen und dort einen Augenblick BLEIBEN.

   BEIDE SEITEN RECHNEN DASSELBE: `state.tn` trägt die Tonhöhe in Cent, jede
   Seite kennt beide Töne und entscheidet lokal – keine Autorität, keine
   Nachricht „Tor auf". Und das Feld ist eine PLATTE: Steht das Duett, gilt sie
   als gehalten, und die EINE Türregel (core/doors.ts) macht den Rest. */
interface DuetState {
  /** eigener Ton in Cent (null = ich stehe auf keinem Feld) */
  mine: number | null;
  /** Ton des Partners in Cent (Netz: `state.tn`, Testmodus: seine Seite) */
  theirs: number | null;
  /** Zielintervall des Feldes, um das es geht */
  interval: Interval | null;
  /** Genauigkeit 0…1 – fährt den Schimmer auf, EHE das Tor aufgeht */
  aim: number;
  /** gestimmt UND stehen geblieben ⇒ die Felder halten */
  open: boolean;
  /** sein Feld auf MEINER Ebene (dort klingt sein Ton), sonst null */
  his: Plate | null;
}
const DUET_NONE: DuetState = { mine: null, theirs: null, interval: null, aim: 0, open: false, his: null };
/** Wie lange seine letzte Ton-Meldung gilt – wie beim Rendezvous (M90): Die
 *  Nachsicht deckt ausgefallene Nachrichten, nicht das Verlassen des Feldes
 *  (dann meldet die nächste Nachricht `tn: null`). */
const TONE_FRESH_MS = 700;
let duet: DuetState = DUET_NONE;
/** Mein eigener Ton (Cent) – ZUSTAND, nicht Abbild der Neigung: Er bleibt
 *  stehen, solange die Kugel im Feld liegt (`tuneStep`). Im Testmodus wohnt
 *  derselbe Wert je Seite in `TestSide.tone`, damit er den Spielerwechsel
 *  überlebt. */
let duetTone: number | null = null;
let duetSince: number | null = null;
let duetPartnerTone: number | null = null;
let duetPartnerAt = 0;

function duetFrame(now: number, tilt: { x: number; y: number }): DuetState {
  if (!world || !loaded) return DUET_NONE;
  const fields = loaded.floors.flatMap((f, fl) => f.world.plates.filter((p) => p.tune).map((pl) => ({ pl, fl })));
  if (fields.length === 0) return DUET_NONE;
  const myPlate = world.platesUnderBall().find((p) => p.tune) ?? null;
  // Der Ton wird FORTGESCHRIEBEN (tuneStep): Neigen dreht ihn, Loslassen hält
  // ihn, das Feld verlassen macht ihn stumm. Im Testmodus liegt derselbe Wert
  // je SEITE – dadurch überlebt er den Spielerwechsel, ohne dass es dafür eine
  // eigene Regel bräuchte (wer 👥 antippt, hält das Gerät fast flach).
  const side = mpTest ? mpTest.sides[mpTest.active]! : null;
  const mine = tuneStep(side ? side.tone : duetTone, myPlate !== null, tilt.x, tilt.y);
  if (side) side.tone = mine;
  else duetTone = mine;
  const fresh = duetPartnerAt > 0 && now - duetPartnerAt < TONE_FRESH_MS;
  const theirs = mpTest ? mpTestOther().tone : mp && fresh ? duetPartnerTone : null;
  // Sein Feld: das Resonanzfeld, das SEINER Kugel am nächsten liegt – dort
  // klingt sein Ton, damit die Schwebung im RAUM steht und nicht im Kopf.
  // MEIN Feld ist dabei zugelassen (v3.25.4): Stehen wir beide auf derselben
  // Zelle – bei einer 'any'-Tür ist das erlaubt –, dann kommt sein Ton von
  // dort, wo ich stehe, also ungepannt. Vorher schloss die Auswahl mein Feld
  // aus und ortete ihn am FALSCHEN (oder gar nicht).
  const buddy = mpTest
    ? { x: mpTestOther().loaded.world.ball.x, y: mpTestOther().loaded.world.ball.y }
    : mp && mp.remote.lastAt > 0
      ? { x: mp.remote.x, y: mp.remote.y }
      : null;
  const near = buddy
    ? fields.reduce(
        (best, f) =>
          Math.hypot(f.pl.x - buddy.x, f.pl.y - buddy.y) < Math.hypot(best.pl.x - buddy.x, best.pl.y - buddy.y)
            ? f
            : best,
        fields[0]!,
      )
    : null;
  // Ohne Funk von ihm: das ANDERE Feld ist die beste Vermutung.
  const his = near ?? fields.find((f) => f.pl !== myPlate) ?? null;
  const interval = myPlate?.tune ?? his?.pl.tune ?? null;
  const tuned = mine !== null && theirs !== null && interval !== null && inTune(mine, theirs, interval);
  const step = holdTuned(duetSince, tuned, now);
  duetSince = step.since;
  return {
    mine,
    theirs,
    interval,
    aim: mine !== null && theirs !== null && interval ? tuneAim(mine, theirs, interval) : 0,
    open: step.open,
    his: his && his.fl === activeFloor ? his.pl : null,
  };
}

/** Wer auf einem Resonanzfeld steht, HÄLT es erst, wenn das Duett steht (M91).
 *  Eine gewöhnliche Platte hält, wer darauf steht – wie immer. */
function heldIds(plates: readonly Plate[]): Set<string> {
  return new Set(plates.filter((p) => !p.tune || duet.open).map((p) => p.id));
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
      // M90: nicht „war ich mal", sondern „liege ich JETZT drin" – die
      // Rendezvous-Regel lebt von der Gleichzeitigkeit.
      g: world.goalReached(),
      // M91: meine Tonhöhe in Cent (null = ich stehe auf keinem Feld). Ein
      // Float je 80 ms – die Nachricht bleibt winzig, und beide Seiten
      // rechnen dieselbe Türregel daraus.
      tn: duet.mine,
    });
  }

  // Lokale Platten unter dem Ball (auch ein Ball im Ziel hält seine Platte!).
  // Geführt wird je PLATTE (`Plate.id`), nicht je Tür: Zwei Platten derselben
  // Tür sind zwei Bedingungen – über die Tür-ID hätte eine die andere
  // mitgehalten und ein 'all' wäre mit einer Kugel aufgegangen (M76).
  const holds = heldIds(world.platesUnderBall());
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

  // Platten gelten als gehalten, wenn irgendwer (lokal oder fern) darauf steht;
  // die Türen entscheidet updateDoors über alle Ebenen (require any/all).
  for (const floor of loaded.floors) {
    for (const pl of floor.world.plates) {
      pl.held = holds.has(pl.id) || mp.remoteHolds.has(pl.id);
    }
  }
  updateDoors(now);
}

/** EINE Türregel für Schlüssel, Zeitschloss-Schalter und Platten über alle
 *  Ebenen (core/doors.ts): Öffner-Zustände sammeln, pro Tür auswerten,
 *  Übergänge hörbar machen (nur auf der aktuellen Ebene). Dauerhaft offene
 *  Türen (nur Schlüssel) werden zu Schutt. Liefert die IDs der Türen, die
 *  JETZT offen sind. */
function updateDoors(now: number): Set<string> {
  if (!loaded || !world) return new Set();
  const worlds = (l: LoadedLevel): World[] => l.floors.map((f) => f.world);
  if (!mpTest) return applyDoors(worlds(loaded), worlds(loaded), now);
  const a = worlds(mpTest.sides[0]!.loaded);
  const b = worlds(mpTest.sides[1]!.loaded);
  // Coop-Testmodus: Schlüssel und Schalter beider Seiten öffnen beide Welten
  // (M59). Race: jede Welt entscheidet für sich – die geteilten PLATTEN
  // stecken schon im `held`-Flag der jeweiligen Platte.
  if (mpTest.coop) return applyDoors([...a, ...b], [...a, ...b], now);
  const open = [applyDoors(a, a, now), applyDoors(b, b, now)];
  return open[mpTest.active]!;
}

/** Türen aus den Öffnern von `sources` bestimmen und auf die Wände in
 *  `targets` anwenden (Schutt, Aufleuchten, Klang nur auf der eigenen Ebene).
 *  Liefert die IDs der Türen, die JETZT offen sind. */
function applyDoors(sources: readonly World[], targets: readonly World[], now: number): Set<string> {
  const openNow = new Set<string>();
  if (!world) return openNow;
  const openers = collectOpeners(sources, now);
  for (const fw of targets) {
    for (let i = fw.walls.length - 1; i >= 0; i--) {
      const w = fw.walls[i]!;
      if (!w.door) continue;
      const state = doorState(openers.get(w.door.id) ?? [], w.door.require ?? 'any', w.door.latched === true);
      // „Bleibt offen" (M76): Der Riegel fällt in dem Moment, in dem die Tür
      // zum ersten Mal offen ist – danach fragt doorState die Öffner nicht
      // mehr. Jede Welt merkt sich das selbst; im MP kommen beide Seiten aus
      // denselben (synchronisierten) Öffnern zum selben Schluss.
      if (state.open && w.door.latch) w.door.latched = true;
      if (state.open) openNow.add(w.door.id);
      const dx = w.x + w.w / 2 - world.ball.x;
      const dy = w.y + w.h / 2 - world.ball.y;
      if (state.permanent) {
        fw.walls.splice(i, 1);
        fw.debris.push({ ...w, litUntil: now + 2000 });
        if (fw === world) audio.doorOpen(dx, dy);
        continue;
      }
      if (state.open !== (w.door.open ?? false)) {
        w.door.open = state.open;
        w.litFrom = 0;
        w.litUntil = now + 1500;
        if (fw === world) {
          if (state.open) audio.doorOpen(dx, dy);
          else audio.doorClose(dx, dy);
        }
      }
    }
  }
  return openNow;
}

/** HUD-Kachel des Testmodus: WER am Zug ist (👥1 / 👥2, Spieler 2 in
 *  Partner-Rot). Tippen wechselt. */
function updateSwapChip(): void {
  if (!mpTest) return;
  swapBtn.textContent = `\u{1F465}${mpTest.active + 1}`;
  swapBtn.classList.toggle('p2', mpTest.active === 1);
}

/** Spieler wechseln (👥 oder Taste „p"): Die abgegebene Kugel bleibt liegen,
 *  wo sie ist – ohne Schwung, sonst rollte sie beim Zurückwechseln weiter.
 *  Ebene, Respawn und Ping-Budget gehören der SEITE, nicht dem Lauf. */
function mpTestSwap(): void {
  if (!mpTest || !loaded || !world || state !== 'playing') return;
  const cur = mpTest.sides[mpTest.active]!;
  world.ball.vx = 0;
  world.ball.vy = 0;
  cur.floor = activeFloor;
  cur.respawn = respawnPoint;
  cur.pings = pings;
  mpTest.active = mpTest.active === 0 ? 1 : 0;
  const nxt = mpTest.sides[mpTest.active]!;
  loaded = nxt.loaded;
  respawnPoint = nxt.respawn;
  pings = nxt.pings;
  activateFloor(nxt.floor);
  audio.setRolling(0);
  audio.checkpoint();
  haptics.checkpoint();
  updateSwapChip();
  flash(t('st.mpTestTurn', { n: mpTest.active + 1 }), 1500);
}

/** Ein Frame im Testmodus: Die ruhende WELT läuft weiter (Wächter,
 *  Wanderlöcher – sonst zeigte dieselbe Patrouille beiden Spielern zwei
 *  Stellen), und eine Platte hält, wer WIRKLICH darauf steht: beide Kugeln
 *  zählen, wie die Nachricht 'plate' im echten Spiel, die keinen Modus kennt.
 *  Schlüssel und Zeitschalter teilt nur der Coop – das entscheidet
 *  updateDoors über beide Welten (M59). */
function mpTestFrame(now: number, dt: number): void {
  if (!mpTest || !world) return;
  const cur = mpTest.sides[mpTest.active]!;
  cur.floor = activeFloor;
  cur.pings = pings;
  const other = mpTestOther();
  const otherWorld = other.loaded.floors[other.floor]!.world;
  otherWorld.advanceGuards(dt);
  otherWorld.advanceHoles(dt);
  // Die Glocke drüben klingt aus, und ihre Horcher laufen dorthin (M83) –
  // sonst sieht man im Testmodus nicht, was das Läuten beim Partner tut.
  otherWorld.advanceBells(dt);
  otherWorld.advanceListeners(dt);
  // Der Stein drüben rollt zu Ende und legt sich auf seine Platte (M84).
  // Seine Klang-Ereignisse gehören NICHT hierher: derselbe Stein klingt
  // schon in der eigenen Welt.
  // Hier MIT Kugel: Es ist die eigene Kugel der ruhenden Seite auf ihrer
  // eigenen Ebene – anders als bei den Leerlauf-Ebenen (dort ist die Kugel
  // über alle Ebenen dieselbe Instanz, siehe advanceBoulders).
  otherWorld.advanceBoulders(dt, true);
  otherWorld.consumeBoulderEvents();
  const held = heldIds([...world.platesUnderBall(), ...otherWorld.platesUnderBall()]);
  for (const id of held) if (!mpTest.held.has(id)) audio.plate(true);
  for (const id of mpTest.held) if (!held.has(id)) audio.plate(false);
  mpTest.held = held;
  for (const side of mpTest.sides)
    for (const fl of side.loaded.floors) for (const pl of fl.world.plates) pl.held = held.has(pl.id);
  updateDoors(now);
}

/**
 * LEERLAUF-WELTEN LAUFEN WEITER (M83/M84): Die Spielschleife schrittet nur die
 * Welt der AKTIVEN Ebene. Eine Glocke, die der Partner auf einer anderen Ebene
 * angeschlagen hat, bliebe dort sonst stehen und lockte beim Betreten die
 * Horcher zu einem Läuten von vor einer Minute. Die aktive Welt zählt ihre
 * Glocken selbst herunter (`step`), im Testmodus die ruhende Seite über
 * `mpTestFrame`.
 */
function advanceIdleWorlds(dt: number): void {
  const sides = mpTest ? mpTest.sides.map((sd) => sd.loaded) : loaded ? [loaded] : [];
  for (const side of sides) {
    side.floors.forEach((f, fl) => {
      if (side === loaded && fl === activeFloor) return;
      if (mpTest && side !== loaded && fl === mpTestOther().floor) return;
      f.world.advanceBells(dt);
      // Ein Stein, den der Partner auf einer anderen Ebene angestoßen hat,
      // muss dort ankommen: Seine Platte kann eine Tür ÜBER Ebenen öffnen.
      f.world.advanceBoulders(dt);
      f.world.consumeBoulderEvents();
    });
  }
}

/** Im Ziel: Diese Seite ist durch, ihre Uhr steht – die Kugel rollt weiter
 *  (ein Fertiger kann dem Partner die Platte halten, wie im echten Spiel).
 *  Coop gewinnt, wenn BEIDE drin sind; im Race der erste. */
function mpTestFinish(now: number): void {
  if (!mpTest) return;
  const side = mpTest.sides[mpTest.active]!;
  if (side.done) return;
  side.done = true;
  side.elapsed = (now - t0) / 1000;
  audio.checkpoint();
  haptics.checkpoint();
  if (!mpTest.coop || mpTest.sides.every((sd) => sd.done)) winRun(now, side.elapsed);
  else flash(t('st.mpTestDone', { n: mpTest.active + 1 }), 2500);
}

/** Sieg eines Einzel-Laufs (auch der MP-Testmodus endet hier): Uhr aus,
 *  Konfetti, Ergebniskarte über onWin. */
function winRun(now: number, seconds: number): void {
  state = 'won';
  revealUntil = now + 4000;
  silenceWorld();
  celebrate();
  statusEl.textContent = t('st.win', { time: fmtTime(seconds) });
  onWin(seconds);
}

/* --- GEMEINSAM ANKOMMEN (M90) ----------------------------------------------
   Gewonnen wird, wenn BEIDE gleichzeitig in ihren Zielzonen liegen. Die Regel
   gilt nur im echten Coop-Netz: Solo gibt es keinen Partner, im Rennen keinen
   gemeinsamen Sieg (das Schema lässt `together` auch nur dort zu), und im
   MP-Testmodus liegt die abgegebene Kugel von allein im Ziel und wartet – da
   funktioniert es ohne eigene Regel. */
const togetherMode = (): boolean =>
  !!mp && mp.mode === 'coop' && mp.phase === 'playing' && loaded?.def.together === true;

interface TogetherState {
  /** Läuft dieses Level nach der Rendezvous-Regel? */
  on: boolean;
  /** Liege ich JETZT im Ziel? */
  mine: boolean;
  /** Beide drin – gewonnen. */
  win: boolean;
  /** Er wartet im Ziel auf mich (Chip + Ruf). */
  waits: boolean;
}

/** EINE Rechnung je Frame für Statuszeile, Chip, Ruf und das eigene
 *  Ziel-Licht – sonst zeigten Bild und Klang zwei Wahrheiten (M88). */
function togetherState(now: number): TogetherState {
  if (!mp || !world || !togetherMode()) return { on: false, mine: false, win: false, waits: false };
  const mine = world.goalReached();
  return {
    on: true,
    mine,
    win: togetherWin(mine, mp.remote.goalAt, now),
    waits: partnerWaiting(mine, mp.remote.goalAt, now),
  };
}

/** Das Rendezvous ist da: BEIDE Seiten sehen denselben Augenblick und
 *  schließen unabhängig ab – niemand ist Schiedsrichter, niemand wartet auf
 *  die Bestätigung des anderen (die käme eine Nachrichtenlaufzeit zu spät).
 *  Die `finish`-Meldung geht trotzdem raus: Sie trägt seine Zeit, wenn seine
 *  Seite doch eine Nachricht verloren hat. */
function mpTogetherWin(now: number): void {
  if (!mp || mp.localFinished) return;
  mp.localFinished = true;
  mp.localElapsed = (now - t0) / 1000;
  mp.transport.send('finish', { elapsed: mp.localElapsed });
  // Die Teamzeit IST der Augenblick des Rendezvous, nicht das Maximum zweier
  // Einzelzeiten: Beide Uhren zeigen denselben Moment.
  mp.remote.finished = true;
  mp.remote.elapsed ??= mp.localElapsed;
  mpCheckResult();
}

function mpLocalFinish(now: number): void {
  if (!mp || mp.localFinished) return;
  mp.localFinished = true;
  mp.localElapsed = (now - t0) / 1000;
  // Der Ball wird NICHT gestoppt: Ein eingefrorener Ball sah wie ein Fehler
  // aus – und im Coop war er einer, denn wer festhängt, kann dem Partner
  // keine Druckplatte mehr halten. Ab hier steht die UHR, nicht die Kugel.
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
  silenceWorld();
  audio.stopMusic();
  const mine = mp.localElapsed ?? 0;
  const theirs = mp.remote.elapsed ?? 0;
  let title: string;
  let text: string;
  if (mp.mode === 'coop') {
    celebrate();
    title = t('mp.coopWin');
    // M90: Beim Rendezvous gibt es keine zwei Einzelzeiten, nur den einen
    // Augenblick – „du 12,4 / Partner 12,4" wäre eine Genauigkeit, die nichts
    // bedeutet.
    text = loaded?.def.together
      ? t('mp.rendezvousTime', { team: fmtTime(mine) })
      : t('mp.teamTime', { team: fmtTime(Math.max(mine, theirs)), you: fmtTime(mine), partner: fmtTime(theirs) });
  } else {
    const won = mine < theirs;
    if (won) {
      celebrate();
    } else {
      audio.caught();
    }
    title = mine === theirs ? t('mp.draw') : won ? t('mp.raceWin') : t('mp.raceLose');
    text = t('mp.raceTimes', { you: fmtTime(mine), rival: fmtTime(theirs) });
  }
  // Gast eines Werkstatt-Levels (M57): Level in die eigene Werkstatt holen.
  const level = mp.level;
  const saveAction: InterAction | undefined =
    mp.custom && !mp.host && level
      ? {
          label: t('mp.saveLevel'),
          onClick: () => {
            const saved = importRaw(JSON.parse(JSON.stringify(level)) as Record<string, unknown>);
            interExtra.textContent = saved ? t('mp.savedLevel') : t('ed.saveFailed');
            workshopPanel.refresh();
            refreshMenu();
          },
        }
      : undefined;
  setTimeout(() => {
    if (!mp) return;
    showInterstitial({
      title,
      text,
      extra: saveAction,
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
  mpCustomLevel = null;
  refreshMpPanel();
  mpPanel.classList.remove('hidden');
});
$('mpClose').addEventListener('click', () => {
  if (mp && mp.phase === 'lobby') {
    mp.transport.leave();
    mp = null;
  }
  mpPending = null;
  mpCustomLevel = null;
  mpPanel.classList.add('hidden');
});
/** Neu verbinden: dieselbe Rolle, DERSELBE Raumcode – frische Sockets.
 *  Nötig, weil ein Socket, der im Hintergrund gestorben ist, von trystero
 *  erst nach bis zu einer Minute Backoff wiederkommt; und weil ein Zombie-Peer
 *  aus einer alten Sitzung so verschwindet. */
function mpReconnect(): void {
  if (!mp || mp.phase !== 'lobby') return;
  const { host, code, level, custom } = mp;
  mpPending = null;
  mp.transport.leave();
  mp = null;
  if (host && level) void mpHost(level, custom, code);
  else void mpJoin(code);
}

$('mpReconnectBtn').addEventListener('click', mpReconnect);

/* TURN eintragen (M75): Der Kasten steht in der Lobby, weil man DORT merkt,
   dass die Strecke fehlt. Gespeichert wird auf dem Gerät – Zugangsdaten
   gehören niemandem sonst –, danach wird mit DEMSELBEN Raumcode neu
   verbunden, damit ein schon gescannter QR-Code gültig bleibt. */
$('mpTurnSave').addEventListener('click', () => {
  const field = $('mpTurnText') as HTMLTextAreaElement;
  const parsed = parseIceServers(field.value);
  const status = $('mpTurnStatus');
  if (parsed === null) {
    status.textContent = t('mp.turnBad');
    return;
  }
  saveTurnText(formatIceServers(parsed));
  status.textContent = parsed.length === 0 ? t('mp.turnCleared') : t('mp.turnSaved', { n: parsed.length });
  field.value = formatIceServers(parsed);
  iceProbeStart();
  if (parsed.length > 0) mpReconnect();
});
$('mpTurnPaste').addEventListener('click', () => {
  const clip = navigator.clipboard;
  const status = $('mpTurnStatus');
  if (!clip || typeof clip.readText !== 'function') {
    status.textContent = t('ed.pasteFail');
    return;
  }
  clip.readText().then(
    (txt) => {
      ($('mpTurnText') as HTMLTextAreaElement).value = txt.trim();
      status.textContent = '';
    },
    () => {
      status.textContent = t('ed.pasteFail');
    },
  );
});

// Zurück aus dem Hintergrund: In der Lobby sind die WebSockets zu den
// Vermittlern dann meist tot (iOS friert die Seite ein) – ohne diesen
// Neuaufbau wartet man vor einem Raum, in dem man selbst nicht mehr steht.
let mpHiddenAt: number | null = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    mpHiddenAt = performance.now();
    return;
  }
  const away = mpHiddenAt === null ? 0 : (performance.now() - mpHiddenAt) / 1000;
  mpHiddenAt = null;
  if (away > 3 && mp?.phase === 'lobby' && mp.transport.info().peers.length === 0) mpReconnect();
});
// Netz war weg (Tunnel, WLAN-Wechsel): dasselbe Argument.
window.addEventListener('online', () => {
  if (mp?.phase === 'lobby' && mp.transport.info().peers.length === 0) mpReconnect();
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

// Einladung teilen (M63): Nachricht + Beitritts-Link über das Share-Sheet
// (Signal, WhatsApp, Mail …) – der Link ist derselbe wie im QR-Code. Text und
// URL getrennt übergeben: Android setzt beides zusammen, iOS zeigt beides;
// ohne Web Share landet „Nachricht Link" in der Zwischenablage.
$('mpShareBtn').addEventListener('click', () => {
  const code = $('mpCode').textContent?.trim() ?? '';
  if (!code) return;
  const url = mpJoinUrl(code);
  const text = t('mp.shareText', { code, level: mp?.level ? lvName(mp.level) : t('mp.random') });
  (window as unknown as { __tiltrInvite?: unknown }).__tiltrInvite = { text, url };
  const btn = $<HTMLButtonElement>('mpShareBtn');
  void (async () => {
    try {
      if (navigator.share) await navigator.share({ text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        btn.textContent = t('mp.shareCopied');
        setTimeout(() => (btn.textContent = t('mp.share')), 2500);
      }
    } catch {
      /* abgebrochen */
    }
  })();
});

$('mpScanBtn').addEventListener('click', () => {
  void scanRoomCode().then((code) => {
    if (code) {
      mpCodeInput.value = code;
      void mpJoin(code);
    }
  });
});

// Links im Hash (#level=, #duel=, #join=, #daily=) – erst JETZT, da alle
// Panels, die sie öffnen, initialisiert sind (siehe Hinweis oben).
checkChallengeHash();
// Auch wenn die App SCHON OFFEN ist: Tippt man einen tiltr-Link an (PWA,
// wiederverwendeter Tab), ändert sich nur der Hash – ohne Neuladen. Ohne
// diesen Listener passierte dann gar nichts. (replaceState beim Aufräumen
// feuert kein hashchange, es gibt also keine Schleife.)
window.addEventListener('hashchange', checkChallengeHash);

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Konfetti hängt an DIESER Schleife (keine zweite rAF): Es fällt weiter,
  // während die Ergebnis-Karte aufzieht – und es fällt auch, wenn kein Level
  // geladen ist (deshalb VOR dem world-Check).
  confetti.step(dt);
  if (!world) return;

  // Gemeinsam ankommen (M90): EINMAL je Frame gerechnet – Statuszeile, Chip,
  // Ruf und das eigene Ziel-Licht sagen dann dasselbe. Gerechnet wird NACH
  // dem Physik-Schritt (weiter unten), aber hier deklariert, weil das
  // Ziel-Licht am Ende des Frames dieselbe Wahrheit braucht. Erst NACH dem
  // Schritt, weil sonst „liege ich im Ziel?" die Lage des VORIGEN Bildes
  // meldet – im ersten Bild in der Zielzone gewann dann noch die alte Regel
  // (`mpLocalFinish` rastete ein, gemessen in Lauf 47).
  let tog: TogetherState = { on: false, mine: false, win: false, waits: false };

  updateHoles(now);
  updateSlidingWalls(now);
  updateJukeboxes(now);
  world.pings = world.pings.filter((p) => ((now - p.start) / 1000) * p.speed < p.range);

  if (state === 'playing') {
    // MP: Nur ein Verbindungsverlust pausiert das Spiel. Wer im Ziel ist,
    // rollt weiter (die Uhr steht) – im Coop wartet man dort nicht untätig,
    // sondern hilft dem Nachzügler an den Platten.
    const disconnected = mp?.disconnectedAt != null;
    let tilt = disconnected ? { x: 0, y: 0 } : input.tilt;
    if (fpOn()) {
      // First Person: Lenkrad drehen, Schub entlang der Blickrichtung.
      // Kamera, Physik und Hörer hängen alle am SELBEN geglätteten Heading.
      const r = fpStep(fpState, tilt, dt);
      fpState = { heading: r.heading, turnRate: r.turnRate };
      tilt = r.worldTilt;
      audio.setHeading(r.heading);
    }
    const hits = disconnected ? [] : world.step(dt, tilt);
    // Rollstein (M47): Mahlen, Schlag, Versinken, Platte – aus seiner Richtung.
    for (const ev of world.consumeBoulderEvents()) {
      const dx = ev.x - world.ball.x,
        dy = ev.y - world.ball.y;
      if (ev.kind === 'roll') {
        audio.boulderRoll(dx, dy);
        // ZU ZWEIT ROLLT ER FÜR BEIDE (M84): Übertragen wird der STOSS, nicht
        // die Position – dieselbe Regel entscheidet drüben, ob die Zielzelle
        // frei ist. Die Fortsetzung auf Eis trägt kein `i`, die macht die
        // Physik dort selbst.
        if (ev.i !== undefined && ev.dir) {
          if (mp) mp.transport.send('boulder', { f: activeFloor, i: ev.i, d: ev.dir });
          if (mpTest) mpTestOther().loaded.floors[activeFloor]?.world.pushBoulderAt(ev.i, ev.dir);
        }
      }
      else if (ev.kind === 'stop') audio.boulderStop(dx, dy);
      else if (ev.kind === 'sink') {
        audio.boulderSink(dx, dy);
        flash(t('st.boulderSink'));
      } else {
        audio.plate(true);
        flash(t('st.boulderPlate'));
        updateDoors(now);
      }
      if (ev.kind !== 'plate') haptics.hit(0.6);
    }
    // Lockglocke (M46): angeschlagen – Glockenschlag aus ihrer Richtung.
    // ZU ZWEIT LÄUTET SIE FÜR BEIDE (M83): Jeder Spieler hat seine eigene
    // Welt, also auch seine eigenen Horcher – ohne diese Nachricht lockt die
    // Glocke nur die eigenen, und „ich läute, du schleichst vorbei" gäbe es
    // nicht. Im Testmodus dieselbe Glocke in der anderen Welt (wie die Platten).
    for (const bl of world.consumeRings()) {
      audio.bellRing(bl.x - world.ball.x, bl.y - world.ball.y);
      haptics.checkpoint();
      flash(t('st.bell'));
      const i = world.bells.indexOf(bl);
      if (mp) mp.transport.send('bell', { f: activeFloor, i });
      if (mpTest) mpTestOther().loaded.floors[activeFloor]?.world.ringBellAt(i);
    }

    for (const hit of hits) {
      const wall = hit.wall;
      // Dämmerung (M43): Die erste Berührung löscht das Licht – außer der
      // Spieler hat sich das Tutorial ausdrücklich hell gewünscht.
      if (duskStart === null && loaded?.floors[activeFloor]?.dusk === true && !(mode?.kind === 'tutorial' && profile.tutorialBright)) {
        duskStart = now;
        flash(t('st.dusk'));
      }
      wall.litFrom = 0; // Berührung leuchtet sofort, ohne Ping-Verzögerung
      wall.litUntil = now + 1200; // Echo: berührte Wand kurz sichtbar machen
      const intensity = Math.min(1, hit.impact / 500);
      if (intensity <= 0.06) continue;
      audio.hit(intensity, hit.nx, hit.ny, wall.absorb === true);
      haptics.hit(intensity);
      // Jukebox angerempelt: nächster Titel. Ein Streifschuss zählt nicht –
      // sonst schaltet ein an der Kante entlangrollender Ball durch.
      if (wall.jukebox !== undefined && intensity > 0.1) {
        const box = world.jukeboxes[wall.jukebox];
        if (box) skipJukebox(box, intensity, now);
      }
      // Brüchige Wand: knirscht bei kräftigen Treffern, stürzt irgendwann ein.
      // Einseitig (M66): von der falschen Seite ist sie eine gewöhnliche Wand.
      if (wall.hp !== undefined && intensity > 0.2 && brittleBreakable(wall, world.ball.x, world.ball.y)) {
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
    audio.beacon(gdx, gdy, Math.min(1, gdist / maxDist), activeFloor !== loaded!.goalFloor || shield(gdx, gdy) < 1);

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
      audio.setHoleRumble(
        danger * shield(dangerHole.x - world.ball.x, dangerHole.y - world.ball.y),
        dangerHole.x - world.ball.x,
        dangerHole.y - world.ball.y,
      );
    } else {
      audio.setHoleRumble(0, 0, 0);
    }
    // Wächter: Brummen aus seiner Richtung, fließt in die Gefahr (Herzschlag) ein
    let guardDanger = 0;
    let nearGuard: { dx: number; dy: number } | null = null;
    // Schläfer (M45): schnarcht statt zu brummen – eigener Bus, eigene Nähe.
    let snoreClose = 0;
    let nearSleeper: { dx: number; dy: number } | null = null;
    for (const g of world.guards) {
      const d = Math.max(0, Math.hypot(g.x - world.ball.x, g.y - world.ball.y) - g.r);
      const c = Math.max(0, 1 - d / GUARD_HEAR);
      if (World.asleep(g)) {
        if (c > snoreClose) {
          snoreClose = c;
          nearSleeper = { dx: g.x - world.ball.x, dy: g.y - world.ball.y };
        }
        continue;
      }
      if (c > guardDanger) {
        guardDanger = c;
        nearGuard = { dx: g.x - world.ball.x, dy: g.y - world.ball.y };
      }
    }
    if (nearGuard) audio.setGuard(guardDanger * shield(nearGuard.dx, nearGuard.dy), nearGuard.dx, nearGuard.dy);
    else audio.setGuard(0, 0, 0);
    if (nearSleeper) audio.setSnore(snoreClose * shield(nearSleeper.dx, nearSleeper.dy), nearSleeper.dx, nearSleeper.dy);
    else audio.setSnore(0, 0, 0);

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
    if (nearListener)
      audio.setListener(listenerClose * shield(nearListener.dx, nearListener.dy), activity, nearListener.dx, nearListener.dy);
    else audio.setListener(0, 0, 0, 0);
    const listenerDanger = listenerClose * (0.25 + 0.75 * activity);

    // Nebel: im Kern klingt alles wie durch Watte (ein Lowpass hinter dem Master).
    audio.setFog(world.inFog() ? 1 : 0);
    // Hallraum (M46): Nachhall an, solange der Ball in der Zone ist.
    audio.setReverb(world.inReverb() ? 1 : 0);

    // Eis: kristallines Sirren, solange der Ball darauf gleitet.
    audio.setIce(world.onIce() ? Math.min(1, world.ball.speed / 500) : 0);

    if (danger > 0.55) haptics.holeWarning(danger);
    audio.heartbeat(Math.max(danger, guardDanger, listenerDanger));

    // Schlüssel: Klimpern in Hörweite, Einsammeln öffnet die Tür.
    // Stimmgabel (M45): ungepannter Ton, Schwebung aus der Neigungsrichtung.
    let forkLevel = 0;
    let forkBeat = 0;
    for (const key of world.keys) {
      if (key.collected) continue;
      const kdx = key.x - world.ball.x,
        kdy = key.y - world.ball.y;
      const kd = Math.hypot(kdx, kdy);
      if (key.voice === 'fork' && kd >= key.r + world.ball.r && kd < KEY_HEAR) {
        const tone = forkTone(tilt.x, tilt.y, kdx, kdy);
        const level = (1 - kd / KEY_HEAR) * shield(kdx, kdy);
        if (level > forkLevel) {
          forkLevel = level;
          forkBeat = tone.beatHz;
        }
        continue;
      }
      if (kd < key.r + world.ball.r) {
        key.collected = true;
        audio.collectKey();
        haptics.checkpoint();
        // Coop (M59): Schlüssel gelten für beide – dem Partner melden. Im Race
        // nicht: dort hilft niemand (so rechnet auch der Beweis).
        if (mp && mp.mode === 'coop' && mp.phase === 'playing')
          mp.transport.send('key', { f: activeFloor, i: world.keys.indexOf(key) });
        // Ob die Tür damit aufgeht, entscheidet updateDoors (require any/all)
        // über ALLE Ebenen – das Lösbarkeits-Modell (coopReachable) ist
        // ebenenübergreifend, das Spiel muss dasselbe tun.
        const opened = updateDoors(now);
        flash(opened.has(key.opens) ? t('st.door') : t('st.keyMore'));
      } else if (kd < KEY_HEAR) {
        // Hinter einer Schallschutzwand klingt der Schlüssel wie weit weg.
        audio.keyTinkle(kdx, kdy, Math.min(1, kd / KEY_HEAR / shield(kdx, kdy)));
      }
    }
    audio.setFork(forkLevel, forkBeat);

    // Sanduhr (M45): einsammeln verlängert die Par.
    for (const hg of world.hourglasses) {
      if (hg.collected) continue;
      if (Math.hypot(hg.x - world.ball.x, hg.y - world.ball.y) < hg.r + world.ball.r) {
        hg.collected = true;
        bonusS += hg.bonusS;
        audio.collectHourglass();
        haptics.checkpoint();
        flash(t('st.hourglass', { n: hg.bonusS }));
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
      // Die SCHALE eines Resonanzfeldes ist für die Physik ein Anker, klingt
      // aber nicht wie einer (M91b): Sie hat ihre eigene Stimme – den Ton.
      // Ein Element mit zwei Signaturen wäre eine zweite Bedeutung, und beim
      // Stimmen lag das Anker-Brummen genau auf den Tönen.
      if (a.resonance) continue;
      const d = Math.hypot(a.x - world.ball.x, a.y - world.ball.y);
      const c = Math.max(0, 1 - d / (a.r + ANCHOR_HEAR));
      if (c > anchorClose) {
        anchorClose = c;
        nearAnchor = { dx: a.x - world.ball.x, dy: a.y - world.ball.y };
      }
    }
    if (nearAnchor) audio.setAnchor(anchorClose * shield(nearAnchor.dx, nearAnchor.dy), nearAnchor.dx, nearAnchor.dy);
    else audio.setAnchor(0, 0, 0);

    // DUETT (M91): Die beiden Resonanztöne – EINMAL je Frame gerechnet, denn
    // Klang, Türregel (heldIds) und der Haken für die E2E müssen dasselbe
    // sagen. Gerechnet wird NACH `world.step()` (Lektion aus M90): „stehe ich
    // auf dem Feld?" ist eine Frage an die neue Lage, nicht an die alte.
    duet = duetFrame(now, tilt);
    audio.setResonance(
      duet.mine !== null ? centsToHz(duet.mine) : null,
      duet.theirs !== null ? centsToHz(duet.theirs) : null,
      duet.his ? duet.his.x - world.ball.x : 0,
      duet.his ? duet.his.y - world.ball.y : 0,
      duet.aim,
      // FÜHRUNGSTON (v3.25.4) nur, wo es sonst keine Schwebung gibt: Beim
      // EINKLANG schwebt sein Ton schon gegen meinen, bei einer QUINTE nicht
      // (zwei Töne im Quintabstand schweben nicht). Dann spielt das Spiel
      // leise den Ton mit, den ich treffen müsste – der schwebt gegen meinen,
      // und die Schwebung wird langsamer, bis sie steht.
      duet.mine !== null && duet.theirs !== null && duet.interval && duet.interval !== 'unison'
        ? centsToHz(guideCents(duet.mine, duet.theirs, duet.interval))
        : null,
    );

    // Windzonen: hörbar in der Nähe, spürbar (Kraft) mittendrin
    let bestZone: { dist: number; dx: number; dy: number } | null = null;
    for (const z of world.windZones) {
      const p = zoneProximity(z, world.ball);
      if (!bestZone || p.dist < bestZone.dist) bestZone = p;
    }
    if (bestZone) {
      audio.setWind(Math.max(0, 1 - bestZone.dist / WIND_HEAR) * shield(bestZone.dx, bestZone.dy), bestZone.dx, bestZone.dy);
    }

    // Strömungen: pulsierendes Rauschen in Hörweite (Richtung wie beim Wind).
    let bestCurrent: { dist: number; dx: number; dy: number } | null = null;
    for (const z of world.currents) {
      const p = zoneProximity(z, world.ball);
      if (!bestCurrent || p.dist < bestCurrent.dist) bestCurrent = p;
    }
    if (bestCurrent) {
      audio.setCurrent(
        Math.max(0, 1 - bestCurrent.dist / CURRENT_HEAR) * shield(bestCurrent.dx, bestCurrent.dy),
        bestCurrent.dx,
        bestCurrent.dy,
      );
    }

    // Zeitschloss-Schalter: Betreten spannt das Uhrwerk (Draufbleiben frischt
    // stumm auf); die verknüpften Türen laufen unten über alle Ebenen synchron.
    for (const sw of world.switches) {
      const on = Math.hypot(sw.x - world.ball.x, sw.y - world.ball.y) < sw.r + world.ball.r / 2;
      if (on) {
        sw.openUntil = now + sw.durationS * 1000;
        // Coop (M59): der Partner bekommt denselben Timer – beim Druck sofort,
        // beim Draufbleiben alle 500 ms aufgefrischt.
        if (mp && mp.mode === 'coop' && mp.phase === 'playing') {
          const k = `${activeFloor}:${world.switches.indexOf(sw)}`;
          if (!sw.held || now - (mp.switchSyncAt.get(k) ?? -Infinity) > 500) {
            mp.switchSyncAt.set(k, now);
            mp.transport.send('switch', { f: activeFloor, i: world.switches.indexOf(sw), ms: sw.durationS * 1000 });
          }
        }
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
        let urgency = 0; // dringlichster laufender Timer (0 = keiner aktiv)
        let running = 0;
        for (const s of allSwitches) {
          if (s.openUntil !== null && s.openUntil > now) {
            running++;
            urgency = Math.max(urgency, 1 - (s.openUntil - now) / (s.durationS * 1000));
          }
        }
        updateDoors(now);
        if (running) audio.switchTick(urgency);
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
    if (nearPortal) audio.setPortal(portalCloseness * shield(nearPortal.dx, nearPortal.dy), nearPortal.dx, nearPortal.dy);
    else audio.setPortal(0, 0, 0);

    if (!warpReady && !world.transporters.some((t) => Math.hypot(t.x - world!.ball.x, t.y - world!.ball.y) < t.r + world!.ball.r + 10)) {
      warpReady = true;
    }
    const pad = warpReady && !disconnected ? world.transporterHit() : null;
    if (pad) {
      pad.litFrom = 0;
      pad.litUntil = now + 1200;
      startWarp(pad.tx, pad.ty, pad.targetFloor, pad.dir);
      renderer.follow(world.ball.x, world.ball.y);
      renderer.draw(world, { debug, ...lightOpts(now), now });
      return;
    }

    if (mp && mp.phase === 'playing' && !disconnected) mpFrame(now);
    if (mpTest) mpTestFrame(now, dt);
    advanceIdleWorlds(dt);
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

    // Im Ziel steht die Uhr auf der erreichten Zeit – das unmissverständliche
    // „du bist durch", während der Ball weiterrollen darf.
    tog = togetherState(now);
    const testSide = mpTest ? mpTest.sides[mpTest.active]! : null;
    const shownTime = testSide?.elapsed ?? mp?.localElapsed ?? (now - t0) / 1000;
    timerEl.textContent = fmtTime(shownTime);
    timerEl.classList.toggle('done', mp?.localFinished === true || testSide?.done === true);
    // Nur bei Änderung schreiben: erspart Layout-Arbeit pro Frame.
    const pingsTxt = '●'.repeat(pings) + '○'.repeat(Math.max(0, pingMax - pings));
    if (pingsEl.textContent !== pingsTxt) pingsEl.textContent = pingsTxt;
    const allGems = loaded!.floors.flatMap((f) => f.world.gems);
    const gemsTxt = allGems.length
      ? `💎 ${allGems.filter((g) => g.collected).length}/${allGems.length}`
      : '';
    if (gemsEl.textContent !== gemsTxt) gemsEl.textContent = gemsTxt;
    // Er wartet im Ziel: Pille in Partnerfarbe plus ein Ruf (die Sperre in
    // audio.waitCall hält den Abstand). Ohne diese Rückmeldung wäre der Modus
    // Frust – „nichts passiert" sähe wie ein Fehler aus.
    const waitTxt = tog.waits ? t('hud.partnerWaits') : '';
    if (waitChipEl.textContent !== waitTxt) waitChipEl.textContent = waitTxt;
    if (tog.waits) audio.waitCall();

    const fallen = disconnected ? null : world.fallenHole();
    const caught = fallen || disconnected ? null : world.guardCaught();
    const heard = fallen || caught || disconnected ? null : world.listenerCaught();
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
    } else if (mp && disconnected) {
      const remaining = Math.max(0, 10 - (now - mp.disconnectedAt!) / 1000);
      statusEl.textContent = t('mp.lostCountdown', { n: remaining.toFixed(0) });
    } else if (mp?.localFinished && state === 'playing') {
      statusEl.textContent = t(mp.mode === 'coop' ? 'mp.doneCoop' : 'mp.doneRace');
    } else if (tog.on && (tog.mine || tog.waits)) {
      // M90: Einer allein im Ziel gewinnt NICHT – er wartet, und beide hören
      // und lesen das. Erst das Rendezvous schließt ab, auf beiden Seiten
      // unabhängig.
      if (tog.win) mpTogetherWin(now);
      else statusEl.textContent = t(tog.mine ? 'st.waitTogether' : 'st.partnerWaits');
    } else if (mp && world.goalReached()) {
      mpLocalFinish(now);
    } else if (mpTest && world.goalReached()) {
      mpTestFinish(now);
    } else if (mpTest?.sides[mpTest.active]!.done) {
      statusEl.textContent = t(mpTest.coop ? 'mp.doneCoop' : 'mp.doneRace');
    } else if (!mp && !mpTest && world.goalReached()) {
      winRun(now, (now - t0) / 1000);
    } else if (messageUntil > now) {
      statusEl.textContent = message;
    } else if (duet.mine !== null && duet.interval) {
      // AUF DEM FELD SAGT DAS SPIEL, WAS ZU TUN IST (v3.25.5): Ein Feld, das
      // nur summt, ist ein Rätsel über das Rätsel – niemand errät, dass die
      // NEIGUNGSRICHTUNG stimmt und ein Tipp genügt. Vier Stufen, damit die
      // Zeile mitgeht: allein / suchen / fast / es steht.
      statusEl.textContent = t(
        duet.open
          ? 'st.tuneOpen'
          : duet.theirs === null
            ? 'st.tuneAlone'
            : duet.aim > 0.5
              ? 'st.tuneClose'
              : 'st.tuneSearch',
        { int: t(duet.interval === 'fifth' ? 'st.int.fifth' : 'st.int.unison') },
      );
    } else {
      const modeLabel = t(input.hasSensor ? 'hud.tilt' : 'hud.keys');
      statusEl.textContent = debug ? `Debug · ${modeLabel} · x ${tilt.x.toFixed(2)} y ${tilt.y.toFixed(2)} · ${input.diagnostics()}` : '';
    }
  }

  renderer.follow(world.ball.x, world.ball.y);
  // KEIN PHANTOM AM URSPRUNG (M88): `mp.remote` steht bis zur ersten
  // `state`-Nachricht auf (0,0) – das ist keine Position, sondern „noch nichts
  // gehört". Vorher klang und leuchtete der Partner deshalb kurz in der Ecke
  // der Welt (in der CI gemessen: dx −50 statt +300, Nähe 0,70). Erst wenn er
  // sich EINMAL gemeldet hat (`lastAt > 0`), gibt es ihn – Bild und Klang aus
  // derselben Wahrheit.
  const buddy =
    mp && (mp.phase === 'playing' || mp.phase === 'done') && mp.remote.lastAt > 0
      ? {
          x: mp.remote.x,
          y: mp.remote.y,
          sameFloor: mp.remote.floor === activeFloor,
          floorLabel: mp.remote.floor === activeFloor ? undefined : `E${mp.remote.floor + 1}`,
          done: mp.remote.finished,
          // Coop auf heller Ebene (M62): Partner als fester roter Ball.
          solid: mp.mode === 'coop' && bright(),
        }
      : // Testmodus (M69): der ruhende Spieler IST der Partner – dieselbe
        // Darstellung wie im echten Spiel, damit die Vorschau nicht lügt.
        mpTest
        ? {
            x: mpTestOther().loaded.world.ball.x,
            y: mpTestOther().loaded.world.ball.y,
            sameFloor: mpTestOther().floor === activeFloor,
            floorLabel: mpTestOther().floor === activeFloor ? undefined : `E${mpTestOther().floor + 1}`,
            done: mpTestOther().done,
            solid: mpTest.coop && bright(),
          }
        : null;
  // Partner-Klang (M88): NUR im Coop – im Race ist die Blindheit das Rennen,
  // wie dort auch Platten nicht zählen und Schlüssel lokal wirken (M57/M59).
  // Gehört wird er nach denselben Regeln wie jede Quelle: Nähe, Richtung
  // (HRTF), eine Schallschutzwand dazwischen dämpft (shield), andere Ebene =
  // fernes Grundeln (muffled), und der Nebel dämpft am Master von selbst.
  // Seine Geschwindigkeit trägt den ROLLANTEIL: im echten Netz abgeleitet
  // (M88, mp.remote.speed), im Testmodus liegt die abgegebene Kugel ohne
  // Schwung – dort hört man also nur den Grundton, und das ist die Wahrheit.
  const buddyCoop = mp ? mp.mode === 'coop' && mp.phase === 'playing' : mpTest !== null && mpTest.coop;
  let buddyHeard: { closeness: number; moving: number; dx: number; dy: number; muffled: boolean } | null = null;
  if (buddy && buddyCoop && state === 'playing') {
    const bdx = buddy.x - world.ball.x;
    const bdy = buddy.y - world.ball.y;
    // Meldet der Partner gerade nichts (Funkloch), gilt er als ruhend statt
    // als ewig rollend – der letzte Messwert wäre eine Lüge, die nachhallt.
    const speed = mp
      ? now - mp.remote.lastAt < 400
        ? mp.remote.speed
        : 0
      : mpTestOther().loaded.world.ball.speed;
    const snd = buddySound(Math.hypot(bdx, bdy), speed, world.maxSpeed);
    const near = snd.closeness * (buddy.sameFloor ? shield(bdx, bdy) : 1);
    audio.setBuddy(near, bdx, bdy, snd.moving, !buddy.sameFloor);
    buddyHeard = { closeness: near, moving: snd.moving, dx: bdx, dy: bdy, muffled: !buddy.sameFloor };
  } else {
    audio.setBuddy(0, 0, 0, 0);
  }
  (window as unknown as { __tiltrBuddy?: unknown }).__tiltrBuddy = buddyHeard;
  // DUETT (M91): Töne, Genauigkeit und Türzustand offenlegen – „warum geht das
  // Tor nicht auf?" ist ohne die beiden Zahlen nicht zu beantworten.
  (window as unknown as { __tiltrResonance?: unknown }).__tiltrResonance =
    duet === DUET_NONE
      ? null
      : {
          mine: duet.mine === null ? null : Math.round(duet.mine),
          theirs: duet.theirs === null ? null : Math.round(duet.theirs),
          interval: duet.interval,
          aim: Number(duet.aim.toFixed(2)),
          open: duet.open,
          // WO sein Ton klingt (Richtung zu SEINEM Feld) – ohne das ist eine
          // falsche Ortung nicht prüfbar (v3.25.4).
          hisDx: duet.his && world ? Math.round(duet.his.x - world.ball.x) : null,
          hisDy: duet.his && world ? Math.round(duet.his.y - world.ball.y) : null,
        };
  (window as unknown as { __tiltrMarks?: unknown }).__tiltrMarks = {
    left: markMax() - ownCount(marks),
    max: markMax(),
    mine: marks.filter((m) => m.mine),
    theirs: marks.filter((m) => !m.mine),
  };

  // Wegmarken (M89): Es tickt immer nur die NÄCHSTE auf DIESER Ebene – ein
  // Bus, eine Richtung, wie beim Automaten. Eine Schallschutzwand dazwischen
  // dämpft sie wie jede Quelle (shield), der Nebel am Master von selbst.
  const floorMarks = marks.filter((m) => m.floor === activeFloor);
  if (state === 'playing') {
    const near = nearestMark(marks, activeFloor, world.ball.x, world.ball.y);
    if (near) audio.markTick(near.dx, near.dy, Math.min(1, near.dist / MARK_HEAR / shield(near.dx, near.dy)));
  }

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
  renderer.draw(world, {
    debug,
    ...lightOpts(now),
    now,
    buddy,
    marks: floorMarks,
    ghost: ghostOpt,
    // M90: Im Rendezvous leuchtet das eigene Ziel ruhig weiter, solange ich
    // darin liege – die Uhr steht dabei noch nicht.
    goalDone: mp?.localFinished === true || tog.mine,
    heading: fpOn() ? fpState.heading : 0,
  });
  // Testbarkeits-Hooks für E2E
  (window as unknown as { __tiltrBall?: { x: number; y: number } }).__tiltrBall = {
    x: world.ball.x,
    y: world.ball.y,
  };
  (window as unknown as { __tiltrWorld?: unknown }).__tiltrWorld = {
    crystals: world.crystals.length,
    anchors: world.anchors.length,
    glass: world.glass.length,
    hourglasses: world.hourglasses.length,
    bonusS,
    bells: world.bells.length,
    ringing: world.bells.filter((b) => b.ringLeft > 0).length,
    reverbZones: world.reverbZones.length,
    inReverb: world.inReverb(),
    roaming: world.holes.filter((h) => h.roam).length,
    boulders: world.boulders.filter((s) => !s.sunk).length,
    boulderCells: world.boulders.filter((s) => !s.sunk).map((s) => `${s.cell[0]},${s.cell[1]}`),
    sunk: world.boulders.filter((s) => s.sunk).length,
    plateHeld: world.plates.filter((p) => p.boulder).length,
    roamX: world.holes.find((h) => h.roam)?.x ?? null,
    sleepers: world.guards.filter((g) => g.sleeper).length,
    asleep: world.guards.filter((g) => World.asleep(g)).length,
    mirrors: world.walls.filter((w) => w.mirror).length,
    forks: world.keys.filter((k) => k.voice === 'fork').length,
    keysCollected: world.keys.filter((k) => k.collected).length,
    // Türen dieser Ebene: wie viele es FÜR MICH gibt (M72: eine Tür für den
    // anderen Spieler ist hier eine Wand) und welche gerade offen sind (M71:
    // eine Platte hält nur, solange wirklich jemand darauf steht).
    doors: world.walls.filter((w) => w.door !== undefined).length,
    doorsOpen: world.walls.filter((w) => w.door?.open === true).map((w) => w.door!.id),
    // Welche PLATTEN gehalten werden (M76): je Platte, nicht je Tür – zwei
    // Platten derselben Tür sind zwei Bedingungen.
    platesHeld: world.plates.filter((p) => p.held || p.boulder === true).map((p) => p.id),
    doorsLatched: world.walls.filter((w) => w.door?.latched === true).map((w) => w.door!.id),
    transporters: world.transporters.length,
    torches: world.torches.length,
    brittleSided: world.walls.filter((w) => w.hpSide !== undefined).length,
    // Licht je Spieler (M92): `bright()` liest die GELADENE Ebene, also die
    // Ladung DIESES Spielers – damit sagt der Haken „ist es für MICH hell?"
    // und macht „bei einem hell, beim anderen dunkel" prüfbar (E2E Lauf 49).
    bright: bright(),
    lightGain: lightGain(now),
    respawnFloor: respawnPoint.floor,
    spotlight: [...spotTypes],
  };
  (window as unknown as { __tiltrFp?: unknown }).__tiltrFp = fpOn()
    ? { heading: fpState.heading, turnRate: fpState.turnRate, view: renderer.lastView }
    : null;
  if (world.jukeboxes.length) {
    // Es klingt immer nur EINER (der nächste) – und nur der hat ein bpm.
    const live = world.jukeboxes.find((j) => j.bpm !== undefined) ?? null;
    (window as unknown as { __tiltrJukebox?: unknown }).__tiltrJukebox = {
      boxes: world.jukeboxes.length,
      index: live?.index ?? null,
      title: live ? (tuneOf(live.playlist[live.index])?.title ?? null) : null,
      tracks: live?.playlist.length ?? 0,
      ...audio.musicState(),
    };
  } else {
    (window as unknown as { __tiltrJukebox?: unknown }).__tiltrJukebox = null;
  }
  (window as unknown as { __tiltrGhost?: unknown }).__tiltrGhost = ghost
    ? { time: ghost.time, active: ghostPos !== null }
    : null;
  // Neigung offenlegen: „warum rollt die Kugel von allein?" ist ohne diesen
  // Wert Raten – die Neigung schwingt nach dem Loslassen aus (Glättung).
  (window as unknown as { __tiltrTilt?: unknown }).__tiltrTilt = { x: input.tilt.x, y: input.tilt.y };
  (window as unknown as { __tiltrMpTest?: unknown }).__tiltrMpTest = mpTest
    ? {
        player: mpTest.active + 1,
        coop: mpTest.coop,
        floor: activeFloor,
        buddySolid: renderer.buddySolid,
        held: [...mpTest.held],
        done: mpTest.sides.map((sd) => sd.done),
        balls: mpTest.sides.map((sd) => ({ x: sd.loaded.world.ball.x, y: sd.loaded.world.ball.y, vx: sd.loaded.world.ball.vx, vy: sd.loaded.world.ball.vy, floor: sd.floor })),
        // Klingt die Glocke in BEIDEN Welten (M83)? Und laufen die Horcher
        // drüben hin? Beides muss von außen prüfbar sein.
        ringing: mpTest.sides.map((sd) => sd.loaded.floors[sd.floor]!.world.bells.filter((b) => b.ringLeft > 0).length),
        // Stehen die Steine in BEIDEN Welten gleich (M84)?
        boulders: mpTest.sides.map((sd) =>
          sd.loaded.floors[sd.floor]!.world.boulders.filter((st) => !st.sunk).map((st) => `${st.cell[0]},${st.cell[1]}`),
        ),
        plateBoulder: mpTest.sides.map(
          (sd) => sd.loaded.floors[sd.floor]!.world.plates.filter((pl) => pl.boulder).length,
        ),
        listeners: mpTest.sides.map((sd) =>
          sd.loaded.floors[sd.floor]!.world.listeners.map((l) => ({ x: Math.round(l.x), y: Math.round(l.y) })),
        ),
      }
    : null;
  (window as unknown as { __tiltrMp?: unknown }).__tiltrMp = mp
    ? {
        phase: mp.phase,
        levelId: mp.level?.id ?? null,
        player: mp.host ? 1 : 2,
        custom: mp.custom,
        remote: { ...mp.remote },
        mode: mp.mode,
        // Gilt hier die Rendezvous-Regel (M90)? Ohne diesen Haken war „einer
        // allein gewinnt nicht" von „das Flag kam nie an" nicht zu trennen.
        together: togetherMode(),
        localFinished: mp.localFinished,
        goalLit: renderer.goalLit,
        buddySolid: renderer.buddySolid,
        localHolds: [...mp.localHolds],
        remoteHolds: [...mp.remoteHolds],
      }
    : null;
}

refreshMenu();
requestAnimationFrame(frame);
