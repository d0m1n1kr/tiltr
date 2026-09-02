// Neigungssensor (DeviceOrientation) mit Kalibrierung + Tastatur-Fallback für Desktop.

import type { Tilt } from '../core/types';
import { angleFromType, screenTilt } from '../core/orientation';

// iOS-Erweiterung: requestPermission existiert nur dort.
interface DeviceOrientationEventiOS {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/** Apple-Geräte (iPhone, iPad – iPadOS gibt sich als „MacIntel" mit Touch aus). */
function isApple(): boolean {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Drehwinkel des Bildschirms gegen den SENSOR-Rahmen (v3.0.5). Android:
 *  `screen.orientation.angle` (relativ zur natürlichen Lage = Sensor-Rahmen).
 *  Apple: der Sensor misst immer im Hochformat, aber iPadOS zählt `angle` von
 *  der Querlage – deshalb dort der TYP über die Spec-Tabelle (angleFromType),
 *  hilfsweise das physisch korrekte Legacy-`window.orientation`. */
export function physicalAngle(): number {
  const so = screen.orientation as ScreenOrientation | undefined;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  if (isApple()) {
    if (so?.type) return angleFromType(so.type, so.angle);
    if (typeof legacy === 'number') return legacy;
  }
  return so?.angle ?? legacy ?? 0;
}

export class TiltInput {
  beta = 0; // vor/zurück
  gamma = 0; // links/rechts
  alpha = 0; // Kompass (nur Diagnose)
  /** accelerationIncludingGravity aus devicemotion – nur Diagnose (v3.0.4):
   *  zweite, unabhängige Sicht auf die Schwerkraft im Geräterahmen. */
  acc: { x: number; y: number; z: number } | null = null;
  beta0 = 0;
  gamma0 = 0;
  hasSensor = false;
  maxAngle = 22; // ° Neigung für vollen Ausschlag
  private keys = new Set<string>();
  private keyTilt: Tilt = { x: 0, y: 0 };

  // Muss aus einer User-Geste heraus aufgerufen werden (iOS-Permission).
  async start(): Promise<void> {
    const doe = DeviceOrientationEvent as unknown as DeviceOrientationEventiOS;
    if (typeof doe?.requestPermission === 'function') {
      try {
        const res = await doe.requestPermission();
        if (res !== 'granted') {
          this.startKeyboard();
          return;
        }
      } catch {
        this.startKeyboard();
        return;
      }
    }
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta === null || e.gamma === null) return;
      if (!this.hasSensor) {
        this.hasSensor = true;
        this.beta0 = e.beta;
        this.gamma0 = e.gamma;
      }
      this.beta = e.beta;
      this.gamma = e.gamma;
      this.alpha = e.alpha ?? 0;
    });
    window.addEventListener('devicemotion', (e) => {
      const a = e.accelerationIncludingGravity;
      if (a && a.x !== null && a.y !== null && a.z !== null) this.acc = { x: a.x, y: a.y, z: a.z };
    });
    this.startKeyboard(); // Tastatur bleibt zusätzlich aktiv
  }

  private startKeyboard(): void {
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  /** Sensor-Diagnose (Debug, v3.0.4): Was meldet DIESES Gerät? Ausrichtung
   *  (Typ, Winkel, natürliche Lage), rohe Winkel, Schwerkraft, Ergebnis. Die
   *  Achsen-Konventionen von beta/gamma und screen.orientation sind auf
   *  Tablets nicht überall gleich – ohne diese Zeile ist jede Korrektur
   *  Raterei. */
  diagnostics(): string {
    const raw = screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
    const type = screen.orientation?.type ?? '?';
    const legacy = (window as unknown as { orientation?: number }).orientation;
    const phys = physicalAngle();
    const t = this.tilt;
    // Unkalibriert (β0 = γ0 = 0): das Mapping ohne die Referenz der letzten
    // Kalibrierung – im Menü ist die oft alt, `tilt` steht dann am Anschlag.
    const r = screenTilt(this.gamma / this.maxAngle, this.beta / this.maxAngle, phys);
    const acc = this.acc ? `acc ${this.acc.x.toFixed(1)} ${this.acc.y.toFixed(1)} ${this.acc.z.toFixed(1)}` : 'acc –';
    const sensor = this.hasSensor ? '' : ' · kein Sensor';
    return `${type} angle ${raw}° win ${legacy ?? '–'} → phys ${phys}° · β ${this.beta.toFixed(0)} γ ${this.gamma.toFixed(0)} α ${this.alpha.toFixed(0)} · ${acc} · tilt ${t.x.toFixed(2)} ${t.y.toFixed(2)} · raw→ ${r.x.toFixed(2)} ${r.y.toFixed(2)}${sensor}`;
  }

  calibrate(): void {
    this.beta0 = this.beta;
    this.gamma0 = this.gamma;
  }

  // {x,y} in [-1,1]; +x = Ball rollt nach rechts, +y = nach unten (zum Nutzer).
  // Die Achsen werden nach Screen-Orientierung gedreht, damit Querformat stimmt.
  get tilt(): Tilt {
    if (this.hasSensor) {
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      const dead = (v: number) => (Math.abs(v) < 0.04 ? 0 : v); // Totzone gegen Sensor-Drift
      const gx = (this.gamma - this.gamma0) / this.maxAngle;
      const gy = (this.beta - this.beta0) / this.maxAngle;
      // Drehung in Bildschirmachsen wohnt in core/orientation.ts (rein, mit
      // Units) – hier nur den Winkel liefern. Rotation Lock: screen.orientation
      // meldet die DARGESTELLTE Ausrichtung, also genau die, in die gedreht
      // werden muss.
      const { x, y } = screenTilt(gx, gy, physicalAngle());
      return { x: clamp(dead(x)), y: clamp(dead(y)) };
    }
    const k = this.keys;
    const t = this.keyTilt;
    const tx = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    const ty = (k.has('arrowdown') || k.has('s') ? 1 : 0) - (k.has('arrowup') || k.has('w') ? 1 : 0);
    // weiches An-/Abschwellen, damit sich Tasten wie Neigen anfühlen
    t.x += (tx * 0.7 - t.x) * 0.15;
    t.y += (ty * 0.7 - t.y) * 0.15;
    return { x: t.x, y: t.y };
  }
}
