// Neigungssensor (DeviceOrientation) mit Kalibrierung + Tastatur-Fallback für Desktop.

import type { Tilt } from '../core/types';

// iOS-Erweiterung: requestPermission existiert nur dort.
interface DeviceOrientationEventiOS {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export class TiltInput {
  beta = 0; // vor/zurück
  gamma = 0; // links/rechts
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
    });
    this.startKeyboard(); // Tastatur bleibt zusätzlich aktiv
  }

  private startKeyboard(): void {
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
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
      const raw =
        screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
      const angle = ((raw % 360) + 360) % 360;
      let x: number, y: number;
      if (angle === 90) {
        x = gy;
        y = -gx;
      } else if (angle === 180) {
        x = -gx;
        y = -gy;
      } else if (angle === 270) {
        x = -gy;
        y = gx;
      } else {
        x = gx;
        y = gy;
      }
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
