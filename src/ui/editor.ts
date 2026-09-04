// Level-Editor (M12a): editiert eine ROHE LevelDef. Jede Änderung läuft
// durch parseLevel -> loadLevel -> Renderer.draw({debug}) – die Vorschau IST
// das Spiel-Rendering; wirft der Loader, bleibt das letzte gültige Bild
// stehen und #edStatus nennt den Fehler. Darüber liegt die Editor-Ebene
// (Grid, Auswahl, Verknüpfungslinien). Tablet-first: Pinch-Zoom und
// Ein-Finger-Pan auf dem Canvas, Tap = Werkzeug-Aktion.
//
// M12a bewusst ohne: Mehr-Ebenen, Transporter, Druckplatten (MP-only),
// Import/Export/Share (M12b).

import { CELL } from '../core/constants';
import { breathAt } from '../core/breathing';
import type { GameAudio } from '../audio/audio';
import { Renderer } from '../render/renderer';
import { WORLD } from '../render/palette';
import { loadLevel, type LoadedLevel } from '../levels/loader';
import { parseLevel } from '../levels/schema';
import { validateLevel, isShareable, buildFloorCells, SOFT_CHECKS, type CheckResult } from '../levels/validate';
import { encodeLevel, SHARE_WARN_BYTES } from '../levels/shareCodec';
import { galleryEntries } from '../elements';
import { extraEntries } from './gallery';
import { EXPORT_EXT, saveTextFile } from './download';
import { MUSIC, compiledById } from '../music';
import { compileTune, type CompiledTune, type Tune } from '../audio/chiptune';
import { previewTune } from '../audio/musicPreview';
import { clearDraft, exportPayload, saveDraft, workshop } from '../workshop';
import { findings, findingsSummary } from '../levels/diagnosis';
import { twoTap } from './twoTap';
import { t, applyI18n, type Dict } from '../i18n';
import { ZodError } from 'zod';

type Dir = 'n' | 'e' | 's' | 'w';
export type Edge = [[number, number], Dir];

/* Rohe Def-Ausschnitte – bewusst locker typisiert (Quelle der Wahrheit ist
   das zod-Schema; der Editor mutiert Rohdaten und lässt parseLevel richten). */
interface RawEl {
  type: string;
  cell?: [number, number];
  edge?: Edge;
  patrol?: Array<[number, number]>;
  [k: string]: unknown;
}
interface RawFloor {
  size: [number, number];
  maze: {
    seed: number;
    carve: Edge[];
    add: Edge[];
    brittle: Edge[];
    /** Einseitig brüchig (M66); optional, weil Roh-Defs es weglassen dürfen –
     *  normalizeDraft füllt auf, die Helfer unten tolerieren das Fehlen. */
    brittleSide?: Array<[Edge, Dir]>;
    absorb: Edge[];
    mirrors: Edge[];
    [k: string]: unknown;
  };
  elements: RawEl[];
  start: [number, number];
  goal: [number, number] | null;
  /** Zwei Spieler (M57): Start/Ziel des Gasts – optional, fehlen = wie Spieler 1. */
  start2?: [number, number];
  goal2?: [number, number];
  [k: string]: unknown;
}
const MAX_FLOORS = 4; // Schema-Limit
export interface RawLevel {
  id: string;
  name: string;
  intro?: string;
  parTimeS?: number;
  pingBudget?: number;
  floors: RawFloor[];
  /** Zwei Spieler (M57): 2 = nur zu zweit spielbar (Lobby), mpMode wählt den Modus. */
  players?: 1 | 2;
  mpMode?: 'coop' | 'race' | 'any';
  [k: string]: unknown;
}

/** Tap-Ziel: Kante, wenn der Punkt nah an einer INNEREN Gridlinie liegt,
 *  sonst Zelle. Kanten kommen kanonisch als ('e' | 's') des linken/oberen
 *  Nachbarn zurück. preferEdge (Wand-Werkzeug, Tür/Schiebewand): die
 *  NÄCHSTE innere Kante gewinnt IMMER – auf dem Phone ist die schmale
 *  Kantenzone sonst mit dem Finger kaum zu treffen. Exportiert für Tests. */
export function pickTarget(
  wx: number,
  wy: number,
  cols: number,
  rows: number,
  preferEdge = false,
): { kind: 'cell'; cell: [number, number] } | { kind: 'edge'; edge: Edge } | null {
  if (wx < 0 || wy < 0 || wx >= cols * CELL || wy >= rows * CELL) return null;
  const cx = Math.floor(wx / CELL);
  const cy = Math.floor(wy / CELL);
  const dxLeft = wx - cx * CELL;
  const dxRight = (cx + 1) * CELL - wx;
  const dyTop = wy - cy * CELL;
  const dyBottom = (cy + 1) * CELL - wy;
  const EDGE_ZONE = 18; // Welteinheiten um die Gridlinie (Standard-Werkzeuge)
  // Kandidaten nach Distanz, nur INNERE Kanten (Außenrand ist unantastbar).
  const candidates: Array<[number, Edge | null]> = [
    [dxLeft, cx > 0 ? [[cx - 1, cy], 'e'] : null],
    [dxRight, cx < cols - 1 ? [[cx, cy], 'e'] : null],
    [dyTop, cy > 0 ? [[cx, cy - 1], 's'] : null],
    [dyBottom, cy < rows - 1 ? [[cx, cy], 's'] : null],
  ];
  candidates.sort((a, b) => a[0] - b[0]);
  for (const [dist, edge] of candidates) {
    if (!preferEdge && dist >= EDGE_ZONE) break;
    if (edge) return { kind: 'edge', edge };
  }
  return { kind: 'cell', cell: [cx, cy] };
}

const edgeKey = (e: Edge) => `${e[0][0]},${e[0][1]},${e[1]}`;
const edgeIn = (list: Edge[], e: Edge) => list.some((x) => edgeKey(x) === edgeKey(e));
const edgeDrop = (list: Edge[], e: Edge) => {
  const i = list.findIndex((x) => edgeKey(x) === edgeKey(e));
  if (i !== -1) list.splice(i, 1);
};

export type EdgeState = 'open' | 'wall' | 'brittle' | 'absorb' | 'mirror';
export type WallVariant = 'solid' | 'brittle' | 'absorb' | 'mirror';
export type MazeEdits = { carve: Edge[]; add: Edge[]; brittle: Edge[]; brittleSide?: Array<[Edge, Dir]>; absorb: Edge[]; mirrors: Edge[] };
const sideDrop = (list: Array<[Edge, Dir]> | undefined, e: Edge) => {
  if (!list) return;
  const i = list.findIndex(([x]) => edgeKey(x) === edgeKey(e));
  if (i !== -1) list.splice(i, 1);
};
/** Bruchseite einer einseitig brüchigen Kante (M66), undefined = beidseitig. */
export function brittleSideOf(maze: MazeEdits, e: Edge): Dir | undefined {
  return maze.brittleSide?.find(([x]) => edgeKey(x) === edgeKey(e))?.[1];
}
/** Bruchseite setzen (undefined = beidseitig). Nur sinnvoll auf brüchigen Kanten. */
export function setBrittleSide(maze: MazeEdits, e: Edge, side: Dir | undefined): void {
  maze.brittleSide ??= [];
  sideDrop(maze.brittleSide, e);
  if (side) maze.brittleSide.push([e, side]);
}

/** Sichtbarer Zustand einer Kante: Variante, wenn gelistet; sonst offen/Wand
 *  nach dem AKTUELLEN Maze (Seed + Edits). */
export function edgeState(maze: MazeEdits, e: Edge, open: boolean): EdgeState {
  if (edgeIn(maze.absorb, e)) return 'absorb';
  if (edgeIn(maze.mirrors, e)) return 'mirror';
  if (edgeIn(maze.brittle, e)) return 'brittle';
  return open ? 'open' : 'wall';
}

/** Wand-Werkzeug: Wand oder keine Wand – nach SICHTBAREM Zustand. `open` =
 *  Kante ist im aktuellen Maze offen, `seedOpen` = im nackten Seed. Die
 *  Listen werden so gesetzt, dass der Zielzustand herauskommt, egal was der
 *  Seed an dieser Kante gewürfelt hat; eine entfernte Wand nimmt ihre
 *  Variante (brüchig/Schallschutz) mit. Früher lief hier ein Vierer-Zyklus
 *  über die LISTEN (Seed → carve → add → brüchig), der je nach Seed einen
 *  unsichtbaren Tap hatte – und die Variante gehört nicht in ein Werkzeug,
 *  sondern in die Eigenschaften der ausgewählten Wand (setEdgeVariant).
 *  Exportiert für Tests. Liefert den neuen Zustand. */
export function toggleEdge(maze: MazeEdits, e: Edge, open: boolean, seedOpen: boolean): EdgeState {
  edgeDrop(maze.carve, e);
  edgeDrop(maze.add, e);
  edgeDrop(maze.brittle, e);
  sideDrop(maze.brittleSide, e);
  edgeDrop(maze.absorb, e);
  edgeDrop(maze.mirrors, e);
  if (open) {
    if (seedOpen) maze.add.push(e);
    return 'wall';
  }
  if (!seedOpen) maze.carve.push(e);
  return 'open';
}

/** ALLE Wände einer Ebene abräumen – das Gegenstück zum Würfeln (M87). Jede
 *  INNERE Kante, die der NACKTE Seed als Wand würfelt, kommt in `carve`;
 *  `add` und alle Wand-VARIANTEN (brüchig samt Seite, Schallschutz, Spiegel)
 *  fallen weg, denn eine Variante ohne Wand lehnt der Loader ab. Der
 *  Außenrand bleibt unangetastet: Er ist keine beschreibbare Kante. Gefragt
 *  wird der Seed (`seedOpen`), nicht der sichtbare Zustand – so bleibt die
 *  Liste minimal, statt jede Kante des Feldes in den Teilen-Link zu schreiben.
 *  Türen und Schiebewände verlangen eine OFFENE Kante, sie überleben das
 *  also. Rein, exportiert für Tests. Liefert die Zahl der entfernten Wände. */
export function clearWalls(
  maze: MazeEdits,
  cols: number,
  rows: number,
  seedOpen: (e: Edge) => boolean,
): number {
  const interior: Edge[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (x < cols - 1) interior.push([[x, y], 'e']);
      if (y < rows - 1) interior.push([[x, y], 's']);
    }
  // Sichtbarer Zustand VOR dem Abräumen – nur zum Zählen; er folgt aus Seed
  // und Listen, ein zweiter Prädikat-Parameter wäre eine zweite Wahrheit.
  const wallBefore = (e: Edge) => (seedOpen(e) ? edgeIn(maze.add, e) : !edgeIn(maze.carve, e));
  const removed = interior.filter(wallBefore).length;
  maze.carve = interior.filter((e) => !seedOpen(e));
  maze.add = [];
  maze.brittle = [];
  if (maze.brittleSide) maze.brittleSide = [];
  maze.absorb = [];
  maze.mirrors = [];
  return removed;
}

/** Variante einer BESTEHENDEN Wand setzen: massiv, brüchig oder Schallschutz –
 *  genau eine Liste führt die Kante, die anderen nicht. Auf eine offene Kante
 *  angewandt ist das ein Fehler des Aufrufers (der Loader verlangt die Wand);
 *  der Editor bietet die Auswahl nur für Wände an. */
export function setEdgeVariant(maze: MazeEdits, e: Edge, v: WallVariant): void {
  edgeDrop(maze.brittle, e);
  edgeDrop(maze.absorb, e);
  edgeDrop(maze.mirrors, e);
  if (v !== 'brittle') sideDrop(maze.brittleSide, e); // Seite gehört zur brüchigen Wand
  if (v === 'brittle') maze.brittle.push(e);
  if (v === 'absorb') maze.absorb.push(e);
  if (v === 'mirror') maze.mirrors.push(e);
}

/** Landeplätze auf Ebene `floorIndex`: jede Transporter-Zielzelle, die auf
 *  dieser Ebene liegt – mit der Ebene, VON der man kommt. Rein, exportiert für
 *  Tests; der Editor zeichnet genau diese Liste. Ein Landeplatz ist KEIN
 *  Element: Die Zelle bleibt frei bebaubar und ein Tap darauf wählt nicht den
 *  Transporter (der steht ggf. auf einer anderen Ebene). */
export function landingsOn(
  level: RawLevel,
  floorIndex: number,
): Array<{ cell: [number, number]; from: number; index: number }> {
  const out: Array<{ cell: [number, number]; from: number; index: number }> = [];
  level.floors.forEach((f, from) => {
    f.elements.forEach((el, index) => {
      if (el.type !== 'transporter') return;
      const tg = el.target as { floor: number; cell: [number, number] } | undefined;
      if (tg && tg.floor === floorIndex) out.push({ cell: tg.cell, from, index });
    });
  });
  return out;
}

/** Zellen, die ein Element belegt – inklusive der Wächter-Wegpunkte, denn
 *  auf einer Patrouille wacht die Kugel nicht sicher auf. Kanten-Elemente
 *  (Tür, Schiebewand) belegen KEINE Zelle. */
function elementCells(fl: RawFloor): Set<string> {
  const taken = new Set<string>();
  for (const el of fl.elements) {
    if (el.cell) taken.add(`${el.cell[0]},${el.cell[1]}`);
    for (const p of el.patrol ?? []) taken.add(`${p[0]},${p[1]}`);
  }
  return taken;
}

/** Freie Zelle für Start bzw. Ziel: `prefer` gewinnt, wenn sie frei ist –
 *  sonst die erste freie in Leserichtung. `taken` sperrt zusätzlich (Start
 *  und Ziel dürfen nicht dieselbe Zelle sein). Exportiert für Tests.
 *  Ist NICHTS frei, kommt `prefer` zurück: eine Ebene ohne einzige freie
 *  Zelle ist kein Level mehr, und die Badges sagen das ohnehin. */
export function freeCellFor(
  fl: RawFloor,
  prefer: [number, number],
  taken: Array<[number, number]> = [],
): [number, number] {
  const blocked = elementCells(fl);
  for (const c of taken) blocked.add(`${c[0]},${c[1]}`);
  const [cols, rows] = fl.size;
  if (!blocked.has(`${prefer[0]},${prefer[1]}`) && prefer[0] < cols && prefer[1] < rows) return prefer;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) if (!blocked.has(`${x},${y}`)) return [x, y];
  }
  return prefer;
}

/** Ebene aus einem rohen Level entfernen und die Folgen aufräumen. Rein und
 *  exportiert, weil hier drei Invarianten gleichzeitig hängen und der
 *  Ablauf sonst nur per Klick prüfbar wäre (tests/editorFloors.test.ts). */
export function removeFloor(level: RawLevel, index: number): void {
  if (level.floors.length < 2 || !level.floors[index]) return;
  const hadGoal = level.floors[index]!.goal !== null;
  const hadGoal2 = level.floors[index]!.goal2 !== undefined;
  level.floors.splice(index, 1);
  // Transporter aufräumen: Ziele auf die Ebene fallen weg, höhere rutschen nach.
  for (const f of level.floors) {
    f.elements = f.elements.filter((el) => {
      const target = (el as { target?: { floor: number } }).target;
      return !(el.type === 'transporter' && target?.floor === index);
    });
    for (const el of f.elements) {
      const target = (el as { target?: { floor: number } }).target;
      if (el.type === 'transporter' && target && target.floor > index) target.floor--;
    }
  }
  const f0 = level.floors[0]!;
  // Ebene 1 gelöscht: Bis jetzt war der Start der nachrückenden Ebene ein
  // TOTER Zahlenwert (nur Ebene 1 setzt die Kugel, loader.ts) – ab jetzt ist
  // er echt. Er darf deshalb nicht in einem Loch, an einem Anker oder in
  // einem Automaten liegen.
  if (index === 0) f0.start = freeCellFor(f0, f0.start, f0.goal ? [f0.goal] : []);
  // Ein-Ziel-Invariante retten: das Ziel wandert notfalls auf Ebene 1 – in
  // eine FREIE Zelle, denn die Ecke kann längst belegt sein.
  if (hadGoal) f0.goal = freeCellFor(f0, [f0.size[0] - 1, f0.size[1] - 1], [f0.start]);
  // Zwei Spieler (M57): Der zweite Start lebt nur auf Ebene 1 – ein
  // nachgerückter `start2` wäre ein toter Wert, der plötzlich zählt: weg
  // damit, wenn er die Zelle eines Elements trifft, sonst behalten. Das
  // zweite Ziel wandert wie das erste in eine freie Zelle von Ebene 1.
  const taken = (): Array<[number, number]> => [f0.start, ...(f0.goal ? [f0.goal] : []), ...(f0.start2 ? [f0.start2] : [])];
  if (index === 0 && f0.start2) f0.start2 = freeCellFor(f0, f0.start2, [f0.start, ...(f0.goal ? [f0.goal] : [])]);
  if (hadGoal2) f0.goal2 = freeCellFor(f0, [f0.size[0] - 1, 0], taken());
}

/** Ladefehler lesbar machen (M61): Ein zod-Fehler kam als rohes JSON in die
 *  Statuszeile („[{ "expected": "string", "path": ["floors", 0, "elements",
 *  1, "opens"] … }]") – auf dem Phone ein Textblock, der nichts sagt. Jetzt:
 *  „E1 · Druckplatte 2: opens fehlt (expected string, received undefined)".
 *  Rein und exportiert (tests/editorErrors.test.ts). */
export function describeLoadError(err: unknown, def: { floors?: Array<{ elements?: Array<{ type?: string }> }> } | null): string {
  if (err instanceof ZodError) {
    const lines = err.issues.map((iss) => {
      const p = iss.path.map(String);
      let where = p.join('.');
      let field = '';
      if (p[0] === 'floors' && p[1] !== undefined) {
        const fl = Number(p[1]);
        where = `E${fl + 1}`;
        if (p[2] === 'elements' && p[3] !== undefined) {
          const i = Number(p[3]);
          const type = def?.floors?.[fl]?.elements?.[i]?.type;
          const name = type ? t(`el.${type}.title` as keyof Dict).split(' & ')[0] : t('ed.elements');
          where += ` · ${name} ${i + 1}`;
          field = p.slice(4).join('.');
        } else field = p.slice(2).join('.');
      } else field = where;
      const missing = /received undefined/.test(iss.message);
      const what = field ? (missing ? `${field} ${t('ed.errMissing')}` : field) : '';
      return `${where}${what ? `: ${what}` : ''} (${iss.message})`;
    });
    return lines.join(' · ');
  }
  return err instanceof Error ? err.message : String(err);
}

type Tool = 'select' | 'place' | 'wall' | 'erase' | 'start' | 'goal' | 'test';

/** Startpunkt für den TESTLAUF (⚑): Ebene + Zelle, an der die Vorschau die
 *  Kugel absetzt – statt am Level-Start. Kein Teil der Def (wird nicht
 *  gespeichert, nicht geteilt), lebt nur im Editor. */
export interface TestStart {
  floor: number;
  cell: [number, number];
}

/** Testlauf eines Entwurfs (M57): ⚑-Start und als welcher Spieler die
 *  Vorschau BEGINNT. Bei zwei Spielern lädt die Vorschau beide Welten und
 *  wechselt per 👥 (M69) – der Phantom-Partner, der „alle Platten hält",
 *  ist damit weg: es hält, wer wirklich drauf steht. */
export interface TestRun {
  from: TestStart | null;
  player: 1 | 2;
}

/** Palette: alles außer Druckplatte – die kommt nur bei ZWEI Spielern dazu
 *  (M57): Solo hält sie niemand, und der Beweis zählte sie trotzdem als
 *  Öffner (coopReachable) – ein grünes Level, das keiner lösen kann. */
const PLACEABLE = [
  'hole',
  'windZone',
  'current',
  'ice',
  'fogZone',
  'glass',
  'checkpoint',
  'gem',
  'echoCrystal',
  'key',
  'door',
  'timedSwitch',
  'slidingWall',
  'guard',
  'listener',
  'anchor',
  'hourglass',
  'bell',
  'reverbZone',
  'roamingHole',
  'boulder',
  'torch',
  'transporter',
  'jukebox',
] as const;
const EDGE_TYPES = new Set(['door', 'slidingWall']);

export interface EditorApi {
  open(def: RawLevel): void;
  /** Nach dem Preview: Panel wieder zeigen, Entwurf unverändert. */
  reopen(): void;
  isOpen(): boolean;
}

export function setupEditor(opts: {
  onTest: (def: RawLevel, run: TestRun) => void;
  onSaved: () => void;
  /** Für die Ton-Vorschau im Eigenschaften-Panel (dieselbe Klang-Signatur,
   *  die die Galerie anspielt – eine Quelle: die Element-Registry). */
  audio: GameAudio;
  /** ‹ schließt den Editor – zurück gehört man in die Werkstatt, nicht
   *  ins Hauptmenü (dort ist man mit einem Tap, über die Werkstatt). */
  onClose: () => void;
}): EditorApi {
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const panel = $('editor');
  const canvas = $<HTMLCanvasElement>('edCanvas');
  const nameInput = $<HTMLInputElement>('edName');
  const badgesEl = $('edBadges');
  const statusEl = $('edStatus');
  const paletteEl = $('edPalette');
  const propsEl = $('edProps');
  const drawerEl = $('edDrawer');
  const drawerHandle = $('edDrawerHandle');

  // Galerie-Miniatur eines Element-Typs (Palette, Auswahl-Kopf, Drawer-Griff).
  const allEntries = [...galleryEntries(), ...extraEntries()];
  const galleryDraws = new Map(allEntries.map((e) => [e.type, e.draw]));
  // Klang-Signaturen aus derselben Registry: Was die Galerie anspielt, spielt
  // auch das Eigenschaften-Panel – ein Element hat EINEN Klang.
  const galleryDemos = new Map(allEntries.map((e) => [e.type, e.demoSound]));
  const miniCanvas = (type: string): HTMLCanvasElement => {
    const cv = document.createElement('canvas');
    cv.width = 66;
    cv.height = 42;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = WORLD.bgDeep;
    ctx.fillRect(0, 0, cv.width, cv.height);
    galleryDraws.get(type)?.(ctx, cv.width, cv.height);
    return cv;
  };

  /* Phone-Chrome: Eigenschaften-Drawer (Griff + ✕ unten) + Element-Sheet.
     Auf dem Desktop sind die Klassen wirkungslos (Media-Query). */
  const updateDrawerHandle = (): void => {
    const chevron = drawerEl.classList.contains('open') ? '▾' : '▴';
    drawerHandle.replaceChildren();
    const chev = document.createElement('span');
    chev.textContent = chevron;
    drawerHandle.append(chev);
    // Der Griff identifiziert die Auswahl: Galerie-Icon + Elementname.
    const el = draft?.floors[activeFloor]?.elements[selected];
    if (el) {
      const name = document.createElement('span');
      name.textContent = t(`el.${el.type}.title` as keyof Dict);
      drawerHandle.append(miniCanvas(el.type), name);
    } else if (selEdge) {
      const name = document.createElement('span');
      name.textContent = t('ed.wall');
      drawerHandle.append(miniCanvas('wallEcho'), name);
    } else {
      const label = document.createElement('span');
      label.textContent = t('ed.props');
      drawerHandle.append(label);
    }
  };
  const closeSheet = (): void => panel.classList.remove('sheet-open');
  const closeDrawer = (): void => {
    drawerEl.classList.remove('open');
    updateDrawerHandle();
  };
  const openDrawer = (): void => {
    drawerEl.classList.add('open');
    closeSheet();
    updateDrawerHandle();
  };
  drawerHandle.addEventListener('click', () => {
    drawerEl.classList.toggle('open');
    closeSheet();
    updateDrawerHandle();
  });
  $('edDrawerClose').addEventListener('click', closeDrawer);

  const renderer = new Renderer(canvas);
  const overlay = canvas.getContext('2d')!;

  let draft: RawLevel | null = null;
  let loaded: LoadedLevel | null = null;
  let loadError: string | null = null;
  let tool: Tool = 'place';
  let placeType: string = 'hole';
  let activeFloor = 0;
  /** „Zeigen" aus der Beweis-Tafel: hervorgehobene Zelle (M71). */
  let highlight: { floor: number; cell: [number, number] } | null = null;
  let checkAt: { floor: number; cell: readonly [number, number] } | null = null;
  let selected = -1; // Index in floor.elements (der AKTIVEN Ebene)
  /** Ausgewählte WANDKANTE (Auswählen-Werkzeug auf eine Wand ohne Element):
   *  Eigenschaften = Variante. Schließt `selected` aus und umgekehrt. */
  let selEdge: Edge | null = null;
  /** ⚑ Teststart der Vorschau (null = am Level-Start). */
  let testStart: TestStart | null = null;
  /** Zwei Spieler (M57): als wer die Vorschau läuft, und ob der Partner hält. */
  let testPlayer: 1 | 2 = 1;
  /** Für WEN setzen ● und ◎ (M58)? Eigenschaft der beiden Werkzeuge statt
   *  eigener Kacheln – die Leiste bleibt bei sechs, auf dem Phone waren mehr
   *  nicht erreichbar. Umschalten: Eigenschaften-Feld oder die aktive Kachel
   *  nochmal antippen. */
  let toolPlayer: 1 | 2 = 1;
  const twoPlayers = (): boolean => draft?.players === 2;
  let pendingGuard: [number, number] | null = null;
  /** Transporter-Platzierung: Pad gesetzt, Ziel-Tap steht aus (Ebenenwechsel erlaubt). */
  let pendingTransporter: { floor: number; cell: [number, number] } | null = null;
  /** 🔗 Verknüpfen: Öffner (Schlüssel/Zeitschloss) wartet auf den Tür-Tap.
   *  Ebenenwechsel erlaubt – Schlüssel öffnen ebenenübergreifend. */
  let pendingLink: { floor: number; index: number } | null = null;
  /** 🔗 Umverlegen: Transporter wartet auf sein neues Ziel (Ebenenwechsel erlaubt). */
  let pendingRetarget: { floor: number; index: number } | null = null;
  /** ＋ Wegpunkt (M72): Wächter/Wanderloch wartet auf die nächste Zelle seiner
   *  Bahn. Wie beim Setzen muss der Abschnitt achsenparallel sein – ein
   *  diagonaler Wächter liefe durch Wände. */
  let pendingWaypoint: { floor: number; index: number } | null = null;
  let view = { scale: 1, ox: 0, oy: 0 }; // Canvas-Pixel pro Welteinheit + Offset
  let checks: CheckResult[] = [];
  let validateTimer: ReturnType<typeof setTimeout> | null = null;

  const floor = (): RawFloor => draft!.floors[activeFloor]!;

  /* Rohe Defs dürfen optionale Felder WEGLASSEN – ein importiertes oder
     geteiltes Level ohne `maze.add` ist vollkommen gültig (das Schema füllt
     die Vorgaben erst beim Parsen). Der Editor arbeitet aber direkt auf dem
     rohen Draft und schiebt in genau diese Listen. Deshalb hier EINMAL beim
     Öffnen auffüllen, statt an jeder Zugriffsstelle zu prüfen: Danach hält
     der Draft, was RawFloor verspricht.
     (Gefunden vom E2E-Lauf 20: Ein Import ohne `add` ließ paint() auflaufen
     – die Karte blieb schwarz.) */
  function normalizeDraft(): void {
    if (!draft) return;
    draft.floors ??= [];
    for (const f of draft.floors) {
      f.maze ??= { seed: 1, carve: [], add: [], brittle: [], brittleSide: [], absorb: [], mirrors: [] };
      f.maze.carve ??= [];
      f.maze.add ??= [];
      f.maze.brittle ??= [];
      f.maze.brittleSide ??= [];
      f.maze.absorb ??= [];
      f.maze.mirrors ??= [];
      f.elements ??= [];
      // Wie bei maze.add: Ein rohes Def darf Felder auslassen, der Editor
      // greift aber direkt darauf zu. EINMAL auffüllen statt an jeder
      // Zugriffsstelle prüfen.
      for (const el of f.elements) {
        if (el.type === 'jukebox') el.playlist ??= ['tiltr'];
        // Platte ohne Tür (Entwürfe vor 3.1.3): auffüllen, damit die Def parst –
        // das Badge „Verknüpfungen" sagt dann, dass „tor1" fehlt.
        if (el.type === 'plate') el.opens ??= 'tor1';
      }
    }
  }
  const flash = (text: string, error = false): void => {
    statusEl.textContent = text;
    statusEl.style.color = error ? 'var(--warning)' : '';
  };

  /* --- Rohdaten-Helfer ----------------------------------------------------- */

  const inList = edgeIn;
  const dropFromList = edgeDrop;

  // Ist die Kante im aktuellen Maze (Seed + Edits) offen? `seedOnly` fragt den
  // nackten Seed – das Wand-Werkzeug braucht beides (toggleEdge).
  const edgeOpen = (e: Edge, seedOnly = false): boolean => {
    try {
      const def = parseLevel(draft);
      const f0 = def.floors[activeFloor]!;
      const f = seedOnly ? { ...f0, maze: { ...f0.maze, carve: [], add: [] } } : f0;
      // mirror wie der Loader: importierte Kampagnen-Level sind gespiegelt.
      const cells = buildFloorCells(f, { brittleOpen: false, doorsOpen: true }, def.mirror);
      const c = cells[e[0][1] * f.size[0] + e[0][0]]!;
      return e[1] === 'e' ? !c.e : !c.s;
    } catch {
      return true; // Def gerade kaputt: nicht zusätzlich blockieren
    }
  };

  // Seed-Zustand ALLER Kanten der Ebene in EINEM Durchgang: `edgeOpen` parst
  // je Aufruf die komplette Def, und clearWalls fragt jede innere Kante (bei
  // 20×24 sind das über 900). Gleiche Rechnung wie dort, gleiche Spiegelung.
  const seedOpenAll = (): ((e: Edge) => boolean) => {
    try {
      const def = parseLevel(draft);
      const f0 = def.floors[activeFloor]!;
      const f = { ...f0, maze: { ...f0.maze, carve: [], add: [] } };
      const cells = buildFloorCells(f, { brittleOpen: false, doorsOpen: true }, def.mirror);
      return (e: Edge) => {
        const c = cells[e[0][1] * f.size[0] + e[0][0]]!;
        return e[1] === 'e' ? !c.e : !c.s;
      };
    } catch {
      return () => true; // Def gerade kaputt: nicht zusätzlich blockieren
    }
  };

  // Türen über ALLE Ebenen: Der Loader prüft IDs global, Schlüssel öffnen
  // ebenenübergreifend – zwei Ebenen mit je einem „tor1" wären mehrdeutig.
  const allDoors = (): Array<{ fl: number; el: RawEl }> => {
    const out: Array<{ fl: number; el: RawEl }> = [];
    draft!.floors.forEach((f, fl) => {
      for (const el of f.elements) if (el.type === 'door') out.push({ fl, el });
    });
    return out;
  };
  const nextDoorId = (): string => {
    const ids = new Set(allDoors().map((d) => String(d.el.id)));
    for (let n = 1; ; n++) if (!ids.has(`tor${n}`)) return `tor${n}`;
  };

  // Kantenmitte einer Tür in Zell-Koordinaten (für Abstände & Labels).
  const edgeMid = (e: Edge): [number, number] => {
    const [[x, y], dir] = e;
    return [dir === 'e' ? x + 1 : x + 0.5, dir === 's' ? y + 1 : y + 0.5];
  };

  /** Nächstgelegene Tür zu einer Zelle: erst auf derselben Ebene, für
   *  Schlüssel notfalls ebenenübergreifend (dann die erste gefundene). */
  const nearestDoorId = (fl: number, cell: [number, number], anyFloor: boolean): string | null => {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const d of allDoors()) {
      if (d.fl !== fl) continue;
      const [mx, my] = edgeMid(d.el.edge!);
      const dist = Math.hypot(mx - (cell[0] + 0.5), my - (cell[1] + 0.5));
      if (dist < bestDist) {
        bestDist = dist;
        best = String(d.el.id);
      }
    }
    if (!best && anyFloor) best = allDoors().map((d) => String(d.el.id))[0] ?? null;
    return best;
  };

  /** Dropdown-Einträge mit Ortsangabe – nackte IDs sind bei 2+ Türen Raterei. */
  const doorOptions = (sameFloorOnly: boolean): Array<[string, string]> => {
    const multi = draft!.floors.length > 1;
    return allDoors()
      .filter((d) => !sameFloorOnly || d.fl === activeFloor)
      .map((d) => {
        const [[x, y]] = d.el.edge!;
        const place = multi && !sameFloorOnly ? `E${d.fl + 1} (${x},${y})` : `(${x},${y})`;
        return [String(d.el.id), `${d.el.id} · ${place}`];
      });
  };

  const openersOf = (doorId: string): RawEl[] =>
    draft!.floors.flatMap((f) =>
      f.elements.filter((el) => (el.type === 'key' || el.type === 'plate' || el.type === 'timedSwitch') && el.opens === doorId),
    );

  /** Tür weg ⇒ Referenzen nicht hängen lassen: Öffner auf die nächstgelegene
   *  verbleibende Tür umhängen; gibt es keine mehr, bleibt das Badge
   *  „Verknüpfungen" rot und der Status sagt warum. */
  function cleanupAfterDoorDelete(doorId: string): void {
    const orphans: Array<{ fl: number; el: RawEl }> = [];
    draft!.floors.forEach((f, fl) => {
      for (const el of f.elements) {
        if ((el.type === 'key' || el.type === 'plate' || el.type === 'timedSwitch') && el.opens === doorId)
          orphans.push({ fl, el });
      }
    });
    if (!orphans.length) return;
    if (allDoors().length) {
      let last = '';
      for (const o of orphans) {
        // Zeitschlösser nur auf derselben Ebene (Timer-Beweis), Schlüssel überall.
        const next = nearestDoorId(o.fl, o.el.cell ?? [0, 0], o.el.type !== 'timedSwitch');
        if (next) {
          o.el.opens = next;
          last = next;
        }
      }
      if (last) flash(`${orphans.length} × ${t('ed.relinked')} „${last}"`);
      else flash(`${orphans.length} × ${t('ed.orphaned')}`, true);
    } else {
      flash(`${orphans.length} × ${t('ed.orphaned')}`, true);
    }
  }

  /** Tür umbenennen: global eindeutig, alle Öffner-Referenzen ziehen mit. */
  function renameDoor(el: RawEl, next: string): void {
    const old = String(el.id);
    if (!next || next === old) return renderProps();
    if (allDoors().some((d) => d.el !== el && String(d.el.id) === next)) {
      flash(t('ed.idTaken'), true);
      return renderProps();
    }
    el.id = next;
    for (const o of openersOf(old)) o.opens = next;
    flash(`„${old}" → „${next}"`);
    renderProps();
    rebuild();
  }

  const elementAt = (target: { kind: string; cell?: [number, number]; edge?: Edge }): number => {
    const els = floor().elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]!;
      if (target.kind === 'edge' && el.edge && edgeKey(el.edge) === edgeKey(target.edge!)) return i;
      if (target.kind === 'cell' && el.cell && el.cell[0] === target.cell![0] && el.cell[1] === target.cell![1]) return i;
      if (target.kind === 'cell' && el.patrol?.some((p) => p[0] === target.cell![0] && p[1] === target.cell![1])) return i;
    }
    return -1;
  };

  /* --- Vorschau + Overlay --------------------------------------------------- */

  /* --- Play/Pause: bewegte Elemente laufen lassen ---------------------------
     Reine ANSICHT, keine Simulation: Es gibt keinen Ball, keine Physik und
     keine Kollisionen – nur die Zyklen (atmende Löcher, Schiebewände über
     dieselbe Uhr wie im Spiel, src/core/breathing.ts) und die Patrouillen
     (world.advanceGuards). Damit beurteilt man Timing und Taktung, ohne den
     Entwurf zu verlassen. Stumm, denn ohne Ball gibt es keinen Hörerort –
     Klang gibt es gezielt über die Ton-Vorschau im Eigenschaften-Panel.
     Horcher stehen still: Sie jagen den Ball, und den gibt es hier nicht. */
  let playing = false;
  /** Vorschau-Uhr in Sekunden (unabhängig von performance.now, damit Pause
   *  wirklich pausiert statt nur das Zeichnen auszusetzen). */
  let animT = 0;
  let lastAnim = 0;

  function animateFrame(now: number): void {
    if (!playing) return;
    const dt = Math.min(0.05, (now - lastAnim) / 1000);
    lastAnim = now;
    animT += dt;
    applyAnim(dt);
    paint();
    requestAnimationFrame(animateFrame);
  }

  /** Zyklen und Patrouillen der SICHTBAREN Ebene auf die Vorschau-Uhr setzen. */
  function applyAnim(dt: number): void {
    if (!loaded) return;
    const w = loaded.floors[Math.min(activeFloor, loaded.floors.length - 1)]!.world;
    for (const h of w.holes) if (h.breathing) h.openness = breathAt(h.breathing, animT).openness;
    for (const wall of w.walls) if (wall.slide) wall.slide.openness = breathAt(wall.slide.cycle, animT).openness;
    w.advanceGuards(dt);
    w.advanceHoles(dt);
  }

  function setPlaying(on: boolean): void {
    if (playing === on) return;
    playing = on;
    playBtn.textContent = on ? '⏸' : '▶';
    playBtn.dataset.tip = t(on ? 'ed.animateOff' : 'ed.animate');
    playBtn.classList.toggle('active', on);
    if (on) {
      lastAnim = performance.now();
      requestAnimationFrame(animateFrame);
    } else {
      paint(); // eingefrorenes Bild bleibt stehen – so lässt sich hinsehen
    }
  }

  function fitView(): void {
    const [cols, rows] = floor().size;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = rect.width * dpr;
    const ch = rect.height * dpr;
    const scale = Math.min((cw - 48) / (cols * CELL), (ch - 48) / (rows * CELL));
    view = {
      scale,
      ox: (cw - cols * CELL * scale) / 2,
      oy: (ch - rows * CELL * scale) / 2,
    };
  }

  function rebuild(): void {
    if (!draft) return;
    try {
      loaded = loadLevel(parseLevel(draft), { allTransporters: true }); // Vorschau zeigt beide Spieler
      loadError = null;
      // Status hier NICHT löschen: frische Hinweise aus der laufenden Aktion
      // („Feld belegt", Wächter-/Transporter-Schritt 2) müssen stehen bleiben
      // – aufgeräumt wird zu Beginn der nächsten Aktion (act).
    } catch (e) {
      loadError = describeLoadError(e, draft);
      flash(loadError, true);
    }
    // Jede Änderung landet reload-fest im Draft – „später fortsetzen"
    // funktioniert damit auch nach App-Wechsel oder Tab-Tod (PWA).
    saveDraft(draft as unknown as Record<string, unknown>);
    scheduleValidate();
    paint();
  }

  function scheduleValidate(): void {
    if (validateTimer) clearTimeout(validateTimer);
    validateTimer = setTimeout(() => {
      if (!draft) return;
      checks = validateLevel(draft);
      renderBadges();
    }, 250);
  }

  function renderBadges(): void {
    badgesEl.replaceChildren();
    for (const c of checks) {
      // Badge ist ein KNOPF (M71): Ein rotes Zeichen ohne Erklärung ist eine
      // Sackgasse – Tippen sagt, was geprüft wird, was zu tun ist, und wo.
      const b = document.createElement('button');
      // Weiche Badges (SOFT_CHECKS) warnen nur: ⚠ statt ✗, gestrichelt.
      const soft = !c.ok && SOFT_CHECKS.has(c.key);
      b.className = 'ed-badge' + (c.ok ? '' : soft ? ' warn' : ' fail');
      b.textContent = `${c.ok ? '✓' : soft ? '⚠' : '✗'} ${t(`ed.check.${c.key}` as keyof Dict)}`;
      b.dataset.check = c.key;
      b.title = t('ed.check.tapHelp');
      b.addEventListener('click', () => showCheck(c));
      badgesEl.append(b);
    }
  }

  /** Ort eines Befunds in Worten: „Ebene 2, Zelle 3/5". Zellschlüssel
   *  („2:3,5") aus dem technischen Detail fallen dann weg – sie stehen ja
   *  schon in Klartext da. */
  function checkDetailText(c: CheckResult): string {
    const tech = (c.detail ?? '')
      .replace(/\b\d+:\d+,\d+\b/g, '')
      // Der Zellschlüssel stand im Bericht VOR dem Gedankenstrich, der ihn
      // vom Grund trennte (M79: „Spieler 1: 1:0,0 – kein Rückweg …“).
      // Fällt er hier weg, bleibt ein Fransen: „· – kein Rückweg“ am
      // Satzanfang oder „Spieler 1: – …“ mit zwei Trennzeichen.
      .replace(/\s+/g, ' ')
      .replace(/:\s*–\s*/g, ': ')
      .replace(/^\s*[–·:]\s*/, '')
      .replace(/[:·–]\s*$/, '')
      .trim();
    const place = c.at ? t('ed.check.at', { f: c.at.floor + 1, x: c.at.cell[0], y: c.at.cell[1] }) : '';
    return [place, tech].filter(Boolean).join(' · ');
  }

  /** Erklär-Tafel zu einem Beweis: Zustand, was er prüft, wo es klemmt. */
  function showCheck(c: CheckResult): void {
    const soft = !c.ok && SOFT_CHECKS.has(c.key);
    const mark = c.ok ? '✓' : soft ? '⚠' : '✗';
    const title = $('edCheckTitle');
    title.textContent = `${mark} ${t(`ed.check.${c.key}` as keyof Dict)}`;
    title.className = c.ok ? 'ok' : soft ? 'warn' : 'fail';
    $('edCheckWhy').textContent = t(`ed.help.${c.key}` as keyof Dict);
    $('edCheckDetail').textContent = c.ok ? '' : checkDetailText(c);
    const showBtn = $('edCheckShow');
    showBtn.classList.toggle('hidden', !c.at || c.at.floor >= (draft?.floors.length ?? 0));
    checkAt = c.at ?? null;
    $('edCheckSheet').classList.remove('hidden');
  }

  function hideCheck(): void {
    $('edCheckSheet').classList.add('hidden');
  }

  /** „Zeigen": auf die Ebene wechseln, die Zelle hervorheben und mittig
   *  bringen. Die Hervorhebung bleibt, bis man das Feld anfasst. */
  function showPlace(place: { floor: number; cell: readonly [number, number] }): void {
    if (!draft || place.floor >= draft.floors.length) return;
    hideCheck();
    if (place.floor !== activeFloor) switchFloor(place.floor);
    highlight = { floor: place.floor, cell: [place.cell[0], place.cell[1]] };
    const rect = canvas.getBoundingClientRect();
    const dpr = renderer.dpr;
    view.ox = (rect.width * dpr) / 2 - (place.cell[0] + 0.5) * CELL * view.scale;
    view.oy = (rect.height * dpr) / 2 - (place.cell[1] + 0.5) * CELL * view.scale;
    paint();
  }

  function paint(): void {
    if (!draft) return;
    // Testbarkeits-Hook (E2E): Transform + Elementzahl der aktuellen Ebene.
    (window as unknown as { __tiltrEd?: unknown }).__tiltrEd = {
      scale: view.scale,
      ox: view.ox,
      oy: view.oy,
      dpr: renderer.dpr,
      elements: floor().elements.length,
      floors: draft.floors.length,
      activeFloor,
      carve: floor().maze.carve.length,
      add: floor().maze.add.length,
      brittle: floor().maze.brittle.length,
      brittleSide: floor().maze.brittleSide?.length ?? 0,
      absorb: floor().maze.absorb.length,
      mirrors: floor().maze.mirrors.length,
      // Sichtbarer Kantenzustand (E2E: Wand an/aus, Variante über Eigenschaften).
      edgeState: (e: Edge) => edgeState(floor().maze, e, edgeOpen(e)),
      selEdge,
      highlight,
      pendingWaypoint,
      testStart,
      players: draft.players ?? 1,
      testPlayer,
      toolPlayer,
      tool,
      // Landeplätze dieser Ebene – genau das, was der Overlay-Ring zeigt.
      landings: landingsOn(draft, activeFloor),
      selected,
      loadError,
      // Teilbar = alle Pflicht-Badges grün (E2E; die UI sagt es über
      // #edStatus, wenn man es trotzdem versucht). Als GETTER, weil die
      // Prüfung entprellt läuft (250 ms) und erst NACH diesem paint()
      // fertig ist – ein Schnappschuss wäre immer einen Stand hinterher.
      get shareable() {
        return !loadError && isShareable(checks);
      },
      // Stand die Kugel im letzten Frame? Als GETTER, denn dieser Haken wird
      // VOR renderer.draw() gesetzt – ein Schnappschuss wäre einen Frame alt.
      get ballDrawn() {
        return renderer.ballDrawn;
      },
      playing,
      animT,
      // Was sich auf der sichtbaren Ebene gerade bewegt (Play-Vorschau):
      // der Renderer zeichnet genau diese Werte.
      motion: loaded
        ? (() => {
            const w = loaded.floors[Math.min(activeFloor, loaded.floors.length - 1)]!.world;
            return {
              slides: w.walls.filter((x) => x.slide).map((x) => Number(x.slide!.openness.toFixed(3))),
              holes: w.holes.map((h) => Number((h.openness ?? 1).toFixed(3))),
              guards: w.guards.map((g) => [Math.round(g.x), Math.round(g.y)]),
            };
          })()
        : null,
      // rohe Def (Live-Referenz): E2E prüft Verknüpfungen (opens, target, IDs)
      def: draft,
    };
    renderer.setManualView(view.scale, view.ox, view.oy);
    if (loaded) {
      const world = loaded.floors[Math.min(activeFloor, loaded.floors.length - 1)]!.world;
      // Es gibt EINE Kugel für alle Ebenen (loader.ts setzt sie auf den Start
      // von Ebene 1). Auf einer tieferen Ebene stünde sie an FREMDEN
      // Koordinaten und sah dort aus wie ein eigener Startpunkt – weglassen.
      renderer.draw(world, { debug: true, now: performance.now(), hideBall: activeFloor !== 0 });
    } else {
      overlay.fillStyle = WORLD.bgDeep;
      overlay.fillRect(0, 0, canvas.width, canvas.height);
    }
    drawOverlay();
  }

  function drawOverlay(): void {
    const [cols, rows] = floor().size;
    const s = view.scale;
    const tx = (x: number) => view.ox + x * s;
    const ty = (y: number) => view.oy + y * s;
    const dpr = renderer.dpr;

    // Grid
    overlay.strokeStyle = 'rgba(110, 168, 255, 0.12)';
    overlay.lineWidth = 1;
    overlay.beginPath();
    for (let x = 0; x <= cols; x++) {
      overlay.moveTo(tx(x * CELL), ty(0));
      overlay.lineTo(tx(x * CELL), ty(rows * CELL));
    }
    for (let y = 0; y <= rows; y++) {
      overlay.moveTo(tx(0), ty(y * CELL));
      overlay.lineTo(tx(cols * CELL), ty(y * CELL));
    }
    overlay.stroke();

    // Verknüpfungen: Öffner -> Tür (goldene gestrichelte Linie, gleiche Ebene)
    const doors = new Map<string, Edge>();
    for (const el of floor().elements) if (el.type === 'door' && el.edge) doors.set(String(el.id), el.edge);
    const selEl = floor().elements[selected];
    overlay.lineWidth = 1.5 * dpr;
    overlay.setLineDash([5 * dpr, 5 * dpr]);
    for (const el of floor().elements) {
      if ((el.type !== 'key' && el.type !== 'plate' && el.type !== 'timedSwitch') || !el.cell) continue;
      // Ausgewählte Paare leuchten – die Verknüpfung soll man SEHEN.
      const hot = selEl === el || (selEl?.type === 'door' && String(selEl.id) === String(el.opens));
      overlay.strokeStyle = `rgba(${WORLD.door}, ${hot ? 0.95 : 0.5})`;
      const door = doors.get(String(el.opens));
      if (door) {
        const [mx, my] = edgeMid(door);
        overlay.beginPath();
        overlay.moveTo(tx((el.cell[0] + 0.5) * CELL), ty((el.cell[1] + 0.5) * CELL));
        overlay.lineTo(tx(mx * CELL), ty(my * CELL));
        overlay.stroke();
        if (hot) {
          // Tür-Kante des Paars golden rahmen
          const [[dx, dy], ddir] = door;
          const vertical = ddir === 'e';
          overlay.strokeRect(
            tx((vertical ? (dx + 1) * CELL : dx * CELL) - 8),
            ty((vertical ? dy * CELL : (dy + 1) * CELL) - 8),
            (vertical ? 16 : CELL + 16) * s,
            (vertical ? CELL + 16 : 16) * s,
          );
          overlay.strokeRect(tx(el.cell[0] * CELL), ty(el.cell[1] * CELL), CELL * s, CELL * s);
        }
      } else if (hot || selEl === el) {
        // Öffner zeigt ins Leere (oder auf eine andere Ebene): Zelle markieren
        overlay.strokeRect(tx(el.cell[0] * CELL), ty(el.cell[1] * CELL), CELL * s, CELL * s);
      }
    }
    overlay.setLineDash([]);

    // Tür-IDs ab der zweiten Tür: nackte Kanten sind sonst nicht zuzuordnen.
    if (allDoors().length > 1) {
      overlay.fillStyle = `rgba(${WORLD.door}, 0.9)`;
      overlay.font = `600 ${11 * dpr}px system-ui, sans-serif`;
      overlay.textAlign = 'center';
      for (const [id, e] of doors) {
        const [mx, my] = edgeMid(e);
        overlay.fillText(id, tx(mx * CELL), ty(my * CELL) - 6 * dpr);
      }
    }

    // Transporter: Pad -> Ziel (magenta; andere Ebene = „E<n>"-Label am Pad)
    for (const el of floor().elements) {
      if (el.type !== 'transporter' || !el.cell) continue;
      const tg = el.target as { floor: number; cell: [number, number] } | undefined;
      if (!tg) continue;
      const hot = selEl === el;
      overlay.strokeStyle = `rgba(${WORLD.portal}, ${hot ? 0.95 : 0.45})`;
      overlay.fillStyle = `rgba(${WORLD.portal}, 0.9)`;
      // Nur für einen Spieler (M65): kleine Marke am Pad.
      if (el.player === 1 || el.player === 2) {
        overlay.font = `700 ${11 * dpr}px system-ui, sans-serif`;
        overlay.textAlign = 'left';
        overlay.fillText(`P${el.player}`, tx(el.cell[0] * CELL) + 4 * dpr, ty((el.cell[1] + 1) * CELL) - 4 * dpr);
      }
      if (tg.floor === activeFloor) {
        overlay.lineWidth = 1.5 * dpr;
        overlay.setLineDash([5 * dpr, 5 * dpr]);
        overlay.beginPath();
        overlay.moveTo(tx((el.cell[0] + 0.5) * CELL), ty((el.cell[1] + 0.5) * CELL));
        overlay.lineTo(tx((tg.cell[0] + 0.5) * CELL), ty((tg.cell[1] + 0.5) * CELL));
        overlay.stroke();
        overlay.setLineDash([]);
      } else {
        overlay.font = `600 ${11 * dpr}px system-ui, sans-serif`;
        overlay.textAlign = 'center';
        overlay.fillText(`→E${tg.floor + 1}`, tx((el.cell[0] + 0.5) * CELL), ty(el.cell[1] * CELL) - 4 * dpr);
      }
    }

    // Landeplätze: Wo kommt man auf DIESER Ebene an – und von wo? Gestrichelter
    // Ring in Portal-Farbe, „←E<n>" wenn der Transporter auf einer anderen
    // Ebene steht. Reine Ansicht: kein Element, die Zelle bleibt bebaubar.
    for (const ld of draft ? landingsOn(draft, activeFloor) : []) {
      const hot = ld.from === activeFloor && floor().elements[ld.index] === selEl;
      const cx = tx((ld.cell[0] + 0.5) * CELL);
      const cy = ty((ld.cell[1] + 0.5) * CELL);
      overlay.strokeStyle = `rgba(${WORLD.portal}, ${hot ? 0.95 : 0.6})`;
      overlay.fillStyle = `rgba(${WORLD.portal}, 0.9)`;
      overlay.lineWidth = (hot ? 2 : 1.5) * dpr;
      overlay.setLineDash([3 * dpr, 3 * dpr]);
      overlay.beginPath();
      overlay.arc(cx, cy, 0.3 * CELL * s, 0, Math.PI * 2);
      overlay.stroke();
      overlay.setLineDash([]);
      if (hot) overlay.strokeRect(tx(ld.cell[0] * CELL), ty(ld.cell[1] * CELL), CELL * s, CELL * s);
      if (ld.from !== activeFloor) {
        overlay.font = `600 ${11 * dpr}px system-ui, sans-serif`;
        overlay.textAlign = 'center';
        overlay.fillText(`←E${ld.from + 1}`, cx, ty(ld.cell[1] * CELL) - 4 * dpr);
      }
    }

    // „Zeigen" aus der Beweis-Tafel (M71): die genannte Zelle hervorheben,
    // bis man das Feld wieder anfasst. Bernstein wie jede Warnung.
    if (highlight && highlight.floor === activeFloor) {
      const [hx, hy] = highlight.cell;
      overlay.strokeStyle = 'rgba(255, 176, 96, 0.95)';
      overlay.fillStyle = 'rgba(255, 176, 96, 0.16)';
      overlay.lineWidth = 2 * dpr;
      overlay.setLineDash([6 * dpr, 4 * dpr]);
      overlay.fillRect(tx(hx * CELL), ty(hy * CELL), CELL * s, CELL * s);
      overlay.strokeRect(tx(hx * CELL), ty(hy * CELL), CELL * s, CELL * s);
      overlay.setLineDash([]);
    }

    // 🔗 wartet: Quelle golden gestrichelt markieren
    if (pendingLink && pendingLink.floor === activeFloor) {
      const src = floor().elements[pendingLink.index];
      if (src?.cell) {
        overlay.strokeStyle = `rgba(${WORLD.door}, 0.9)`;
        overlay.lineWidth = 2 * dpr;
        overlay.setLineDash([4 * dpr, 4 * dpr]);
        overlay.strokeRect(tx(src.cell[0] * CELL), ty(src.cell[1] * CELL), CELL * s, CELL * s);
        overlay.setLineDash([]);
      }
    }
    if (pendingRetarget && pendingRetarget.floor === activeFloor) {
      const src = floor().elements[pendingRetarget.index];
      if (src?.cell) {
        overlay.strokeStyle = `rgba(${WORLD.portal}, 0.9)`;
        overlay.lineWidth = 2 * dpr;
        overlay.setLineDash([4 * dpr, 4 * dpr]);
        overlay.strokeRect(tx(src.cell[0] * CELL), ty(src.cell[1] * CELL), CELL * s, CELL * s);
        overlay.setLineDash([]);
      }
    }

    // Zwei Spieler (M57): Start 2 (nur Ebene 1) und Ziel 2 als gestrichelte
    // Ringe mit „2" – die Welt zeichnet nur Spieler 1 (Kugel, Zielzone).
    const mark2 = (cell: [number, number], rgb: string, r: number): void => {
      const cx = tx((cell[0] + 0.5) * CELL);
      const cy = ty((cell[1] + 0.5) * CELL);
      overlay.strokeStyle = `rgba(${rgb}, 0.9)`;
      overlay.lineWidth = 2 * dpr;
      overlay.setLineDash([4 * dpr, 4 * dpr]);
      overlay.beginPath();
      overlay.arc(cx, cy, r * CELL * s, 0, Math.PI * 2);
      overlay.stroke();
      overlay.setLineDash([]);
      overlay.fillStyle = `rgba(${rgb}, 0.95)`;
      overlay.font = `700 ${13 * dpr}px system-ui, sans-serif`;
      overlay.textAlign = 'center';
      overlay.fillText('2', cx, cy + 5 * dpr);
    };
    if (twoPlayers()) {
      if (activeFloor === 0 && floor().start2) mark2(floor().start2!, WORLD.ballGlow, 0.22);
      if (floor().goal2) mark2(floor().goal2!, WORLD.goal, 0.32);
    }

    // ⚑ Teststart: hier setzt die Vorschau die Kugel ab (nur auf seiner Ebene)
    if (testStart && testStart.floor === activeFloor) {
      const [cx, cy] = testStart.cell;
      overlay.strokeStyle = `rgba(${WORLD.ballGlow}, 0.8)`;
      overlay.lineWidth = 1.5 * dpr;
      overlay.setLineDash([4 * dpr, 4 * dpr]);
      overlay.strokeRect(tx(cx * CELL), ty(cy * CELL), CELL * s, CELL * s);
      overlay.setLineDash([]);
      overlay.fillStyle = `rgba(${WORLD.ballGlow}, 0.95)`;
      overlay.font = `600 ${16 * dpr}px system-ui, sans-serif`;
      overlay.textAlign = 'center';
      overlay.fillText('⚑', tx((cx + 0.5) * CELL), ty((cy + 0.5) * CELL) + 6 * dpr);
    }

    // Auswahl: Wandkante (Variante in den Eigenschaften)
    if (selEdge && !floor().elements[selected]) {
      const [[x, y], dir] = selEdge;
      const vertical = dir === 'e';
      const ex = vertical ? (x + 1) * CELL : x * CELL;
      const ey = vertical ? y * CELL : (y + 1) * CELL;
      overlay.strokeStyle = `rgba(${WORLD.ballGlow}, 0.9)`;
      overlay.lineWidth = 2 * dpr;
      overlay.strokeRect(tx(ex - 8), ty(ey - 8), (vertical ? 16 : CELL + 16) * s, (vertical ? CELL + 16 : 16) * s);
    }

    // Auswahl
    const sel = floor().elements[selected];
    if (sel) {
      overlay.strokeStyle = `rgba(${WORLD.ballGlow}, 0.9)`;
      overlay.lineWidth = 2 * dpr;
      if (sel.edge) {
        const [[x, y], dir] = sel.edge;
        const vertical = dir === 'e';
        const ex = vertical ? (x + 1) * CELL : x * CELL;
        const ey = vertical ? y * CELL : (y + 1) * CELL;
        overlay.strokeRect(tx(ex - 8), ty(ey - 8), (vertical ? 16 : CELL + 16) * s, (vertical ? CELL + 16 : 16) * s);
      } else if (sel.cell) {
        overlay.strokeRect(tx(sel.cell[0] * CELL), ty(sel.cell[1] * CELL), CELL * s, CELL * s);
      } else if (sel.patrol?.length) {
        // Bahn des gewählten Wächters: Zellen, Verbindungslinie, Nummern und
        // ⏸ wo gewartet wird – ab drei Punkten sonst nicht lesbar.
        for (const p of sel.patrol) overlay.strokeRect(tx(p[0] * CELL), ty(p[1] * CELL), CELL * s, CELL * s);
        const mid = (p: [number, number]): [number, number] => [tx((p[0] + 0.5) * CELL), ty((p[1] + 0.5) * CELL)];
        overlay.beginPath();
        (sel.patrol as Array<[number, number]>).forEach((p, i) => {
          const [mx, my] = mid(p);
          if (i === 0) overlay.moveTo(mx, my);
          else overlay.lineTo(mx, my);
        });
        overlay.stroke();
        overlay.font = `600 ${11 * dpr}px system-ui, sans-serif`;
        overlay.textAlign = 'center';
        overlay.fillStyle = overlay.strokeStyle;
        const pauses = (sel.pause as number[] | undefined) ?? [];
        (sel.patrol as Array<[number, number]>).forEach((p, i) => {
          const [mx, my] = mid(p);
          const wait = pauses[i] ?? 0;
          overlay.fillText(`${i + 1}${wait > 0 ? ` ⏸${wait}s` : ''}`, mx, my - 0.28 * CELL * s);
        });
      }
    }

    // Transporter-Platzierung: Pad wartet auf sein Ziel (magenta markiert)
    if (pendingTransporter && pendingTransporter.floor === activeFloor) {
      overlay.strokeStyle = `rgba(${WORLD.portal}, 0.9)`;
      overlay.lineWidth = 2 * dpr;
      overlay.setLineDash([4 * dpr, 4 * dpr]);
      overlay.strokeRect(
        tx(pendingTransporter.cell[0] * CELL),
        ty(pendingTransporter.cell[1] * CELL),
        CELL * s,
        CELL * s,
      );
      overlay.setLineDash([]);
    }

    // ＋ Wegpunkt wartet: letzte Zelle der Bahn markieren, damit klar ist,
    // wohin der nächste Abschnitt zeigt.
    if (pendingWaypoint && pendingWaypoint.floor === activeFloor) {
      const pat = (draft?.floors[pendingWaypoint.floor]?.elements[pendingWaypoint.index]?.patrol ?? []) as Array<[number, number]>;
      const last = pat[pat.length - 1];
      if (last) {
        overlay.strokeStyle = `rgba(${WORLD.guard}, 0.9)`;
        overlay.lineWidth = 2 * dpr;
        overlay.setLineDash([4 * dpr, 4 * dpr]);
        overlay.strokeRect(tx(last[0] * CELL), ty(last[1] * CELL), CELL * s, CELL * s);
        overlay.setLineDash([]);
      }
    }

    // Wächter-Platzierung: erster Wegpunkt wartet auf den zweiten
    if (pendingGuard) {
      overlay.strokeStyle = `rgba(${WORLD.guard}, 0.9)`;
      overlay.lineWidth = 2 * dpr;
      overlay.setLineDash([4 * dpr, 4 * dpr]);
      overlay.strokeRect(tx(pendingGuard[0] * CELL), ty(pendingGuard[1] * CELL), CELL * s, CELL * s);
      overlay.setLineDash([]);
    }
  }

  /* --- Werkzeuge ------------------------------------------------------------ */

  function act(wx: number, wy: number): void {
    if (!draft) return;
    flash(''); // alte Meldung räumen – die Aktion setzt ggf. eine neue
    const [cols, rows] = floor().size;
    // Wand-Werkzeug, Kanten-Elemente und Tür-Verknüpfen: nächste Kante gewinnt.
    const wantsEdge = tool === 'wall' || (tool === 'place' && EDGE_TYPES.has(placeType)) || pendingLink !== null;
    const target = pickTarget(wx, wy, cols, rows, wantsEdge);
    if (!target) return;

    // ＋ Wegpunkt wartet: Der Tap verlängert die Bahn statt etwas zu setzen.
    if (pendingWaypoint) {
      waypointTap(target);
      rebuild();
      renderProps();
      return;
    }
    // 🔗-Modi fangen den Tap ab: Verknüpfen/Umverlegen statt Werkzeug-Aktion.
    if (pendingLink) {
      linkTap(target);
      rebuild();
      return;
    }
    if (pendingRetarget) {
      retargetTap(target);
      rebuild();
      return;
    }

    if (tool === 'wall') {
      if (target.kind !== 'edge') return flash(t('ed.edgeHint'));
      toggleWall(target.edge);
    } else if (tool === 'erase') {
      eraseAt(target);
    } else if (tool === 'test') {
      // ⚑ Teststart: Tap setzt, Tap auf dieselbe Zelle hebt auf. Jede Ebene.
      if (target.kind !== 'cell') return;
      const same =
        testStart && testStart.floor === activeFloor && testStart.cell[0] === target.cell[0] && testStart.cell[1] === target.cell[1];
      testStart = same ? null : { floor: activeFloor, cell: target.cell };
      flash(testStart ? t('ed.testSet', { floor: activeFloor + 1, x: target.cell[0], y: target.cell[1] }) : t('ed.testCleared'));
    } else if (tool === 'start' || tool === 'goal') {
      if (target.kind !== 'cell') return;
      const forTwo = twoPlayers() && toolPlayer === 2;
      if (tool === 'start') {
        if (activeFloor !== 0) return flash(t('ed.startFloor1'));
        if (!forTwo) floor().start = target.cell;
        else {
          // Spieler 2 (M57): Tap setzt, Tap auf dieselbe Zelle hebt auf – dann
          // gilt wieder der Start von Spieler 1 für beide.
          const same = floor().start2 && floor().start2![0] === target.cell[0] && floor().start2![1] === target.cell[1];
          if (same) {
            delete floor().start2;
            flash(t('ed.start2Cleared'));
          } else floor().start2 = target.cell;
        }
      } else if (!forTwo) {
        // Ein-Ziel-Invariante über alle Ebenen: das neue Ziel gewinnt.
        for (const f of draft.floors) f.goal = null;
        floor().goal = target.cell;
      } else {
        const had = floor().goal2 && floor().goal2![0] === target.cell[0] && floor().goal2![1] === target.cell[1];
        for (const f of draft.floors) delete f.goal2;
        if (had) flash(t('ed.goal2Cleared'));
        else floor().goal2 = target.cell;
      }
    } else if (tool === 'place') {
      // Bestehendes Element antippen = AUSWÄHLEN statt doppelt besetzen –
      // außer ein Zwei-Tap-Ablauf (Wächter/Transporter) wartet auf Schritt 2.
      const hit = pendingGuard || pendingTransporter ? -1 : elementAt(target);
      if (hit !== -1) {
        selected = hit;
        renderProps();
        openDrawer(); // Phone: Auswahl zeigt die Eigenschaften
      } else {
        placeAt(target);
      }
    } else {
      selected = elementAt(target);
      // Keine Element-Kante, aber eine WAND: die Wand selbst wählen – ihre
      // Variante (massiv/brüchig/Schallschutz) wohnt in den Eigenschaften.
      selEdge = selected === -1 && target.kind === 'edge' && !edgeOpen(target.edge!) ? target.edge! : null;
      renderProps();
      if (selected !== -1 || selEdge) openDrawer();
    }
    rebuild();
  }

  /** 🔗 Verknüpfen: Tap auf eine Türkante setzt `opens` des wartenden Öffners. */
  function linkTap(target: { kind: string; cell?: [number, number]; edge?: Edge }): void {
    const src = draft!.floors[pendingLink!.floor]?.elements[pendingLink!.index];
    if (!src || (src.type !== 'key' && src.type !== 'timedSwitch' && src.type !== 'plate')) {
      pendingLink = null;
      return;
    }
    const hit = target.kind === 'edge' ? floor().elements[elementAt(target)] : undefined;
    if (!hit || hit.type !== 'door') return flash(t('ed.linkMiss'), true);
    if (src.type === 'timedSwitch' && pendingLink!.floor !== activeFloor)
      return flash(t('ed.linkSameFloor'), true);
    src.opens = String(hit.id);
    // Quelle liegt auf einer anderen Ebene: Auswahl-Index gilt dort nicht.
    if (pendingLink!.floor !== activeFloor) selected = -1;
    pendingLink = null;
    flash(`🔗 → „${hit.id}"`);
    renderProps();
  }

  /** 🔗 Umverlegen: Tap auf eine freie Zelle wird das neue Transporter-Ziel. */
  function retargetTap(target: { kind: string; cell?: [number, number]; edge?: Edge }): void {
    if (target.kind !== 'cell') return flash(t('ed.retargetHint'), true);
    const src = draft!.floors[pendingRetarget!.floor]?.elements[pendingRetarget!.index];
    if (!src || src.type !== 'transporter') {
      pendingRetarget = null;
      return;
    }
    if (!cellFree(target.cell!)) return flash(t('ed.cellTaken'), true);
    if (pendingRetarget!.floor === activeFloor && src.cell![0] === target.cell![0] && src.cell![1] === target.cell![1])
      return flash(t('ed.transporterSame'), true);
    src.target = { floor: activeFloor, cell: target.cell! };
    // Pad liegt auf einer anderen Ebene: Auswahl-Index gilt dort nicht.
    if (pendingRetarget!.floor !== activeFloor) selected = -1;
    pendingRetarget = null;
    flash(`🔗 → E${activeFloor + 1} (${target.cell![0]},${target.cell![1]})`);
    renderProps();
  }

  // Frei = keine Element-Zelle (inkl. Wächter-Wegpunkte) und nicht Ziel der
  // aktiven Ebene. Der START zählt nur auf EBENE 1: Auf tieferen Ebenen ist
  // `start` ein toter Pflichtwert des Formats (loader.ts setzt die Kugel
  // allein aus floors[0]) – er würde dort grundlos einen Bauplatz sperren.
  function cellFree(cell: [number, number]): boolean {
    if (elementAt({ kind: 'cell', cell }) !== -1) return false;
    const f = floor();
    if (activeFloor === 0 && f.start[0] === cell[0] && f.start[1] === cell[1]) return false;
    if (f.goal && f.goal[0] === cell[0] && f.goal[1] === cell[1]) return false;
    if (activeFloor === 0 && f.start2 && f.start2[0] === cell[0] && f.start2[1] === cell[1]) return false;
    if (f.goal2 && f.goal2[0] === cell[0] && f.goal2[1] === cell[1]) return false;
    return true;
  }

  // Wand-Werkzeug: Wand oder keine Wand, nach sichtbarem Zustand.
  function toggleWall(e: Edge): void {
    toggleEdge(floor().maze, e, edgeOpen(e), edgeOpen(e, true));
    if (selEdge && edgeKey(selEdge) === edgeKey(e)) selEdge = null;
  }

  function eraseAt(target: { kind: string; cell?: [number, number]; edge?: Edge }): void {
    const i = elementAt(target);
    if (i !== -1) {
      const [removed] = floor().elements.splice(i, 1);
      if (selected === i) selected = -1;
      if (removed?.type === 'door') cleanupAfterDoorDelete(String(removed.id));
      renderProps();
      return;
    }
    if (target.kind === 'edge') {
      const m = floor().maze;
      dropFromList(m.carve, target.edge!);
      dropFromList(m.add, target.edge!);
      dropFromList(m.brittle, target.edge!);
      sideDrop(m.brittleSide, target.edge!);
      dropFromList(m.absorb, target.edge!);
      if (selEdge && edgeKey(selEdge) === edgeKey(target.edge!)) selEdge = null;
    }
  }

  function placeAt(target: { kind: string; cell?: [number, number]; edge?: Edge }): void {
    const els = floor().elements;
    if (EDGE_TYPES.has(placeType)) {
      if (target.kind !== 'edge') return flash(t('ed.edgeHint'));
      const e = target.edge!;
      // Tür/Schiebewand sitzt auf einer OFFENEN Kante – notfalls freischneiden.
      if (!edgeOpen(e)) {
        dropFromList(floor().maze.add, e);
        dropFromList(floor().maze.brittle, e);
        sideDrop(floor().maze.brittleSide, e);
        dropFromList(floor().maze.absorb, e);
        if (!inList(floor().maze.carve, e)) floor().maze.carve.push(e);
      }
      els.push(placeType === 'door' ? { type: 'door', id: nextDoorId(), edge: e } : { type: 'slidingWall', edge: e });
      selected = els.length - 1;
    } else if (placeType === 'transporter') {
      if (target.kind !== 'cell') return;
      if (!cellFree(target.cell!)) return flash(t('ed.cellTaken'), true);
      if (!pendingTransporter) {
        pendingTransporter = { floor: activeFloor, cell: target.cell! };
        flash(t('ed.transporterTarget'));
        return;
      }
      const origin = pendingTransporter;
      pendingTransporter = null;
      if (origin.floor === activeFloor && origin.cell[0] === target.cell![0] && origin.cell[1] === target.cell![1]) {
        return flash(t('ed.transporterSame'), true);
      }
      draft!.floors[origin.floor]!.elements.push({
        type: 'transporter',
        cell: origin.cell,
        target: { floor: activeFloor, cell: target.cell! },
      } as RawEl);
      selected = origin.floor === activeFloor ? floor().elements.length - 1 : -1;
      flash('');
    } else if (placeType === 'guard' || placeType === 'roamingHole') {
      // Zwei Taps = Patrouille (Wächter und Wanderloch, M46).
      if (target.kind !== 'cell') return;
      if (!cellFree(target.cell!)) return flash(t('ed.cellTaken'), true);
      if (!pendingGuard) {
        pendingGuard = target.cell!;
        flash(t('ed.guardSecond'));
        return;
      }
      const [ax, ay] = pendingGuard;
      const [bx, by] = target.cell!;
      if ((ax === bx) === (ay === by)) {
        // gleiche Zelle oder diagonal: Patrouille muss achsenparallel sein
        pendingGuard = null;
        return flash(t('ed.guardBad'), true);
      }
      if (placeType === 'roamingHole') els.push({ type: 'roamingHole', patrol: [[ax, ay], [bx, by]], speed: 55 });
      else els.push({ type: 'guard', patrol: [[ax, ay], [bx, by]], speed: 85 });
      pendingGuard = null;
      selected = els.length - 1;
      flash('');
    } else {
      if (target.kind !== 'cell') return;
      if (!cellFree(target.cell!)) return flash(t('ed.cellTaken'), true);
      const el: RawEl = { type: placeType, cell: target.cell! };
      if (placeType === 'windZone' || placeType === 'current') el.dir = pickOpenDir(target.cell!);
      // Auto-Verknüpfung: die NÄCHSTGELEGENE Tür (Schlüssel notfalls auf
      // anderer Ebene). Gibt es keine, zeigt 'tor1' auf die erste Tür, die
      // später gesetzt wird – bis dahin ist das Badge „Verknüpfungen" rot.
      // Platte (M60) wie Schlüssel: Türen wirken ebenenübergreifend. Ohne
      // `opens` parst die Def nicht – die Platte war unsichtbar, weil das
      // letzte gültige Bild stehen blieb.
      if (placeType === 'key' || placeType === 'timedSwitch' || placeType === 'plate')
        el.opens = nearestDoorId(activeFloor, target.cell!, placeType !== 'timedSwitch') ?? 'tor1';
      if (placeType === 'hole') el.breathing = { offset: Math.round(Math.random() * 8) / 2 }; // 0,5er-Schritte wie das Eingabefeld
      // Eine Jukebox ohne Titel gibt es nicht (Schema: min. 1) – das Haus-Thema
      // ist der Vorgabewert.
      if (placeType === 'jukebox') el.playlist = ['tiltr'];
      els.push(el);
      selected = els.length - 1;
    }
    renderProps();
  }

  // Für Strömungen: eine offene Kante als Default-Richtung (kein Dauer-Pin).
  function pickOpenDir(cell: [number, number]): Dir {
    try {
      const def = parseLevel(draft);
      const f = def.floors[activeFloor]!;
      const cells = buildFloorCells(f, { brittleOpen: false, doorsOpen: true }, def.mirror);
      const c = cells[cell[1] * f.size[0] + cell[0]]!;
      for (const d of ['e', 's', 'w', 'n'] as const) if (!c[d]) return d;
    } catch {
      /* Def gerade kaputt */
    }
    return 'e';
  }

  /* --- Palette --------------------------------------------------------------- */

  // Palette: Desktop = Spalte mit allem, Phone = kompakte Werkzeugleiste
  // plus Element-Button, der #edElements als Grid-Sheet öffnet (CSS-Split
  // über die 900px-Media-Query; hier wird nur EINMAL gerendert).
  function renderPalette(): void {
    paletteEl.replaceChildren();
    const clearPendings = (): void => {
      pendingGuard = null;
      pendingWaypoint = null;
      pendingTransporter = null;
      pendingLink = null;
      pendingRetarget = null;
    };
    const groupLabel = (text: string): HTMLElement => {
      const p = document.createElement('p');
      p.className = 'ed-group-label';
      p.textContent = text;
      return p;
    };
    const lblSpan = (text: string): HTMLElement => {
      const s = document.createElement('span');
      s.className = 'ed-lbl';
      s.textContent = text;
      return s;
    };

    const toolsWrap = document.createElement('div');
    toolsWrap.id = 'edTools';
    // Zwei Spieler (M57/M58): ● und ◎ setzen für Spieler 1 ODER 2 – keine
    // eigenen Kacheln (die Leiste bleibt bei sechs, mehr passte auf dem
    // Phone nicht), sondern eine Eigenschaft des Werkzeugs: Feld im
    // Eigenschaften-Panel, oder die AKTIVE Kachel nochmal antippen.
    const two = twoPlayers();
    const sup = two && toolPlayer === 2 ? '²' : '';
    const tools: Array<[Tool, string, string]> = [
      ['select', '☝', t('ed.tool.select')],
      ['wall', '▤', t('ed.tool.wall')],
      ['erase', '⌫', t('ed.tool.erase')],
      ['start', `●${sup}`, sup ? t('ed.tool.start2') : t('ed.tool.start')],
      ['goal', `◎${sup}`, sup ? t('ed.tool.goal2') : t('ed.tool.goal')],
      ['test', '⚑', t('ed.tool.test')],
    ];
    for (const [tl, ico, lbl] of tools) {
      const b = document.createElement('button');
      b.id = `edTool-${tl}`;
      // Start gibt es nur auf Ebene 1. Der Knopf bleibt anklickbar und
      // ERKLÄRT sich (ein `disabled` Knopf nimmt weder Hover noch Fokus –
      // die Tooltip-Blase käme nie, und ein toter Knopf sagt nichts).
      const off = tl === 'start' && activeFloor !== 0;
      const switchable = two && (tl === 'start' || tl === 'goal');
      b.className = 'panel ed-tile' + (tool === tl ? ' active' : '') + (off ? ' off' : '');
      const i = document.createElement('span');
      i.textContent = ico;
      b.append(i, lblSpan(lbl));
      b.dataset.tip = off
        ? t('ed.startFloor1')
        : switchable
          ? `${lbl} · ${t('ed.toolAgain', { n: toolPlayer === 2 ? 1 : 2 })}`
          : lbl; // Hover (Desktop) / Fokus (Touch)
      b.addEventListener('click', () => {
        if (off) {
          flash(t('ed.startFloor1'));
          document.getElementById(`edTool-${tl}`)?.focus({ preventScroll: true });
          return;
        }
        // Aktive ●/◎-Kachel nochmal: Spieler wechseln (nur bei zwei Spielern).
        if (switchable && tool === tl) {
          toolPlayer = toolPlayer === 2 ? 1 : 2;
          paint();
        }
        tool = tl;
        clearPendings();
        renderProps(); // die Werkzeug-Eigenschaft („Setzt für") folgt der Kachel
        closeSheet();
        renderPalette();
        // renderPalette ersetzt den Button: Fokus zurückgeben, damit die
        // Tooltip-Blase nach dem Tap sichtbar bleibt ([data-tip]:focus).
        document.getElementById(`edTool-${tl}`)?.focus({ preventScroll: true });
      });
      toolsWrap.append(b);
    }

    // Phone: aktiver Element-Typ als Button – öffnet/schließt das Sheet.
    const elBtn = document.createElement('button');
    elBtn.id = 'edElementBtn';
    elBtn.className = 'panel ed-tile' + (tool === 'place' ? ' active' : '');
    const caret = document.createElement('span');
    caret.textContent = '▾';
    elBtn.append(miniCanvas(placeType), lblSpan(t(`el.${placeType}.title` as keyof Dict)), caret);
    elBtn.addEventListener('click', () => {
      panel.classList.toggle('sheet-open');
      drawerEl.classList.remove('open');
      updateDrawerHandle();
    });

    // Element-Sheet als MODAL (v3.8.1): Auf dem Phone ist `#edElements` ein
    // SCHIRM über dem Editor, darin eine opake Karte mit Kopf („Elemente" +
    // Schließen) und dem scrollenden Grid. Vorher war es eine bodennahe Karte
    // mit `max-height: 60vh` – auf kurzen Geräten wuchs sie über die
    // Werkzeugleiste und verdeckte ihren EIGENEN Öffner: Wer nichts wählen
    // wollte, kam nicht mehr heraus. Ein Schirm hat immer einen Weg zurück
    // (Tap daneben) und einen sichtbaren Knopf – dasselbe Muster wie die
    // Beweis-Tafel (M73).
    const elementsWrap = document.createElement('div');
    elementsWrap.id = 'edElements';
    elementsWrap.addEventListener('click', (e) => {
      if (e.target === elementsWrap) closeSheet(); // Tap NEBEN die Karte
    });
    const elementsCard = document.createElement('div');
    elementsCard.id = 'edElementCard';
    const elementsHead = document.createElement('div');
    elementsHead.id = 'edElementHead';
    elementsHead.className = 'ed-sheet-head';
    const headLabel = document.createElement('span');
    headLabel.textContent = t('ed.elements');
    const headClose = document.createElement('button');
    headClose.id = 'edElementClose';
    headClose.className = 'btn btn-ghost';
    headClose.textContent = t('common.close');
    headClose.addEventListener('click', closeSheet);
    elementsHead.append(headLabel, headClose);
    const elementsGrid = document.createElement('div');
    elementsGrid.id = 'edElementGrid';
    elementsCard.append(elementsHead, elementsGrid);
    elementsWrap.append(elementsCard);
    // Druckplatte nur bei zwei Spielern (siehe PLACEABLE), hinter der Tür.
    const placeable: string[] = [...PLACEABLE];
    if (twoPlayers()) placeable.splice(placeable.indexOf('door') + 1, 0, 'plate');
    for (const type of placeable) {
      const b = document.createElement('button');
      b.id = `edEl-${type}`;
      b.className = 'panel ed-tile' + (tool === 'place' && placeType === type ? ' active' : '');
      b.append(miniCanvas(type), lblSpan(t(`el.${type}.title` as keyof Dict)));
      b.addEventListener('click', () => {
        tool = 'place';
        placeType = type;
        clearPendings();
        closeSheet();
        renderPalette();
        renderProps(); // Werkzeug-Eigenschaft von ●/◎ verschwindet
      });
      elementsGrid.append(b);
    }

    paletteEl.append(groupLabel(t('ed.tools')), toolsWrap, elBtn, groupLabel(t('ed.elements')), elementsWrap);
  }

  /* --- Eigenschaften ---------------------------------------------------------- */

  /** Pause an Wegpunkt `i` setzen. Die parallele Liste wird nur geführt,
   *  solange irgendwo gewartet wird – sonst fällt sie weg und die Def bleibt
   *  so schlank wie vorher. */
  function setPause(el: RawEl, i: number, v: number): void {
    const list = [...(((el.pause as number[] | undefined) ?? []) as number[])];
    while (list.length < (el.patrol?.length ?? 0)) list.push(0);
    list[i] = v;
    if (list.some((p) => p > 0)) el.pause = list;
    else delete el.pause;
  }

  /** Tap nach „＋ Wegpunkt": Zelle prüfen und an die Bahn hängen. */
  function waypointTap(target: NonNullable<ReturnType<typeof pickTarget>>): void {
    const pending = pendingWaypoint!;
    pendingWaypoint = null;
    if (pending.floor !== activeFloor) return flash(t('ed.wpFloor'), true);
    if (target.kind !== 'cell') return flash(t('ed.wpBad'), true);
    const el = draft!.floors[pending.floor]!.elements[pending.index];
    const pat = el?.patrol as Array<[number, number]> | undefined;
    if (!el || !pat?.length) return;
    const [lx, ly] = pat[pat.length - 1]!;
    const [cx, cy] = target.cell!;
    if ((lx === cx) === (ly === cy)) return flash(t('ed.guardBad'), true); // gleiche Zelle oder diagonal
    if (!cellFree(target.cell!)) return flash(t('ed.cellTaken'), true);
    pat.push([cx, cy]);
    setPause(el, pat.length - 1, ((el.pause as number[] | undefined) ?? [])[pat.length - 1] ?? 0);
    flash('');
  }

  function field(label: string, input: HTMLElement): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'ed-field';
    const lb = document.createElement('label');
    lb.textContent = label;
    wrap.append(lb, input);
    return wrap;
  }

  function numInput(value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(value);
    inp.addEventListener('change', () => {
      const v = Number(inp.value);
      if (Number.isFinite(v)) {
        onChange(Math.max(min, Math.min(max, v)));
        rebuild();
      }
    });
    return inp;
  }

  function selectInput(value: string, options: Array<[string, string]>, onChange: (v: string) => void): HTMLSelectElement {
    const sel = document.createElement('select');
    for (const [v, label] of options) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      if (v === value) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener('change', () => {
      onChange(sel.value);
      rebuild();
    });
    return sel;
  }

  const DIR_OPTIONS: Array<[string, string]> = [
    ['n', '↑'],
    ['e', '→'],
    ['s', '↓'],
    ['w', '←'],
  ];

  /* Playlist der Jukebox: Häkchenliste über den mitgelieferten Titeln plus
     die im Level EINGEBETTETEN (die kommen aus einem importierten Level und
     stehen nicht in unserem Ordner – man kann sie hören und abwählen, aber
     nicht neu anhaken). Die Ziffer vor dem Titel ist die ABSPIELFOLGE: Sie
     entsteht durch die Reihenfolge des Anhakens, nicht durch die Liste. */
  function playlistField(el: RawEl): HTMLElement {
    const list = () => (el.playlist as Array<string | Tune>) ?? [];
    const wrap = document.createElement('div');
    wrap.className = 'ed-playlist';

    const preview = (tune: CompiledTune | undefined): void => {
      if (!tune) return;
      void opts.audio.start().then(() => previewTune(opts.audio, tune));
    };

    const row = (
      label: string,
      order: number,
      checked: boolean,
      embedded: boolean,
      tune: CompiledTune | undefined,
      toggle: (on: boolean) => void,
    ): HTMLElement => {
      const r = document.createElement('label');
      r.className = 'ed-track';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = checked;
      const num = document.createElement('span');
      num.className = 'ed-order';
      num.textContent = order > 0 ? `${order}.` : '';
      const name = document.createElement('span');
      name.textContent = label;
      r.append(box, num, name);
      if (embedded) {
        const tag = document.createElement('span');
        tag.className = 'ed-embedded';
        tag.textContent = t('ed.f.embedded');
        r.append(tag);
      }
      const play = document.createElement('button');
      play.className = 'btn btn-soft';
      play.textContent = '▶';
      play.addEventListener('click', (ev) => {
        // Im <label>: Ein Klick auf den Knopf darf das Häkchen nicht kippen.
        ev.preventDefault();
        ev.stopPropagation();
        preview(tune);
      });
      r.append(play);
      box.addEventListener('change', () => {
        toggle(box.checked);
        renderProps();
        rebuild();
      });
      return r;
    };

    const setList = (next: Array<string | Tune>): boolean => {
      // Das Schema verlangt mindestens einen und erlaubt höchstens acht Titel –
      // hier abfangen, sonst wäre das Level bis zum Wiederanhaken unladbar.
      if (!next.length) {
        flash(t('ed.playlistMin'), true);
        return false;
      }
      if (next.length > 8) {
        flash(t('ed.playlistMax'), true);
        return false;
      }
      el.playlist = next;
      flash('');
      return true;
    };

    for (const tune of MUSIC) {
      const idx = list().indexOf(tune.id);
      wrap.append(
        row(tune.title, idx + 1, idx >= 0, false, compiledById(tune.id), (on) => {
          if (on) setList([...list(), tune.id]);
          else setList(list().filter((e) => e !== tune.id));
        }),
      );
    }
    // Eingebettete Titel des Levels – immer angehakt, solange sie drin sind.
    list().forEach((entry, i) => {
      if (typeof entry === 'string') return;
      let compiled: CompiledTune | undefined;
      try {
        compiled = compileTune(entry);
      } catch {
        compiled = undefined;
      }
      wrap.append(
        row(entry.title, i + 1, true, true, compiled, () => {
          setList(list().filter((e) => e !== entry));
        }),
      );
    });
    return wrap;
  }

  /** Bereichs-Kopf im Eigenschaften-Panel. Das Panel mischt DREI
   *  Geltungsbereiche – Element, Level, Ebene – und ohne Beschriftung sieht
   *  „Spalten" wie eine Level-Eigenschaft aus (Rückmeldung aus der Praxis).
   *  Jeder Block sagt deshalb selbst, wofür er gilt; `first` lässt die
   *  Trennlinie am ersten Kopf weg. */
  function scopeHead(text: string, first = false): HTMLElement {
    const h = document.createElement('p');
    h.className = 'ed-group-label ed-scope' + (first ? ' first' : '');
    h.textContent = text;
    return h;
  }

  function renderProps(): void {
    if (!draft) return;
    propsEl.replaceChildren();
    const f = floor();

    updateDrawerHandle(); // Phone-Griff spiegelt die Auswahl (Icon + Name)

    // Ausgewählte WAND: Kopf + Variante (massiv / brüchig / Schallschutz).
    if (selEdge && !f.elements[selected]) {
      if (edgeOpen(selEdge)) {
        selEdge = null; // inzwischen aufgeschnitten – nichts mehr zu wählen
      } else {
        const e = selEdge;
        const head = document.createElement('div');
        head.className = 'ed-selhead';
        const label = document.createElement('span');
        label.className = 'ed-group-label';
        label.textContent = `${t('ed.selected')}: ${t('ed.wall')} · ${t('ed.scope.element')}`;
        head.append(miniCanvas('wallEcho'), label);
        const state = edgeState(f.maze, e, false);
        const demo = galleryDemos.get(state === 'absorb' ? 'wallAbsorb' : state === 'mirror' ? 'wallMirror' : 'wallEcho');
        if (demo) {
          const listen = document.createElement('button');
          listen.className = 'btn btn-soft ed-listen';
          listen.textContent = t('common.listen');
          listen.addEventListener('click', () => void opts.audio.start().then(() => demo(opts.audio)));
          head.append(listen);
        }
        propsEl.append(head);
        const sel = selectInput(state === 'brittle' || state === 'absorb' || state === 'mirror' ? state : 'solid', [
          ['solid', t('ed.v.solid')],
          ['brittle', t('ed.v.brittle')],
          ['absorb', t('ed.v.absorb')],
          ['mirror', t('ed.v.mirror')],
        ], (v) => {
          setEdgeVariant(f.maze, e, v as WallVariant);
          rebuild();
          renderProps();
        });
        sel.id = 'edWallVariant';
        propsEl.append(field(t('ed.f.variant'), sel));
        // Einseitig brüchig (M66): von welcher Seite bricht die Wand?
        if (state === 'brittle') {
          const vertical = e[1] === 'e';
          const sides: Array<[string, string]> = vertical
            ? [['w', t('ed.side.w')], ['e', t('ed.side.e')]]
            : [['n', t('ed.side.n')], ['s', t('ed.side.s')]];
          const cur = brittleSideOf(f.maze, e);
          const sideSel = selectInput(cur ?? 'both', [['both', t('ed.side.both')], ...sides], (v) => {
            setBrittleSide(f.maze, e, v === 'both' ? undefined : (v as Dir));
            rebuild();
          });
          sideSel.id = 'edBrittleSide';
          propsEl.append(field(t('ed.f.brittleSide'), sideSel));
          // Welche Seite ist gemeint? Die, auf der der BALL steht – als
          // Rückweg also die Seite, auf der man eingeschlossen ist. Verkehrt
          // eingetragen führt die Wand hinein statt hinaus; der
          // Softlock-Bericht sagt das seit M81, hier steht es vorher.
          if (cur) {
            const sideHint = document.createElement('p');
            sideHint.className = 'menu-meta';
            sideHint.textContent = t('ed.brittleSideHint');
            propsEl.append(sideHint);
          }
        }
        const hint = document.createElement('p');
        hint.className = 'menu-meta';
        hint.textContent = t('ed.wallHint');
        propsEl.append(hint);
      }
    }

    // Ausgewähltes Element: Kopf mit Galerie-Miniatur zur Identifikation
    const el = f.elements[selected];
    if (el) {
      const head = document.createElement('div');
      head.className = 'ed-selhead';
      const label = document.createElement('span');
      label.className = 'ed-group-label';
      label.textContent = `${t('ed.selected')}: ${t(`el.${el.type}.title` as keyof Dict)} · ${t('ed.scope.element')}`;
      head.append(miniCanvas(el.type), label);
      // Ton-Vorschau: Das Element IST sein Klang – man muss ihn beim Bauen
      // hören können, nicht erst im Testlauf suchen.
      const demo = galleryDemos.get(el.type);
      if (demo) {
        const listen = document.createElement('button');
        listen.className = 'btn btn-soft ed-listen';
        listen.textContent = t('common.listen');
        listen.addEventListener('click', () => {
          // Erste Geste im Editor: AudioContext freischalten, dann spielen.
          void opts.audio.start().then(() => demo(opts.audio));
        });
        head.append(listen);
      }
      propsEl.append(head);
      const num = (label: string, key: string, min: number, max: number, step = 1, obj: Record<string, unknown> = el) =>
        propsEl.append(field(label, numInput(Number(obj[key] ?? 0), min, max, step, (v) => (obj[key] = v))));

      if (el.type === 'hole') {
        const breathing = el.breathing as Record<string, unknown> | undefined;
        const toggle = selectInput(breathing ? '1' : '0', [
          ['1', t('ed.f.breathing')],
          ['0', t('ed.f.static')],
        ], (v) => {
          if (v === '1') el.breathing = { offset: 0 };
          else delete el.breathing;
          renderProps();
        });
        propsEl.append(field(t('ed.f.mode'), toggle));
        if (breathing) num(t('ed.f.offset'), 'offset', 0, 12, 0.5, breathing);
      }
      if (el.type === 'windZone') {
        if (el.force === undefined) el.force = 1150;
        propsEl.append(field(t('ed.f.dir'), selectInput(String(el.dir ?? 'e'), DIR_OPTIONS, (v) => (el.dir = v))));
        num(t('ed.f.force'), 'force', 400, 2400, 50);
      }
      if (el.type === 'current') {
        propsEl.append(field(t('ed.f.dir'), selectInput(String(el.dir ?? 'e'), DIR_OPTIONS, (v) => (el.dir = v))));
      }
      if (el.type === 'guard' || el.type === 'listener') num(t('ed.f.speed'), 'speed', 40, 200, 5);
      if (el.type === 'roamingHole') num(t('ed.f.speed'), 'speed', 20, 150, 5);
      if (el.type === 'bell') {
        if (el.ringS === undefined) el.ringS = 4;
        num(t('ed.f.ringS'), 'ringS', 1, 12, 0.5);
      }
      if (el.type === 'guard' || el.type === 'roamingHole') {
        // Wegpunkte (M72): beliebig viele, mit Pause je Punkt. Die Liste zeigt
        // die Reihenfolge (Ping-Pong) und wo gewartet wird; ＋ hängt einen
        // Punkt an (nächster Tap), − nimmt den letzten weg (zwei bleiben –
        // ohne zwei Punkte gibt es keine Bahn).
        const pat = (el.patrol ?? []) as Array<[number, number]>;
        const pauses = (el.pause as number[] | undefined) ?? [];
        propsEl.append(scopeHead(t('ed.f.waypoints', { n: pat.length })));
        pat.forEach((c, i) => {
          const inp = numInput(pauses[i] ?? 0, 0, 30, 0.5, (v) => {
            setPause(el, i, v);
            rebuild();
            paint();
          });
          inp.id = `edPause${i}`;
          propsEl.append(field(t('ed.f.pauseAt', { n: i + 1, x: c[0], y: c[1] }), inp));
        });
        const row = document.createElement('div');
        row.className = 'ed-row';
        const add = document.createElement('button');
        add.className = 'btn btn-soft';
        add.id = 'edWpAdd';
        add.textContent = t('ed.wpAdd');
        add.addEventListener('click', () => {
          pendingWaypoint = { floor: activeFloor, index: selected };
          flash(t('ed.wpNext'));
          paint();
        });
        const drop = document.createElement('button');
        drop.className = 'btn btn-ghost';
        drop.id = 'edWpDrop';
        drop.textContent = t('ed.wpDrop');
        drop.addEventListener('click', () => {
          if (pat.length <= 2) return flash(t('ed.wpMin'), true);
          pat.pop();
          if (Array.isArray(el.pause)) (el.pause as number[]).length = pat.length;
          if (Array.isArray(el.pause) && !(el.pause as number[]).some((v) => v > 0)) delete el.pause;
          rebuild();
          renderProps();
          paint();
        });
        row.append(add, drop);
        propsEl.append(row);
      }
      if (el.type === 'guard') {
        // Schläfer (M45): Variante des Wächters – schläft, bis ein Ping ihn weckt.
        const sleeper = el.sleeper as { wakeRadius?: number; awakeS?: number } | undefined;
        const sel = selectInput(sleeper ? 'yes' : 'no', [
          ['no', t('ed.sleeper.no')],
          ['yes', t('ed.sleeper.yes')],
        ], (v) => {
          if (v === 'yes') el.sleeper = { wakeRadius: 220, awakeS: 5 };
          else delete el.sleeper;
          renderProps();
          rebuild();
        });
        sel.id = 'edSleeper';
        propsEl.append(field(t('ed.f.sleeper'), sel));
        if (sleeper) {
          sleeper.wakeRadius ??= 220;
          sleeper.awakeS ??= 5;
          num(t('ed.f.wakeRadius'), 'wakeRadius', 100, 500, 20, sleeper as Record<string, unknown>);
          num(t('ed.f.awakeS'), 'awakeS', 2, 20, 1, sleeper as Record<string, unknown>);
        }
      }
      if (el.type === 'key') {
        // Stimmgabel (M45): Klang-Variante des Schlüssels.
        const voice = selectInput(String(el.voice ?? 'tinkle'), [
          ['tinkle', t('ed.voice.tinkle')],
          ['fork', t('ed.voice.fork')],
        ], (v) => {
          if (v === 'tinkle') delete el.voice;
          else el.voice = v;
          rebuild();
        });
        voice.id = 'edKeyVoice';
        propsEl.append(field(t('ed.f.voice'), voice));
      }
      if (el.type === 'hourglass') {
        if (el.bonusS === undefined) el.bonusS = 10;
        num(t('ed.f.bonusS'), 'bonusS', 5, 60, 5);
      }
      if (el.type === 'key' || el.type === 'timedSwitch' || el.type === 'plate') {
        // Zeitschlösser nur auf derselben Ebene (Timer-Beweis), Schlüssel und
        // Platten überall (M60: die Platte hatte weder Feld noch 🔗).
        const options = doorOptions(el.type === 'timedSwitch');
        const cur = String(el.opens ?? '');
        if (!options.some(([v]) => v === cur)) options.unshift([cur, `${cur} ⚠`]);
        propsEl.append(field(t('ed.f.opens'), selectInput(cur, options, (v) => (el.opens = v))));
        const link = document.createElement('button');
        link.className = 'btn btn-soft ed-link';
        link.textContent = `🔗 ${t('ed.linkPick')}`;
        link.addEventListener('click', () => {
          pendingLink = { floor: activeFloor, index: selected };
          pendingRetarget = null;
          flash(t('ed.linkHint'));
          paint();
        });
        propsEl.append(link);
      }
      if (el.type === 'door') {
        const idInp = document.createElement('input');
        idInp.type = 'text';
        idInp.value = String(el.id ?? '');
        idInp.addEventListener('change', () => renameDoor(el, idInp.value.trim()));
        propsEl.append(field(t('ed.f.id'), idInp));
        const info = document.createElement('p');
        info.className = 'menu-meta';
        info.textContent = `${t('ed.f.openers')}: ${openersOf(String(el.id)).length}`;
        propsEl.append(info);
        // Mehrere Öffner: einer genügt (any) oder alle gleichzeitig (all) –
        // core/doors.ts; der Beweis (coopReachable) rechnet dasselbe.
        const req = selectInput(String(el.require ?? 'any'), [
          ['any', t('ed.req.any')],
          ['all', t('ed.req.all')],
        ], (v) => {
          if (v === 'any') delete el.require;
          else el.require = v;
        });
        req.id = 'edDoorRequire';
        propsEl.append(field(t('ed.f.require'), req));
        // Nach dem Öffnen (M76): Platte/Schalter halten die Tür nur, solange
        // sie erfüllt sind – „bleibt offen" macht das Aufgehen endgültig.
        // Schlüssel öffnen ohnehin dauerhaft; das steht als Hinweis dabei,
        // damit niemand die Einstellung für einen Schlüssel sucht.
        const latch = selectInput(el.latch === true ? 'stay' : 'close', [
          ['close', t('ed.latch.close')],
          ['stay', t('ed.latch.stay')],
        ], (v) => {
          if (v === 'stay') el.latch = true;
          else delete el.latch;
          rebuild();
          paint();
        });
        latch.id = 'edDoorLatch';
        propsEl.append(field(t('ed.f.latch'), latch));
        if (el.latch === true) {
          const latchHint = document.createElement('p');
          latchHint.className = 'menu-meta';
          latchHint.textContent = t('ed.latchHint');
          propsEl.append(latchHint);
        }
        // Tür nur für einen Spieler (M72). Für den anderen ist sie eine WAND –
        // das steht als Hinweis dabei, sonst sucht er später den Öffner.
        if (twoPlayers()) {
          const who = selectInput(String(el.player ?? 'both'), [
            ['both', t('ed.tp.both')],
            ['1', t('ed.tp.p1')],
            ['2', t('ed.tp.p2')],
          ], (v) => {
            if (v === 'both') delete el.player;
            else el.player = Number(v);
            rebuild();
            paint();
          });
          who.id = 'edDoorPlayer';
          propsEl.append(field(t('ed.f.doorPlayer'), who));
          if (el.player !== undefined) {
            const hint = document.createElement('p');
            hint.className = 'menu-meta';
            hint.textContent = t('ed.doorPlayerHint');
            propsEl.append(hint);
          }
        }
      }
      if (el.type === 'transporter') {
        const tg = el.target as { floor: number; cell: [number, number] } | undefined;
        const info = document.createElement('p');
        info.className = 'menu-meta';
        info.textContent = tg ? `${t('ed.f.target')}: E${tg.floor + 1} (${tg.cell[0]},${tg.cell[1]})` : '';
        propsEl.append(info);
        const link = document.createElement('button');
        link.className = 'btn btn-soft ed-link';
        link.textContent = `🔗 ${t('ed.retargetPick')}`;
        link.addEventListener('click', () => {
          pendingRetarget = { floor: activeFloor, index: selected };
          pendingLink = null;
          flash(t('ed.retargetHint'));
          paint();
        });
        propsEl.append(link);
        // Zwei Spieler (M65): Pad nur für einen Spieler – in der Welt des
        // anderen gibt es es nicht.
        if (twoPlayers()) {
          const who = selectInput(String(el.player ?? 'both'), [
            ['both', t('ed.tp.both')],
            ['1', t('ed.tp.p1')],
            ['2', t('ed.tp.p2')],
          ], (v) => {
            if (v === 'both') delete el.player;
            else el.player = Number(v);
            rebuild();
            paint();
          });
          who.id = 'edTransporterPlayer';
          propsEl.append(field(t('ed.tp.for'), who));
        }
      }
      if (el.type === 'timedSwitch') {
        if (el.durationS === undefined) el.durationS = 6;
        num(t('ed.f.duration'), 'durationS', 2, 30, 1);
      }
      if (el.type === 'slidingWall') {
        const cycle = (el.cycle ??= { open: 2.6, closed: 2.2, ramp: 0.6, offset: 0 }) as Record<string, unknown>;
        num(t('ed.f.openS'), 'open', 1, 12, 0.2, cycle);
        num(t('ed.f.closedS'), 'closed', 1, 12, 0.2, cycle);
        num(t('ed.f.offset'), 'offset', 0, 12, 0.2, cycle);
      }
      if (el.type === 'jukebox') {
        if (el.volume === undefined) el.volume = 1;
        propsEl.append(field(t('ed.f.playlist'), playlistField(el)));
        num(t('ed.f.volume'), 'volume', 0, 1, 0.1);
      }
      if (el.type === 'torch') {
        if (el.r === undefined) el.r = 160;
        num(t('ed.f.radius'), 'r', 60, 400, 20);
      }
      if (el.type === 'anchor') {
        if (el.r === undefined) el.r = 120;
        if (el.force === undefined) el.force = 2000;
        num(t('ed.f.radius'), 'r', 60, 300, 10);
        num(t('ed.f.force'), 'force', 600, 2400, 100);
      }

      const del = document.createElement('button');
      del.className = 'btn btn-ghost';
      del.textContent = `⌫ ${t('ed.deleteEl')}`;
      del.addEventListener('click', () => {
        const [removed] = f.elements.splice(selected, 1);
        selected = -1;
        selEdge = null;
        if (removed?.type === 'door') cleanupAfterDoorDelete(String(removed.id));
        renderProps();
        rebuild();
      });
      propsEl.append(del);
    }

    // Werkzeug-Eigenschaft (M58): ● und ◎ setzen für Spieler 1 oder 2.
    if (twoPlayers() && (tool === 'start' || tool === 'goal') && selected < 0 && !selEdge) {
      propsEl.append(scopeHead(`${tool === 'start' ? '●' : '◎'} ${t(tool === 'start' ? 'ed.tool.start' : 'ed.tool.goal')}`));
      const who = selectInput(String(toolPlayer), [
        ['1', t('ed.forPlayer.1')],
        ['2', t('ed.forPlayer.2')],
      ], (v) => {
        toolPlayer = v === '2' ? 2 : 1;
        renderPalette();
        paint();
      });
      who.id = 'edToolPlayer';
      propsEl.append(field(t('ed.forPlayer'), who));
    }

    // Level-Metadaten: gelten für ALLE Ebenen.
    propsEl.append(scopeHead(t('ed.scope.level'), selected < 0));

    const intro = document.createElement('textarea');
    intro.value = String(draft.intro ?? '');
    intro.addEventListener('change', () => {
      if (intro.value.trim()) draft!.intro = intro.value.trim();
      else delete draft!.intro;
    });
    propsEl.append(field(t('ed.intro'), intro));

    propsEl.append(
      field(t('ed.par'), numInput(Number(draft.parTimeS ?? 60), 10, 900, 5, (v) => (draft!.parTimeS = v))),
      field(t('ed.pings'), numInput(Number(draft.pingBudget ?? 3), 0, 9, 1, (v) => (draft!.pingBudget = v))),
    );
    // Wegmarken (M89): Vorrat je Spieler – nur bei ZWEI Spielern, denn allein
    // hört die Boje niemand außer dir. 0 heißt: Dieses Level kennt sie nicht,
    // dann verschwindet auch der HUD-Knopf. Ein Level ohne Bojen spielt
    // außerdem mit jeder älteren Gegenstelle (Merkmals-Gate am LEVEL).
    if (twoPlayers()) {
      const marksInput = numInput(Number(draft.marks ?? 3), 0, 9, 1, (v) => (draft!.marks = v));
      marksInput.id = 'edMarks';
      propsEl.append(field(t('ed.marks'), marksInput));
    }

    // Zwei Spieler (M57): Ein Zwei-Spieler-Level ist NUR zu zweit spielbar
    // (Werkstatt: „Zu zweit" statt „Spielen"); zurück auf einen Spieler räumt
    // Start 2, Ziel 2 und den Modus weg – ein Solo-Level trägt keine
    // Gast-Koordinaten mit sich herum.
    const players = selectInput(String(draft.players ?? 1), [
      ['1', t('ed.players.1')],
      ['2', t('ed.players.2')],
    ], (v) => {
      if (v === '2') {
        draft!.players = 2;
        draft!.mpMode ??= 'coop';
      } else {
        delete draft!.players;
        delete draft!.mpMode;
        for (const f of draft!.floors) {
          delete f.start2;
          delete f.goal2;
          for (const el of f.elements) if (el.type === 'transporter') delete el.player;
        }
        toolPlayer = 1;
        if (placeType === 'plate') placeType = 'hole';
        testPlayer = 1;
      }
      renderPalette();
      renderProps();
      rebuild();
    });
    players.id = 'edPlayers';
    propsEl.append(field(t('ed.players'), players));
    if (twoPlayers()) {
      const modeSel = selectInput(String(draft.mpMode ?? 'coop'), [
        ['coop', t('ed.mpMode.coop')],
        ['race', t('ed.mpMode.race')],
        ['any', t('ed.mpMode.any')],
      ], (v) => {
        draft!.mpMode = v as 'coop' | 'race' | 'any';
        rebuild();
      });
      modeSel.id = 'edMpMode';
      propsEl.append(field(t('ed.mpMode'), modeSel));
      const hint = document.createElement('p');
      hint.className = 'menu-meta';
      hint.textContent = t('ed.mpHint');
      propsEl.append(hint);
      // Vorschau-Optionen: als welcher Spieler, und hält der Partner die Platten?
      const asSel = selectInput(String(testPlayer), [
        ['1', t('ed.testAs.1')],
        ['2', t('ed.testAs.2')],
      ], (v) => {
        testPlayer = v === '2' ? 2 : 1;
      });
      asSel.id = 'edTestAs';
      propsEl.append(field(t('ed.testAs'), asSel));
      const swapHint = document.createElement('p');
      swapHint.className = 'menu-meta';
      swapHint.id = 'edSwapHint';
      swapHint.textContent = t('ed.testSwap');
      propsEl.append(swapHint);
    }

    // Ab hier gilt alles nur für die AKTIVE Ebene – Größe und Maze sind
    // Eigenschaften des Stockwerks, nicht des Levels.
    propsEl.append(scopeHead(t('ed.scope.floor', { n: activeFloor + 1 })));

    const sizeRow = document.createElement('div');
    sizeRow.className = 'ed-row';
    sizeRow.append(
      field(t('ed.cols'), numInput(f.size[0], 3, 20, 1, (v) => resize(v, f.size[1]))),
      field(t('ed.rows'), numInput(f.size[1], 3, 24, 1, (v) => resize(f.size[0], v))),
    );
    propsEl.append(sizeRow);

    // Helle Ebene: Labyrinth und Elemente sichtbar (Renderer revealAll) –
    // ein Stilmittel je Stockwerk, Default bleibt die dunkle Welt.
    const fr = f as unknown as Record<string, unknown>;
    const light = selectInput(fr.bright === true ? 'bright' : 'dark', [
      ['dark', t('ed.light.dark')],
      ['bright', t('ed.light.bright')],
    ], (v) => {
      if (v === 'bright') fr.bright = true;
      else delete fr.bright;
      rebuild();
    });
    light.id = 'edFloorBright';
    propsEl.append(field(t('ed.f.light'), light));

    const reroll = document.createElement('button');
    reroll.className = 'btn btn-ghost';
    reroll.textContent = `🎲 ${t('ed.reroll')}`;
    reroll.addEventListener('click', () => {
      f.maze.seed = Math.floor(Math.random() * 0x7fffffff);
      rebuild();
    });
    propsEl.append(reroll);

    // Gegenstück zum Würfeln: leeres Feld (M87). Zwei-Tap, denn es gibt kein
    // Rückgängig – und ein Handbau von zwanzig Wänden wäre mit einem Tap weg.
    const clear = document.createElement('button');
    clear.className = 'btn btn-ghost';
    clear.id = 'edClearWalls';
    clear.textContent = `🧹 ${t('ed.clearWalls')}`;
    clear.addEventListener('click', () => {
      twoTap(clear, `⚠ ${t('ed.clearWallsAsk')}`, () => {
        const n = clearWalls(f.maze, f.size[0], f.size[1], seedOpenAll());
        selEdge = null; // die ausgewählte Wand gibt es nicht mehr
        rebuild();
        flash(t('ed.clearedWalls', { n }));
      });
    });
    propsEl.append(clear);
  }

  // Feld verkleinern/vergrößern: Elemente und Wand-Edits außerhalb fallen weg.
  function resize(cols: number, rows: number): void {
    const f = floor();
    f.size = [cols, rows];
    const inside = (c: [number, number]) => c[0] < cols && c[1] < rows;
    const edgeInside = (e: Edge) =>
      e[0][0] < cols && e[0][1] < rows && (e[1] !== 'e' || e[0][0] < cols - 1) && (e[1] !== 's' || e[0][1] < rows - 1);
    f.elements = f.elements.filter((el) =>
      el.cell ? inside(el.cell) : el.edge ? edgeInside(el.edge) : el.patrol ? el.patrol.every(inside) : true,
    );
    f.maze.carve = f.maze.carve.filter(edgeInside);
    f.maze.add = f.maze.add.filter(edgeInside);
    f.maze.brittle = f.maze.brittle.filter(edgeInside);
    f.maze.brittleSide = (f.maze.brittleSide ?? []).filter(([e]) => edgeInside(e));
    f.maze.absorb = f.maze.absorb.filter(edgeInside);
    f.start = [Math.min(f.start[0], cols - 1), Math.min(f.start[1], rows - 1)];
    if (f.goal) f.goal = [Math.min(f.goal[0], cols - 1), Math.min(f.goal[1], rows - 1)];
    if (f.start2) f.start2 = [Math.min(f.start2[0], cols - 1), Math.min(f.start2[1], rows - 1)];
    if (f.goal2) f.goal2 = [Math.min(f.goal2[0], cols - 1), Math.min(f.goal2[1], rows - 1)];
    selected = -1;
    selEdge = null;
    fitView();
    renderProps();
  }

  /* --- Canvas-Gesten: Tap = Aktion, Drag = Pan, Pinch = Zoom ------------------ */

  const pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  let panning = false;
  let pinchStart: { dist: number; scale: number } | null = null;

  const toCanvas = (ev: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: (ev.clientX - rect.left) * renderer.dpr, y: (ev.clientY - rect.top) * renderer.dpr };
  };

  canvas.addEventListener('pointerdown', (ev) => {
    highlight = null; // wer das Feld anfasst, braucht die Markierung nicht mehr
    canvas.setPointerCapture(ev.pointerId);
    const p = toCanvas(ev);
    pointers.set(ev.pointerId, { ...p, startX: p.x, startY: p.y });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale: view.scale };
      panning = true; // kein Tap mehr
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    const entry = pointers.get(ev.pointerId);
    if (!entry) return;
    const p = toCanvas(ev);
    const dx = p.x - entry.x;
    const dy = p.y - entry.y;
    entry.x = p.x;
    entry.y = p.y;
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      const next = Math.max(0.15, Math.min(4, (pinchStart.scale * dist) / pinchStart.dist));
      view.ox = mid.x - ((mid.x - view.ox) / view.scale) * next;
      view.oy = mid.y - ((mid.y - view.oy) / view.scale) * next;
      view.scale = next;
      paint();
      return;
    }
    if (!panning && Math.hypot(p.x - entry.startX, p.y - entry.startY) > 12 * renderer.dpr) panning = true;
    if (panning && pointers.size === 1) {
      view.ox += dx;
      view.oy += dy;
      paint();
    }
  });
  const endPointer = (ev: PointerEvent): void => {
    const entry = pointers.get(ev.pointerId);
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (!entry) return;
    if (!panning && pointers.size === 0) {
      const wx = (entry.x - view.ox) / view.scale;
      const wy = (entry.y - view.oy) / view.scale;
      act(wx, wy);
    }
    if (pointers.size === 0) panning = false;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = (ev.clientX - rect.left) * renderer.dpr;
    const my = (ev.clientY - rect.top) * renderer.dpr;
    const next = Math.max(0.15, Math.min(4, view.scale * (ev.deltaY < 0 ? 1.15 : 1 / 1.15)));
    view.ox = mx - ((mx - view.ox) / view.scale) * next;
    view.oy = my - ((my - view.oy) / view.scale) * next;
    view.scale = next;
    paint();
  });

  /* --- Ebenen-Tabs (bis 4 Ebenen, Schema-Limit) -------------------------------- */

  function switchFloor(index: number): void {
    activeFloor = index;
    selected = -1;
    selEdge = null;
    pendingGuard = null;
    // Mit dem Start-Werkzeug in der Hand auf eine tiefere Ebene wechseln:
    // Dort gibt es keinen Start zu setzen – zurück aufs Auswählen.
    if (tool === 'start' && activeFloor !== 0) tool = 'select';
    renderFloorTabs();
    renderPalette(); // der ●-Knopf hängt an der Ebene (gedämpft ab E2)
    renderProps();
    fitView();
    paint();
  }

  function renderFloorTabs(): void {
    if (!draft) return;
    const tabs = $('edFloorTabs');
    tabs.replaceChildren();
    draft.floors.forEach((_, i) => {
      const b = document.createElement('button');
      b.className = 'btn chip' + (i === activeFloor ? ' active' : '');
      b.textContent = `E${i + 1}`;
      b.addEventListener('click', () => switchFloor(i));
      tabs.append(b);
    });
    if (draft.floors.length < MAX_FLOORS) {
      const add = document.createElement('button');
      add.className = 'btn chip';
      add.textContent = '＋';
      add.dataset.tip = t('ed.addFloor');
      add.addEventListener('click', () => {
        const cur = floor();
        draft!.floors.push({
          size: [...cur.size] as [number, number],
          maze: { seed: Math.floor(Math.random() * 0x7fffffff), carve: [], add: [], brittle: [], brittleSide: [], absorb: [], mirrors: [] },
          elements: [],
          start: [0, 0],
          goal: null,
        });
        switchFloor(draft!.floors.length - 1);
        rebuild();
      });
      tabs.append(add);
    }
    if (draft.floors.length > 1) {
      const rm = document.createElement('button');
      rm.className = 'btn chip';
      rm.textContent = '−';
      rm.dataset.tip = t('ed.removeFloor');
      rm.addEventListener('click', () => {
        const removed = activeFloor;
        removeFloor(draft!, removed);
        pendingTransporter = null;
        switchFloor(Math.max(0, removed - 1));
        rebuild();
      });
      tabs.append(rm);
    }
  }

  const playBtn = $<HTMLButtonElement>('edPlay');
  playBtn.addEventListener('click', () => setPlaying(!playing));

  $('edFit').addEventListener('click', () => {
    fitView();
    paint();
  });

  /* --- Teilen / Export ---------------------------------------------------------- */

  $('edShare').addEventListener('click', (ev) => {
    if (!draft) return;
    // Ein Level, das nicht lädt, hat keinen Link – da gibt es nichts zu
    // dekodieren. Rote BADGES dagegen sind seit M80 nach Rückfrage teilbar:
    // Genau so ein Level will man jemandem zeigen („schau mal, warum sagt er
    // Softlock?"). Der Link heißt dann Diagnose-Link, der Empfänger sieht die
    // Warnung im Angebot.
    if (loadError) return flash(t('ed.shareLoadBad'), true);
    if (!isShareable(checks)) {
      const sum = findingsSummary(checks);
      const b = ev.currentTarget as HTMLButtonElement;
      // Der Knopf steht in der Kopfzeile neben ▶ Testen und Speichern: dort
      // gehört nur ein KURZER Wechseltext hin (⚠ statt 🔗), die Frage in die
      // Statuszeile – ein Satz im Knopf sprengt die Zeile auf dem Phone.
      if (b.dataset.armed !== '1') flash(t('ed.shareAnyway'), true);
      return twoTap(
        b,
        '⚠',
        () => {
          flash(t('ed.shareDiag', { hard: sum?.hard ?? 0, soft: sum?.soft ?? 0 }), true);
          doShare();
        },
        t('ed.shareAnyway'),
      );
    }
    doShare();
  });

  /** Teilen-Link erzeugen und weitergeben (Web Share, sonst Zwischenablage). */
  function doShare(): void {
    if (!draft) return;
    draft.name = nameInput.value.trim() || t('ed.untitled');
    const def = draft as unknown as Record<string, unknown>;
    void (async () => {
      const token = await encodeLevel(def);
      const url = `${location.origin}${location.pathname}#level=${token}`;
      // Testbarkeits-Hook: der Link, den Teilen erzeugt hätte.
      (window as unknown as { __tiltrShareUrl?: string }).__tiltrShareUrl = url;
      if (token.length > SHARE_WARN_BYTES) flash(t('ed.shareBig'), true);
      try {
        if (navigator.share) {
          await navigator.share({ title: draft!.name, url });
        } else {
          await navigator.clipboard.writeText(url);
          flash(t('ed.shareCopied'));
        }
      } catch {
        /* abgebrochen */
      }
    })();
  }

  $('edExport').addEventListener('click', () => {
    if (!draft) return;
    draft.name = nameInput.value.trim() || t('ed.untitled');
    // Derselbe Weg wie Werkstatt und Backup: Teilen als Datei (text/plain),
    // sonst Download – der nackte Download-Link war in der iOS-PWA tot.
    // Befunde mit in die Datei (M80): Wer ein rotes Level weitergibt, gibt
    // die Kreuze mit – ohne sie muss der Empfänger den Beweis neu raten.
    const payload = exportPayload(draft as unknown as Record<string, unknown>, findings(checks));
    // Testbarkeits-Hook wie __tiltrShareUrl: was die Datei enthalten hätte.
    (window as unknown as { __tiltrExport?: string }).__tiltrExport = payload;
    void saveTextFile(
      `tiltr-level-${draft.name.replace(/[^\wäöüÄÖÜß-]+/g, '_').toLowerCase()}${EXPORT_EXT}`,
      payload,
      'file',
    );
  });

  /* --- Kopfzeile --------------------------------------------------------------- */

  nameInput.addEventListener('change', () => {
    if (!draft) return;
    draft.name = nameInput.value.trim() || t('ed.untitled');
    saveDraft(draft as unknown as Record<string, unknown>);
  });

  $('edClose').addEventListener('click', () => {
    setPlaying(false);
    panel.classList.add('hidden');
    opts.onClose();
  });

  $('edSave').addEventListener('click', () => {
    if (!draft) return;
    draft.name = nameInput.value.trim() || t('ed.untitled');
    // Ins Bundle, das das Level schon enthält – sonst ins aktuelle (M40).
    const ok = workshop.save(draft as unknown as Record<string, unknown>, undefined, t('ws.bundle.defaultTitle'));
    // Gesichert ist gesichert: der Reload-Draft ist dann Bibliotheks-Sache.
    if (ok) clearDraft();
    flash(ok ? t('ed.saved') : t('ed.saveFailed'), false);
    opts.onSaved();
  });

  $('edCheckClose').addEventListener('click', hideCheck);
  // Tap neben die Karte schließt – ein Modal, das nur über einen Knopf
  // wieder weggeht, fühlt sich auf dem Phone wie eine Falle an.
  $('edCheckSheet').addEventListener('click', (e) => {
    if (e.target === $('edCheckSheet')) hideCheck();
  });
  $('edCheckShow').addEventListener('click', () => {
    if (checkAt) showPlace(checkAt);
  });

  $('edTest').addEventListener('click', () => {
    if (!draft || loadError) return;
    setPlaying(false); // der Testlauf hat seine eigene Zeit
    draft.name = nameInput.value.trim() || t('ed.untitled');
    // ⚑ nur, wenn die Ebene noch existiert (Ebenen können gelöscht sein).
    const from = testStart && testStart.floor < draft.floors.length ? testStart : null;
    opts.onTest(JSON.parse(JSON.stringify(draft)) as RawLevel, {
      from,
      player: twoPlayers() ? testPlayer : 1,
    });
  });

  window.addEventListener('resize', () => {
    if (!panel.classList.contains('hidden')) paint();
  });

  // Der Renderer setzt sein Backing bei JEDER Layout-Änderung des Canvas neu
  // (ResizeObserver) – und ein neues Backing ist LEER. Ohne eigenen Repaint
  // verschwindet die Karte, sobald sich das Layout setzt (Palette/Props
  // rendern nach, Browser-Toolbar, Tastatur) – sie käme erst beim nächsten
  // Zoom zurück. Deshalb: nach jeder Größenänderung neu malen, und wenn die
  // Ansicht dabei aus dem Bild gefallen ist, neu einpassen.
  const viewLost = (): boolean => {
    if (!draft) return false;
    const [cols, rows] = floor().size;
    const x1 = view.ox + cols * CELL * view.scale;
    const y1 = view.oy + rows * CELL * view.scale;
    return view.scale < 0.02 || x1 < 20 || y1 < 20 || view.ox > canvas.width - 20 || view.oy > canvas.height - 20;
  };
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (panel.classList.contains('hidden') || !draft) return;
      // Nach dem Frame malen, in dem der Renderer das Backing angepasst hat.
      requestAnimationFrame(() => {
        if (viewLost()) fitView();
        paint();
      });
    }).observe(canvas);
  }

  return {
    open(def: RawLevel): void {
      draft = JSON.parse(JSON.stringify(def)) as RawLevel;
      normalizeDraft();
      activeFloor = 0;
      highlight = null;
      hideCheck();
      selected = -1;
      selEdge = null;
      pendingGuard = null;
      pendingWaypoint = null;
      pendingTransporter = null;
      pendingLink = null;
      pendingRetarget = null;
      drawerEl.classList.remove('open');
      closeSheet();
      updateDrawerHandle();
      tool = 'place';
      placeType = 'hole';
      testPlayer = 1;
      toolPlayer = 1;
      setPlaying(false);
      animT = 0;
      nameInput.value = String(draft.name ?? '');
      panel.classList.remove('hidden');
      applyI18n(panel);
      renderPalette();
      renderFloorTabs();
      renderProps();
      // Erst nach dem Layout passt das Canvas-Rect (ResizeObserver des
      // Renderers setzt das Backing) – dann einpassen und zeichnen.
      requestAnimationFrame(() => {
        fitView();
        rebuild();
      });
    },
    reopen(): void {
      if (!draft) return;
      panel.classList.remove('hidden');
      requestAnimationFrame(() => {
        fitView();
        rebuild();
      });
    },
    isOpen(): boolean {
      return !panel.classList.contains('hidden');
    },
  };
}
