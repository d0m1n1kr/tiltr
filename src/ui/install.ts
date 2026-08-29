// Installations-Hinweis (PWA): Android/Chrome bekommt einen echten
// "Installieren"-Knopf (beforeinstallprompt), iOS Safari eine kurze Anleitung
// über das Teilen-Menü. Dismiss merkt sich die Entscheidung 14 Tage.

const DISMISS_KEY = 'tiltr.installDismissedAt';
const DISMISS_DAYS = 14;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS meldet sich als "Macintosh", hat aber Touch.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function isDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function setupInstallHint(): void {
  const hint = document.getElementById('installHint')!;
  const label = document.getElementById('installLabel')!;
  const installBtn = document.getElementById('installBtn')!;
  const dismissBtn = document.getElementById('installDismiss')!;

  if (isStandalone() || isDismissed()) return;

  const hide = () => hint.classList.add('hidden');

  dismissBtn.addEventListener('click', () => {
    hide();
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* Private Mode o. ä. */
    }
  });

  // Android/Chromium: echtes Install-Prompt anbieten.
  let deferred: BeforeInstallPromptEvent | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    label.textContent = 'tiltr als App installieren – offline & im Vollbild.';
    installBtn.classList.remove('hidden');
    hint.classList.remove('hidden');
  });
  installBtn.addEventListener('click', async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    if (choice.outcome === 'accepted') hide();
  });
  window.addEventListener('appinstalled', hide);

  // iOS Safari: kein beforeinstallprompt – Anleitung zeigen.
  if (isIOS()) {
    label.textContent = 'Als App installieren: Teilen-Symbol (□↑) tippen, dann „Zum Home-Bildschirm".';
    installBtn.classList.add('hidden');
    hint.classList.remove('hidden');
  }
}

// Während des Spiels soll der Hinweis nicht im Weg sein.
export function hideInstallHint(): void {
  document.getElementById('installHint')?.classList.add('hidden');
}
