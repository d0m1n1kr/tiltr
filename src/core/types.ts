// Gemeinsame Typen der Simulation und ihrer Darstellungs-/Audio-Schichten.

export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rest-Treffer einer brüchigen Wand; undefined = massiv */
  hp?: number;
  cracked?: boolean;
  /** Verschlossene Tür. Schlüssel entfernen sie dauerhaft; Coop-Türen
   *  stehen offen, solange eine verknüpfte Druckplatte gehalten wird. */
  door?: { id: string; open?: boolean };
  /** Schiebewand: öffnet/schließt zyklisch (openness 1 = Lücke, passierbar).
   *  lastState/nextTick sind Laufzeit-Zustand der Klang-Steuerung. */
  slide?: {
    cycle: Breathing;
    openness: number;
    lastState?: 'opening' | 'open' | 'closing' | 'closed';
    nextTick?: number;
  };
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
  litFrom?: number;
  litUntil?: number;
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
}

export interface Plate {
  x: number;
  y: number;
  r: number;
  /** Tür-ID, die diese Druckplatte (solange gehalten) öffnet */
  opens: string;
  /** wird gerade von einem Spieler gehalten (lokal ODER remote) */
  held: boolean;
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
