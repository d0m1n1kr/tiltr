// NACHGLÜHEN (M94): Eine berührte Wand leuchtet auf und glüht nach – und zwar
// UMSO LÄNGER, je länger man an ihr entlangschrammt. Die Wand LÄDT SICH AUF.
//
// Vorher setzte jeder Kontaktframe dieselbe feste Frist (`litUntil = now +
// 1200`): Ein Streifschuss und ein zwei Sekunden langes Anlehnen hinterließen
// exakt dasselbe Bild. Damit verschenkte die Darstellung die einzige
// Rückmeldung, die im Dunkeln WIRKLICH etwas über den Raum sagt – wo man sich
// länger aufgehalten hat, bleibt eine Spur, und die hilft beim Zurückfinden.
//
// DIE KURVE IST EINE WURZEL, keine Gerade: Der erste Augenblick Kontakt soll
// am meisten zählen (das ist der Normalfall – anstoßen, weiterrollen), das
// lange Anlehnen läuft in eine Sättigung. Linear hätte den kurzen Rempler
// kaum vom mittleren unterschieden.
//
// Rein und DOM-frei wie alles in core/ – die Zeit kommt von außen herein
// (`now`), damit sie prüfbar bleibt. Units in tests/afterglow.test.ts.

/** Nachglühen nach dem kürzesten Kontakt (ms) – der bisherige Festwert. */
export const GLOW_BASE_MS = 1200;

/** Nachglühen bei voller Ladung (ms). */
export const GLOW_MAX_MS = 4200;

/** So lange Kontakt lädt bis zur Sättigung (ms). */
export const GLOW_CHARGE_MS = 1600;

/** Kontaktlücke, die eine Berührung noch als EINE zählt (ms). Ein rollender
 *  Ball berührt eine Wand nicht in jedem Bild – ohne diese Nachsicht begänne
 *  die Ladung beim Entlangschrammen ständig von vorn. */
export const GLOW_GAP_MS = 180;

/** Über diese letzte Spanne blendet das Nachglühen aus (Renderer). Ein Wert,
 *  eine Quelle: Wand, Platte und aufgedeckte Objekte blenden gleich aus. */
export const GLOW_FADE_MS = 1200;

/** Ladezustand eines berührbaren Dings. Liegt am Objekt (Wand, Platte). */
export interface GlowState {
  /** Beginn der laufenden Berührung (ms) */
  glowFrom?: number;
  /** letzter Kontaktframe (ms) */
  glowAt?: number;
  /** glüht nach bis (ms) */
  glowUntil?: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Ladung 0…1 nach `contactMs` ununterbrochener Berührung. */
export function glowCharge(contactMs: number): number {
  return Math.sqrt(clamp01(contactMs / GLOW_CHARGE_MS));
}

/** Wie lange glüht etwas nach, das `contactMs` lang berührt wurde? */
export function afterglowMs(contactMs: number): number {
  return GLOW_BASE_MS + (GLOW_MAX_MS - GLOW_BASE_MS) * glowCharge(contactMs);
}

/**
 * Ein Kontaktframe: fortsetzen oder neu beginnen, und daraus die neue Frist.
 *
 * Das Nachglühen wird dabei NIE KÜRZER (`Math.max`) – eine frische Berührung
 * an einer noch glühenden Wand würde sonst löschen, was sie gerade auflädt.
 */
export function glowTouch(prev: GlowState, now: number): Required<GlowState> {
  const running = prev.glowFrom !== undefined && prev.glowAt !== undefined && now - prev.glowAt <= GLOW_GAP_MS;
  const glowFrom = running ? prev.glowFrom! : now;
  const until = now + afterglowMs(now - glowFrom);
  return { glowFrom, glowAt: now, glowUntil: Math.max(prev.glowUntil ?? 0, until) };
}

/** Wie hell glüht es JETZT (0…1)? Voll, bis die letzte Spanne anbricht. */
export function glowNow(o: GlowState, now: number): number {
  const left = (o.glowUntil ?? 0) - now;
  return left <= 0 ? 0 : Math.min(1, left / GLOW_FADE_MS);
}
