/**
 * WEITERSAGEN (M85): Der Startscreen bekommt einen Teilen-Knopf für die APP –
 * nicht für ein Level. Rein und DOM-frei, damit die Nachricht prüfbar ist:
 * Werbetext in der aktuellen Sprache, dahinter die EINE Adresse.
 *
 * Warum eine Konstante und nicht `location.href`? Geteilt wird die App, nicht
 * der Tab: Aus dem Dev-Server oder einem Vorschau-Port käme sonst ein Link, den
 * niemand öffnen kann.
 */

/** Die eine Adresse der App (Live-Deploy, siehe README). */
export const APP_URL = 'https://d0m1n1kr.github.io/tiltr/';

/** Das Promo-GIF liegt daneben – als `og:image` für die Link-Vorschau und zum
 *  Mitschicken als Datei (`public/promo.gif`, erzeugt von tools/promo.mjs). */
export const PROMO_GIF_URL = `${APP_URL}promo.gif`;

/** Dateiname des GIFs im lokalen Bundle (relativ, damit es auch unter einem
 *  Unterpfad und im Dev-Server gefunden wird). */
export const PROMO_GIF_FILE = 'promo.gif';

export interface PromoShare {
  title: string;
  text: string;
  url: string;
}

/** Was Web Share bekommt. `title` und `text` kommen aus dem Wörterbuch der
 *  aktuellen Sprache – wer auf Französisch spielt, teilt auf Französisch. */
export function promoShare(title: string, text: string): PromoShare {
  return { title, text, url: APP_URL };
}

/** Fallback ohne Web Share: EIN Textblock für die Zwischenablage. Der Link
 *  steht in der letzten Zeile – Messenger machen daraus die Vorschau. */
export function promoClipboard(share: PromoShare): string {
  return `${share.text}\n${share.url}`;
}
