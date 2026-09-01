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
import { validateLevel, isShareable, buildFloorCells, type CheckResult } from '../levels/validate';
import { encodeLevel, SHARE_WARN_BYTES } from '../levels/shareCodec';
import { galleryEntries } from '../elements';
import { clearDraft, exportPayload, saveDraft, workshop } from '../workshop';
import { t, applyI18n, type Dict } from '../i18n';

type Dir = 'n' | 'e' | 's' | 'w';
type Edge = [[number, number], Dir];

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
  maze: { seed: number; carve: Edge[]; add: Edge[]; brittle: Edge[]; [k: string]: unknown };
  elements: RawEl[];
  start: [number, number];
  goal: [number, number] | null;
}
const MAX_FLOORS = 4; // Schema-Limit
export interface RawLevel {
  id: string;
  name: string;
  intro?: string;
  parTimeS?: number;
  pingBudget?: number;
  floors: RawFloor[];
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

type Tool = 'select' | 'place' | 'wall' | 'erase' | 'start' | 'goal';

/** Palette: alles außer Druckplatte (MP-only ohne Singleplayer-Semantik). */
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
  'transporter',
] as const;
const EDGE_TYPES = new Set(['door', 'slidingWall']);

export interface EditorApi {
  open(def: RawLevel): void;
  /** Nach dem Preview: Panel wieder zeigen, Entwurf unverändert. */
  reopen(): void;
  isOpen(): boolean;
}

export function setupEditor(opts: {
  onTest: (def: RawLevel) => void;
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
  const galleryDraws = new Map(galleryEntries().map((e) => [e.type, e.draw]));
  // Klang-Signaturen aus derselben Registry: Was die Galerie anspielt, spielt
  // auch das Eigenschaften-Panel – ein Element hat EINEN Klang.
  const galleryDemos = new Map(galleryEntries().map((e) => [e.type, e.demoSound]));
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
  let selected = -1; // Index in floor.elements (der AKTIVEN Ebene)
  let pendingGuard: [number, number] | null = null;
  /** Transporter-Platzierung: Pad gesetzt, Ziel-Tap steht aus (Ebenenwechsel erlaubt). */
  let pendingTransporter: { floor: number; cell: [number, number] } | null = null;
  /** 🔗 Verknüpfen: Öffner (Schlüssel/Zeitschloss) wartet auf den Tür-Tap.
   *  Ebenenwechsel erlaubt – Schlüssel öffnen ebenenübergreifend. */
  let pendingLink: { floor: number; index: number } | null = null;
  /** 🔗 Umverlegen: Transporter wartet auf sein neues Ziel (Ebenenwechsel erlaubt). */
  let pendingRetarget: { floor: number; index: number } | null = null;
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
      f.maze ??= { seed: 1, carve: [], add: [], brittle: [] };
      f.maze.carve ??= [];
      f.maze.add ??= [];
      f.maze.brittle ??= [];
      f.elements ??= [];
    }
  }
  const flash = (text: string, error = false): void => {
    statusEl.textContent = text;
    statusEl.style.color = error ? 'var(--warning)' : '';
  };

  /* --- Rohdaten-Helfer ----------------------------------------------------- */

  const inList = (list: Edge[], e: Edge) => list.some((x) => edgeKey(x) === edgeKey(e));
  const dropFromList = (list: Edge[], e: Edge) => {
    const i = list.findIndex((x) => edgeKey(x) === edgeKey(e));
    if (i !== -1) list.splice(i, 1);
  };

  // Ist die Kante im aktuellen Maze (Seed + Edits) offen?
  const edgeOpen = (e: Edge): boolean => {
    try {
      const def = parseLevel(draft);
      const f = def.floors[activeFloor]!;
      const cells = buildFloorCells(f, { brittleOpen: false, doorsOpen: true });
      const c = cells[e[0][1] * f.size[0] + e[0][0]]!;
      return e[1] === 'e' ? !c.e : !c.s;
    } catch {
      return true; // Def gerade kaputt: nicht zusätzlich blockieren
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
      loaded = loadLevel(parseLevel(draft));
      loadError = null;
      // Status hier NICHT löschen: frische Hinweise aus der laufenden Aktion
      // („Feld belegt", Wächter-/Transporter-Schritt 2) müssen stehen bleiben
      // – aufgeräumt wird zu Beginn der nächsten Aktion (act).
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
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
      const b = document.createElement('span');
      b.className = 'ed-badge' + (c.ok ? '' : ' fail');
      b.textContent = `${c.ok ? '✓' : '✗'} ${t(`ed.check.${c.key}` as keyof Dict)}`;
      if (c.detail) b.title = c.detail;
      badgesEl.append(b);
    }
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
      selected,
      loadError,
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
      renderer.draw(world, { debug: true, now: performance.now() });
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
      if (tg.floor === activeFloor) {
        overlay.lineWidth = 1.5 * dpr;
        overlay.setLineDash([5 * dpr, 5 * dpr]);
        overlay.beginPath();
        overlay.moveTo(tx((el.cell[0] + 0.5) * CELL), ty((el.cell[1] + 0.5) * CELL));
        overlay.lineTo(tx((tg.cell[0] + 0.5) * CELL), ty((tg.cell[1] + 0.5) * CELL));
        overlay.stroke();
        overlay.setLineDash([]);
        if (hot) overlay.strokeRect(tx(tg.cell[0] * CELL), ty(tg.cell[1] * CELL), CELL * s, CELL * s);
      } else {
        overlay.font = `600 ${11 * dpr}px system-ui, sans-serif`;
        overlay.textAlign = 'center';
        overlay.fillText(`→E${tg.floor + 1}`, tx((el.cell[0] + 0.5) * CELL), ty(el.cell[1] * CELL) - 4 * dpr);
      }
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
        for (const p of sel.patrol) overlay.strokeRect(tx(p[0] * CELL), ty(p[1] * CELL), CELL * s, CELL * s);
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
      cycleWall(target.edge);
    } else if (tool === 'erase') {
      eraseAt(target);
    } else if (tool === 'start' || tool === 'goal') {
      if (target.kind !== 'cell') return;
      if (tool === 'start') {
        floor().start = target.cell;
      } else {
        // Ein-Ziel-Invariante über alle Ebenen: das neue Ziel gewinnt.
        for (const f of draft.floors) f.goal = null;
        floor().goal = target.cell;
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
      renderProps();
      if (selected !== -1) openDrawer();
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

  // Frei = keine Element-Zelle (inkl. Wächter-Wegpunkte) und nicht Start/Ziel
  // der aktiven Ebene. Elemente werden NUR in freie Felder gesetzt.
  function cellFree(cell: [number, number]): boolean {
    if (elementAt({ kind: 'cell', cell }) !== -1) return false;
    const f = floor();
    if (f.start[0] === cell[0] && f.start[1] === cell[1]) return false;
    if (f.goal && f.goal[0] === cell[0] && f.goal[1] === cell[1]) return false;
    return true;
  }

  // Kante zyklisch: Seed-Zustand -> offen (carve) -> zu (add) -> brüchig -> Seed.
  function cycleWall(e: Edge): void {
    const m = floor().maze;
    if (inList(m.brittle, e)) {
      dropFromList(m.brittle, e);
      dropFromList(m.add, e);
    } else if (inList(m.add, e)) {
      m.brittle.push(e);
    } else if (inList(m.carve, e)) {
      dropFromList(m.carve, e);
      m.add.push(e);
    } else {
      m.carve.push(e);
    }
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
    } else if (placeType === 'guard') {
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
      els.push({ type: 'guard', patrol: [[ax, ay], [bx, by]], speed: 85 });
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
      if (placeType === 'key' || placeType === 'timedSwitch')
        el.opens = nearestDoorId(activeFloor, target.cell!, placeType === 'key') ?? 'tor1';
      if (placeType === 'hole') el.breathing = { offset: Math.round(Math.random() * 8) / 2 }; // 0,5er-Schritte wie das Eingabefeld
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
      const cells = buildFloorCells(f, { brittleOpen: false, doorsOpen: true });
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
    const tools: Array<[Tool, string, string]> = [
      ['select', '☝', t('ed.tool.select')],
      ['wall', '▤', t('ed.tool.wall')],
      ['erase', '⌫', t('ed.tool.erase')],
      ['start', '●', t('ed.tool.start')],
      ['goal', '◎', t('ed.tool.goal')],
    ];
    for (const [tl, ico, lbl] of tools) {
      const b = document.createElement('button');
      b.id = `edTool-${tl}`;
      b.className = 'panel ed-tile' + (tool === tl ? ' active' : '');
      const i = document.createElement('span');
      i.textContent = ico;
      b.append(i, lblSpan(lbl));
      b.dataset.tip = lbl; // Tooltip-Blase: Hover (Desktop) / Fokus (Touch)
      b.addEventListener('click', () => {
        tool = tl;
        clearPendings();
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

    const elementsWrap = document.createElement('div');
    elementsWrap.id = 'edElements';
    for (const type of PLACEABLE) {
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
      });
      elementsWrap.append(b);
    }

    paletteEl.append(groupLabel(t('ed.tools')), toolsWrap, elBtn, groupLabel(t('ed.elements')), elementsWrap);
  }

  /* --- Eigenschaften ---------------------------------------------------------- */

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

  function renderProps(): void {
    if (!draft) return;
    propsEl.replaceChildren();
    const f = floor();

    updateDrawerHandle(); // Phone-Griff spiegelt die Auswahl (Icon + Name)

    // Ausgewähltes Element: Kopf mit Galerie-Miniatur zur Identifikation
    const el = f.elements[selected];
    if (el) {
      const head = document.createElement('div');
      head.className = 'ed-selhead';
      const label = document.createElement('span');
      label.className = 'ed-group-label';
      label.textContent = `${t('ed.selected')}: ${t(`el.${el.type}.title` as keyof Dict)}`;
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
      if (el.type === 'key' || el.type === 'timedSwitch') {
        // Zeitschlösser nur auf derselben Ebene (Timer-Beweis), Schlüssel überall.
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
        if (removed?.type === 'door') cleanupAfterDoorDelete(String(removed.id));
        renderProps();
        rebuild();
      });
      propsEl.append(del);
    }

    // Level-Metadaten
    const meta = document.createElement('p');
    meta.className = 'ed-group-label';
    meta.textContent = t('ed.level');
    propsEl.append(meta);

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

    const sizeRow = document.createElement('div');
    sizeRow.className = 'ed-row';
    sizeRow.append(
      field(t('ed.cols'), numInput(f.size[0], 3, 20, 1, (v) => resize(v, f.size[1]))),
      field(t('ed.rows'), numInput(f.size[1], 3, 24, 1, (v) => resize(f.size[0], v))),
    );
    propsEl.append(sizeRow);

    const reroll = document.createElement('button');
    reroll.className = 'btn btn-ghost';
    reroll.textContent = `🎲 ${t('ed.reroll')}`;
    reroll.addEventListener('click', () => {
      f.maze.seed = Math.floor(Math.random() * 0x7fffffff);
      rebuild();
    });
    propsEl.append(reroll);
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
    f.start = [Math.min(f.start[0], cols - 1), Math.min(f.start[1], rows - 1)];
    if (f.goal) f.goal = [Math.min(f.goal[0], cols - 1), Math.min(f.goal[1], rows - 1)];
    selected = -1;
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
    pendingGuard = null;
    renderFloorTabs();
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
          maze: { seed: Math.floor(Math.random() * 0x7fffffff), carve: [], add: [], brittle: [] },
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
        const hadGoal = draft!.floors[removed]!.goal !== null;
        draft!.floors.splice(removed, 1);
        // Transporter aufräumen: Ziele auf die Ebene fallen weg, höhere rutschen nach.
        for (const f of draft!.floors) {
          f.elements = f.elements.filter((el) => {
            const target = (el as { target?: { floor: number } }).target;
            return !(el.type === 'transporter' && target?.floor === removed);
          });
          for (const el of f.elements) {
            const target = (el as { target?: { floor: number } }).target;
            if (el.type === 'transporter' && target && target.floor > removed) target.floor--;
          }
        }
        // Ein-Ziel-Invariante retten: das Ziel wandert notfalls auf Ebene 1.
        if (hadGoal) {
          const f0 = draft!.floors[0]!;
          f0.goal = [f0.size[0] - 1, f0.size[1] - 1];
        }
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

  $('edShare').addEventListener('click', () => {
    if (!draft) return;
    if (loadError || !isShareable(checks)) return flash(t('ed.shareBlocked'), true);
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
  });

  $('edExport').addEventListener('click', () => {
    if (!draft) return;
    draft.name = nameInput.value.trim() || t('ed.untitled');
    const blob = new Blob([exportPayload(draft as unknown as Record<string, unknown>)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tiltr-level-${draft.name.replace(/[^\wäöüÄÖÜß-]+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
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
    const ok = workshop.save(draft as unknown as Record<string, unknown>);
    // Gesichert ist gesichert: der Reload-Draft ist dann Bibliotheks-Sache.
    if (ok) clearDraft();
    flash(ok ? t('ed.saved') : t('ed.saveFailed'), false);
    opts.onSaved();
  });

  $('edTest').addEventListener('click', () => {
    if (!draft || loadError) return;
    setPlaying(false); // der Testlauf hat seine eigene Zeit
    draft.name = nameInput.value.trim() || t('ed.untitled');
    opts.onTest(JSON.parse(JSON.stringify(draft)) as RawLevel);
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
      selected = -1;
      pendingGuard = null;
      pendingTransporter = null;
      pendingLink = null;
      pendingRetarget = null;
      drawerEl.classList.remove('open');
      closeSheet();
      updateDrawerHandle();
      tool = 'place';
      placeType = 'hole';
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
