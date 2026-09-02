// Levelformat: die zentrale Schnittstelle zwischen Editor/Generator und Engine.
// zod validiert beim Laden – Fehler knallen sofort, nicht erst im Spiel.

import { z } from 'zod';
import { compileTune } from '../audio/chiptune';

export const cellCoord = z.tuple([z.number().int().min(0), z.number().int().min(0)]);
export const wallDir = z.enum(['n', 'e', 's', 'w']);
/** Eine Wandkante: Zelle + Richtung. */
export const wallEdge = z.tuple([cellCoord, wallDir]);

export const breathingSchema = z.object({
  /** Sekunden offen */
  open: z.number().positive().default(2.6),
  /** Sekunden geschlossen */
  closed: z.number().positive().default(2.2),
  /** Öffnen/Schließen-Rampe in Sekunden */
  ramp: z.number().positive().default(0.6),
  /** Phasenversatz in Sekunden */
  offset: z.number().min(0).default(0),
});

const base = { cell: cellCoord };

export const holeDef = z.object({
  ...base,
  type: z.literal('hole'),
  /** Radius in Welteinheiten (Zelle = 100) */
  r: z.number().positive().default(20.9),
  /** fehlt = dauerhaft offen */
  breathing: breathingSchema.optional(),
  /** Versatz vom Zellzentrum */
  jitter: z.tuple([z.number(), z.number()]).default([0, 0]),
});

export const windZoneDef = z.object({
  ...base,
  type: z.literal('windZone'),
  dir: wallDir,
  /** Beschleunigung in px/s² */
  force: z.number().positive().default(1150),
});

export const checkpointDef = z.object({
  ...base,
  type: z.literal('checkpoint'),
  r: z.number().positive().default(30),
});

export const guardDef = z.object({
  type: z.literal('guard'),
  /** Wegpunkte (Zellen), werden im Ping-Pong abgelaufen */
  patrol: z.array(cellCoord).min(2),
  /** px/s */
  speed: z.number().positive().default(90),
  r: z.number().positive().default(26),
});

export const keyDef = z.object({
  ...base,
  type: z.literal('key'),
  /** Tür-ID, die dieser Schlüssel öffnet */
  opens: z.string().min(1),
  r: z.number().positive().default(18),
});

export const doorDef = z.object({
  type: z.literal('door'),
  id: z.string().min(1),
  /** Wandkante, auf der die Tür sitzt – muss im Maze OFFEN sein */
  edge: wallEdge,
  /** Mehrere Öffner (Schlüssel, Zeitschloss, Platte): 'any' = einer genügt,
   *  'all' = alle müssen gleichzeitig erfüllt sein (core/doors.ts). */
  require: z.enum(['any', 'all']).default('any'),
});

export const gemDef = z.object({
  ...base,
  type: z.literal('gem'),
  r: z.number().positive().default(14),
});

export const plateDef = z.object({
  ...base,
  type: z.literal('plate'),
  /** Tür-ID, die diese Platte öffnet, SOLANGE sie gehalten wird (Coop) */
  opens: z.string().min(1),
  r: z.number().positive().default(30),
});

export const transporterDef = z.object({
  ...base,
  type: z.literal('transporter'),
  /** Ziel: Ebenen-Index + Zelle. Gleiche Ebene = Portal. */
  target: z.object({ floor: z.number().int().min(0), cell: cellCoord }),
  r: z.number().positive().default(32),
});

export const slidingWallDef = z.object({
  type: z.literal('slidingWall'),
  /** Wandkante, auf der die Schiebewand sitzt – muss im Maze OFFEN sein */
  edge: wallEdge,
  /** Zyklus wie atmende Löcher: open = Sekunden PASSIERBAR */
  cycle: breathingSchema.default({ open: 2.6, closed: 2.2, ramp: 0.6, offset: 0 }),
});

export const timedSwitchDef = z.object({
  ...base,
  type: z.literal('timedSwitch'),
  /** Tür-ID, die der Schalter für durationS Sekunden öffnet */
  opens: z.string().min(1),
  durationS: z.number().positive().default(6),
  r: z.number().positive().default(30),
});

export const currentDef = z.object({
  ...base,
  type: z.literal('current'),
  /** Fließrichtung – die Kante dorthin muss OFFEN sein (sonst Dauer-Pin) */
  dir: wallDir,
  /** px/s² – MUSS über der Neigungs-Beschleunigung (2600) liegen: Einbahnstraße */
  force: z.number().min(3000).default(3400),
});

export const listenerDef = z.object({
  ...base,
  type: z.literal('listener'),
  /** Jagdgeschwindigkeit in px/s (nur während sich der Ball bewegt) */
  speed: z.number().positive().default(95),
  r: z.number().positive().default(26),
});

export const fogZoneDef = z.object({
  ...base,
  type: z.literal('fogZone'),
});

export const iceDef = z.object({
  ...base,
  type: z.literal('ice'),
});

export const echoCrystalDef = z.object({
  ...base,
  type: z.literal('echoCrystal'),
  r: z.number().positive().default(16),
});

export const anchorDef = z.object({
  ...base,
  type: z.literal('anchor'),
  /** Wirkradius in Welteinheiten */
  r: z.number().positive().default(120),
  /** Maximaler Sog im Zentrum (px/s²) – MUSS unter der Neigungs-
   *  Beschleunigung (2600) bleiben: ein Anker ist zäh, nie eine Falle. */
  force: z.number().positive().max(2400).default(2000),
});

export const glassDef = z.object({
  ...base,
  type: z.literal('glass'),
});

/* --- Jukebox (M27) ---------------------------------------------------------
   Ein Playlist-Eintrag hat ZWEI Formen: eine Titel-ID aus src/music/ oder
   ein im Level EINGEBETTETER Titel. Das ist keine Bequemlichkeit, sondern die
   Rechte-Politik in Schema-Form: Ausgeliefert und vorgecacht wird nur der
   sichere Satz im Ordner; wer sein eigenes Thema will, trägt es in SEIN Level
   ein – es reist dann im #level=-Token und landet nie in diesem Repo.
   Die Obergrenzen (Zeichen, Stimmen, Titel) halten ein geteiltes Token klein. */

export const musicVoice = z.enum(['square', 'triangle', 'noise']);

export const trackSchema = z.object({
  voice: musicVoice,
  gain: z.number().min(0).max(1).optional(),
  /** Notenzeile – Format siehe src/audio/chiptune.ts */
  notes: z.string().min(1).max(1200),
  /** Zeile so oft hintereinander (Schlagwerk schreibt EINEN Takt) */
  repeat: z.number().int().min(1).max(64).optional(),
});

export const tuneSchema = z
  .object({
    id: z.string().min(1).max(32),
    title: z.string().min(1).max(48),
    bpm: z.number().min(40).max(240),
    loop: z.boolean().optional(),
    tracks: z.array(trackSchema).min(1).max(4),
  })
  // Ein eingebetteter Titel muss auch NOTIERBAR sein: Der Parser ist die
  // Wahrheit, nicht die Zeichenlänge. Ein Tippfehler im Ton soll beim Laden
  // knallen, nicht als Stille im Level auffallen.
  .refine(
    (t) => {
      try {
        return compileTune(t).notes.length > 0;
      } catch {
        return false;
      }
    },
    { message: 'Eingebetteter Titel: Notenzeile unlesbar oder leer' },
  );

/** Registry-ID (aus src/music/) ODER eingebetteter Titel. */
export const playlistEntry = z.union([z.string().min(1).max(32), tuneSchema]);

export const jukeboxDef = z.object({
  ...base,
  type: z.literal('jukebox'),
  /** Reihenfolge = Abspielfolge; Anrempeln schaltet einen weiter */
  playlist: z.array(playlistEntry).min(1).max(8),
  /** Lautstärke des Automaten (0 = stumm, aber sichtbar) */
  volume: z.number().min(0).max(1).default(1),
  /** Titel, mit dem er beim Levelstart läuft */
  startIndex: z.number().int().min(0).default(0),
});

export const elementDef = z.discriminatedUnion('type', [
  holeDef,
  windZoneDef,
  checkpointDef,
  guardDef,
  keyDef,
  doorDef,
  gemDef,
  transporterDef,
  plateDef,
  slidingWallDef,
  timedSwitchDef,
  currentDef,
  listenerDef,
  fogZoneDef,
  iceDef,
  echoCrystalDef,
  anchorDef,
  glassDef,
  jukeboxDef,
]);
export type ElementDef = z.infer<typeof elementDef>;
export type HoleDef = z.infer<typeof holeDef>;
export type WindZoneDef = z.infer<typeof windZoneDef>;
export type CheckpointDef = z.infer<typeof checkpointDef>;
export type GuardDef = z.infer<typeof guardDef>;
export type KeyDef = z.infer<typeof keyDef>;
export type DoorDef = z.infer<typeof doorDef>;
export type GemDef = z.infer<typeof gemDef>;
export type TransporterDef = z.infer<typeof transporterDef>;
export type PlateDef = z.infer<typeof plateDef>;
export type SlidingWallDef = z.infer<typeof slidingWallDef>;
export type TimedSwitchDef = z.infer<typeof timedSwitchDef>;
export type CurrentDef = z.infer<typeof currentDef>;
export type ListenerDef = z.infer<typeof listenerDef>;
export type FogZoneDef = z.infer<typeof fogZoneDef>;
export type IceDef = z.infer<typeof iceDef>;
export type EchoCrystalDef = z.infer<typeof echoCrystalDef>;
export type AnchorDef = z.infer<typeof anchorDef>;
export type GlassDef = z.infer<typeof glassDef>;
export type JukeboxDef = z.infer<typeof jukeboxDef>;
export type TuneDef = z.infer<typeof tuneSchema>;
export type PlaylistEntry = z.infer<typeof playlistEntry>;

export const floorSchema = z.object({
  /** [Spalten, Zeilen] */
  size: z.tuple([z.number().int().min(2).max(64), z.number().int().min(2).max(64)]),
  maze: z.object({
    seed: z.number().int().nonnegative(),
    /** Wände nachträglich öffnen (Durchgänge schaffen) */
    carve: z.array(wallEdge).default([]),
    /** Wände nachträglich schließen */
    add: z.array(wallEdge).default([]),
    /** Gezielt brüchige Wandkanten (müssen existieren) */
    brittle: z.array(wallEdge).default([]),
    /** Schallschutzwände: Wandkanten, die den Ping verschlucken und Klang
     *  dahinter abschirmen. Wie `brittle` muss die Wand existieren. */
    absorb: z.array(wallEdge).default([]),
    /** Anteil zufällig brüchiger Innenwände (0 = keine) */
    brittleChance: z.number().min(0).max(1).default(0),
    /** Treffer bis zum Einsturz */
    brittleHits: z.number().int().min(1).default(3),
  }),
  elements: z.array(elementDef).default([]),
  start: cellCoord,
  /** null = Ziel liegt auf einer anderen Ebene (ab M5) */
  goal: cellCoord.nullable(),
  /** Helle Ebene: Labyrinth und Elemente sind sichtbar wie in der
   *  Debug-Ansicht (Renderer revealAll) – Default ist die dunkle Welt. */
  bright: z.boolean().default(false),
});
export type FloorDef = z.infer<typeof floorSchema>;

export const levelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Kurzer Text vor Levelstart (Tutorial, Kampagne) */
  intro: z.string().optional(),
  parTimeS: z.number().positive().optional(),
  /** Echo-Pings zu Rundenbeginn */
  pingBudget: z.number().int().min(0).default(3),
  /** Ebene 0 ist die Start-Ebene; höherer Index = tiefer. */
  floors: z.array(floorSchema).min(1).max(4),
  /**
   * Gesetzt von mirrorLevel (src/levels/mirror.ts): Alle Def-Koordinaten
   * sind bereits gespiegelt; Loader/Test-Helfer spiegeln zusätzlich das
   * generierte Maze-Rauschen (mirrorCells) – zusammen ein exaktes
   * Spiegelbild des Original-Designs. NICHT von Hand setzen.
   */
  mirror: z.enum(['x', 'y', 'xy']).optional(),
});
export type LevelDef = z.infer<typeof levelSchema>;

export function parseLevel(data: unknown): LevelDef {
  return levelSchema.parse(data);
}
