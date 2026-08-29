// Vibration API – auf iOS Safari nicht verfügbar, dort übernimmt Audio das Feedback.

const supported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
let lastHit = 0;
let lastWarn = 0;

export const haptics = {
  supported,

  hit(intensity01: number): void {
    if (!supported) return;
    const now = performance.now();
    if (now - lastHit < 60) return; // Entprellen
    lastHit = now;
    navigator.vibrate(Math.round(10 + Math.min(1, intensity01) * 70));
  },

  // Warnpuls in Lochnähe – Rate steigt mit der Nähe.
  holeWarning(closeness01: number): void {
    if (!supported || closeness01 <= 0) return;
    const now = performance.now();
    const interval = 600 - closeness01 * 420;
    if (now - lastWarn < interval) return;
    lastWarn = now;
    navigator.vibrate(12);
  },

  checkpoint(): void {
    if (supported) navigator.vibrate([15, 40, 15]);
  },

  crumble(): void {
    if (supported) navigator.vibrate([20, 20, 70]);
  },

  fall(): void {
    if (supported) navigator.vibrate([30, 30, 50, 30, 90, 30, 140]);
  },

  win(): void {
    if (supported) navigator.vibrate([60, 40, 60, 40, 160]);
  },
};
