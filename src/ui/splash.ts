// Animierter Splash beim Laden: Ball rollt ein, Echo-Ringe, Logo, Version
// und Credits. Blendet sich nach kurzer Zeit aus (Tap überspringt);
// prefers-reduced-motion verkürzt, ?nosplash (E2E) unterdrückt ihn ganz.

import { t } from '../i18n';

export function showSplash(version: string): void {
  const el = document.getElementById('splash');
  if (!el) return;
  if (new URLSearchParams(location.search).has('nosplash')) {
    el.remove();
    return;
  }
  document.getElementById('splashCredit')!.textContent = t('splash.credit');
  document.getElementById('splashVersion')!.textContent = `v${version}`;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add('fade');
    setTimeout(() => el.remove(), 550);
  };
  el.addEventListener('pointerdown', close);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(close, reduced ? 1400 : 2600);
}
