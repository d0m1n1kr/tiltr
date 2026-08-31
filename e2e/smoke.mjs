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

  // M11: der Mittel-Generator würfelt Kristall, Sog-Anker und Glasboden mit.
  const wc = await page.evaluate(() => window.__tiltrWorld);
  check(
    `Quick (Mittel) enthält M11-Elemente (✦${wc?.crystals} ⊙${wc?.anchors} ▦${wc?.glass})`,
    !!wc && wc.crystals === 1 && wc.anchors === 1 && wc.glass === 1,
  );

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
  check(`Kampagnen-Liste zeigt 28 Level (${await items.count()})`, (await items.count()) === 28);
  const lockedCount = await page.locator('.level-item.locked').count();
  check(`nur Level 1 ist freigeschaltet (${28 - lockedCount} offen)`, lockedCount === 27);

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
  // Blind-Stern: der Lauf kam ohne einen einzigen Ping aus -> 🌑 in der Karte.
  const resultText = (await page.textContent('#interText')).trim();
  check(`Blind-Stern in der Ergebnis-Karte ("${resultText.split('\n').pop()}")`, resultText.includes('🌑'));

  await page.click('#interSecondary'); // Menü
  await page.click('#campaignBtn');
  await page.waitForTimeout(200);
  const lockedAfter = await page.locator('.level-item.locked').count();
  check(`Level 2 nach Sieg freigeschaltet (${28 - lockedAfter} offen)`, lockedAfter === 26);
  const firstMeta = (await page.locator('.level-item .level-meta').first().textContent()).trim();
  check(`Blind-Stern 🌑 in der Levelliste ("${firstMeta}")`, firstMeta.includes('🌑'));

  // Geist-Replay: derselbe Level nochmal – die eben gespeicherte Bestzeit
  // rollt jetzt als blasser Halo mit (Hook: __tiltrGhost).
  await page.locator('.level-item').first().click(); // Sensoren sind schon aktiv: kein Countdown
  await page.waitForTimeout(400);
  await page.click('#interPrimary'); // Los!
  await page.waitForTimeout(600);
  const ghostInfo = await page.evaluate(() => window.__tiltrGhost);
  check(
    `Geist-Replay der Bestzeit läuft mit (time=${ghostInfo?.time?.toFixed?.(1)})`,
    !!ghostInfo && typeof ghostInfo.time === 'number' && ghostInfo.active === true,
  );
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
  check(`Kampagne: 28 Level in 4 Welten (${items}/${headers})`, items === 28 && headers === 4);
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
  check(`MP-Panel: je 6 Level + 🎲 Zufall (${coopCount}/${raceCount})`, coopCount === 7 && raceCount === 7);

  await pageA.locator('#mpLevelList .level-item:not(#mpRandomBtn)').first().click(); // coop-01 Schleuse
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

  // Zufallslevel: Host würfelt, der Gast regeneriert es aus der ID (Seed).
  const pageC = await ctx.newPage();
  const pageD = await ctx.newPage();
  for (const p of [pageC, pageD]) {
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    p.on('pageerror', (e) => errors.push(String(e)));
  }
  await pageC.goto(`${BASE}/?mpcode=TESTR01&nosplash`);
  await pageC.click('#mpBtn');
  await pageC.click('#mpRandomBtn');
  await pageC.waitForTimeout(300);
  const rndLobby = !(await pageC.locator('#mpLobby').getAttribute('class')).includes('hidden');
  const rndQr = (await pageC.innerHTML('#mpQr')).includes('<svg');
  check('Zufallslevel: Lobby mit QR erscheint sofort', rndLobby && rndQr);

  await pageD.goto(`${BASE}/?nosplash`);
  await pageD.click('#mpBtn');
  await pageD.fill('#mpCodeInput', 'TESTR01');
  await pageD.click('#mpJoinBtn');
  await pageD.waitForTimeout(600);
  const rndIntroC = (await pageC.textContent('#interTitle')).trim();
  const rndIntroD = (await pageD.textContent('#interTitle')).trim();
  check(`Zufallslevel: beide sehen das Intro ("${rndIntroD}")`, rndIntroC.includes('Zufallslevel') && rndIntroD.includes('Zufallslevel'));

  await pageC.click('#interPrimary');
  await pageD.click('#interPrimary');
  await pageC.waitForTimeout(4200);
  const idC = await pageC.evaluate(() => window.__tiltrMp?.levelId);
  const idD = await pageD.evaluate(() => window.__tiltrMp?.levelId);
  const phaseC = await pageC.evaluate(() => window.__tiltrMp?.phase);
  check(`Zufallslevel: beide spielen DASSELBE regenerierte Level (${idC})`,
    phaseC === 'playing' && typeof idC === 'string' && idC.startsWith('mpq-coop-') && idC === idD);

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

  // Neues Menü: 6 Modus-Karten, Tutorial als Einstieg empfohlen
  const modeItems = await page.locator('#modeList .mode-item').count();
  const suggested = await page.locator('#tutorialBtn.suggest').count();
  check(`Startscreen: 6 Modus-Karten, Tutorial empfohlen (${modeItems}/${suggested})`, modeItems === 6 && suggested === 1);

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

// --- Lauf 12: Werkstatt – Tablet-Dreispalter, Element platzieren, Badges,
// Preview mit ✏️-Rücksprung, Speichern, Bibliothek; Phone-Gegenprobe. ---
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, locale: 'de-DE' });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  // Tablet-Menü (≥900px): Modus-Karten zweispaltig in verbreiterter Mitte,
  // Schnellstart als Querzeile – und der Footer passt ohne Scrollen auf
  // 1024x768 (Querformat war vorher abgeschnitten).
  const menu = await page.evaluate(() => ({
    cols: getComputedStyle(document.getElementById('modeList')).gridTemplateColumns.split(' ').length,
    width: document.getElementById('menuButtons').getBoundingClientRect().width,
    quickDir: getComputedStyle(document.getElementById('quickGroup')).flexDirection,
    footerBottom: document.getElementById('menuFooter').getBoundingClientRect().bottom,
    vh: innerHeight,
  }));
  check(`Tablet-Menü: 2 Spalten, breite Mitte (${menu.cols} Spalten, ${Math.round(menu.width)}px)`,
    menu.cols === 2 && menu.width > 600 && menu.quickDir === 'row');
  check(`Tablet-Menü: Footer ohne Scrollen sichtbar (${Math.round(menu.footerBottom)} <= ${menu.vh})`,
    menu.footerBottom <= menu.vh);

  await page.click('#workshopBtn');
  const wsShown = !(await page.locator('#workshop').getAttribute('class')).includes('hidden');
  check('Werkstatt-Panel öffnet', wsShown);

  // Werkstatt-Start: Aktionen als Modus-Karten (Icon + Titel + Untertitel)
  // statt umbrechender Buttons – auf dem Tablet als Drei-Spalten-Grid.
  const wsGrid = await page.evaluate(() => ({
    cols: getComputedStyle(document.getElementById('workshopActions')).gridTemplateColumns.split(' ').length,
    card: !!document.querySelector('#wsNewBtn .mode-title') && !!document.querySelector('#wsNewBtn .mode-sub'),
  }));
  check(`Werkstatt-Aktionen als Karten-Grid (${wsGrid.cols} Spalten)`, wsGrid.cols === 3 && wsGrid.card);
  await page.click('#wsNewBtn');
  await page.waitForTimeout(500);
  const edShown = !(await page.locator('#editor').getAttribute('class')).includes('hidden');
  const cols = await page.evaluate(() => getComputedStyle(document.getElementById('edBody')).gridTemplateColumns);
  check(`Editor öffnet als Tablet-Dreispalter (${cols})`, edShown && cols.split(' ').length === 3);

  // Phone-Chrome (Element-Button, Drawer-Griff) existiert, bleibt hier aber
  // unsichtbar – der Dreispalter zeigt Palette und Eigenschaften direkt.
  const chromeHidden = await page.evaluate(() => {
    const gone = (id) => {
      const el = document.getElementById(id);
      return !!el && getComputedStyle(el).display === 'none';
    };
    return gone('edElementBtn') && gone('edDrawerHandle');
  });
  check('Tablet: Element-Button und Drawer-Griff nur auf dem Phone', chromeHidden);

  // Icon-Buttons erklären sich: [data-tip]-Blase beim Hover (Desktop) …
  await page.hover('#edShare');
  await page.waitForTimeout(300);
  const tipDesk = await page.evaluate(() => {
    const s = getComputedStyle(document.getElementById('edShare'), '::after');
    return { content: s.content, opacity: s.opacity };
  });
  check(`Tablet: Tooltip am Icon-Button beim Hover (${tipDesk.content} / ${tipDesk.opacity})`,
    tipDesk.content.toLowerCase().includes('teilen') && tipDesk.opacity === '1');

  // Live-Badges: das leere 6x8-Level ist beweisbar gesund (alle grün).
  const badges = await page.locator('#edBadges .ed-badge').count();
  const failed = await page.locator('#edBadges .ed-badge.fail').count();
  check(`Live-Validierung: ${badges} Badges, ${failed} rot`, badges >= 6 && failed === 0);

  // Loch in die Zellmitte (3,4) setzen – Screen-Punkt exakt aus dem
  // Editor-Transform berechnet (Hook __tiltrEd).
  const before = await page.evaluate(() => window.__tiltrEd?.elements);
  const pt = await page.evaluate(() => {
    const ed = window.__tiltrEd;
    const box = document.getElementById('edCanvas').getBoundingClientRect();
    return { x: box.left + (ed.ox + 350 * ed.scale) / ed.dpr, y: box.top + (ed.oy + 450 * ed.scale) / ed.dpr };
  });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__tiltrEd?.elements);
  const propsText = (await page.textContent('#edProps')).trim();
  check(`Element platziert (${before} -> ${after})`, before === 0 && after === 1 && propsText.includes('Auswahl'));

  // Belegt-Regeln: dieselbe Zelle nochmal antippen wählt das Element AUS
  // statt ein zweites zu stapeln; Start-/Zielzellen bleiben ganz frei.
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
  const sameCell = await page.evaluate(() => ({ n: window.__tiltrEd.elements, sel: window.__tiltrEd.selected }));
  check(`Tap auf bestehendes Element wählt aus statt zu stapeln (n=${sameCell.n}, sel=${sameCell.sel})`,
    sameCell.n === 1 && sameCell.sel === 0);
  const ptStart = await page.evaluate(() => {
    const ed = window.__tiltrEd;
    const box = document.getElementById('edCanvas').getBoundingClientRect();
    return { x: box.left + (ed.ox + 50 * ed.scale) / ed.dpr, y: box.top + (ed.oy + 50 * ed.scale) / ed.dpr };
  });
  await page.mouse.click(ptStart.x, ptStart.y);
  await page.waitForTimeout(300);
  const startTry = await page.evaluate(() => window.__tiltrEd.elements);
  const takenMsg = (await page.textContent('#edStatus')).trim();
  check(`Start-Zelle bleibt frei ("${takenMsg}")`, startTry === 1 && takenMsg.includes('belegt'));

  // Preview: Testen -> echte Spielschleife mit ✏️-Rücksprung.
  await page.click('#edTest');
  await page.waitForTimeout(3600); // Kalibrier-Countdown
  const hudShown = !(await page.locator('#hud').getAttribute('class')).includes('hidden');
  const editBtnShown = !(await page.locator('#editBtn').getAttribute('class')).includes('hidden');
  const homeHidden = (await page.locator('#homeBtn').getAttribute('class')).includes('hidden');
  const ball = await page.evaluate(() => window.__tiltrBall);
  check('Preview läuft in der Spielschleife (HUD + ✏️ + Ball, 🏠 versteckt)', hudShown && editBtnShown && homeHidden && !!ball);
  await page.click('#editBtn');
  await page.waitForTimeout(300);
  const backInEditor = !(await page.locator('#editor').getAttribute('class')).includes('hidden');
  const stillOne = await page.evaluate(() => window.__tiltrEd?.elements);
  check(`✏️ führt zurück in den Editor (Entwurf erhalten: ${stillOne} Element)`, backInEditor && stillOne === 1);

  // Speichern -> Bibliothek zeigt das Level, Menü zählt es.
  await page.click('#edSave');
  const savedMsg = (await page.textContent('#edStatus')).trim();
  await page.click('#edClose');
  await page.click('#workshopBtn');
  const items = await page.locator('.ws-item').count();
  const wsName = (await page.textContent('.ws-name')).trim();
  await page.click('#workshopClose');
  const count = (await page.textContent('#workshopCount')).trim();
  check(`Speichern + Bibliothek ("${savedMsg}" / "${wsName}" / ${count})`,
    savedMsg.includes('Gespeichert') && items === 1 && wsName === 'Mein Level' && count === '(1)');

  // Normales Spielen aus der Bibliothek (kein Editor-Preview): 🏠 ist wieder
  // da, ✏️ nicht – nur der Preview bindet den Rückweg an den Editor.
  await page.click('#workshopBtn');
  await page.locator('#workshopList .ws-actions .btn-primary').first().click(); // ▶ Spielen
  await page.waitForTimeout(600);
  const homeShown = !(await page.locator('#homeBtn').getAttribute('class')).includes('hidden');
  const editHidden = (await page.locator('#editBtn').getAttribute('class')).includes('hidden');
  check('Bibliothek-Spielen: 🏠 sichtbar, ✏️ versteckt', homeShown && editHidden);
  await page.close();
}
{
  // Phone-Gegenprobe: unter 900px wird der Editor zur Leisten-Ansicht.
  // Dazu die drei Phone-Regressionen: Karte bleibt nach dem Layout-Settle
  // und nach Viewport-Resizes sichtbar (Renderer-Backing-Reset löscht den
  // Canvas – der Editor muss selbst neu malen), der Kopf bleibt kompakt
  // (einzeilige Badge-Leiste), und das Wand-Werkzeug trifft die NÄCHSTE
  // Kante statt einer 10-px-Fingerzone.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'de-DE', hasTouch: true });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  // Gegenprobe: unter 900px bleibt das Menü die bewährte Phone-Säule.
  const menuCols = await page.evaluate(() => getComputedStyle(document.getElementById('modeList')).gridTemplateColumns);
  check(`Phone-Menü bleibt einspaltig (${menuCols})`, menuCols === 'none');

  await page.click('#workshopBtn');
  const wsCols = await page.evaluate(() => getComputedStyle(document.getElementById('workshopActions')).gridTemplateColumns);
  check(`Phone: Werkstatt-Karten gestapelt (${wsCols})`, wsCols === 'none');
  await page.click('#wsNewBtn');
  await page.waitForTimeout(1200); // Layout-Settle: hier verschwand die Karte
  const cols = await page.evaluate(() => getComputedStyle(document.getElementById('edBody')).gridTemplateColumns);
  check(`Phone-Editor: eine Spalte (${cols})`, cols.split(' ').length === 1);

  // Wand-Blau mit debug-Alpha 0.55 über bgDeep ≈ RGB(62, 95, 147).
  const mapVisible = () => page.evaluate(() => {
    const c = document.getElementById('edCanvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 45 && d[i] < 80 && d[i + 1] > 75 && d[i + 1] < 115 && d[i + 2] > 120 && d[i + 2] < 170) return true;
    }
    return false;
  });
  check('Phone: Karte nach Layout-Settle sichtbar', await mapVisible());
  await page.setViewportSize({ width: 390, height: 700 }); // Browser-Toolbar-Effekt
  await page.waitForTimeout(600);
  check('Phone: Karte nach Toolbar-Resize weiterhin sichtbar', await mapVisible());

  const bodyTop = await page.evaluate(() => document.getElementById('edBody').getBoundingClientRect().top);
  check(`Phone: kompakter Editor-Kopf (Karte ab y=${bodyTop})`, bodyTop < 240);

  // Phone-Umbau: das Spielfeld dominiert – Palette ist eine kompakte
  // Werkzeugleiste, Elemente wählt man in einem Grid-Sheet, Eigenschaften
  // liegen in einem Drawer unten. Die Karte bekommt >55% der Höhe.
  const mapShare = await page.evaluate(
    () => document.getElementById('edCanvasWrap').getBoundingClientRect().height / innerHeight,
  );
  check(`Phone: Spielfeld dominiert (${Math.round(mapShare * 100)}% der Höhe)`, mapShare > 0.55);

  const tapPhone = async (cx, cy) => {
    const pt = await page.evaluate(([x, y]) => {
      const ed = window.__tiltrEd;
      const box = document.getElementById('edCanvas').getBoundingClientRect();
      return { x: box.left + (ed.ox + x * ed.scale) / ed.dpr, y: box.top + (ed.oy + y * ed.scale) / ed.dpr };
    }, [cx * 100 + 50, cy * 100 + 50]);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(250);
  };

  // Element-Wahl: Button öffnet ein Grid-Sheet (mehrspaltig, kein
  // einzeiliges Horizontal-Scrollen mehr), Auswahl schließt es.
  const elBtn = await page.locator('#edElementBtn:visible').count();
  let sheetCols = 0;
  let sheetClosed = false;
  if (elBtn === 1) {
    await page.click('#edElementBtn');
    sheetCols = await page.evaluate(
      () => getComputedStyle(document.getElementById('edElements')).gridTemplateColumns.split(' ').length,
    );
    await page.locator('#edElements .ed-tile', { hasText: 'Glasboden' }).click();
    sheetClosed = await page.evaluate(
      () => getComputedStyle(document.getElementById('edElements')).display === 'none',
    );
  }
  check(`Phone: Element-Wahl als Grid-Sheet (${sheetCols} Spalten)`, elBtn === 1 && sheetCols >= 3 && sheetClosed);

  // Eigenschaften-Drawer: Tap auf ein Element öffnet ihn, der Griff schließt.
  const drawerY = () => page.evaluate(() => {
    const tf = getComputedStyle(document.getElementById('edDrawer')).transform;
    return tf === 'none' ? 0 : new DOMMatrixReadOnly(tf).m42;
  });
  const hasDrawer = await page.locator('#edDrawer').count();
  let openY = -1;
  let closedY = -1;
  if (hasDrawer === 1 && elBtn === 1) {
    await tapPhone(1, 1); // Glasboden platzieren …
    await tapPhone(1, 1); // … und antippen: auswählen + Drawer öffnen
    openY = await drawerY();
    await page.click('#edDrawerHandle');
    await page.waitForTimeout(400);
    closedY = await drawerY();
  }
  check(`Phone: Auswahl öffnet den Eigenschaften-Drawer (y=${Math.round(openY)})`,
    hasDrawer === 1 && openY === 0);
  check(`Phone: Drawer-Griff schließt wieder (y=${Math.round(closedY)})`,
    hasDrawer === 1 && closedY > 50);

  // Drawer-Kopf identifiziert das Element (Galerie-Icon + Name) und hat
  // ein ✕ zum Schließen – der Griff allein war nicht selbsterklärend.
  let handleInfo = { text: '(fehlt)', icon: 0 };
  let closeY = -1;
  if (hasDrawer === 1 && elBtn === 1) {
    await tapPhone(1, 1); // Glasboden erneut auswählen -> Drawer auf
    handleInfo = await page.evaluate(() => ({
      text: document.getElementById('edDrawerHandle')?.textContent?.trim() ?? '(fehlt)',
      icon: document.querySelectorAll('#edDrawerHandle canvas').length,
    }));
    if (await page.locator('#edDrawerClose:visible').count()) {
      await page.click('#edDrawerClose');
      await page.waitForTimeout(400);
      closeY = await drawerY();
    }
  }
  check(`Phone: Drawer-Kopf zeigt Element-Icon + Name ("${handleInfo.text}")`,
    handleInfo.icon === 1 && handleInfo.text.includes('Glasboden'));
  check(`Phone: ✕ schließt den Drawer (y=${Math.round(closeY)})`, closeY > 50);

  // … und auf Touch per Fokus nach dem Tap (title-Attribute können das
  // nicht): Tap aufs Werkzeug zeigt die Blase mit dem Namen.
  if (await page.locator('#edTool-select').count()) {
    await page.tap('#edTool-select');
    await page.waitForTimeout(300);
  }
  const tipPhone = await page.evaluate(() => {
    const b = document.getElementById('edTool-select');
    if (!b) return { content: 'fehlt', opacity: '0', focused: false };
    const s = getComputedStyle(b, '::after');
    return { content: s.content, opacity: s.opacity, focused: document.activeElement === b };
  });
  check(`Phone: Tooltip nach Tap auf Icon-Button (${tipPhone.content} / ${tipPhone.opacity})`,
    tipPhone.content.includes('Auswählen') && tipPhone.opacity === '1' && tipPhone.focused);

  // Wand-Werkzeug: Tap 30 Welteinheiten neben der Gridlinie (alte Zone: 18)
  // schaltet die nächste Kante trotzdem (carve +1).
  await page.locator('.ed-tile', { hasText: '▤' }).click();
  const pt = await page.evaluate(() => {
    const ed = window.__tiltrEd;
    const box = document.getElementById('edCanvas').getBoundingClientRect();
    return { x: box.left + (ed.ox + 130 * ed.scale) / ed.dpr, y: box.top + (ed.oy + 150 * ed.scale) / ed.dpr };
  });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
  const edits = await page.evaluate(() => ({ carve: window.__tiltrEd.carve, add: window.__tiltrEd.add }));
  check(`Phone: Wand-Tap neben der Linie trifft die nächste Kante (carve=${edits.carve})`, edits.carve === 1 && edits.add === 0);
  await page.close();
}

// --- Lauf 13: Werkstatt-Teilen – Mehr-Ebenen mit Transporter-Paar, Share-Link
// (deflate im Hash), Empfang auf zweiter Seite, Import per Einfügen. ---
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'de-DE' });
  const pageA = await ctx.newPage();
  pageA.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  pageA.on('pageerror', (e) => errors.push(String(e)));
  await pageA.goto(`${BASE}/?nosplash`);
  await pageA.click('#workshopBtn');
  await pageA.click('#wsNewBtn');
  await pageA.waitForTimeout(500);

  // Zweite Ebene anlegen (Tab ＋) -> aktiv ist E2.
  await pageA.locator('#edFloorTabs .chip', { hasText: '＋' }).click();
  await pageA.waitForTimeout(300);
  const floors = await pageA.evaluate(() => ({ n: window.__tiltrEd?.floors, active: window.__tiltrEd?.activeFloor }));
  check(`Ebenen-Tabs: zweite Ebene angelegt (E${(floors.active ?? 0) + 1} von ${floors.n})`, floors.n === 2 && floors.active === 1);

  // Transporter-Paar: E1 -> E2 und zurück (Zwei-Tap mit Tab-Wechsel).
  const tapCell = async (cx, cy) => {
    const pt = await pageA.evaluate(([x, y]) => {
      const ed = window.__tiltrEd;
      const box = document.getElementById('edCanvas').getBoundingClientRect();
      return { x: box.left + (ed.ox + x * ed.scale) / ed.dpr, y: box.top + (ed.oy + y * ed.scale) / ed.dpr };
    }, [cx * 100 + 50, cy * 100 + 50]);
    await pageA.mouse.click(pt.x, pt.y);
    await pageA.waitForTimeout(250);
  };
  const tab = (label) => pageA.locator('#edFloorTabs .chip', { hasText: label }).first();
  await pageA.locator('.ed-tile', { hasText: 'Transporter' }).click();
  await tab('E1').click();
  await tapCell(2, 2); // Pad auf E1 …
  await tab('E2').click();
  await tapCell(1, 1); // … Ziel auf E2
  await tapCell(4, 4); // Rückweg-Pad auf E2 …
  await tab('E1').click();
  await tapCell(3, 3); // … Ziel auf E1
  await pageA.waitForTimeout(600);
  const e1Count = await pageA.evaluate(() => window.__tiltrEd?.elements);
  const failCount = await pageA.locator('#edBadges .ed-badge.fail').count();
  check(`Transporter-Paar über zwei Ebenen, alle Beweise grün (E1: ${e1Count} Element, ${failCount} rot)`,
    e1Count === 1 && failCount === 0);

  // Share-Link erzeugen (nur mit grünen Pflicht-Badges möglich).
  await pageA.fill('#edName', 'Ebenen-Probe');
  await pageA.dispatchEvent('#edName', 'change');
  await pageA.click('#edShare');
  await pageA.waitForTimeout(400);
  const shareUrl = await pageA.evaluate(() => window.__tiltrShareUrl);
  check(`Share-Link erzeugt (deflate, ${shareUrl?.length ?? 0} Zeichen)`,
    typeof shareUrl === 'string' && shareUrl.includes('#level=1') && shareUrl.length < 4000);

  // Empfang auf einer zweiten Seite: Interstitial -> in die Werkstatt übernehmen.
  const pageB = await ctx.newPage();
  pageB.on('pageerror', (e) => errors.push(String(e)));
  await pageB.goto(shareUrl.replace(BASE, '') ? shareUrl : shareUrl); // vollständige URL inkl. Hash
  await pageB.waitForTimeout(600);
  const shareTitle = (await pageB.textContent('#interTitle')).trim();
  const shareText = (await pageB.textContent('#interText')).trim();
  check(`Geteiltes Level wird angeboten ("${shareTitle}")`,
    shareTitle.includes('Geteiltes Level') && shareText.includes('Ebenen-Probe'));
  check('Level-Hash wurde aus der URL entfernt', await pageB.evaluate(() => location.hash === ''));
  await pageB.click('#interSecondary'); // In die Werkstatt
  await pageB.waitForTimeout(300);
  const wsOpen = !(await pageB.locator('#workshop').getAttribute('class')).includes('hidden');
  const wsName = (await pageB.textContent('.ws-name')).trim();
  check(`Übernommen: Werkstatt zeigt "${wsName}"`, wsOpen && wsName === 'Ebenen-Probe');

  // Import per Einfügen (Tablet-Weg ohne Datei).
  await pageB.click('#wsImportBtn');
  await pageB.fill('#wsImportText', JSON.stringify({
    id: 'custom-e2e-import', name: 'Import-Probe', pingBudget: 3,
    floors: [{ size: [4, 4], maze: { seed: 5 }, elements: [], start: [0, 0], goal: [3, 3] }],
  }));
  await pageB.click('#wsImportGo');
  await pageB.waitForTimeout(200);
  const importMsg = (await pageB.textContent('#wsImportStatus')).trim();
  const wsItems = await pageB.locator('.ws-item').count();
  check(`Import per Einfügen ("${importMsg}", ${wsItems} Level)`, importMsg.includes('importiert') && wsItems === 2);
  await ctx.close();
}

// --- Lauf 14: Editor-Verknüpfungen – Tür ohne Öffner ist ein normaler
// Zwischenzustand (Badge „Verknüpfungen" statt Load-Exception), Auto-Link auf
// die NÄCHSTE Tür, 🔗-Tap-Verknüpfen, global eindeutige Tür-IDs, aufräumendes
// Löschen, Rename mit Referenz-Umhängen, Transporter-Ziel neu wählbar. ---
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, locale: 'de-DE' });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);
  await page.click('#workshopBtn');
  await page.click('#wsNewBtn');
  await page.waitForTimeout(500);

  const tap = async (cx, cy, edge = null) => {
    const pt = await page.evaluate(([cx, cy, edge]) => {
      const ed = window.__tiltrEd;
      const box = document.getElementById('edCanvas').getBoundingClientRect();
      let wx = cx * 100 + 50;
      let wy = cy * 100 + 50;
      if (edge === 'e') wx = (cx + 1) * 100;
      if (edge === 's') wy = (cy + 1) * 100;
      return { x: box.left + (ed.ox + wx * ed.scale) / ed.dpr, y: box.top + (ed.oy + wy * ed.scale) / ed.dpr };
    }, [cx, cy, edge]);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(250);
  };
  const els = (fl = 0) => page.evaluate((fl) => window.__tiltrEd.def.floors[fl].elements, fl);
  const status = async () => (await page.textContent('#edStatus')).trim();

  // Tür ohne Öffner: lädt weiter (Loader mild), nur „Verknüpfungen" ist rot.
  await page.locator('.ed-tile', { hasText: /^Tür$/ }).click();
  await tap(2, 2, 'e');
  await page.waitForTimeout(500); // Validate-Debounce
  const doorState = await page.evaluate(() => ({
    loadError: window.__tiltrEd.loadError,
    badges: [...document.querySelectorAll('#edBadges .ed-badge')].map((b) => b.textContent),
  }));
  check('Tür ohne Öffner lädt – Badge „Verknüpfungen" statt Load-Exception',
    doorState.loadError === null &&
    doorState.badges.some((b) => b === '✓ Lädt') &&
    doorState.badges.some((b) => b === '✗ Verknüpfungen'));

  // Zweite Tür + Schlüssel daneben: Auto-Link auf die NÄCHSTE Tür.
  await tap(4, 5, 's');
  await page.locator('.ed-tile', { hasText: /^Schlüssel & Tür$/ }).click();
  await tap(4, 6);
  let key = (await els()).find((e) => e.type === 'key');
  check(`Auto-Link auf die nächstgelegene Tür (${key?.opens})`, key?.opens === 'tor2');

  // 🔗-Tap: Schlüssel auswählen, „Tür wählen", Tür 1 antippen.
  await page.locator('.ed-tile', { hasText: '☝' }).first().click();
  await tap(4, 6);
  await page.locator('#edProps .ed-link').click();
  await tap(2, 2, 'e');
  key = (await els()).find((e) => e.type === 'key');
  check(`🔗-Tap verknüpft um ("${await status()}")`, key?.opens === 'tor1' && (await status()).includes('tor1'));

  // Tür-IDs sind GLOBAL eindeutig: die neue Tür auf E2 heißt tor3.
  await page.locator('#edFloorTabs .chip', { hasText: '＋' }).click();
  await page.locator('.ed-tile', { hasText: /^Tür$/ }).click();
  await tap(2, 2, 'e');
  const e2Door = (await els(1)).find((e) => e.type === 'door');
  check(`Tür-ID global eindeutig über Ebenen (${e2Door?.id})`, e2Door?.id === 'tor3');

  // Tür 1 löschen: der Schlüssel wird auf die nächste verbleibende Tür
  // derselben Ebene umgehängt statt ins Leere zu zeigen.
  await page.locator('#edFloorTabs .chip', { hasText: 'E1' }).first().click();
  await page.locator('.ed-tile', { hasText: '☝' }).first().click();
  await tap(2, 2, 'e');
  await page.locator('#edProps .btn-ghost', { hasText: '⌫' }).click();
  await page.waitForTimeout(300);
  key = (await els()).find((e) => e.type === 'key');
  check(`Tür löschen hängt Öffner um ("${await status()}")`,
    key?.opens === 'tor2' && (await status()).includes('umgehängt'));

  // Rename: alle Referenzen ziehen mit.
  await tap(4, 5, 's');
  await page.locator('#edProps input[type=text]').fill('haupttor');
  await page.locator('#edProps input[type=text]').press('Enter');
  await page.waitForTimeout(300);
  key = (await els()).find((e) => e.type === 'key');
  const renamed = (await els()).find((e) => e.type === 'door');
  check(`Tür-Rename zieht Referenzen mit (${renamed?.id} / ${key?.opens})`,
    renamed?.id === 'haupttor' && key?.opens === 'haupttor');

  // Transporter-Ziel per 🔗 neu wählen – auch über Ebenen (Pad E1, Ziel E2).
  await page.locator('.ed-tile', { hasText: 'Transporter' }).click();
  await tap(1, 6);
  await tap(3, 6);
  await page.locator('.ed-tile', { hasText: '☝' }).first().click();
  await tap(1, 6);
  await page.locator('#edProps .ed-link').click();
  await page.locator('#edFloorTabs .chip', { hasText: 'E2' }).first().click();
  await tap(2, 5);
  const pad = (await els(0)).find((e) => e.type === 'transporter');
  check(`Transporter-Ziel per 🔗 neu gewählt (E${(pad?.target?.floor ?? -1) + 1} ${JSON.stringify(pad?.target?.cell)})`,
    pad?.target?.floor === 1 && pad?.target?.cell?.[0] === 2 && pad?.target?.cell?.[1] === 5);

  await page.close();
}

// --- Lauf 15: Bearbeitungs-Draft – jede Änderung landet im localStorage
// (Reload-fest, „Weiter an …" in der Werkstatt), Neu/Zufall/Bearbeiten
// verwerfen den Draft nur nach Zwei-Tap-Bestätigung, Speichern räumt ihn. ---
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, locale: 'de-DE' });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);
  await page.click('#workshopBtn');
  await page.click('#wsNewBtn');
  await page.waitForTimeout(500);

  const tap = async (cx, cy) => {
    const pt = await page.evaluate(([x, y]) => {
      const ed = window.__tiltrEd;
      const box = document.getElementById('edCanvas').getBoundingClientRect();
      return { x: box.left + (ed.ox + x * ed.scale) / ed.dpr, y: box.top + (ed.oy + y * ed.scale) / ed.dpr };
    }, [cx * 100 + 50, cy * 100 + 50]);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(250);
  };
  const editorOpen = async () => !(await page.locator('#editor').getAttribute('class')).includes('hidden');

  // Bearbeitung: Loch setzen, Name ändern – dann RELOAD (PWA-Realität:
  // Tab stirbt, App-Wechsel). Die Werkstatt bietet danach „Weiter an …".
  await tap(1, 1);
  await page.fill('#edName', 'Draft-Probe');
  await page.dispatchEvent('#edName', 'change');
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForTimeout(800);
  await page.click('#workshopBtn');
  const resumeVisible = await page.locator('#wsResumeBtn:visible').count();
  const resumeText = resumeVisible ? (await page.textContent('#wsResumeBtn')).trim() : '(fehlt)';
  check(`Draft überlebt den Reload: „Weiter an …" in der Werkstatt ("${resumeText}")`,
    resumeVisible === 1 && resumeText.includes('Draft-Probe'));

  let resumedEls = -1;
  if (resumeVisible) {
    await page.click('#wsResumeBtn');
    await page.waitForTimeout(500);
    resumedEls = await page.evaluate(() => window.__tiltrEd?.elements);
  }
  check(`Fortsetzen öffnet den Editor mit dem Draft (${resumedEls} Element)`,
    resumedEls === 1 && (await editorOpen()));

  // „Neu" bei vorhandenem Draft: erster Tap warnt (Editor bleibt zu),
  // zweiter Tap startet wirklich leer. (Klicks abgesichert, damit der
  // Rot-Lauf ohne Feature nicht in Timeouts läuft.)
  const ensureWorkshop = async () => {
    if (await editorOpen()) {
      await page.click('#edClose');
      await page.waitForTimeout(200);
    }
    if ((await page.locator('#workshop').getAttribute('class')).includes('hidden')) {
      await page.click('#workshopBtn');
      await page.waitForTimeout(200);
    }
  };
  await ensureWorkshop();
  await page.click('#wsNewBtn');
  await page.waitForTimeout(300);
  const armedText = (await page.textContent('#wsNewBtn')).trim();
  const stillClosed = !(await editorOpen());
  check(`„Neu" verlangt Bestätigung, solange ein Draft existiert ("${armedText}")`,
    stillClosed && armedText.includes('Sicher'));
  if (stillClosed) {
    await page.click('#wsNewBtn');
    await page.waitForTimeout(500);
  }
  const blankEls = await page.evaluate(() => window.__tiltrEd?.elements);
  check(`Zweiter Tap startet leer (${blankEls} Elemente)`, stillClosed && (await editorOpen()) && blankEls === 0);

  // Speichern legt das Level in die Bibliothek UND räumt den Draft weg:
  // kein „Weiter an …" mehr für bereits Gesichertes.
  if (await editorOpen()) await page.click('#edSave');
  await ensureWorkshop();
  const hasResumeBtn = await page.locator('#wsResumeBtn').count();
  const resumeAfterSave = await page.locator('#wsResumeBtn:visible').count();
  check('Speichern räumt den Draft (kein „Weiter an …" mehr)', hasResumeBtn === 1 && resumeAfterSave === 0);
  await page.close();
}

// --- Lauf 16: Geist-Duell – ein gewonnener Lauf wird zur Herausforderung
// (Link mit Level + Spur + Zeit), der Empfänger rennt gegen die echte Spur.
// Zusätzlich: kaputte Tokens werden abgewiesen, unplausible Spuren treten
// ohne Geist an (der Beweis greift im echten Flow). ---
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'de-DE' });
  const pageA = await ctx.newPage();
  pageA.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  pageA.on('pageerror', (e) => errors.push(String(e)));
  await pageA.goto(`${BASE}/?nosplash`);

  // Ein Level, das in einer Sekunde zu gewinnen ist: Ziel direkt unter dem
  // Start, Wand dazwischen aufgeschnitten. Kommt per Einfüge-Import rein.
  const sprint = {
    id: 'custom-sprint',
    name: 'Sprint',
    pingBudget: 3,
    parTimeS: 30,
    floors: [
      {
        size: [4, 5],
        maze: { seed: 3, carve: [[[0, 0], 's']] },
        elements: [],
        start: [0, 0],
        goal: [0, 1],
      },
    ],
  };
  // Absendername (optional, im Menü-Footer): macht das Duell persönlich.
  if (await pageA.locator('#playerName').count()) {
    await pageA.fill('#playerName', 'Dominik');
    await pageA.dispatchEvent('#playerName', 'change');
  }
  await pageA.click('#workshopBtn');
  await pageA.click('#wsImportBtn');
  await pageA.fill('#wsImportText', JSON.stringify(sprint));
  await pageA.click('#wsImportGo');
  await pageA.waitForTimeout(300);
  await pageA.locator('#workshopList .ws-actions .btn-primary').first().click(); // ▶ Spielen
  await pageA.waitForTimeout(3800); // Kalibrier-Countdown

  // Mit der Pfeiltaste nach unten ins Ziel rollen.
  await pageA.keyboard.down('ArrowDown');
  await pageA.waitForTimeout(1500);
  await pageA.keyboard.up('ArrowDown');
  await pageA.waitForTimeout(2600); // Ergebnis-Karte kommt nach 1,8 s
  const winTitle = (await pageA.textContent('#interTitle')).trim();
  check(`Sprint-Level gewonnen ("${winTitle}")`, winTitle.includes('Ziel in'));
  const hasExtra = (await pageA.locator('#interExtra').count()) && (await pageA.locator('#interExtra').isVisible());
  const extraLabel = hasExtra ? (await pageA.textContent('#interExtra')).trim() : '(fehlt)';
  check(`Ergebnis-Karte bietet Herausfordern an ("${extraLabel}")`, extraLabel.includes('Herausfordern'));

  if (hasExtra) {
    await pageA.click('#interExtra');
    await pageA.waitForTimeout(600);
  }
  const duelUrl = await pageA.evaluate(() => window.__tiltrDuelUrl);
  check(`Duell-Link erzeugt (${duelUrl ? duelUrl.length : 0} Zeichen)`,
    typeof duelUrl === 'string' && duelUrl.includes('#duel=1') && duelUrl.length < 4000);
  // Der Link teilt, schließt aber die Karte NICHT – man entscheidet danach.
  check('Teilen lässt die Ergebnis-Karte offen', hasExtra && (await pageA.locator('#interstitial').isVisible()));

  // Empfang auf einer zweiten Seite: Herausforderung -> antreten -> der
  // Rivale rollt mit (Geist aktiv, Zielzeit aus dem Link).
  const pageB = await ctx.newPage();
  pageB.on('pageerror', (e) => errors.push(String(e)));
  await pageB.goto(typeof duelUrl === 'string' ? duelUrl : `${BASE}/?nosplash`);
  await pageB.waitForTimeout(700);
  const duelTitle = (await pageB.textContent('#interTitle')).trim();
  const duelText = (await pageB.textContent('#interText')).trim();
  check(`Herausforderung wird angeboten ("${duelTitle}")`,
    duelTitle.includes('Herausforderung') && duelText.includes('Sprint') && duelText.includes('hörst'));
  check(`Absendername steht in der Herausforderung ("${duelText.slice(0, 24)}…")`, duelText.startsWith('Dominik'));
  check(
    'Duell-Hash wurde aus der URL entfernt',
    typeof duelUrl === 'string' && (await pageB.evaluate(() => location.hash === '')),
  );

  if (await pageB.locator('#interPrimary').isVisible()) {
    await pageB.click('#interPrimary'); // Antreten
    await pageB.waitForTimeout(4200);
  }
  const rival = await pageB.evaluate(() => window.__tiltrGhost);
  check(`Rivale läuft im Duell mit (Zielzeit ${rival ? rival.time : '?'} s, aktiv: ${rival?.active})`,
    !!rival && rival.active === true && rival.time > 0 && rival.time < 30);

  // Kaputtes Token: klare Absage statt Absturz.
  const pageC = await ctx.newPage();
  pageC.on('pageerror', (e) => errors.push(String(e)));
  await pageC.goto(`${BASE}/?nosplash#duel=1kaputtesTokenOhneSinn`);
  await pageC.waitForTimeout(600);
  const badText = (await pageC.textContent('#interText')).trim();
  check(`Kaputtes Duell-Token wird abgewiesen ("${badText.slice(0, 34)}…")`, badText.includes('beschädigt'));

  // App SCHON OFFEN, Link angetippt: Es ändert sich nur der Hash (kein
  // Neuladen) – der Empfang muss trotzdem greifen (PWA-Realität).
  if (typeof duelUrl === 'string') {
    await pageC.evaluate((tok) => {
      location.hash = `#duel=${tok}`;
    }, duelUrl.split('#duel=')[1]);
    await pageC.waitForTimeout(800);
  }
  const openAppText = (await pageC.textContent('#interText')).trim();
  check(`Duell-Link erreicht auch die offene App ("${openAppText.slice(0, 30)}…")`,
    openAppText.includes('Sprint'));

  // Unplausible Spur (Teleport mitten im Lauf): Das Duell startet, aber OHNE
  // Geist – ein Phantom mit 0,1 s tritt nicht an.
  const pageD = await ctx.newPage();
  pageD.on('pageerror', (e) => errors.push(String(e)));
  const cheatToken = await pageC.evaluate(async (def) => {
    // Encoder unabhängig nachgebaut: prüft auch das Token-FORMAT.
    const frames = [];
    for (let i = 0; i < 40; i++) frames.push(i * 0.125, 0, 50 + i * 3, 50 + i * 3);
    const payload = {
      v: 1,
      def,
      t: 4.875,
      by: 'Phantom',
      g: { s: [0, 50, 50], d: frames.map(() => 0).slice(0, 78), f: [] },
    };
    // d: erst harmlose Nullen, dann ein Teleport quer über die Karte
    payload.g.d[40] = 3000;
    const json = new TextEncoder().encode(JSON.stringify(payload));
    const packed = new Uint8Array(
      await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer(),
    );
    let bin = '';
    for (const b of packed) bin += String.fromCharCode(b);
    return '1' + btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  }, sprint);
  await pageD.goto(`${BASE}/?nosplash#duel=${cheatToken}`);
  await pageD.waitForTimeout(700);
  const cheatText = (await pageD.textContent('#interText')).trim();
  if (await pageD.locator('#interPrimary').isVisible()) {
    await pageD.click('#interPrimary');
    await pageD.waitForTimeout(4200);
  }
  const noGhost = await pageD.evaluate(() => window.__tiltrGhost);
  check(`Unplausible Spur tritt ohne Geist an ("${cheatText.split('\n').pop()?.slice(0, 30)}…")`,
    cheatText.includes('Zielzeit') && noGhost === null);
  await ctx.close();
}

check('keine Konsolen-/Seitenfehler', errors.length === 0);
if (errors.length) console.log(errors);

await browser.close();
stop();
process.exit(failed ? 1 : 0);
