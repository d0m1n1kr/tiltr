// Vibration API – auf iOS Safari nicht verfügbar, dort übernimmt Audio das Feedback.

export const haptics = {
  supported: typeof navigator !== 'undefined' && 'vibrate' in navigator,
  _lastHit: 0,

  hit(intensity01) {
    if (!this.supported) return;
    const now = performance.now();
    if (now - this._lastHit < 60) return; // Entprellen
    this._lastHit = now;
    navigator.vibrate(Math.round(10 + Math.min(1, intensity01) * 70));
  },

  // Warnpuls in Lochnähe – Rate steigt mit der Nähe.
  _lastWarn: 0,
  holeWarning(closeness01) {
    if (!this.supported || closeness01 <= 0) return;
    const now = performance.now();
    const interval = 600 - closeness01 * 420;
    if (now - this._lastWarn < interval) return;
    this._lastWarn = now;
    navigator.vibrate(12);
  },

  fall() {
    if (!this.supported) return;
    navigator.vibrate([30, 30, 50, 30, 90, 30, 140]);
  },

  win() {
    if (!this.supported) return;
    navigator.vibrate([60, 40, 60, 40, 160]);
  },
};
