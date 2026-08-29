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

// --- Lauf 4: Kampagne – Levelauswahl, w1-01 gewinnen, Sterne, Freischaltung ---
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/`);

  await page.click('#campaignBtn');
  await page.waitForTimeout(200);
  const items = page.locator('.level-item');
  check(`Kampagnen-Liste zeigt 15 Level (${await items.count()})`, (await items.count()) === 15);
  const lockedCount = await page.locator('.level-item.locked').count();
  check(`nur Level 1 ist freigeschaltet (${15 - lockedCount} offen)`, lockedCount === 14);

  await items.first().click();
  await page.waitForTimeout(3300); // Kalibrier-Countdown
  const introTitle = (await page.textContent('#interTitle')).trim();
  check(`Kampagnen-Intro ("${introTitle}")`, introTitle.includes('Aufbruch'));
  await page.click('#interPrimary'); // Los!

  // Spine von w1-01: Spalte 0 hinab, dann unten nach rechts.
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(2600);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(2600);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(2300); // Sieg-Reveal + Ergebnis

  const resultTitle = (await page.textContent('#interTitle')).trim();
  check(`Kampagnen-Ergebnis mit Sternen ("${resultTitle}")`, /★/.test(resultTitle) && resultTitle.includes('Aufbruch'));

  await page.click('#interSecondary'); // Menü
  await page.click('#campaignBtn');
  await page.waitForTimeout(200);
  const lockedAfter = await page.locator('.level-item.locked').count();
  check(`Level 2 nach Sieg freigeschaltet (${15 - lockedAfter} offen)`, lockedAfter === 13);
  await page.close();
}

// --- Lauf 5: Multi-Ebenen (W2-01) – ?unlock, Weltsektionen, echter Warp ---
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?unlock`);

  await page.click('#campaignBtn');
  await page.waitForTimeout(200);
  const items = await page.locator('.level-item').count();
  const headers = await page.locator('.world-header').count();
  check(`Kampagne: 15 Level in 2 Welten (${items}/${headers})`, items === 15 && headers === 2);
  const locked = await page.locator('.level-item.locked').count();
  check('?unlock schaltet alles frei', locked === 0);

  await page.locator('.level-item').nth(10).click(); // W2-01 Unterführung
  await page.waitForTimeout(3300); // Countdown
  const introTitle = (await page.textContent('#interTitle')).trim();
  check(`W2-Intro ("${introTitle}")`, introTitle.includes('Unterführung'));
  await page.click('#interPrimary'); // Los!
  await page.waitForTimeout(200);

  const floor1 = (await page.textContent('#floor')).trim();
  check(`Ebenen-Anzeige im HUD ("${floor1}")`, floor1 === '⬍ E1');

  // Auf E1 nach rechts zum Transporter [4,0] rollen -> Warp nach E2
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(2400);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(1200); // Warp-Pause + Ankunft
  const floor2 = (await page.textContent('#floor')).trim();
  const pos = await page.evaluate(() => window.__tiltrBall);
  check(`Warp auf Ebene 2 (jetzt "${floor2}", Ball x=${pos.x.toFixed(0)})`, floor2 === '⬍ E2');
  await page.close();
}

// --- Lauf 6: Tages-Challenge – Menü-Status und Herausforderungs-Link ---
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/`);
  const status = (await page.textContent('#dailyStatus')).trim();
  check(`Daily-Status im Menü ("${status}")`, status === 'Heute noch offen');
  await page.close();
}
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/#daily=2026-01-05&t=42.3`);
  await page.waitForTimeout(300);
  const title = (await page.textContent('#interTitle')).trim();
  const text = (await page.textContent('#interText')).trim();
  check(`Herausforderung wird angeboten ("${title}")`, title.includes('Herausforderung') && text.includes('42.3 s'));
  check('Hash wurde aus der URL entfernt', await page.evaluate(() => location.hash === ''));

  await page.click('#interPrimary'); // Annehmen
  await page.waitForTimeout(3300); // Kalibrier-Countdown
  const intro = (await page.textContent('#interTitle')).trim();
  const introText = (await page.textContent('#interText')).trim();
  check(`Challenge-Intro mit Datum ("${intro}")`, intro.includes('05.01.2026'));
  check('Intro nennt die Zielzeit', introText.includes('42.3 s'));
  await page.click('#interPrimary'); // Los!
  await page.waitForTimeout(300);
  const floor = (await page.textContent('#floor')).trim();
  check(`Daily ist mehrstöckig ("${floor}")`, floor === '⬍ E1');
  await page.close();
}

// --- Lauf 7: Installations-Hinweis (Android-Pfad synthetisch, iOS per User-Agent) ---
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

// --- Lauf 6: Safe-Area-Pflichttest – nachgebildete Insets (iPhone 402x874,
// oben 62 / unten 34) UND Gegenprobe ohne. Die Fehler dieser Kategorie sind
// im Browser unsichtbar; dieser Lauf ersetzt das installierte Gerät. ---
{
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  // Tokens VOR dem ersten Render überschreiben: nach dem Theme-<link> injiziert,
  // gewinnt der Style per Kaskade (gleiche Spezifität, späterer Ursprung).
  await page.route(`${BASE}/`, async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace(
      '</head>',
      '<style>:root{--safe-top:62px;--safe-bottom:34px}</style></head>',
    );
    await route.fulfill({ response: res, body });
  });
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(300);

  const m = await page.evaluate(() => {
    const hud = document.getElementById('hud');
    hud.classList.remove('hidden'); // nur für die Messung
    const hudTop = hud.getBoundingClientRect().top;
    hud.classList.add('hidden');
    const canvas = document.getElementById('game').getBoundingClientRect();
    const banners = document.getElementById('banners').getBoundingClientRect();
    document.getElementById('galleryLink').click();
    const gallery = getComputedStyle(document.getElementById('gallery'));
    return {
      hudTop,
      canvasW: canvas.width,
      canvasH: canvas.height,
      bannersBottom: banners.bottom,
      galleryPadTop: gallery.paddingTop,
      galleryPadBottom: gallery.paddingBottom,
      bodyTouch: getComputedStyle(document.body).touchAction,
      gameTouch: getComputedStyle(document.getElementById('game')).touchAction,
      innerH: innerHeight,
      innerW: innerWidth,
    };
  });
  check(`HUD beginnt unter dem oberen Inset (top=${m.hudTop})`, m.hudTop === 62);
  check(`Canvas füllt den Layout-Viewport (${m.canvasW}x${m.canvasH})`, m.canvasW === m.innerW && m.canvasH === m.innerH);
  check(`Banner enden über dem Home-Indicator (bottom=${m.bannersBottom})`, m.bannersBottom === m.innerH - 34 - 16);
  check(`Panel-Padding respektiert Insets (${m.galleryPadTop}/${m.galleryPadBottom})`, m.galleryPadTop === '78px' && m.galleryPadBottom === '50px');
  check(`touch-action: body=${m.bodyTouch}, game=${m.gameTouch}`, m.bodyTouch === 'pan-x pan-y' && m.gameTouch === 'none');

  // Panels müssen scrollbar sein (der alte touch-action:none-Bug wäre hier unsichtbar,
  // aber die Struktur – overflow + genügend Inhalt – lässt sich prüfen).
  const scroll = await page.evaluate(() => {
    const g = document.getElementById('gallery');
    g.scrollTop = 200;
    return { scrolled: g.scrollTop > 0, overflows: g.scrollHeight > g.clientHeight };
  });
  check('Galerie-Panel ist scrollbar', scroll.scrolled && scroll.overflows);
  await page.close();
}
{
  // Gegenprobe ohne Insets (normaler Browser): alles bündig.
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/`);
  const m = await page.evaluate(() => {
    const hud = document.getElementById('hud');
    hud.classList.remove('hidden');
    const hudTop = hud.getBoundingClientRect().top;
    hud.classList.add('hidden');
    return {
      hudTop,
      canvasH: document.getElementById('game').getBoundingClientRect().height,
      bannersBottom: document.getElementById('banners').getBoundingClientRect().bottom,
      innerH: innerHeight,
    };
  });
  check(`Gegenprobe ohne Insets (hud=${m.hudTop}, banner=${m.bannersBottom})`,
    m.hudTop === 0 && m.canvasH === m.innerH && m.bannersBottom === m.innerH - 16);
  await page.close();
}

check('keine Konsolen-/Seitenfehler', errors.length === 0);
if (errors.length) console.log(errors);

await browser.close();
stop();
process.exit(failed ? 1 : 0);
