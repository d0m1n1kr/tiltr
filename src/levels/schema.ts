// Levelformat: die zentrale Schnittstelle zwischen Editor/Generator und Engine.
// zod validiert beim Laden – Fehler knallen sofort, nicht erst im Spiel.

import { z } from 'zod';
import { compileTune } from '../audio/chiptune';
import { FIFTH_CENTS, PITCH_SPAN_CENTS } from '../core/resonance';

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
  /** Pause JE WEGPUNKT in Sekunden (M72), Index = Wegpunkt; fehlend oder 0 =
   *  keine Pause. Parallele Liste statt Objekt-Wegpunkte, damit jede
   *  bestehende Def unverändert weiterlädt. Eine Pause ändert nur das
   *  TIMING – der Riegel-Beweis (guardsProof) bleibt davon unberührt, weil er
   *  ohnehin annimmt, der Wächter könne überall auf seiner Bahn stehen. */
  pause: z.array(z.number().min(0).max(30)).optional(),
  /** px/s */
  speed: z.number().positive().default(90),
  r: z.number().positive().default(26),
  /** Schläfer (M45): schläft auf Wegpunkt 0, bis ein Echo-Ping in
   *  `wakeRadius` (px) ihn weckt – dann `awakeS` Sekunden Patrouille. Macht
   *  den Ping zum Risiko. Beweis: wie Wächter (Patrouille als Riegel geprüft). */
  sleeper: z
    .object({
      wakeRadius: z.number().positive().default(220),
      awakeS: z.number().positive().default(5),
    })
    .optional(),
});

/* --- EIN ÖFFNER, MEHRERE TÜREN (M99) ----------------------------------------
   `opens` nimmt eine Tür-ID ODER eine Liste – nach dem Parsen ist es IMMER
   eine Liste. EINE Form im Modell, zwei an der Schnittstelle: Alle Beweise und
   die Türregel iterieren, und trotzdem lädt jede Def von vor 3.34 unverändert.

   Der Editor schreibt weiterhin einen STRING, solange es EINE Tür ist
   (`setOpens`): Ein Level, das das neue Mittel nicht braucht, bleibt Byte für
   Byte, wie es war – Teilen-Token und Exporte bleiben mit älteren Fassungen
   lesbar. Erst wer wirklich zwei Türen an einen Öffner hängt, braucht 3.34.
   Im Netz deckt das Merkmals-Gate den Fall (`needsFor(…, multiOpens)`). */
// `preprocess` statt `union`: Ein fehlendes `opens` soll weiter „Required"
// melden (der Editor macht daraus „opens fehlt", M61) – bei einer Union stünde
// dort nur „Invalid input", und die Ladefehler-Meldung wäre wieder Kauderwelsch.
const opensField = z.preprocess(
  (v) => (typeof v === 'string' ? [v] : v),
  z.array(z.string().min(1)).min(1),
);

export const keyDef = z.object({
  ...base,
  type: z.literal('key'),
  /** Tür-ID(s), die dieser Schlüssel öffnet – eine oder mehrere (M99) */
  opens: opensField,
  r: z.number().positive().default(18),
  /** Klang (M45): Klimpern (gepannt) oder Stimmgabel – reiner Ton, dessen
   *  Schwebung mit der Neigungsrichtung wandert (Ortung über Tonhöhe). */
  voice: z.enum(['tinkle', 'fork']).default('tinkle'),
});

/** Sanduhr (M45): Sammler, der die Par um `bonusS` verlängert – die zweite
 *  Routen-Entscheidung neben den Gems: Zeit holen oder Gems holen? */
export const hourglassDef = z.object({
  ...base,
  type: z.literal('hourglass'),
  r: z.number().positive().default(22),
  bonusS: z.number().positive().default(10),
});

export const doorDef = z.object({
  type: z.literal('door'),
  id: z.string().min(1),
  /** Wandkante, auf der die Tür sitzt – muss im Maze OFFEN sein */
  edge: wallEdge,
  /** Mehrere Öffner (Schlüssel, Zeitschloss, Platte): 'any' = einer genügt,
   *  'all' = alle müssen gleichzeitig erfüllt sein (core/doors.ts). */
  require: z.enum(['any', 'all']).default('any'),
  /** BLEIBT OFFEN (M76): Sobald die Bedingung einmal erfüllt war, bleibt die
   *  Tür offen – die Platte darf wieder los, der Schalter darf ablaufen.
   *  Ohne das schließt sie wieder (Halte-Choreografie zu zweit). Schlüssel
   *  öffnen ohnehin dauerhaft (die Tür wird zu Schutt). */
  latch: z.boolean().default(false),
  /** Tür nur für EINEN Spieler (M72, wie transporter.player): Für den anderen
   *  ist sie eine WAND, die nie aufgeht – im Spiel wie im Beweis. Ohne Angabe
   *  gilt sie für beide. Nur in Zwei-Spieler-Leveln sinnvoll. */
  player: z.union([z.literal(1), z.literal(2)]).optional(),
});

export const gemDef = z.object({
  ...base,
  type: z.literal('gem'),
  r: z.number().positive().default(14),
});

export const plateDef = z.object({
  ...base,
  type: z.literal('plate'),
  /** Tür-ID(s), die diese Platte öffnet, SOLANGE sie gehalten wird (Coop) –
   *  eine oder mehrere (M99) */
  opens: opensField,
  r: z.number().positive().default(30),
  /** RESONANZFELD (M91): Die Platte ist eine SCHALE, die die Kugel hält, und
   *  die Neigung wird zum Stimmknopf. Gehalten ist sie erst, wenn die Töne
   *  beider Felder im Zielintervall stehen – allein ist ein Duett nicht zu
   *  spielen. Ohne das Feld bleibt die Platte eine gewöhnliche Druckplatte. */
  tune: z.enum(['unison', 'fifth']).optional(),
  /** DER STIMMTON (M96): Der Gegenton kommt vom SPIEL, nicht vom Partner –
   *  Cent über dem Grundton (0…1200, wie `pitchFromTilt`). Damit ist ein
   *  Resonanz-Tor ALLEIN spielbar: Das Feld gibt den Ton an, man stimmt
   *  dagegen, und die Tür braucht „bleibt offen" (sonst stünde man auf der
   *  Platte, während man hindurchrollen müsste – M95). Nur mit `tune`. */
  pitch: z.number().min(0).max(1200).optional(),
})
  .refine((p) => p.pitch === undefined || p.tune !== undefined, {
    message: '„Vorgabe-Ton" nur auf einem Resonanzfeld (tune)',
  })
  // DER GEGENTON MUSS ERREICHBAR SEIN: Die Skala reicht von 0 bis
  // PITCH_SPAN_CENTS (Norden bis Süden). Bei einer QUINTE braucht der Spieler
  // `pitch ± 702` – liegt beides außerhalb der Skala, ginge das Tor NIE auf,
  // und ein Level, dessen Vorgabe unspielbar ist, wäre ein Versprechen, das es
  // nicht hält (dieselbe Lehre wie die Tür für einen Spieler, M72).
  .refine(
    (p) =>
      p.pitch === undefined ||
      p.tune !== 'fifth' ||
      p.pitch >= FIFTH_CENTS ||
      p.pitch <= PITCH_SPAN_CENTS - FIFTH_CENTS,
    { message: `„Vorgabe-Ton" für eine Quinte muss ≤ ${PITCH_SPAN_CENTS - FIFTH_CENTS} oder ≥ ${FIFTH_CENTS} Cent sein` },
  );

export const transporterDef = z.object({
  ...base,
  type: z.literal('transporter'),
  /** Ziel: Ebenen-Index + Zelle. Gleiche Ebene = Portal. */
  target: z.object({ floor: z.number().int().min(0), cell: cellCoord }),
  r: z.number().positive().default(32),
  /** Zwei Spieler (M65): nur für diesen Spieler vorhanden – in der Welt des
   *  anderen gibt es das Pad nicht (kein Klang, kein Warp). Fehlt = beide. */
  player: z.union([z.literal(1), z.literal(2)]).optional(),
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
  /** Tür-ID(s), die der Schalter für durationS Sekunden öffnet (M99) */
  opens: opensField,
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

/** Hallraum (M46): Zone wie Nebel, aber mit Nachhall statt Dämpfung. */
export const reverbZoneDef = z.object({
  ...base,
  type: z.literal('reverbZone'),
});

/** Lockglocke (M46): Überrollen schlägt sie an, Horcher laufen zum Klang. */
export const bellDef = z.object({
  ...base,
  type: z.literal('bell'),
  r: z.number().positive().default(24),
  /** Sekunden, die sie nachklingt – und die Horcher ablenkt */
  ringS: z.number().positive().default(4),
});

/** Rollstein (M47): zweiter Körper, zellweise schiebbar. Auf einer Druck-
 *  platte hält er sie (Einzelspieler-Öffner), in ein Loch gestoßen füllt er
 *  es. Kein Stein-Stein-Schieben, kein Transporter, keine Schiebewand-Zelle. */
export const boulderDef = z.object({
  ...base,
  type: z.literal('boulder'),
});

/** Wanderloch (M46): ein offenes Loch auf Patrouille – Wächter und Loch in
 *  einem. Modell: passierbar wie ein atmendes Loch (man wartet, bis es
 *  vorbei ist); Patrouille achsenparallel durch offene Zellen wie beim Wächter. */
export const roamingHoleDef = z.object({
  type: z.literal('roamingHole'),
  patrol: z.array(cellCoord).min(2),
  /** px/s – langsamer als ein Wächter, ein Loch wandert */
  speed: z.number().positive().default(55),
  r: z.number().positive().default(20.9),
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

/** Fackel (M66): macht in ihrem Radius HELL – das einzige Element ohne
 *  Klang, denn Licht ist hier die Information. Kein Physik-Einfluss. */
/* --- Zehrfeld (M102) --------------------------------------------------------
   Ein Feld, das Echo-Pings FRISST: Wer darüberrollt, zahlt `cost` Pings. Damit
   lässt sich eine Abkürzung BEPREISEN statt versperren – die erste Kosten-
   Mechanik im Spiel, und die einzige, die den Vorrat kleiner macht (der
   Kristall macht ihn größer, der Checkpoint füllt auf).

   Der Preis STEHT auf dem Feld: Der Renderer schreibt die Ziffer hinein,
   sobald die Zelle aufgedeckt ist. Ein Preisschild, das man nicht lesen kann,
   wäre eine Falle – und Fallen ohne Ansage gibt es in diesem Spiel nicht. */
export const drainDef = z.object({
  ...base,
  type: z.literal('drain'),
  /** Wie viele Pings eine Überfahrt kostet (die Ziffer auf dem Feld) */
  cost: z.number().int().min(1).max(9).default(1),
  r: z.number().positive().default(38),
});

export const torchDef = z.object({
  ...base,
  type: z.literal('torch'),
  /** Lichtradius in Welteinheiten (Zelle = 100) */
  r: z.number().positive().default(160),
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
  hourglassDef,
  reverbZoneDef,
  bellDef,
  roamingHoleDef,
  boulderDef,
  torchDef,
  drainDef,
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
export type HourglassDef = z.infer<typeof hourglassDef>;
export type ReverbZoneDef = z.infer<typeof reverbZoneDef>;
export type BellDef = z.infer<typeof bellDef>;
export type RoamingHoleDef = z.infer<typeof roamingHoleDef>;
export type BoulderDef = z.infer<typeof boulderDef>;
export type TorchDef = z.infer<typeof torchDef>;
export type DrainDef = z.infer<typeof drainDef>;
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
    /** Einseitig brüchig (M66): Kante aus `brittle` plus die SEITE, von der sie
     *  bricht – als Richtung vom Wandmittelpunkt zur Zelle des Angreifers
     *  ('w'/'e' bei senkrechten, 'n'/'s' bei waagerechten Wänden). Fehlt eine
     *  Kante hier, bricht sie von beiden Seiten. */
    brittleSide: z.array(z.tuple([wallEdge, wallDir])).default([]),
    /** Schallschutzwände: Wandkanten, die den Ping verschlucken und Klang
     *  dahinter abschirmen. Wie `brittle` muss die Wand existieren. */
    absorb: z.array(wallEdge).default([]),
    /** Echo-Spiegel (M45): Wandkanten, die den Ping am gespiegelten Punkt
     *  antworten lassen – eine Wand, die nicht da ist. Wand muss existieren. */
    mirrors: z.array(wallEdge).default([]),
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
  /** LICHT JE SPIELER (M92): Hell nur für DIESEN Spieler, für den anderen
   *  bleibt die Ebene dunkel. Damit wird aus der hellen Ebene ein Coop-
   *  Werkzeug: Einer SIEHT und sagt an, der andere hört und rollt – die
   *  Wegmarken (M89) sind dafür die Sprache. Ohne das Feld gilt `bright` wie
   *  bisher für beide. */
  brightPlayer: z.union([z.literal(1), z.literal(2)]).optional(),
  /** Dämmerung (Tutorial): hell wie `bright`, bis der Ball zum ersten Mal
   *  eine Wand berührt – dann blendet das Licht in zwei Sekunden aus und die
   *  Ebene ist dunkel wie jede andere. „Du kennst diesen Raum. Jetzt hör ihn." */
  dusk: z.boolean().default(false),
  /** Zwei-Spieler-Level (M57): Start des ZWEITEN Spielers (Gast). Nur auf
   *  Ebene 1 wirksam wie `start`; fehlt er, starten beide in `start`. */
  start2: cellCoord.optional(),
  /** Ziel des ZWEITEN Spielers – höchstens eines im Level, auf beliebiger
   *  Ebene. Fehlt es, gilt `goal` für beide. Für Spieler 2 ist dann nur
   *  DIESES Ziel die Zielzone (Spieler 1 sieht es nicht, es ist inert). */
  goal2: cellCoord.optional(),
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
  /** Spielerzahl (M57): 2 = Multiplayer-Level aus dem Editor – nur zu zweit
   *  spielbar, mit optionalem zweiten Start/Ziel (floor.start2/goal2). */
  players: z.union([z.literal(1), z.literal(2)]).default(1),
  /** Wegmarken je Spieler (M89): Klangbojen, die BEIDE hören – 0 heißt, dieses
   *  Level kennt sie nicht. Eine Bau-Entscheidung, keine Einstellung: Wer drei
   *  Marken hat, muss sparsam sein; wer null hat, verlässt sich auf Absprachen. */
  marks: z.number().int().min(0).max(9).default(3),
  /** Nur bei zwei Spielern: fester Modus oder 'any' (die Lobby wählt). */
  mpMode: z.enum(['coop', 'race', 'any']).default('any'),
  /** Gemeinsam ankommen (M90): Gewonnen wird nur, wenn BEIDE gleichzeitig in
   *  ihren Zielzonen liegen. Nur im Coop sinnvoll – im Rennen gibt es keinen
   *  gemeinsamen Sieg. Fehlt = die alte Regel (jeder für sich fertig). */
  together: z.boolean().optional(),
  /**
   * Gesetzt von mirrorLevel (src/levels/mirror.ts): Alle Def-Koordinaten
   * sind bereits gespiegelt; Loader/Test-Helfer spiegeln zusätzlich das
   * generierte Maze-Rauschen (mirrorCells) – zusammen ein exaktes
   * Spiegelbild des Original-Designs. NICHT von Hand setzen.
   */
  mirror: z.enum(['x', 'y', 'xy']).optional(),
})
  // „Gemeinsam ankommen" ist eine Coop-Regel: Solo gibt es keinen Partner, im
  // Rennen keinen gemeinsamen Sieg. Als Invariante im Schema (wie force <=
  // 2400 < accel), damit ein solches Level nicht erst im Spiel auffällt.
  .refine((l) => !l.together || (l.players === 2 && l.mpMode !== 'race'), {
    message: '„together" nur bei zwei Spielern im Coop (players: 2, mpMode coop/any)',
  })
  // Licht je Spieler (M92) braucht einen zweiten Spieler und eine HELLE Ebene –
  // sonst wäre das Feld eine stille Lüge (dunkel für beide).
  .refine((l) => l.floors.every((f) => !f.brightPlayer || (l.players === 2 && f.bright)), {
    message: '„brightPlayer" nur bei zwei Spielern und mit bright: true',
  });
export type LevelDef = z.infer<typeof levelSchema>;

/** Nennt irgendein Öffner MEHRERE Türen (M99)? Das ist die Frage des
 *  Merkmals-Gates: Eine Fassung vor 3.34 liest `opens` nur als eine ID und
 *  lädt so ein Level gar nicht. Rein abgeleitet – kein Level-Feld, sonst
 *  könnte es lügen. */
export const hasMultiOpens = (def: LevelDef): boolean =>
  def.floors.some((f) =>
    f.elements.some((el) => (el.type === 'key' || el.type === 'plate' || el.type === 'timedSwitch') && el.opens.length > 1),
  );

export function parseLevel(data: unknown): LevelDef {
  return levelSchema.parse(data);
}
