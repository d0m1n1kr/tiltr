// Neigungssensor (DeviceOrientation) mit Kalibrierung + Tastatur-Fallback für Desktop.

export class TiltInput {
  constructor() {
    this.beta = 0;   // vor/zurück
    this.gamma = 0;  // links/rechts
    this.beta0 = 0;
    this.gamma0 = 0;
    this.hasSensor = false;
    this.maxAngle = 22; // ° Neigung für vollen Ausschlag
    this.keys = new Set();
    this._keyTilt = { x: 0, y: 0 };
  }

  // Muss aus einer User-Geste heraus aufgerufen werden (iOS-Permission).
  async start() {
    if (typeof DeviceOrientationEvent !== 'undefined'
        && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return this._startKeyboard();
      } catch {
        return this._startKeyboard();
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
    this._startKeyboard(); // Tastatur bleibt zusätzlich aktiv
    return true;
  }

  _startKeyboard() {
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    return true;
  }

  calibrate() {
    this.beta0 = this.beta;
    this.gamma0 = this.gamma;
  }

  // {x,y} in [-1,1]; +x = Ball rollt nach rechts, +y = nach unten (zum Nutzer).
  // Die Achsen werden nach Screen-Orientierung gedreht, damit Querformat stimmt.
  get tilt() {
    if (this.hasSensor) {
      const clamp = (v) => Math.max(-1, Math.min(1, v));
      const dead = (v) => (Math.abs(v) < 0.04 ? 0 : v); // Totzone gegen Sensor-Drift
      const gx = (this.gamma - this.gamma0) / this.maxAngle;
      const gy = (this.beta - this.beta0) / this.maxAngle;
      const raw = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
      const angle = ((raw % 360) + 360) % 360;
      let x, y;
      if (angle === 90) { x = gy; y = -gx; }
      else if (angle === 180) { x = -gx; y = -gy; }
      else if (angle === 270) { x = -gy; y = gx; }
      else { x = gx; y = gy; }
      return { x: clamp(dead(x)), y: clamp(dead(y)) };
    }
    const k = this.keys;
    const t = this._keyTilt;
    const tx = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    const ty = (k.has('arrowdown') || k.has('s') ? 1 : 0) - (k.has('arrowup') || k.has('w') ? 1 : 0);
    // weiches An-/Abschwellen, damit sich Tasten wie Neigen anfühlen
    t.x += (tx * 0.7 - t.x) * 0.15;
    t.y += (ty * 0.7 - t.y) * 0.15;
    return { x: t.x, y: t.y };
  }
}
