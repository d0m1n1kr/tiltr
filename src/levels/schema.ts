// Levelformat: die zentrale Schnittstelle zwischen Editor/Generator und Engine.
// zod validiert beim Laden – Fehler knallen sofort, nicht erst im Spiel.

import { z } from 'zod';

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

export const elementDef = z.discriminatedUnion('type', [holeDef, windZoneDef, checkpointDef]);
export type ElementDef = z.infer<typeof elementDef>;
export type HoleDef = z.infer<typeof holeDef>;
export type WindZoneDef = z.infer<typeof windZoneDef>;
export type CheckpointDef = z.infer<typeof checkpointDef>;

export const floorSchema = z.object({
  /** [Spalten, Zeilen] */
  size: z.tuple([z.number().int().min(2).max(64), z.number().int().min(2).max(64)]),
  maze: z.object({
    seed: z.number().int().nonnegative(),
    /** Wände nachträglich öffnen (Durchgänge schaffen) */
    carve: z.array(wallEdge).default([]),
    /** Wände nachträglich schließen */
    add: z.array(wallEdge).default([]),
    /** Anteil brüchiger Innenwände (0 = keine) */
    brittleChance: z.number().min(0).max(1).default(0),
    /** Treffer bis zum Einsturz */
    brittleHits: z.number().int().min(1).default(3),
  }),
  elements: z.array(elementDef).default([]),
  start: cellCoord,
  /** null = Ziel liegt auf einer anderen Ebene (ab M5) */
  goal: cellCoord.nullable(),
});
export type FloorDef = z.infer<typeof floorSchema>;

export const levelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parTimeS: z.number().positive().optional(),
  /** Echo-Pings zu Rundenbeginn */
  pingBudget: z.number().int().min(0).default(3),
  // Mehrere Ebenen sind ab M5 geplant; das Format trägt sie schon.
  floors: z.array(floorSchema).min(1).max(1),
});
export type LevelDef = z.infer<typeof levelSchema>;

export function parseLevel(data: unknown): LevelDef {
  return levelSchema.parse(data);
}
