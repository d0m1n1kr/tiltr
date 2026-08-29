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
