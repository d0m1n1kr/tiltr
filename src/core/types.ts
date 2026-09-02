// Gemeinsame Typen der Simulation und ihrer Darstellungs-/Audio-Schichten.

// Nur ein TYP-Import, und aus einem reinen, DOM-freien Modul: Die Playlist
// eines Automaten ist Daten (IDs oder eingebettete Notenfolgen), keine
// Audio-Abhängigkeit. Die Simulation rührt sie nicht an.
import type { Tune } from '../audio/chiptune';

export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rest-Treffer einer brüchigen Wand; undefined = massiv */
  hp?: number;
  cracked?: boolean;
  /** Schallschutzwand: verschluckt den Echo-Ping, schirmt Klang dahinter ab
   *  (core/occlusion.ts), Rempler klingt gedämpft. */
  absorb?: boolean;
  /** Echo-Spiegel (M45): Der Ping meldet die Wand am GESPIEGELTEN Punkt –
   *  doppelt so weit, in derselben Richtung: eine Wand, die nicht da ist.
   *  Kollision und Beweis: normale Wand. */
  mirror?: boolean;
  /** Verschlossene Tür. Schlüssel entfernen sie dauerhaft; Coop-Türen
   *  stehen offen, solange eine verknüpfte Druckplatte gehalten wird. */
  door?: { id: string; open?: boolean; require?: 'any' | 'all' };
  /** Schiebewand: öffnet/schließt zyklisch (openness 1 = Lücke, passierbar).
   *  lastState/nextTick sind Laufzeit-Zustand der Klang-Steuerung. */
  slide?: {
    cycle: Breathing;
    openness: number;
    lastState?: 'opening' | 'open' | 'closing' | 'closed';
    nextTick?: number;
  };
  /** Jukebox-Kasten: Index in `World.jukeboxes`. Der Automat ist ein
   *  MASSIVER Kasten aus dem vorhandenen Wand-Mechanismus – Kollision, Echo
   *  und Treffer-Klang sind damit gratis, und die Spielschleife erkennt den
   *  Rempler an dieser Marke (`hit.wall.jukebox`). */
  jukebox?: number;
  /** Aufleuchten frühestens ab (ms, performance.now-Zeitbasis) – Ping-Wellenfront */
  litFrom?: number;
  /** Aufleuchten bis (ms) */
  litUntil?: number;
}

export interface Breathing {
  /** Sekunden offen */
  open: number;
  /** Sekunden geschlossen */
  closed: number;
  /** Öffnen/Schließen-Rampe in Sekunden */
  ramp: number;
  /** Phasenversatz in Sekunden */
  offset: number;
}

export interface Hole {
  x: number;
  y: number;
  r: number;
  /** 0 = geschlossen, 1 = offen; undefined = dauerhaft offen */
  openness?: number;
  /** fehlt = Loch ist dauerhaft offen */
  breathing?: Breathing;
  /** Wanderloch (M46): läuft seine Wegpunkte im Ping-Pong ab wie ein Wächter –
   *  das Grollen zieht durch den Raum. Fehlt = das Loch steht. */
  roam?: { waypoints: Array<{ x: number; y: number }>; target: number; dir: 1 | -1; speed: number };
  litFrom?: number;
  litUntil?: number;
}

/** Lockglocke (M46): Überrollen schlägt sie an (`ringLeft` Sekunden); solange
 *  sie klingt, laufen die Horcher zu IHR statt zum Ball. `inside` merkt sich,
 *  ob der Ball gerade auf ihr steht (Kanten-Trigger). */
export interface Bell {
  x: number;
  y: number;
  r: number;
  ringS: number;
  ringLeft: number;
  inside: boolean;
  litFrom?: number;
  litUntil?: number;
}

/** Hallraum (M46): Zone mit langem Nachhall auf dem Ping-Bus – nicht leiser
 *  wie Nebel, sondern LÄNGER: Wände weit hörbar, Richtung verschmiert. */
export interface ReverbZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindZone {
  x: number;
  y: number;
  w: number;
  h: number;
  fx: number;
  fy: number;
}

export interface Checkpoint {
  x: number;
  y: number;
  r: number;
  reached: boolean;
  litUntil?: number;
}

export interface Goal {
  x: number;
  y: number;
  r: number;
}

export interface PingWave {
  x: number;
  y: number;
  start: number;
  speed: number;
  range: number;
}

export interface Guard {
  x: number;
  y: number;
  r: number;
  speed: number;
  waypoints: Array<{ x: number; y: number }>;
  /** Index des Wegpunkts, auf den sich der Wächter zubewegt */
  target: number;
  /** Laufrichtung durch die Wegpunktliste (Ping-Pong) */
  dir: 1 | -1;
  /** Schläfer (M45): steht schlafend auf Wegpunkt 0. Ein Echo-Ping in
   *  `wakeRadius` weckt ihn für `awakeS` Sekunden Patrouille (`awakeLeft`
   *  zählt herunter), danach kehrt er heim und schläft wieder. */
  sleeper?: { wakeRadius: number; awakeS: number; awakeLeft: number };
  litFrom?: number;
  litUntil?: number;
}

export interface Collectible {
  x: number;
  y: number;
  r: number;
  collected: boolean;
  litFrom?: number;
  litUntil?: number;
}

export interface Key extends Collectible {
  /** Tür-ID, die dieser Schlüssel öffnet */
  opens: string;
  /** Klang (M45): 'tinkle' klimpert gepannt; 'fork' ist eine Stimmgabel –
   *  ungepannter Ton, dessen Schwebung verrät, ob man auf sie zu neigt. */
  voice: 'tinkle' | 'fork';
}

export interface Plate {
  x: number;
  y: number;
  r: number;
  /** Tür-ID, die diese Druckplatte (solange gehalten) öffnet */
  opens: string;
  /** wird gerade von einem Spieler gehalten (lokal ODER remote) */
  held: boolean;
  /** Rollstein (M47) liegt auf der Platte – hält sie dauerhaft, auch allein. */
  boulder?: boolean;
  litFrom?: number;
  litUntil?: number;
}

export interface TimedSwitch {
  x: number;
  y: number;
  r: number;
  /** Tür-ID, die der Schalter für durationS Sekunden öffnet */
  opens: string;
  durationS: number;
  /** Tür offen bis (ms, performance.now-Zeitbasis); null = nie ausgelöst */
  openUntil: number | null;
  /** Ball steht gerade drauf (verhindert Dauer-Klick, erlaubt Auffrischen) */
  held: boolean;
  litFrom?: number;
  litUntil?: number;
}

/** Strömung: Zellen-Zone, deren Schub stärker ist als die Neigung – Einbahnstraße. */
export interface Current {
  x: number;
  y: number;
  w: number;
  h: number;
  fx: number;
  fy: number;
  dir: 'n' | 'e' | 's' | 'w';
}

/** Horcher: bewegt sich NUR, solange der Ball rollt – Stille = sicher.
 *  Hört (und jagt) durch Wände; bei Ball-Stille zieht er sich heimwärts zurück. */
export interface Listener {
  x: number;
  y: number;
  r: number;
  /** Jagdgeschwindigkeit in px/s */
  speed: number;
  /** Heimatpunkt, zu dem er sich bei Stille zurückzieht */
  home: { x: number; y: number };
  litFrom?: number;
  litUntil?: number;
}

/** Nebelzone: dämpft ALLE Klänge (globaler Lowpass) – kein Physik-Einfluss. */
export interface FogZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Eisfläche: reibungsarme Zelle – der Ball gleitet, Lenken wird schwammig. */
export interface IcePatch {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sog-Anker: zieht den Ball im Radius an – Kraft bleibt unter der
 *  Neigungs-Beschleunigung, man kommt immer (mühsam) wieder heraus. */
/** Rollstein (M47): zweiter Körper, ZELLWEISE. Der Ball schiebt ihn um genau
 *  eine Zelle, wenn er ihn schnell genug an einer Kante trifft und die
 *  Zielzelle frei ist. Auf einer Druckplatte hält er sie, in ein Loch
 *  gestoßen füllt er es (beide verschwinden). `move` ist der laufende
 *  Rollvorgang (350 ms), `cell` die logische Zelle, `x/y` die gezeichnete Mitte. */
export interface Boulder {
  x: number;
  y: number;
  /** Kantenlänge des Kastens (Welteinheiten) */
  size: number;
  cell: [number, number];
  move: { fromX: number; fromY: number; toX: number; toY: number; t: number; dir: [number, number] } | null;
  /** im Loch versunken – wird nicht mehr gezeichnet, kollidiert nicht */
  sunk: boolean;
  litFrom?: number;
  litUntil?: number;
}

/** Sanduhr (M45): Sammler, der die Par um `bonusS` verlängert. */
export interface Hourglass extends Collectible {
  bonusS: number;
}

export interface Anchor {
  x: number;
  y: number;
  /** Wirkradius */
  r: number;
  /** Maximaler Sog im Zentrum (px/s²) */
  force: number;
  litFrom?: number;
  litUntil?: number;
}

/** Glasboden: 1. Überrollen knackt, 2. zerbricht die Zelle zum offenen Loch. */
export interface GlassPlate {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 = intakt, 1 = geknackt, 2 = zerbrochen (durch ein Loch ersetzt) */
  state: 0 | 1 | 2;
  /** Ball war im letzten Frame drauf (Kanten-Trigger fürs Überrollen) */
  wasOn: boolean;
  litFrom?: number;
  litUntil?: number;
}

export interface Transporter {
  x: number;
  y: number;
  r: number;
  /** Ziel: Ebene + Weltkoordinaten */
  targetFloor: number;
  tx: number;
  ty: number;
  /** abgeleitet aus Ebenen-Differenz – bestimmt Klang & Glyphe */
  dir: 'up' | 'down' | 'same';
  litFrom?: number;
  litUntil?: number;
}

/** Ein Playlist-Eintrag: Titel-ID aus src/music/ ODER eingebetteter Titel. */
export type PlaylistEntry = string | Tune;

/**
 * Jukebox: ein Musikautomat, der als massiver Kasten in seiner Zelle steht
 * (die Kollision macht die Wand, siehe `Wall.jukebox`). Hier wohnt nur, WAS
 * er spielt und WO die Titelzeit gerade steht – die Noten plant die
 * Spielschleife über den Musik-Bus ein.
 */
export interface Jukebox {
  /** Mittelpunkt des Kastens = Klangquelle */
  x: number;
  y: number;
  /** Der Kasten selbst (identisch mit der zugehörigen Wand) */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  playlist: readonly PlaylistEntry[];
  /** Laufender Titel (Index in playlist) */
  index: number;
  /** Lautstärke des Automaten (0 = stumm, aber sichtbar) */
  volume: number;
  /**
   * Audio-Zeit (nicht performance.now!), auf die die Titelzeit 0 fällt;
   * null = noch nicht angelaufen. Ein Titelwechsel setzt beides zurück.
   */
  epoch: number | null;
  /** Bis wohin auf der Titel-Zeitachse schon Noten eingeplant sind */
  scheduledS: number;
  /** Zeitpunkt des letzten Remplers (ms) – entprellt den Titelwechsel */
  lastSkip?: number;
  /** Tempo des laufenden Titels – nur fürs BILD (der Kasten blinkt im Takt).
   *  undefined = stumm, dann blinkt nichts. */
  bpm?: number;
  litFrom?: number;
  litUntil?: number;
}

export interface WallHit {
  wall: Wall;
  nx: number;
  ny: number;
  impact: number;
}

export interface Tilt {
  x: number;
  y: number;
}
