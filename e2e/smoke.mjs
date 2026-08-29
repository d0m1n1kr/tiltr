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
  const page = await browser.newPage({ viewport: { width: 400, height: 800 }, locale: 'de-DE' });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?seed=28&nosplash`);

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

  const p0 = await page.evaluate(() => window.__tiltrBall);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowRight');
  const pos = await page.evaluate(() => window.__tiltrBall);
  check(`Ball rollt per Tastatur (dx=${(pos.x - p0.x).toFixed(0)})`, pos.x > p0.x + 40);

  // Ruhiges HUD: der Timer-Chip ändert seine Breite nicht, während die Zeit
  // läuft (tabular-nums + Mindestbreite) – nichts dahinter verschiebt sich.
  const w1 = await page.evaluate(() => document.getElementById('timer').getBoundingClientRect().width);
  await page.waitForTimeout(700);
  const w2 = await page.evaluate(() => document.getElementById('timer').getBoundingClientRect().width);
  check(`HUD: Timer-Chip breitenstabil (${w1} = ${w2})`, w1 === w2 && w1 > 0);
  await page.close();
}

// --- Lauf 2: Achsen mit synthetischen Sensor-Events (steil tippen, flach spielen) ---
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 }, locale: 'de-DE' });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?seed=28&nosplash`);
  const fire = (beta, gamma) =>
    page.evaluate(([b, g]) => {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: g }));
    }, [beta, gamma]);

  await page.click('#quickBtn');
  await fire(65, 1); // Handy steil zum Gesicht beim Tippen
  await page.waitForTimeout(1500);
  await fire(20, 0); // während des Countdowns flach hinlegen
  await page.waitForTimeout(2300); // Countdown endet -> Kalibrierung auf beta=20

  const p0 = await page.evaluate(() => window.__tiltrBall);
  await fire(32, 0); // +12° nach vorn -> Ball rollt nach unten
  await page.waitForTimeout(700);
  const p1 = await page.evaluate(() => window.__tiltrBall);
  await fire(20, 12); // nach rechts kippen
  await page.waitForTimeout(700);
  const p2 = await page.evaluate(() => window.__tiltrBall);

  check(`Vertikal gerollt (dy=${(p1.y - p0.y).toFixed(0)})`, p1.y > p0.y + 40);
  check(`Horizontal gerollt (dx=${(p2.x - p1.x).toFixed(0)})`, p2.x > p1.x + 10);

  // Rotation mitten im Spiel: das Canvas-Backing muss dem neuen Element-Rect
  // folgen (sonst ist alles verzerrt) – der ResizeObserver sichert das ab.
  await page.setViewportSize({ width: 800, height: 400 });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const c = document.getElementById('game');
    const dpr = Math.min(2, devicePixelRatio || 1);
    return { w: c.width, h: c.height, ew: Math.round(c.clientWidth * dpr), eh: Math.round(c.clientHeight * dpr) };
  });
  check(`Rotation: Canvas folgt dem Viewport (${m.w}x${m.h} = ${m.ew}x${m.eh})`, m.w === m.ew && m.h === m.eh && m.w > m.h);
  await page.close();
}

// --- Lauf 3: Tutorial-Flow – Intro, Level 1 gewinnen, Ergebnis, Fortschritt ---
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 }, locale: 'de-DE' });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

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
  const page = await browser.newPage({ viewport: { width: 400, height: 800 }, locale: 'de-DE' });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

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
  const page = await browser.newPage({ viewport: { width: 400, height: 800 }, locale: 'de-DE' });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?unlock&nosplash`);

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
  const page = await browser.newPage({ viewport: { width: 400, height: 800 }, locale: 'de-DE' });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);
  const status = (await page.textContent('#dailyStatus')).trim();
  check(`Daily-Status im Menü ("${status}")`, status === 'Heute noch offen');
  await page.close();
}
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 }, locale: 'de-DE' });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash#daily=2026-01-05&t=42.3`);
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
  const page = await browser.newPage({ viewport: { width: 400, height: 800 }, locale: 'de-DE' });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?seed=42&nosplash`);
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
    locale: 'de-DE',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?seed=42&nosplash`);
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
  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, locale: 'de-DE' });
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
  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, locale: 'de-DE' });
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

// --- Lauf 9: Multiplayer Coop – zwei Tabs über den LocalTransport
// (BroadcastChannel, Raumcode "TEST…"): Host + QR/Code, Beitritt, Bereit-Flow,
// Druckplatte öffnet die Tür des Partners, beide im Ziel, Rematch, Disconnect. ---
{
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, locale: 'de-DE' });
  const pageA = await ctx.newPage(); // Host
  const pageB = await ctx.newPage(); // Gast
  for (const p of [pageA, pageB]) {
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    p.on('pageerror', (e) => errors.push(String(e)));
  }

  await pageA.goto(`${BASE}/?mpcode=TESTE2E&nosplash`);
  await pageA.click('#mpBtn');
  const coopCount = await pageA.locator('#mpLevelList .level-item').count();
  await pageA.click('[data-mpmode="race"]');
  const raceCount = await pageA.locator('#mpLevelList .level-item').count();
  await pageA.click('[data-mpmode="coop"]');
  check(`MP-Panel: 5 Coop- und 5 Race-Level (${coopCount}/${raceCount})`, coopCount === 5 && raceCount === 5);

  await pageA.locator('#mpLevelList .level-item').first().click(); // coop-01 Schleuse
  await pageA.waitForTimeout(300);
  const qrHtml = await pageA.innerHTML('#mpQr');
  const codeShown = (await pageA.textContent('#mpCode')).trim();
  check(`Lobby zeigt QR-Code + Raumcode ("${codeShown}")`, qrHtml.includes('<svg') && codeShown === 'TESTE2E');

  await pageB.goto(`${BASE}/?nosplash`);
  await pageB.click('#mpBtn');
  await pageB.fill('#mpCodeInput', 'TESTE2E');
  await pageB.click('#mpJoinBtn');
  await pageB.waitForTimeout(600);

  const introA = (await pageA.textContent('#interTitle')).trim();
  const introB = (await pageB.textContent('#interTitle')).trim();
  check(`Beide sehen das Coop-Intro ("${introA}")`, introA.includes('Schleuse') && introB.includes('Schleuse'));

  await pageA.click('#interPrimary'); // Bereit!
  await pageB.click('#interPrimary');
  await pageA.waitForTimeout(4200); // Kalibrier-Countdown beider Seiten

  const hudA = !(await pageA.locator('#hud').getAttribute('class')).includes('hidden');
  const hudB = !(await pageB.locator('#hud').getAttribute('class')).includes('hidden');
  const overlayA = (await pageA.locator('#overlay').getAttribute('class')).includes('hidden');
  const overlayB = (await pageB.locator('#overlay').getAttribute('class')).includes('hidden');
  check('Coop startet auf beiden Seiten (HUD sichtbar, Menü zu)', hudA && hudB && overlayA && overlayB);

  // A rollt nach rechts – B empfängt die Position (Datenbasis des Partner-Halos).
  await pageA.keyboard.down('ArrowRight');
  await pageA.waitForTimeout(2600);
  await pageA.keyboard.up('ArrowRight');
  await pageA.waitForTimeout(400);
  const remoteAtB = await pageB.evaluate(() => window.__tiltrMp?.remote);
  check(`B kennt A's Position für den Halo (x=${remoteAtB?.x?.toFixed(0)})`, !!remoteAtB && remoteAtB.x > 200);

  // B rollt zur äußeren Druckplatte: rechts, runter (die Tür stoppt ihn),
  // dann links in die Sackgassen-Nische [4,4].
  await pageB.keyboard.down('ArrowRight');
  await pageB.waitForTimeout(2600);
  await pageB.keyboard.up('ArrowRight');
  await pageB.keyboard.down('ArrowDown');
  await pageB.waitForTimeout(2600);
  await pageB.keyboard.up('ArrowDown');
  await pageB.keyboard.down('ArrowLeft');
  await pageB.waitForTimeout(1000);
  await pageB.keyboard.up('ArrowLeft');
  await pageB.waitForTimeout(800);
  const holdsB = await pageB.evaluate(() => window.__tiltrMp?.localHolds ?? []);
  const remoteHoldsA = await pageA.evaluate(() => window.__tiltrMp?.remoteHolds ?? []);
  check(`B hält die Platte, A's Tür ist offen (${JSON.stringify(holdsB)})`, holdsB.includes('g1') && remoteHoldsA.includes('g1'));

  // A rollt durch die offene Tür ins Ziel, friert ein und hält die innere Platte.
  await pageA.keyboard.down('ArrowDown');
  await pageA.waitForTimeout(2600);
  await pageA.keyboard.up('ArrowDown');
  await pageA.waitForTimeout(600);
  const finA = await pageA.evaluate(() => window.__tiltrMp?.localFinished);
  const statusA = (await pageA.textContent('#status')).trim();
  check(`A ist im Ziel und wartet ("${statusA}")`, finA === true && statusA.includes('Warte auf deinen Partner'));

  // B verlässt die Platte – die Tür bleibt offen, weil A im Ziel die innere hält.
  await pageB.keyboard.down('ArrowRight');
  await pageB.waitForTimeout(1000);
  await pageB.keyboard.up('ArrowRight');
  await pageB.keyboard.down('ArrowDown');
  await pageB.waitForTimeout(1600);
  await pageB.keyboard.up('ArrowDown');
  await pageB.waitForTimeout(2600); // Ergebnis-Karte erscheint nach 1,8 s

  const resultA = (await pageA.textContent('#interTitle')).trim();
  const resultB = (await pageB.textContent('#interTitle')).trim();
  check(`Coop-Sieg auf beiden Seiten ("${resultA}")`, resultA.includes('Gemeinsam geschafft') && resultB.includes('Gemeinsam geschafft'));

  // Rematch: beide klicken "Nochmal" – startet sofort neu (ohne Countdown).
  await pageA.click('#interPrimary');
  await pageB.click('#interPrimary');
  await pageA.waitForTimeout(800);
  const rematchPhase = await pageA.evaluate(() => window.__tiltrMp?.phase);
  check(`Rematch startet sofort (phase=${rematchPhase})`, rematchPhase === 'playing');

  // Disconnect: B geht weg (pagehide -> @bye) -> A zeigt den 10s-Countdown.
  // Synthetisch ausgelöst: beim echten Tab-Schließen flusht der
  // BroadcastChannel nicht zuverlässig, der Handler ist derselbe.
  await pageB.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await pageA.waitForTimeout(800);
  const statusGone = (await pageA.textContent('#status')).trim();
  check(`Disconnect-Countdown bei A ("${statusGone}")`, statusGone.includes('Verbindung verloren'));

  await ctx.close();
}

// --- Lauf 9b: iOS-Standalone-Viewport – zwei Zustände nachgebildet.
// (A) status-bar-style 'black': Container liegt UNTER der Statusbar, es gibt
//     eine Lücke zu screen.height, aber env oben = 0 -> KEINE Eingriffe.
// (B) Alt-Installation 'black-translucent': Lücke UND Insel-Überlappung
//     (env oben > 0) -> --app-height/--safe-top-fallback gleichen aus. ---
{
  const mkPage = async (envTopPx) => {
    const page = await browser.newPage({ viewport: { width: 400, height: 800 }, locale: 'de-DE' });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript((envTop) => {
      const origMatch = window.matchMedia.bind(window);
      window.matchMedia = (q) =>
        q === '(display-mode: standalone)'
          ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
          : origMatch(q);
      Object.defineProperty(Screen.prototype, 'width', { get: () => 400 });
      Object.defineProperty(Screen.prototype, 'height', { get: () => 855 });
      if (envTop > 0) {
        // env() lässt sich nicht faken – das Mess-Element (#vp-env-probe)
        // bekommt seinen top-Wert stattdessen per gepatchtem Rect.
        const orig = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function () {
          const r = orig.call(this);
          if (this.id === 'vp-env-probe') {
            return { top: envTop, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, x: r.x, y: envTop };
          }
          return r;
        };
      }
    }, envTopPx);
    await page.goto(`${BASE}/?nosplash`);
    await page.waitForTimeout(300);
    return page;
  };
  const dump = (page) =>
    page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const hud = document.getElementById('hud');
      hud.classList.remove('hidden');
      const hudTop = hud.getBoundingClientRect().top;
      hud.classList.add('hidden');
      return {
        appHeight: cs.getPropertyValue('--app-height').trim(),
        overlayH: document.getElementById('overlay').getBoundingClientRect().height,
        gameH: document.getElementById('game').getBoundingClientRect().height,
        canvasBackingH: document.getElementById('game').height,
        hudTop,
        bannersBottom: document.getElementById('banners').getBoundingClientRect().bottom,
      };
    });

  // (A) Lücke, aber env oben 0: Container unter der Statusbar -> nichts anfassen.
  {
    const page = await mkPage(0);
    const m = await dump(page);
    check(`Standalone 'black' (env oben 0): keine Eingriffe (app-h="${m.appHeight}", overlay=${m.overlayH})`,
      m.appHeight === '' && m.overlayH === 800 && m.gameH === 800 && m.hudTop === 0 && m.bannersBottom === 800 - 16);
    await page.close();
  }

  // (B) Alt-Zustand translucent: Lücke + Insel-Überlappung -> ausgleichen.
  {
    const page = await mkPage(62);
    const m = await dump(page);
    check(`Standalone translucent (env oben 62): Vollflächen bis 855 (overlay=${m.overlayH}, game=${m.gameH})`,
      m.appHeight === '855px' && m.overlayH === 855 && m.gameH === 855);
    check(`Standalone translucent: Canvas-Backing folgt (h=${m.canvasBackingH})`, m.canvasBackingH === 855);
    check(`Standalone translucent: HUD unter der Insel (top=${m.hudTop})`, m.hudTop === 55);
    check(`Standalone translucent: Banner an der echten Unterkante (bottom=${m.bannersBottom})`, m.bannersBottom === 855 - 16);
    await page.close();
  }
}

// --- Lauf 10: Splash – Version + Credits, verschwindet von selbst ---
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 }, locale: 'de-DE' });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(200);
  const splashShown = await page.locator('#splash').isVisible();
  const splashVersion = (await page.textContent('#splashVersion')).trim();
  const splashCredit = (await page.textContent('#splashCredit')).trim();
  check(
    `Splash mit Version + Credits ("${splashVersion}" / "${splashCredit}")`,
    splashShown && /^v\d+\.\d+\.\d+$/.test(splashVersion) && splashCredit.includes('Dominik Rössler') && splashCredit.includes('Claude'),
  );
  await page.waitForTimeout(3400); // Auto-Fade nach ~2,6 s + Ausblenden
  check('Splash verschwindet von selbst', (await page.locator('#splash').count()) === 0);

  // Debug-Ansicht ist versteckt und wird mit 5 Taps auf die Version freigeschaltet.
  const debugHidden = (await page.locator('#debugBtn').getAttribute('class')).includes('hidden');
  for (let i = 0; i < 5; i++) await page.click('#version');
  const debugShown = !(await page.locator('#debugBtn').getAttribute('class')).includes('hidden');
  const diag = (await page.textContent('#diag')).trim();
  check(`Debug-Knopf + Viewport-Diagnose nach 5 Version-Taps ("${diag.slice(0, 40)}…")`,
    debugHidden && debugShown && diag.startsWith('scr ') && diag.includes('env '));

  // Grundton = Spielfeld-Ton: kein heller Streifen neben dem Canvas möglich.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(`Body-Grundton ist bg-deep (${bg})`, bg === 'rgb(5, 7, 15)');
  await page.close();
}

// --- Lauf 11: i18n – Auto-Detect (en-US), manueller Wechsel, Persistenz ---
{
  const page = await browser.newPage({ viewport: { width: 400, height: 800 }, locale: 'en-US' });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  const lang = await page.evaluate(() => document.documentElement.lang);
  const dailyEn = (await page.textContent('#dailyStatus')).trim();
  const quickEn = (await page.textContent('#quickBtn')).trim();
  check(`Browser-Locale en-US => Englisch (lang=${lang}, "${dailyEn}")`, lang === 'en' && dailyEn === 'Still open today' && quickEn.includes('Quick Game'));

  // Neues Menü: 5 Modus-Karten, Tutorial als Einstieg empfohlen
  const modeItems = await page.locator('#modeList .mode-item').count();
  const suggested = await page.locator('#tutorialBtn.suggest').count();
  check(`Startscreen: 5 Modus-Karten, Tutorial empfohlen (${modeItems}/${suggested})`, modeItems === 5 && suggested === 1);

  // Galerie übersetzt (erster Registry-Eintrag: Loch -> "Hole")
  await page.click('#galleryLink');
  await page.waitForTimeout(300);
  const firstTitle = (await page.locator('.gallery-item h3').first().textContent()).trim();
  check(`Galerie auf Englisch ("${firstTitle}")`, firstTitle === 'Hole');
  await page.click('#galleryClose');

  // Manueller Wechsel auf FR + Persistenz über Reload
  await page.click('[data-lang="fr"]');
  const dailyFr = (await page.textContent('#dailyStatus')).trim();
  check(`Sprachwechsel auf FR ("${dailyFr}")`, dailyFr.includes('Encore ouvert'));
  await page.reload();
  await page.waitForTimeout(200);
  const dailyFr2 = (await page.textContent('#dailyStatus')).trim();
  const langFr = await page.evaluate(() => document.documentElement.lang);
  check(`FR überlebt Reload (lang=${langFr})`, langFr === 'fr' && dailyFr2.includes('Encore ouvert'));
  await page.close();
}

check('keine Konsolen-/Seitenfehler', errors.length === 0);
if (errors.length) console.log(errors);

await browser.close();
stop();
process.exit(failed ? 1 : 0);
