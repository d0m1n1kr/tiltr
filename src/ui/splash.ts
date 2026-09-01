// Animierter Splash beim Laden, in drei Akten (Zeiten und Kurven in
// index.html, Abschnitt „Splash"):
//
//   1. EINROLLEN  Die Kugel kommt von UNTEN in die Bühne, ein Echo-Ring
//                 pingt bei der Ankunft.
//   2. TITEL      Logo, Credit und Version blenden gestaffelt ein und
//                 bleiben kurz stehen.
//   3. ABROLLEN   Die Kugel rollt nach OBEN aus dem Bild, der Splash-Grund
//                 wird frei, und GLEICHZEITIG fährt der Startscreen von
//                 unten herein.
//
// Der Menü-Transform lebt an `body.splashing` – ohne diese Klasse hat
// #overlay keinen Transform. Damit sehen `?nosplash` (E2E) und
// prefers-reduced-motion nichts von der Inszenierung, und ein abgebrochener
// Splash kann das Menü nicht unter dem Bildrand vergessen.
//
// Ein Tap überspringt: Er startet Akt 3 sofort, statt hart abzuschneiden –
// die Kugel geht immer sichtbar von der Bühne.

import { t } from '../i18n';

/** Wann Akt 3 beginnt. Die Schrift ist bei ~1,85 s vollständig da, der
 *  Titel steht also gut eine halbe Sekunde, bevor die Bühne räumt. */
const HOLD_MS = 2300;
/** Verkürzt bei prefers-reduced-motion: nur zeigen, nicht zelebrieren. */
const HOLD_REDUCED_MS = 1200;
/** Sicherheitsnetz, falls `animationend` ausfällt (Tab im Hintergrund,
 *  Animationen per Systemeinstellung aus). Muss LÄNGER sein als Akt 3
 *  (160 ms Schrift + 640 ms Menü-Fahrt = 800 ms), sonst schneidet es die
 *  Einfahrt ab. */
const LEAVE_FALLBACK_MS = 1500;

export function showSplash(version: string): void {
  const el = document.getElementById('splash');
  if (!el) return;
  if (new URLSearchParams(location.search).has('nosplash')) {
    el.remove();
    return;
  }
  document.getElementById('splashCredit')!.textContent = t('splash.credit');
  document.getElementById('splashVersion')!.textContent = `v${version}`;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const overlay = document.getElementById('overlay');
  // Menü parkt unter dem Bildrand, bis es hereinfährt.
  document.body.classList.add('splashing');

  let leaving = false;
  let finished = false;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    el.remove();
    document.body.classList.remove('splashing', 'splash-leaving');
  };

  const leave = (): void => {
    if (leaving) return;
    leaving = true;
    // Reduced Motion: nichts inszenieren, nichts hinauszögern – Bühne aus.
    if (reduced) {
      finish();
      return;
    }
    el.classList.add('leave');
    document.body.classList.add('splash-leaving');
    // Fertig ist, wenn die MENÜ-FAHRT endet – nicht nach einer zweiten,
    // parallel gepflegten Zahl. So kann das Timing nicht auseinanderlaufen.
    // `ev.target === overlay`, weil animationend BUBBELT: Eine Animation an
    // irgendeinem Kind des Menüs würde die Fahrt sonst früh abschneiden.
    overlay?.addEventListener('animationend', (ev) => {
      if (ev.target === overlay) finish();
    });
    setTimeout(finish, LEAVE_FALLBACK_MS);
  };

  el.addEventListener('pointerdown', leave);
  setTimeout(leave, reduced ? HOLD_REDUCED_MS : HOLD_MS);
}
