// Level-Loader: baut aus einer validierten LevelDef deterministisch die
// Welt(en) – eine World pro Ebene, alle teilen sich denselben Ball.
// Kennt Elemente nur über die Registry.

import { CELL, WALL_T, BALL_R } from '../core/constants';
import { generateMaze, mazeToWalls, mirrorCells, setWall, type Cell } from '../core/maze';
import { Ball, World } from '../core/physics';
import { mulberry32 } from '../core/rng';
import type { Wall } from '../core/types';
import { buildElements } from '../elements';
import { cellCenter } from '../elements/registry';
import { parseLevel, type LevelDef } from './schema';

export interface LoadedFloor {
  world: World;
  cols: number;
  rows: number;
  /** Helle Ebene: alles sichtbar (Renderer revealAll) */
  bright: boolean;
  /** Dämmerung: hell bis zur ersten Wandberührung, dann ausblenden (app.ts) */
  dusk: boolean;
}

/** Für wen wird geladen (M57)? Spieler 2 (Gast) startet an `start2` und hat
 *  `goal2` als Zielzone, wo das Level sie definiert – sonst dieselben wie
 *  Spieler 1. Default 1: jeder bestehende Aufruf bleibt unverändert. */
export interface LoadOptions {
  player?: 1 | 2;
  /** Editor: auch die Transporter des ANDEREN Spielers bauen (Vorschau zeigt
   *  alles, was in der Def steht). Im Spiel bleiben sie weg. */
  allTransporters?: boolean;
}

/** Gehört dieses Element in die Welt von Spieler `player`? Transporter mit
 *  `player` gibt es nur für ihn (M65); alles andere für beide. */
export function elementForPlayer(el: { type: string; player?: 1 | 2 }, player: 1 | 2): boolean {
  return el.type !== 'transporter' || el.player === undefined || el.player === player;
}

export interface LoadedLevel {
  def: LevelDef;
  floors: LoadedFloor[];
  /** Für welchen Spieler die Welt gebaut wurde (Start, Zielzone). */
  player: 1 | 2;
  /** Ebene, auf der das Ziel liegt */
  goalFloor: number;
  /** Zielposition in Weltkoordinaten (für den gedämpften Beacon auf anderen Ebenen) */
  goalPos: { x: number; y: number };
  pingBudget: number;
  /** Bequemlichkeit: Start-Ebene (Floor 0) */
  world: World;
  cols: number;
  rows: number;
}

/** Zellen einer Ebene: Seed-Maze, gespiegeltes Rauschen, dann die
 *  Hand-Edits – dieselbe Reihenfolge wie in validate.buildFloorCells. */
function floorCells(floor: LevelDef['floors'][number], mirror: LevelDef['mirror']): Cell[] {
  const [cols, rows] = floor.size;
  let cells = generateMaze(cols, rows, mulberry32(floor.maze.seed));
  if (mirror) cells = mirrorCells(cells, cols, rows, mirror);
  for (const [[x, y], dir] of floor.maze.carve) setWall(cells, cols, rows, x, y, dir, false);
  for (const [[x, y], dir] of floor.maze.add) setWall(cells, cols, rows, x, y, dir, true);
  return cells;
}

/** Brüchigkeits-Wurf einer Wand – deterministisch aus Seed UND Position
 *  (Spatial Hash). Damit ist „diese Wand ist brüchig" eine Eigenschaft der
 *  Wand und überlebt jede Änderung an anderen Wänden. */
function brittleRoll(seed: number, x: number, y: number, vertical: boolean): number {
  const h = (seed ^ (Math.round(x) * 73856093) ^ (Math.round(y) * 19349663) ^ (vertical ? 83492791 : 0)) >>> 0;
  return mulberry32(h)();
}

/** Die Kanten, die brittleChance in dieser Ebene brüchig macht – damit die
 *  Werkstatt sie beim Übernehmen eines Zufallslevels EXPLIZIT einbacken
 *  kann (dann ist das Level im Editor vollständig kontrollierbar und ein
 *  geteilter Link hängt nicht an der Generator-Version). */
export function generatedBrittleEdges(
  floor: LevelDef['floors'][number],
  mirror: LevelDef['mirror'],
): Array<[[number, number], 'e' | 's']> {
  if (floor.maze.brittleChance <= 0) return [];
  const [cols, rows] = floor.size;
  const cells = floorCells(floor, mirror);
  const ht = WALL_T / 2;
  // Dieselbe „interior"-Bedingung wie in loadLevel: eine Wand, die den
  // Außenrand BERÜHRT, wird nie brüchig (auch nicht mit einem Ende).
  const interior = (wx: number, wy: number, w: number, h: number) =>
    wx > 0 && wy > 0 && wx + w < cols * CELL && wy + h < rows * CELL;
  const out: Array<[[number, number], 'e' | 's']> = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = cells[y * cols + x]!;
      if (c.e) {
        const wx = (x + 1) * CELL - ht;
        const wy = y * CELL - ht;
        if (
          interior(wx, wy, WALL_T, CELL + WALL_T) &&
          brittleRoll(floor.maze.seed, wx, wy, true) < floor.maze.brittleChance
        )
          out.push([[x, y], 'e']);
      }
      if (c.s) {
        const wx = x * CELL - ht;
        const wy = (y + 1) * CELL - ht;
        if (
          interior(wx, wy, CELL + WALL_T, WALL_T) &&
          brittleRoll(floor.maze.seed, wx, wy, false) < floor.maze.brittleChance
        )
          out.push([[x, y], 's']);
      }
    }
  }
  return out;
}

/** Start-Zelle eines Spielers (Ebene 1). */
export function startCellFor(def: LevelDef, player: 1 | 2): readonly [number, number] {
  const f0 = def.floors[0]!;
  return player === 2 && f0.start2 ? f0.start2 : f0.start;
}

/** Ziel eines Spielers: Ebene + Zelle. Spieler 2 bekommt `goal2`, wenn das
 *  Level eines hat – sonst das gemeinsame Ziel. */
export function goalCellFor(def: LevelDef, player: 1 | 2): { floor: number; cell: readonly [number, number] } | null {
  if (player === 2) {
    const fl = def.floors.findIndex((f) => f.goal2);
    if (fl >= 0) return { floor: fl, cell: def.floors[fl]!.goal2! };
  }
  const fl = def.floors.findIndex((f) => f.goal);
  return fl >= 0 ? { floor: fl, cell: def.floors[fl]!.goal! } : null;
}

export function loadLevel(defOrData: LevelDef | unknown, opts: LoadOptions = {}): LoadedLevel {
  const def = parseLevel(defOrData);
  const player = opts.player ?? 1;
  const ball = new Ball(0, 0, BALL_R); // Position setzt die Start-Ebene unten
  const floors: LoadedFloor[] = [];
  let goalFloor = -1;
  let goalPos = { x: 0, y: 0 };
  // Ziel DIESES Spielers: Spieler 2 bekommt goal2, wo es eines gibt.
  const myGoal = goalCellFor(def, player);
  let goal2Floor = -1;

  def.floors.forEach((floor, floorIndex) => {
    const [cols, rows] = floor.size;
    const cells = floorCells(floor, def.mirror);
    const walls = mazeToWalls(cells, cols, rows, CELL, WALL_T);

    // Gezielt markierte Wandkanten (brüchig, Schallschutz) – die Wand muss
    // existieren; EIN Sucher für beide Listen.
    const ht = WALL_T / 2;
    const edgeWall = (list: typeof floor.maze.brittle, what: string, mark: (w: Wall) => void): void => {
      for (const [[x, y], dir] of list) {
        const border =
          (dir === 'w' && x === 0) ||
          (dir === 'e' && x === cols - 1) ||
          (dir === 'n' && y === 0) ||
          (dir === 's' && y === rows - 1);
        if (border) throw new Error(`Level ${def.id}: Außenwand (${x},${y},${dir}) darf nicht ${what} sein`);
        const ex = dir === 'e' ? (x + 1) * CELL - ht : x * CELL - ht;
        const ey = dir === 's' ? (y + 1) * CELL - ht : y * CELL - ht;
        const vertical = dir === 'e' || dir === 'w';
        const wall = walls.find(
          (w) => Math.abs(w.x - ex) < 0.5 && Math.abs(w.y - ey) < 0.5 && (w.w === WALL_T) === vertical,
        );
        if (!wall) throw new Error(`Level ${def.id}: ${what}e Wandkante (${x},${y},${dir}) existiert nicht`);
        mark(wall);
      }
    };
    edgeWall(floor.maze.brittle, 'brüchig', (w) => (w.hp = floor.maze.brittleHits));
    edgeWall(floor.maze.absorb, 'schallschützend', (w) => (w.absorb = true));
    edgeWall(floor.maze.mirrors, 'spiegelnd', (w) => (w.mirror = true));

    // Innenwände zufällig als brüchig markieren (Außenrand nie). Der Wurf
    // hängt an der WANDPOSITION, nicht an der Listenreihenfolge: Sonst
    // verschiebt schon eine einzige aufgeschnittene Wand die Zuordnung, und
    // plötzlich sind ganz andere Wände brüchig (im Editor gut zu sehen).
    if (floor.maze.brittleChance > 0) {
      for (const w of walls) {
        const interior = w.x > 0 && w.y > 0 && w.x + w.w < cols * CELL && w.y + w.h < rows * CELL;
        if (interior && w.hp === undefined && brittleRoll(floor.maze.seed, w.x, w.y, w.w === WALL_T) < floor.maze.brittleChance)
          w.hp = floor.maze.brittleHits;
      }
    }

    const inBounds = (c: readonly [number, number]) => c[0] < cols && c[1] < rows;
    if (!inBounds(floor.start)) throw new Error(`Level ${def.id}: start außerhalb des Felds (Ebene ${floorIndex})`);
    if (floor.start2 && !inBounds(floor.start2))
      throw new Error(`Level ${def.id}: start2 außerhalb des Felds (Ebene ${floorIndex})`);
    let goal = null;
    if (floor.goal) {
      if (!inBounds(floor.goal)) throw new Error(`Level ${def.id}: goal außerhalb des Felds (Ebene ${floorIndex})`);
      if (goalFloor !== -1) throw new Error(`Level ${def.id}: mehr als ein Ziel definiert`);
      goalFloor = floorIndex;
    }
    if (floor.goal2) {
      if (!inBounds(floor.goal2)) throw new Error(`Level ${def.id}: goal2 außerhalb des Felds (Ebene ${floorIndex})`);
      if (goal2Floor !== -1) throw new Error(`Level ${def.id}: mehr als ein zweites Ziel definiert`);
      goal2Floor = floorIndex;
    }
    // Die Zielzone der Welt ist das Ziel DIESES Spielers – das andere Ziel
    // existiert für ihn nicht (weder Beacon noch Zielzone).
    if (myGoal && myGoal.floor === floorIndex) {
      goalPos = cellCenter(myGoal.cell, CELL);
      goal = { x: goalPos.x, y: goalPos.y, r: BALL_R * 1.4 };
    }

    const world = new World(walls, ball, goal);
    const elements = opts.allTransporters ? floor.elements : floor.elements.filter((el) => elementForPlayer(el, player));
    buildElements(elements, { world, cell: CELL, cols, rows, floorIndex });
    floors.push({ world, cols, rows, bright: floor.bright, dusk: floor.dusk });
  });

  if (goalFloor === -1) throw new Error(`Level ${def.id}: kein Ziel definiert`);
  // Ab hier ist goalFloor die Ebene des Ziels DIESES Spielers.
  if (myGoal) goalFloor = myGoal.floor;

  // Ball auf die Start-Ebene setzen (Spieler 2: start2, wenn vorhanden).
  const start = cellCenter(startCellFor(def, player), CELL);
  ball.x = start.x;
  ball.y = start.y;

  // Transporter-Ziele prüfen (Ebene existiert, Zelle im Feld der Ziel-Ebene).
  floors.forEach(({ world }, floorIndex) => {
    for (const t of world.transporters) {
      const target = floors[t.targetFloor];
      if (!target) throw new Error(`Level ${def.id}: Transporter (Ebene ${floorIndex}) zielt auf Ebene ${t.targetFloor}, die es nicht gibt`);
      if (t.tx > target.cols * CELL || t.ty > target.rows * CELL)
        throw new Error(`Level ${def.id}: Transporter-Ziel außerhalb von Ebene ${t.targetFloor}`);
    }
  });

  // Hängende Verknüpfungen (Schlüssel/Zeitschloss ohne Tür, Tür ohne Öffner)
  // sind hier BEWUSST erlaubt: Eine Tür ohne Öffner ist nur eine verschlossene
  // Wand, ein Schlüssel ohne Tür sammelt sich harmlos – beides ist lauffähig
  // und im Editor ein normaler Zwischenzustand. Die Strenge wohnt im
  // 'links'-Beweis von validate.ts (Pflicht-Badge, blockiert Teilen).

  const first = floors[0]!;
  return {
    def,
    floors,
    player,
    goalFloor,
    goalPos,
    pingBudget: def.pingBudget,
    world: first.world,
    cols: first.cols,
    rows: first.rows,
  };
}
