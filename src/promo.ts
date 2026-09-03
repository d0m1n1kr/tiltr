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

/** Das Promo-GIF liegt daneben und reist als `og:image` in der Link-Vorschau
 *  (`public/promo.gif`, erzeugt von tools/promo.mjs). MITGESCHICKT wird es
 *  nicht: Auf dem Gerät gemessen kam bei `share({files, text})` nur die Datei
 *  an, der Text mit dem Link fiel weg (M86b) – und ein Promo ohne Link ist
 *  wertlos. Deshalb ist das erste Bild des GIFs das Schaubild der Vorschau. */
export const PROMO_GIF_URL = `${APP_URL}promo.gif`;

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

/**
 * EINE Nachricht: Werbetext und Link in einem Block – als Bildunterschrift zum
 * GIF und als Inhalt für die Zwischenablage.
 *
 * Warum der Link IM Text und nicht daneben (`url`)? Wer Datei UND Text teilt,
 * hat nur ein Textfeld, das ankommt: Übergibt man zusätzlich `url` (oder
 * `title`), entscheidet die Ziel-App, was sie davon nimmt – und lässt gern das
 * Falsche weg (Lektion 2.11.4). Steht der Link in der letzten Textzeile, kann
 * er nicht einzeln verloren gehen, und Messenger machen daraus die Vorschau.
 */
export function promoCaption(share: PromoShare): string {
  return `${share.text}\n${share.url}`;
}
