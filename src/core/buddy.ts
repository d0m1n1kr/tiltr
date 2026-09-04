// Partner-Klang (M88): Wie NAH und wie ROLLEND der Partner klingt.
//
// Bis 3.21 war der Partner akustisch NICHT VORHANDEN: ein Schein im Bild (im
// Coop auf heller Ebene ein fester Ball, M62), aber kein Ton – in einem Spiel,
// dessen Welt sich über Klang offenbart, ist „wo bist du?" damit nicht
// beantwortbar. `setRival` gab es schon, aber nur für den Geist im DUELL.
//
// Zwei Anteile, weil die Frage „immer hörbar oder nur in Bewegung?" zwei
// richtige Antworten hat: Die NÄHE trägt den Grundton (ruhend findet man ihn),
// die BEWEGUNG den Rollanteil (rollend verrät er sich). So ist Stillstand
// Tarnung, ohne dass der Partner je ganz verschwindet.
//
// Rein und DOM-frei wie alles in core/ – Units in tests/buddy.test.ts.

/** Hörweite in Welteinheiten – wie beim Rivalen im Duell (RIVAL_HEAR = 520). */
export const BUDDY_HEAR = 520;
/** Ab diesem Anteil der Höchstgeschwindigkeit ist der Rollanteil voll da. */
export const BUDDY_ROLL_FULL = 0.6;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface BuddySound {
  /** 0 = zu weit weg, um ihn zu hören; 1 = direkt daneben */
  closeness: number;
  /** 0 = liegt still (nur Grundton); 1 = rollt deutlich */
  moving: number;
}

/** Nähe und Rollanteil des Partners. `dist` = Luftlinie in Welteinheiten,
 *  `speed`/`maxSpeed` seine Geschwindigkeit und die Obergrenze der Physik. */
export function buddySound(dist: number, speed: number, maxSpeed: number, hear = BUDDY_HEAR): BuddySound {
  const full = Math.max(1e-6, maxSpeed * BUDDY_ROLL_FULL);
  return { closeness: clamp01(1 - dist / hear), moving: clamp01(speed / full) };
}

/** Geglättete Geschwindigkeit: exponentielles Nachziehen mit Zeitkonstante
 *  `tau`. Die Geschwindigkeit des Partners kommt NICHT über das Netz – sie
 *  folgt aus zwei `state`-Nachrichten (alle 80 ms), und die Strecke dazwischen
 *  ist ruckelig: ungeglättet flattert der Rollanteil hörbar. Ein zusätzliches
 *  Protokollfeld hätte beide Seiten ohne Not auf dieselbe Version festgelegt.
 *  `dt ≤ 0` lässt den Wert stehen (zwei Meldungen im selben Millisekunden-
 *  Fenster sind keine Messung). */
export function smoothSpeed(prev: number, sample: number, dt: number, tau = 0.15): number {
  if (!(dt > 0)) return prev;
  return prev + (sample - prev) * (1 - Math.exp(-dt / tau));
}
