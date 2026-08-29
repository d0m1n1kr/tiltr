// iOS-Standalone-Viewport-Bug (empirisch, siehe docs/DESIGN.md "Safe-Area"):
// In der installierten PWA ist der Layout-Viewport um die Statusbar-Höhe zu
// KURZ und startet trotzdem am oberen Screenrand. Folgen:
//  - fixed inset:0 endet ~55pt über dem unteren Screenrand (sichtbarer Streifen),
//  - env(safe-area-inset-top) meldet 0 (Logo unter der Dynamic Island),
//  - env(safe-area-inset-bottom) meldet Statusbar+Home-Indicator (~89px).
// Messbare Wahrheit: screen.height (orientierungsbewusst) minus innerHeight.
// Daraus setzen wir --app-height (Vollflächen bis zum echten Screenrand),
// --vp-gap (Korrektur für bottom-verankerte Elemente) und einen
// --safe-top-fallback in Höhe der Lücke (= Statusbar/Island).

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
    if (gap > 8 && gap < 120) {
      // Klassisches iOS-Gegenmittel: height=device-height zwingt den zu kurz
      // angelegten Standalone-Viewport auf die Gerätehöhe. Nur zur Laufzeit
      // und nur im kaputten Zustand injiziert, damit der Browser-Modus
      // (Toolbars!) unberührt bleibt. Greift es, wird gap 0 und die
      // CSS-Variablen unten räumen sich beim nächsten resize selbst weg.
      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      const content = meta?.getAttribute('content') ?? '';
      if (meta && !content.includes('height=')) {
        meta.setAttribute('content', `${content}, height=device-height`);
      }
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
 *  echte env()-Insets (per Mess-Element), gesetzte --app-height, Modus. */
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
