// iOS-Standalone-Viewport (empirisch per Geräte-Diagnose, docs/DESIGN.md):
// Mit status-bar-style 'black-translucent' bemisst iOS den PWA-Container
// "Screen minus Statusbar", verankert ihn aber oben AM Screenrand – unten
// fehlt genau Statusbarhöhe (unbemalbarer schwarzer Balken), env() meldet
// oben die Insel (62), innerHeight bleibt zu klein (812 bei 874-Screen).
// Seit dem Wechsel auf 'black' liegt der Container UNTER der Statusbar
// (Größe und Position stimmen überein) – dann ist hier nichts zu tun.
//
// Für Alt-Installationen (translucent eingebrannt, bis zur Neuinstallation)
// bleibt der Ausgleich aktiv: Er erkennt den kaputten Zustand daran, dass
// eine Lücke (screen − innerHeight) UND eine Insel-Überlappung (env oben > 0)
// zusammenkommen, und setzt --app-height/--vp-gap/--safe-top-fallback.

/** env(safe-area-inset-top) in px – per Mess-Element, da CSS-seitig nur als
 *  Wert nutzbar. Das Element trägt eine feste id (auch für Tests). */
function measureEnvTop(): number {
  const probe = document.createElement('div');
  probe.id = 'vp-env-probe';
  probe.style.cssText =
    'position:fixed;left:0;width:1px;height:1px;visibility:hidden;pointer-events:none;' +
    'top:env(safe-area-inset-top,0px);';
  document.body.append(probe);
  const top = Math.round(probe.getBoundingClientRect().top);
  probe.remove();
  return top;
}

export function fixStandaloneViewport(): void {
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (!standalone) return;

  const apply = (): void => {
    // iOS lässt screen.width/height bei Rotation in Portrait-Orientierung –
    // die Zielhöhe daher über die aktuelle Orientierung wählen.
    const landscape = matchMedia('(orientation: landscape)').matches;
    const target = landscape
      ? Math.min(screen.width, screen.height)
      : Math.max(screen.width, screen.height);
    const gap = Math.round(target - innerHeight);
    const root = document.documentElement.style;
    if (gap > 8 && gap < 120 && measureEnvTop() > 8) {
      root.setProperty('--app-height', `${target}px`);
      root.setProperty('--vp-gap', `${gap}px`);
      root.setProperty('--safe-top-fallback', `${gap}px`);
    } else {
      root.removeProperty('--app-height');
      root.removeProperty('--vp-gap');
      root.removeProperty('--safe-top-fallback');
    }
  };

  apply();
  window.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);
}

/** Eine Zeile Geräte-Wahrheit für die Debug-Ansicht: Screen-/Viewport-Maße,
 *  echte env()-Insets (Mess-Element), 100lvh, gesetzte --app-height, Modus. */
export function viewportDiagnostics(): string {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;width:1px;visibility:hidden;pointer-events:none;' +
    'top:env(safe-area-inset-top,0px);bottom:env(safe-area-inset-bottom,0px);';
  document.body.append(probe);
  const r = probe.getBoundingClientRect();
  const envTop = Math.round(r.top);
  const envBottom = Math.round(innerHeight - r.bottom);
  probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:100lvh;visibility:hidden;pointer-events:none;';
  const lvh = Math.round(probe.getBoundingClientRect().height);
  probe.remove();
  const appH = getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim();
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return [
    `scr ${screen.width}×${screen.height}`,
    `in ${innerWidth}×${innerHeight}`,
    `vv ${Math.round(window.visualViewport?.height ?? 0)}`,
    `lvh ${lvh}`,
    `env ${envTop}/${envBottom}`,
    `app-h ${appH || '–'}`,
    standalone ? 'standalone' : 'browser',
  ].join(' · ');
}
