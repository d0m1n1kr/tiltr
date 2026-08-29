// Service-Worker-Updates: prüft beim Laden und periodisch, ob eine neue
// Version deployt wurde, und zeigt dann einen Hinweis mit Update-Knopf.

import { registerSW } from 'virtual:pwa-register';

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // alle 10 Minuten

export function setupUpdates(): void {
  const toast = document.getElementById('updateToast')!;
  const label = document.getElementById('updateLabel')!;
  const btn = document.getElementById('updateBtn')!;

  const updateSW = registerSW({
    async onNeedRefresh() {
      // version.json wird NetworkOnly ausgeliefert und trägt die NEUE Version.
      let text = 'Neue Version verfügbar';
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`);
        if (res.ok) {
          const info = (await res.json()) as { version?: string };
          if (info.version) text = `Neue Version v${info.version} verfügbar`;
        }
      } catch {
        /* offline o. ä. – generischer Text reicht */
      }
      label.textContent = text;
      toast.classList.remove('hidden');
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Check beim Laden …
      void registration.update();
      // … und periodisch, solange die App offen ist.
      setInterval(() => void registration.update(), CHECK_INTERVAL_MS);
    },
  });

  btn.addEventListener('click', () => void updateSW(true));
}
