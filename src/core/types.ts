// Gemeinsame Typen der Simulation und ihrer Darstellungs-/Audio-Schichten.

export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rest-Treffer einer brüchigen Wand; undefined = massiv */
  hp?: number;
  cracked?: boolean;
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
