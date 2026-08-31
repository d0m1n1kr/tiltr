// Bildschirm wach halten (Screen Wake Lock API).
//
// Warum das kein Luxus ist: tiltr wird durch NEIGEN gespielt, nicht durch
// Tippen. Für Android/Chrome sieht ein laufender Lauf deshalb aus wie ein
// unbenutztes Gerät – der Bildschirm dimmt und sperrt mitten im Level. Genau
// dagegen gibt es `navigator.wakeLock.request('screen')`.
//
// Zwei Eigenheiten der API, die den ganzen Zustand hier begründen:
//  1. Die Sperre wird AUTOMATISCH freigegeben, sobald die Seite in den
//     Hintergrund geht (Tab-Wechsel, Anruf, Sperrtaste). Sie muss beim
//     Zurückkommen NEU geholt werden – sonst ist sie nach dem ersten
//     Wegschauen für den Rest der Sitzung weg.
//  2. `request()` ist asynchron und darf jederzeit ablehnen (Akkusparmodus,
//     unsichtbare Seite, fehlende Unterstützung). Ein Fehlschlag ist normal
//     und darf das Spiel nicht behelligen.
//
// Der Kern ist deshalb ein kleiner Zustandsautomat um „will wach bleiben" –
// injizierbar und damit ohne Browser testbar (tests/wakelock.test.ts).

/** Der Teil von WakeLockSentinel, den wir brauchen. */
export interface WakeSentinel {
  release(): Promise<void>;
  addEventListener(type: 'release', cb: () => void): void;
}

export interface WakeState {
  /** Bringt die Plattform die API überhaupt mit? (iOS/Safari: nein) */
  supported: boolean;
  /** Wollen wir gerade wach bleiben? (Spiel/Hörtest läuft) */
  wanted: boolean;
  /** Halten wir die Sperre wirklich? */
  active: boolean;
  /** Wie oft haben wir sie angefordert (inkl. Neuanforderung nach Hintergrund)? */
  attempts: number;
  /** Name des letzten Fehlschlags, sonst null. */
  error: string | null;
}

export interface WakeLockApi {
  /** Ab jetzt wach halten. Idempotent – doppeltes Anmelden holt keine zweite Sperre. */
  want(): void;
  /** Nicht mehr nötig (Menü, Ergebnis) – Sperre freigeben. */
  release(): void;
  /** Sichtbarkeit hat sich geändert: beim Zurückkommen neu holen. */
  visibilityChanged(visible: boolean): void;
  state(): WakeState;
}

export function createWakeLock(request: (() => Promise<WakeSentinel>) | null): WakeLockApi {
  let wanted = false;
  let sentinel: WakeSentinel | null = null;
  let pending = false;
  let attempts = 0;
  let error: string | null = null;

  const acquire = (): void => {
    if (!request || !wanted || sentinel || pending) return;
    pending = true;
    attempts++;
    void request().then(
      (s) => {
        pending = false;
        // Zwischenzeitlich abgemeldet (kurzer Lauf, schnelles Zurück): Die
        // Sperre sofort wieder hergeben, statt sie liegen zu lassen.
        if (!wanted) {
          void s.release();
          return;
        }
        sentinel = s;
        error = null;
        s.addEventListener('release', () => {
          if (sentinel === s) sentinel = null;
        });
      },
      (e: unknown) => {
        pending = false;
        error = e instanceof Error ? e.name : String(e);
      },
    );
  };

  return {
    want(): void {
      wanted = true;
      acquire();
    },
    release(): void {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      if (s) void s.release();
    },
    visibilityChanged(visible: boolean): void {
      if (!visible) {
        // Das System hat die Sperre schon genommen; nur den Zustand nachziehen.
        sentinel = null;
        return;
      }
      acquire();
    },
    state(): WakeState {
      return { supported: request !== null, wanted, active: sentinel !== null, attempts, error };
    },
  };
}

/** Browser-Verdrahtung: Feature-Erkennung, Sichtbarkeit, Test-Haken. */
export function setupWakeLock(): WakeLockApi {
  // Die Typdefinition kennt navigator.wakeLock, die Plattform nicht immer
  // (iOS/Safari) – deshalb zur LAUFZEIT prüfen, nicht am Typ.
  const lock = 'wakeLock' in navigator ? navigator.wakeLock : undefined;
  const api = createWakeLock(lock ? () => lock.request('screen') : null);
  document.addEventListener('visibilitychange', () =>
    api.visibilityChanged(document.visibilityState === 'visible'),
  );
  // Zustand als Getter: Der E2E-Lauf liest ihn jederzeit frisch, ohne dass
  // hier jemand an Aktualisierungen denken muss.
  Object.defineProperty(window, '__tiltrWake', { get: () => api.state(), configurable: true });
  return api;
}
