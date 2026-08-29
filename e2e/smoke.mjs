// E2E-Smoke gegen den gebauten Stand (vite preview):
// Start-Flow, Achsen (synthetische Sensor-Events), Echo-Ping, keine Konsolenfehler.
// Läuft lokal (vorinstalliertes Chromium) und in CI (playwright install chromium).

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = 8765;
const BASE = `http://localhost:${PORT}`;
const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
});
const stop = () => preview.kill('SIGTERM');
process.on('exit', stop);

// Warten, bis der Preview-Server antwortet.
for (let i = 0; i < 50; i++) {
  try {
    const res = await fetch(BASE);
    if (res.ok) break;
  } catch {
    /* noch nicht bereit */
  }
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({
  executablePath,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
let failed = false;
const check = (name, cond) => {
  console.log(cond ? '✓' : '✗', name);
  if (!cond) failed = true;
};

// --- Lauf 1: Tastatur-Fallback, Ping, HUD (fester Seed => deterministisch) ---
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?seed=42`);

  const version = (await page.textContent('#version')).trim();
  check(`Version auf Startscreen ("${version}")`, /^v\d+\.\d+\.\d+/.test(version));

  await page.click('#galleryLink');
  await page.waitForTimeout(300);
  const galleryItems = await page.locator('.gallery-item').count();
  check(`Element-Galerie zeigt Einträge (${galleryItems})`, galleryItems >= 6);
  await page.click('#galleryClose');

  await page.click('#quickBtn');
  await page.waitForTimeout(3600); // Kalibrier-Countdown

  check('HUD sichtbar', !(await page.locator('#hud').getAttribute('class')).includes('hidden'));

  const pingsBefore = (await page.textContent('#pings')).trim();
  await page.keyboard.press(' ');
  await page.waitForTimeout(250);
  const pingsAfter = (await page.textContent('#pings')).trim();
  check(`Echo-Ping verbraucht ("${pingsBefore}" -> "${pingsAfter}")`, pingsBefore !== pingsAfter);

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowRight');
  const pos = await page.evaluate(() => window.__tiltrBall);
  check(`Ball rollt per Tastatur (x=${pos.x.toFixed(0)})`, pos.x > 70);
  await page.close();
}

// --- Lauf 2: Achsen mit synthetischen Sensor-Events (steil tippen, flach spielen) ---
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?seed=42`);
  const fire = (beta, gamma) =>
    page.evaluate(([b, g]) => {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: g }));
    }, [beta, gamma]);

  await page.click('#quickBtn');
  await fire(65, 1); // Handy steil zum Gesicht beim Tippen
  await page.waitForTimeout(1500);
  await fire(20, 0); // während des Countdowns flach hinlegen
  await page.waitForTimeout(2300); // Countdown endet -> Kalibrierung auf beta=20

  await fire(32, 0); // +12° nach vorn -> Ball rollt nach unten
  await page.waitForTimeout(700);
  const p1 = await page.evaluate(() => window.__tiltrBall);
  await fire(20, 12); // nach rechts kippen
  await page.waitForTimeout(700);
  const p2 = await page.evaluate(() => window.__tiltrBall);

  check(`Vertikal gerollt (y=${p1.y.toFixed(0)})`, p1.y > 60);
  check(`Horizontal gerollt (x=${p2.x.toFixed(0)})`, p2.x > p1.x + 10);
  await page.close();
}

// --- Lauf 3: Tutorial-Flow – Intro, Level 1 gewinnen, Ergebnis, Fortschritt ---
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/`);

  const progress = (await page.textContent('#tutorialProgress')).trim();
  check(`Tutorial-Fortschritt im Menü ("${progress}")`, progress === '(0/8)');

  await page.click('#tutorialBtn');
  await page.waitForTimeout(3300); // Kalibrier-Countdown
  const introTitle = (await page.textContent('#interTitle')).trim();
  check(`Tutorial-Intro erscheint ("${introTitle}")`, introTitle.includes('Rollen & Lauschen'));

  await page.click('#interPrimary'); // "Los!"
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(2600); // 3x2-Korridor: nach rechts rollen genügt
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(2200); // Sieg-Reveal + Ergebnis-Karte

  const resultTitle = (await page.textContent('#interTitle')).trim();
  const resultShown = !(await page.locator('#interstitial').getAttribute('class')).includes('hidden');
  check(`Ergebnis-Karte nach Sieg ("${resultTitle}")`, resultShown && resultTitle.includes('geschafft'));
  const nextLabel = (await page.textContent('#interPrimary')).trim();
  check(`Weiter-Knopf führt zum nächsten Level ("${nextLabel}")`, nextLabel === 'Weiter');

  // Fortschritt wurde persistiert -> zurück im Menü steht (1/8)
  await page.click('#interSecondary'); // "Menü"
  const progress2 = (await page.textContent('#tutorialProgress')).trim();
  check(`Fortschritt persistiert ("${progress2}")`, progress2 === '(1/8)');
  await page.close();
}

// --- Lauf 4: Installations-Hinweis (Android-Pfad synthetisch, iOS per User-Agent) ---
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?seed=42`);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
  await page.waitForTimeout(100);
  const shown = !(await page.locator('#installHint').getAttribute('class')).includes('hidden');
  check('Install-Hinweis erscheint (Android/beforeinstallprompt)', shown);
  const btnShown = !(await page.locator('#installBtn').getAttribute('class')).includes('hidden');
  check('Installieren-Knopf sichtbar (Android)', btnShown);

  await page.click('#installDismiss');
  const hiddenNow = (await page.locator('#installHint').getAttribute('class')).includes('hidden');
  await page.reload();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
  await page.waitForTimeout(100);
  const staysHidden = (await page.locator('#installHint').getAttribute('class')).includes('hidden');
  check('Dismiss blendet aus und wird gemerkt', hiddenNow && staysHidden);
  await page.close();
}
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?seed=42`);
  await page.waitForTimeout(200);
  const shown = !(await page.locator('#installHint').getAttribute('class')).includes('hidden');
  const text = (await page.textContent('#installLabel')).trim();
  check(`iOS-Hinweis mit Teilen-Anleitung ("${text.slice(0, 40)}…")`, shown && /Home-Bildschirm/.test(text));
  const btnHidden = (await page.locator('#installBtn').getAttribute('class')).includes('hidden');
  check('kein Installieren-Knopf auf iOS', btnHidden);
  await page.close();
}

check('keine Konsolen-/Seitenfehler', errors.length === 0);
if (errors.length) console.log(errors);

await browser.close();
stop();
process.exit(failed ? 1 : 0);
