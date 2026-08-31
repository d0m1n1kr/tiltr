// Bildschirmsperre: Der Zustandsautomat um „will wach bleiben". Die beiden
// Eigenheiten der API sind hier festgenagelt: Die Sperre geht im Hintergrund
// VERLOREN (und muss neu geholt werden), und request() darf ablehnen.

import { describe, expect, it, vi } from 'vitest';
import { createWakeLock, type WakeSentinel } from '../src/ui/wakelock';

/** Sentinel-Attrappe mit steuerbarem „das System hat sie genommen". */
function fakeSentinel(): WakeSentinel & { released: boolean; fireRelease(): void } {
  const listeners: Array<() => void> = [];
  return {
    released: false,
    release(): Promise<void> {
      this.released = true;
      return Promise.resolve();
    },
    addEventListener(_type: 'release', cb: () => void): void {
      listeners.push(cb);
    },
    fireRelease(): void {
      for (const cb of listeners) cb();
    },
  };
}

/** Nimmt request() unter Kontrolle: löst erst auf, wenn der Test es sagt. */
function controlled() {
  const handed: Array<ReturnType<typeof fakeSentinel>> = [];
  let resolveNext: ((s: WakeSentinel) => void) | null = null;
  let rejectNext: ((e: unknown) => void) | null = null;
  const request = (): Promise<WakeSentinel> =>
    new Promise<WakeSentinel>((res, rej) => {
      resolveNext = res;
      rejectNext = rej;
    });
  return {
    request,
    handed,
    async grant(): Promise<ReturnType<typeof fakeSentinel>> {
      const s = fakeSentinel();
      handed.push(s);
      resolveNext!(s);
      await Promise.resolve();
      await Promise.resolve();
      return s;
    },
    async deny(err: unknown): Promise<void> {
      rejectNext!(err);
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('createWakeLock', () => {
  it('meldet fehlende Plattform-Unterstützung, ohne zu stolpern', () => {
    const lock = createWakeLock(null);
    lock.want();
    lock.visibilityChanged(true);
    expect(lock.state()).toEqual({ supported: false, wanted: true, active: false, attempts: 0, error: null });
    lock.release();
    expect(lock.state().wanted).toBe(false);
  });

  it('holt die Sperre bei want() und gibt sie bei release() zurück', async () => {
    const c = controlled();
    const lock = createWakeLock(c.request);
    lock.want();
    expect(lock.state().attempts).toBe(1);
    const s = await c.grant();
    expect(lock.state().active).toBe(true);
    lock.release();
    expect(s.released).toBe(true);
    expect(lock.state()).toMatchObject({ wanted: false, active: false });
  });

  it('holt bei doppeltem want() keine zweite Sperre', async () => {
    const c = controlled();
    const lock = createWakeLock(c.request);
    lock.want();
    lock.want(); // noch offen -> kein zweiter Versuch
    await c.grant();
    lock.want(); // schon gehalten -> kein dritter
    expect(lock.state().attempts).toBe(1);
  });

  it('gibt eine zu spät eintreffende Sperre sofort wieder her', async () => {
    // Kurzer Lauf: Abmeldung passiert VOR der Antwort des Browsers.
    const c = controlled();
    const lock = createWakeLock(c.request);
    lock.want();
    lock.release();
    const s = await c.grant();
    expect(s.released).toBe(true);
    expect(lock.state().active).toBe(false);
  });

  it('holt die im Hintergrund verlorene Sperre beim Zurückkommen neu', async () => {
    const c = controlled();
    const lock = createWakeLock(c.request);
    lock.want();
    const first = await c.grant();
    // Seite in den Hintergrund: Das System nimmt die Sperre.
    first.fireRelease();
    lock.visibilityChanged(false);
    expect(lock.state().active).toBe(false);
    // Zurück im Vordergrund: neuer Versuch, neue Sperre.
    lock.visibilityChanged(true);
    expect(lock.state().attempts).toBe(2);
    await c.grant();
    expect(lock.state().active).toBe(true);
  });

  it('holt im Hintergrund NICHT neu, wenn niemand mehr wach bleiben will', () => {
    const c = controlled();
    const spy = vi.fn(c.request);
    const lock = createWakeLock(spy);
    lock.visibilityChanged(true);
    expect(spy).not.toHaveBeenCalled();
    expect(lock.state().attempts).toBe(0);
  });

  it('verträgt eine Ablehnung und merkt sich den Grund', async () => {
    const c = createWakeLock(() => Promise.reject(new DOMException('nope', 'NotAllowedError')));
    c.want();
    await Promise.resolve();
    await Promise.resolve();
    expect(c.state()).toMatchObject({ active: false, wanted: true, attempts: 1, error: 'NotAllowedError' });
  });

  it('versucht es nach einer Ablehnung beim nächsten Sichtbarwerden wieder', async () => {
    let calls = 0;
    const lock = createWakeLock(() => {
      calls++;
      return calls === 1 ? Promise.reject(new Error('Boom')) : Promise.resolve(fakeSentinel());
    });
    lock.want();
    await Promise.resolve();
    await Promise.resolve();
    expect(lock.state().active).toBe(false);
    lock.visibilityChanged(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(lock.state()).toMatchObject({ active: true, attempts: 2, error: null });
  });
});
