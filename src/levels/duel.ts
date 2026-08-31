// Geist-Duell (M17): Ein gewonnener Lauf wird zur Herausforderung –
// das Token trägt Level + Geist + Zeit, der Empfänger rennt gegen die
// echte Spur (und hört sie). Serverlos wie die Level-Links.
//
// Kompaktheit: Die localStorage-Aufzeichnung (ghost.ts) speichert
// [t, Ebene, x, y] mit MINDEST-Abstand – für eine URL zu fett. Hier wird
// auf das EXAKTE 8-Hz-Raster resampelt (dann ist der Index die Zeit, die
// Zeitspalte entfällt), x/y als Deltas geschrieben (der Ball bewegt sich
// höchstens ~112 px pro Sample) und die Ebene nur bei Wechsel notiert.
// Den Rest macht derselbe deflate-Pfad wie bei Level-Tokens: Deltas
// komprimieren ausgezeichnet. Bewusst KEIN Binärformat – JSON-Deltas
// liegen nach deflate nah dran und bleiben lesbar und testbar.

import { BALL_R, CELL } from '../core/constants';
import { GHOST_INTERVAL_S, sampleGhost, type GhostData } from '../ghost';
import { decodePayload, encodePayload, SHARE_WARN_BYTES } from './shareCodec';
import type { LevelDef } from './schema';

/** World.maxSpeed – hier bewusst als Konstante (wie in validate.ts): der
 *  Beweis darf keine World-Instanz brauchen. */
const MAX_SPEED = 900;
const PAYLOAD_V = 1;

/** Gepackte Spur: Startpunkt, Delta-Strom, Ebenenwechsel. */
export interface PackedGhost {
  /** [Ebene, x, y] des ersten Samples */
  s: [number, number, number];
  /** flach [dx, dy, …] ab dem zweiten Sample */
  d: number[];
  /** [SampleIndex, Ebene, …] – nur die Wechsel */
  f: number[];
}

export interface DuelPayload {
  /** rohe Level-Def – selbstenthaltend, nie eine Kampagnen-Referenz */
  def: Record<string, unknown>;
  /** Zielzeit in Sekunden */
  time: number;
  /** null = Zeit-only-Duell (Spur war zu groß fürs Token) */
  ghost: GhostData | null;
  /** optionaler Absendername */
  by?: string;
}

/** Spur auf das exakte Raster resampeln und delta-kodieren. */
export function packGhost(ghost: GhostData, time: number): PackedGhost {
  const n = Math.max(2, Math.ceil(time / GHOST_INTERVAL_S) + 1);
  const pts: Array<{ floor: number; x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(i * GHOST_INTERVAL_S, time);
    const p = sampleGhost(ghost, t);
    if (!p) break;
    pts.push({ floor: p.floor, x: Math.round(p.x), y: Math.round(p.y) });
  }
  const first = pts[0]!;
  const packed: PackedGhost = { s: [first.floor, first.x, first.y], d: [], f: [] };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    packed.d.push(b.x - a.x, b.y - a.y);
    if (b.floor !== a.floor) packed.f.push(i, b.floor);
  }
  return packed;
}

/** Delta-Strom zurück in eine GhostData (direkt für sampleGhost nutzbar). */
export function unpackGhost(packed: PackedGhost, time: number): GhostData {
  const [floor0, x0, y0] = packed.s;
  const changes = new Map<number, number>();
  for (let i = 0; i + 1 < packed.f.length; i += 2) changes.set(packed.f[i]!, packed.f[i + 1]!);
  const frames: number[] = [];
  let floor = floor0;
  let x = x0;
  let y = y0;
  const n = packed.d.length / 2 + 1;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      x += packed.d[(i - 1) * 2]!;
      y += packed.d[(i - 1) * 2 + 1]!;
      const nf = changes.get(i);
      if (nf !== undefined) floor = nf;
    }
    frames.push(Math.min(i * GHOST_INTERVAL_S, time), floor, x, y);
  }
  return { time, frames };
}

/**
 * Plausibilitäts-Beweis einer empfangenen Spur. Ohne Server ist keine Zeit
 * beweisbar – aber eine Spur muss zu ihrer Zeit und zum Level passen.
 * Rückgabe: null = in Ordnung, sonst der Grund (technisch, fürs Log).
 *
 * BEWUSST NICHT geprüft: ob die Spur durch Wände läuft. Bei 8 Hz überspringt
 * ein schneller Ball ganze Zellgrenzen (900 px/s ⇒ 112 px pro Sample), ein
 * lokaler Kanten-Test würde also legitime Läufe verwerfen. Der Filter zielt
 * auf kaputte und alberne Tokens, nicht auf Anti-Cheat – das ist serverlos
 * ohnehin unmöglich.
 */
export function validateGhostRun(def: LevelDef, ghost: GhostData, time: number): string | null {
  const f = ghost.frames;
  if (!Array.isArray(f) || f.length % 4 !== 0 || f.length < 8) return 'Spur zu kurz';
  const n = f.length / 4;
  const at = (i: number) => ({ t: f[i * 4]!, floor: f[i * 4 + 1]!, x: f[i * 4 + 2]!, y: f[i * 4 + 3]! });
  if (!(time > 0) || !Number.isFinite(time)) return 'Zeit unplausibel';

  // Dauer passt zur behaupteten Zeit (± ein Rasterschritt Toleranz).
  const last = at(n - 1);
  if (Math.abs(last.t - time) > GHOST_INTERVAL_S * 2) return `Dauer ${last.t} != Zeit ${time}`;

  // Zeiten monoton steigend.
  for (let i = 1; i < n; i++) if (at(i).t < at(i - 1).t) return `Zeit springt zurück bei ${i}`;

  // Start: erstes Sample steht auf dem Startfeld von Ebene 1.
  const start = def.floors[0]!.start;
  const first = at(0);
  if (first.floor !== 0) return 'Start nicht auf Ebene 1';
  if (Math.hypot(first.x - (start[0] + 0.5) * CELL, first.y - (start[1] + 0.5) * CELL) > CELL)
    return 'Startpunkt passt nicht';

  // Ziel: letztes Sample steht im Ziel (Toleranz: Zielradius + ein
  // Rasterschritt bei Höchstgeschwindigkeit).
  const goalFloor = def.floors.findIndex((fl) => fl.goal);
  const goal = def.floors[goalFloor]!.goal!;
  if (last.floor !== goalFloor) return 'Ende nicht auf der Ziel-Ebene';
  const goalTol = BALL_R * 1.4 + MAX_SPEED * GHOST_INTERVAL_S;
  if (Math.hypot(last.x - (goal[0] + 0.5) * CELL, last.y - (goal[1] + 0.5) * CELL) > goalTol)
    return 'Endpunkt liegt nicht im Ziel';

  // Kein Teleport: pro Rasterschritt höchstens Höchstgeschwindigkeit
  // (25 % Toleranz für Rundung/Interpolation). Ebenenwechsel sind Sprünge
  // und nur an Transportern erlaubt.
  const transporters = def.floors.map((fl) =>
    fl.elements.filter((el) => el.type === 'transporter').map((el) => el as { cell: readonly [number, number]; target: { floor: number; cell: readonly [number, number] } }),
  );
  const cellOf = (x: number, y: number): [number, number] => [Math.floor(x / CELL), Math.floor(y / CELL)];
  for (let i = 1; i < n; i++) {
    const a = at(i - 1);
    const b = at(i);
    const dt = Math.max(b.t - a.t, GHOST_INTERVAL_S);
    if (a.floor === b.floor) {
      if (Math.hypot(b.x - a.x, b.y - a.y) > MAX_SPEED * dt * 1.25) return `Teleport bei Sample ${i}`;
      continue;
    }
    const from = cellOf(a.x, a.y);
    const to = cellOf(b.x, b.y);
    const ok = transporters[a.floor]!.some(
      (tr) =>
        tr.cell[0] === from[0] &&
        tr.cell[1] === from[1] &&
        tr.target.floor === b.floor &&
        tr.target.cell[0] === to[0] &&
        tr.target.cell[1] === to[1],
    );
    if (!ok) return `Ebenenwechsel ohne Transporter bei Sample ${i}`;
  }
  return null;
}

/**
 * Duell-Token bauen. Reißt es mit Spur die Warnschwelle (sehr langer Lauf),
 * fällt es automatisch auf ein Zeit-only-Duell zurück: dann eben ohne
 * hörbaren Rivalen, aber mit Zielzeit – ein Link, den man teilen kann,
 * ist mehr wert als ein perfekter, der zu lang ist.
 */
export async function encodeDuel(
  def: Record<string, unknown>,
  time: number,
  ghost: GhostData | null,
  by?: string,
): Promise<string> {
  const base: Record<string, unknown> = { v: PAYLOAD_V, def, t: Math.round(time * 1000) / 1000 };
  if (by) base.by = by;
  if (ghost) {
    const withGhost = await encodePayload({ ...base, g: packGhost(ghost, time) });
    if (withGhost.length <= SHARE_WARN_BYTES) return withGhost;
  }
  return encodePayload(base);
}

/** Duell-Token lesen; wirft bei kaputten/fremden Tokens. */
export async function decodeDuel(token: string): Promise<DuelPayload> {
  const raw = await decodePayload(token);
  if (raw.v !== PAYLOAD_V) throw new Error(`Unbekannte Duell-Version "${String(raw.v)}"`);
  const def = raw.def;
  const time = raw.t;
  if (typeof def !== 'object' || def === null || Array.isArray(def)) throw new Error('Kein Level im Duell');
  if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) throw new Error('Keine Zeit im Duell');
  const g = raw.g as PackedGhost | undefined;
  const ghost =
    g && Array.isArray(g.d) && Array.isArray(g.s) && Array.isArray(g.f) ? unpackGhost(g, time) : null;
  return {
    def: def as Record<string, unknown>,
    time,
    ghost,
    by: typeof raw.by === 'string' ? raw.by : undefined,
  };
}

/** Kompletter Duell-Link auf die aktuelle Seite. */
export async function duelUrl(
  def: Record<string, unknown>,
  time: number,
  ghost: GhostData | null,
  by?: string,
): Promise<string> {
  const token = await encodeDuel(def, time, ghost, by);
  return `${location.origin}${location.pathname}#duel=${token}`;
}
