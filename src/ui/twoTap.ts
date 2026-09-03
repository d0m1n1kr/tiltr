/**
 * ZWEI-TAP: Ein Knopf, der beim ersten Tap die Frage stellt und beim zweiten
 * ausführt. Eine Implementierung für Werkstatt UND Editor – vorher lag sie
 * nur in workshopPanel.ts, und der Editor hätte sie kopiert.
 */

/** Zurückstellen in BEIDEN Pfaden (Ausführen und 3-s-Ablauf): Sonst blieb
 *  der Knopf mit dem langen Bestätigungstext stehen. */
function disarm(b: HTMLButtonElement): void {
  b.dataset.armed = '';
  b.classList.remove('armed');
  b.closest('.ws-bundle-row')?.classList.remove('confirming');
  if (b.dataset.restText !== undefined) b.textContent = b.dataset.restText;
  if (b.dataset.restTip !== undefined) b.dataset.tip = b.dataset.restTip;
  delete b.dataset.restText;
  delete b.dataset.restTip;
}

/** Zwei-Tap-Bewaffnung eines Buttons: zweiter Tap innerhalb 3 s führt aus.
 *  In der Bundle-Leiste weichen die übrigen Aktionen, solange die Frage
 *  steht (`.confirming`) – die Frage ersetzt sie, statt die Zeile zu sprengen. */
export function twoTap(
  b: HTMLButtonElement,
  armedText: string,
  action: () => void,
  /** Eigener Tip für Icon-Knöpfe: Im Text steht dort nur „⚠", die FRAGE
   *  gehört in den Tip – sonst fragt der Knopf etwas, was niemand liest. */
  armedTip?: string,
): void {
  if (b.dataset.armed === '1') {
    disarm(b);
    action();
    return;
  }
  b.dataset.restText = b.textContent ?? '';
  if (b.dataset.tip !== undefined) b.dataset.restTip = b.dataset.tip;
  b.dataset.armed = '1';
  b.classList.add('armed');
  b.textContent = armedText;
  b.dataset.tip = armedTip ?? armedText;
  b.closest('.ws-bundle-row')?.classList.add('confirming');
  setTimeout(() => {
    if (b.dataset.armed === '1') disarm(b);
  }, 3000);
}
