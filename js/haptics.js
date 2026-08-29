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

  win() {
    if (!this.supported) return;
    navigator.vibrate([60, 40, 60, 40, 160]);
  },
};
