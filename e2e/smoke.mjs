// E2E-Smoke gegen den gebauten Stand (vite preview):
// Start-Flow, Achsen (synthetische Sensor-Events), Echo-Ping, keine Konsolenfehler.
// Läuft lokal (vorinstalliertes Chromium) und in CI (playwright install chromium).

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = 8765;
// E2E_BASE: ein FREMDER Preview-Server (e2e/parallel.mjs startet einen für
// alle Arbeiter). Ohne die Variable startet dieses Skript seinen eigenen.
const BASE = process.env.E2E_BASE || `http://localhost:${PORT}`;
const executablePath = existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;

// Vite DIREKT starten, nicht über npx: SIGTERM an npx ließ das Kind „vite"
// weiterleben – ein Altserver auf 8765, an dem jeder spätere --strictPort
// still scheiterte (und dann mit dem ALTEN Server redete).
const VITE = new URL("../node_modules/vite/bin/vite.js", import.meta.url)
  .pathname;
const preview = process.env.E2E_BASE
  ? null
  : spawn(
      process.execPath,
      [VITE, "preview", "--port", String(PORT), "--strictPort"],
      { stdio: "ignore" },
    );
const stop = () => preview?.kill("SIGTERM");
process.on("exit", stop);

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

// E2E_ONLY=23,24 fährt nur diese Läufe – zum Iterieren an EINEM Lauf (die
// Sabotage-Disziplin „einmal rot sehen" kostet so 20 s statt 4 min). Ein
// unbekannter Name ist ein FEHLER, kein leerer Erfolg: Ein Tippfehler darf
// nicht grün durchgehen, weil null Checks liefen. KNOWN_RUNS ist aus den
// Lauf-Köpfen erzeugt; e2e/parallel.mjs liest die Liste von hier.
const KNOWN_RUNS = [
  "1",
  "2",
  "3",
  "3b",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "9b",
  "10",
  "10b",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "21b",
  "22",
  "23",
  "24",
  "25",
  ,
  "26",
];
const only = process.env.E2E_ONLY
  ? new Set(process.env.E2E_ONLY.split(",").map((x) => x.trim()))
  : null;
if (only) {
  const unknown = [...only].filter((id) => !KNOWN_RUNS.includes(id));
  if (unknown.length) {
    console.error(
      `E2E_ONLY nennt unbekannte Läufe: ${unknown.join(", ")} – bekannt: ${KNOWN_RUNS.join(", ")}`,
    );
    process.exit(2);
  }
}
const want = (id) => {
  const yes = !only || only.has(id);
  if (yes) console.log(`# Lauf ${id}`);
  return yes;
};

const browser = await chromium.launch({
  executablePath,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
let failed = false;
const check = (name, cond) => {
  console.log(cond ? "✓" : "✗", name);
  if (!cond) failed = true;
};

// --- Lauf 1: Tastatur-Fallback, Ping, HUD (fester Seed => deterministisch) ---
if (want("1")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?seed=28&nosplash`);

  const version = (await page.textContent("#version")).trim();
  check(
    `Version auf Startscreen ("${version}")`,
    /^v\d+\.\d+\.\d+/.test(version),
  );

  await page.click("#galleryLink");
  await page.waitForTimeout(300);
  const galleryItems = await page.locator(".gallery-item").count();
  check(`Element-Galerie zeigt Einträge (${galleryItems})`, galleryItems >= 6);
  await page.click("#galleryClose");

  await page.click("#quickBtn");
  await page.waitForTimeout(3600); // Kalibrier-Countdown

  check(
    "HUD sichtbar",
    !(await page.locator("#hud").getAttribute("class")).includes("hidden"),
  );

  const pingsBefore = (await page.textContent("#pings")).trim();
  await page.keyboard.press(" ");
  await page.waitForTimeout(250);
  const pingsAfter = (await page.textContent("#pings")).trim();
  check(
    `Echo-Ping verbraucht ("${pingsBefore}" -> "${pingsAfter}")`,
    pingsBefore !== pingsAfter,
  );

  const p0 = await page.evaluate(() => window.__tiltrBall);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(600);
  await page.keyboard.up("ArrowRight");
  const pos = await page.evaluate(() => window.__tiltrBall);
  check(
    `Ball rollt per Tastatur (dx=${(pos.x - p0.x).toFixed(0)})`,
    pos.x > p0.x + 40,
  );

  // M11: der Mittel-Generator würfelt Kristall, Sog-Anker und Glasboden mit.
  const wc = await page.evaluate(() => window.__tiltrWorld);
  check(
    `Quick (Mittel) enthält M11-Elemente (✦${wc?.crystals} ⊙${wc?.anchors} ▦${wc?.glass})`,
    !!wc && wc.crystals === 1 && wc.anchors === 1 && wc.glass === 1,
  );

  // Ruhiges HUD: der Timer-Chip ändert seine Breite nicht, während die Zeit
  // läuft (tabular-nums + Mindestbreite) – nichts dahinter verschiebt sich.
  const w1 = await page.evaluate(
    () => document.getElementById("timer").getBoundingClientRect().width,
  );
  await page.waitForTimeout(700);
  const w2 = await page.evaluate(
    () => document.getElementById("timer").getBoundingClientRect().width,
  );
  check(`HUD: Timer-Chip breitenstabil (${w1} = ${w2})`, w1 === w2 && w1 > 0);
  await page.close();
}

// --- Lauf 2: Achsen mit synthetischen Sensor-Events (steil tippen, flach spielen) ---
if (want("2")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?seed=28&nosplash`);
  const fire = (beta, gamma) =>
    page.evaluate(
      ([b, g]) => {
        window.dispatchEvent(
          new DeviceOrientationEvent("deviceorientation", {
            alpha: 0,
            beta: b,
            gamma: g,
          }),
        );
      },
      [beta, gamma],
    );

  await page.click("#quickBtn");
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
  check(
    `Horizontal gerollt (dx=${(p2.x - p1.x).toFixed(0)})`,
    p2.x > p1.x + 10,
  );

  // Rotation mitten im Spiel: das Canvas-Backing muss dem neuen Element-Rect
  // folgen (sonst ist alles verzerrt) – der ResizeObserver sichert das ab.
  await page.setViewportSize({ width: 800, height: 400 });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const c = document.getElementById("game");
    const dpr = Math.min(2, devicePixelRatio || 1);
    return {
      w: c.width,
      h: c.height,
      ew: Math.round(c.clientWidth * dpr),
      eh: Math.round(c.clientHeight * dpr),
    };
  });
  check(
    `Rotation: Canvas folgt dem Viewport (${m.w}x${m.h} = ${m.ew}x${m.eh})`,
    m.w === m.ew && m.h === m.eh && m.w > m.h,
  );
  await page.close();
}

// --- Lauf 3: Tutorial-Flow – Intro, Level 1 gewinnen, Ergebnis, Fortschritt ---
if (want("3")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  // Klangquellen zählen: Der Jubel muss hörbar etwas erzeugen (M26).
  await page.addInitScript(() => {
    window.__srcCount = 0;
    for (const fn of ["createOscillator", "createBufferSource"]) {
      const orig = AudioContext.prototype[fn];
      AudioContext.prototype[fn] = function (...args) {
        window.__srcCount++;
        return orig.apply(this, args);
      };
    }
  });
  await page.goto(`${BASE}/?nosplash`);

  const progress = (await page.textContent("#tutorialProgress")).trim();
  check(`Tutorial-Fortschritt im Menü ("${progress}")`, progress === "(0/8)");

  await page.click("#tutorialBtn");
  await page.waitForTimeout(3300); // Kalibrier-Countdown
  const introTitle = (await page.textContent("#interTitle")).trim();
  check(
    `Tutorial-Intro erscheint ("${introTitle}")`,
    introTitle.includes("Rollen & Lauschen"),
  );

  await page.click("#interPrimary"); // "Los!"
  const confBefore = await page.evaluate(() => window.__tiltrConfetti);
  const srcBeforeWin = await page.evaluate(() => window.__srcCount);
  await page.keyboard.down("ArrowRight");

  /* Konfetti + Jubel beim Sieg (M26) – auch im TUTORIAL, denn alle
     Single-Player-Siege laufen durch dieselbe Stelle (celebrate()). Die
     Salve wird beim frühesten Moment abgegriffen, in dem sie fliegt: Sie
     räumt sich nach ~3 s selbst auf, ein starres Warten würde sie
     verpassen. */
  let conf = null;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(120);
    const c = await page.evaluate(() => window.__tiltrConfetti);
    if (c?.count > 0) {
      conf = c;
      break;
    }
  }
  await page.keyboard.up("ArrowRight");
  check(
    `Konfetti fliegt nach dem Tutorial-Sieg (${conf?.count ?? 0} Schnipsel, ${conf?.colors ?? 0} Farben; vorher ${confBefore?.count})`,
    confBefore?.count === 0 && !!conf && conf.count >= 40 && conf.colors >= 4,
  );
  /* Die Konfetti-Ebene muss das GANZE Bild sein. Ein <canvas> streckt sich
     mit `inset: 0` allein NICHT (replaced element) – die erste Fassung
     feuerte in einen 200 px hohen Streifen aus dem Eigenverhältnis 300×150,
     das Konfetti war nach 200 ms „oben aus dem Bild". Unsichtbar, außer man
     misst es. */
  check(
    `Konfetti-Ebene füllt das Bild (${conf?.cw}×${conf?.ch} bei ${await page.evaluate(() => innerHeight)} px Höhe)`,
    !!conf && conf.ch >= (await page.evaluate(() => innerHeight)) - 2,
  );
  // Die Kanonen stehen UNTEN: Der Start liegt im unteren Bilddrittel.
  check(
    `Salve startet unten (höchster Punkt bei y=${conf?.minY} von ${conf?.ch})`,
    !!conf && conf.minY > conf.ch * 0.6,
  );
  const srcAfterWin = await page.evaluate(() => window.__srcCount);
  // Schwelle > 8: Der Sieg-Akkord allein macht 4 Quellen, der Konfetti-Klang
  // 9 dazu (4 Knaller + 5 Funkeln). Eine Schwelle von 4 bestand auch OHNE
  // den Konfetti-Klang – gefunden im Sabotage-Lauf.
  check(
    `Jubel klingt inkl. Konfetti-Knaller (Klangquellen ${srcBeforeWin} → ${srcAfterWin})`,
    srcAfterWin > srcBeforeWin + 8,
  );

  await page.waitForTimeout(2200); // Sieg-Reveal + Ergebnis-Karte

  const resultTitle = (await page.textContent("#interTitle")).trim();
  const resultShown = !(
    await page.locator("#interstitial").getAttribute("class")
  ).includes("hidden");
  check(
    `Ergebnis-Karte nach Sieg ("${resultTitle}")`,
    resultShown && resultTitle.includes("geschafft"),
  );

  // Das Konfetti räumt sich selbst auf – kein Papier, das liegen bleibt.
  await page.waitForTimeout(3000);
  const confEnd = await page.evaluate(() => window.__tiltrConfetti);
  check(
    `Konfetti räumt sich selbst auf (${confEnd?.count} Schnipsel übrig)`,
    confEnd?.count === 0,
  );
  const nextLabel = (await page.textContent("#interPrimary")).trim();
  check(
    `Weiter-Knopf führt zum nächsten Level ("${nextLabel}")`,
    nextLabel === "Weiter",
  );

  // Fortschritt wurde persistiert -> zurück im Menü steht (1/8)
  await page.click("#interSecondary"); // "Menü"
  const progress2 = (await page.textContent("#tutorialProgress")).trim();
  check(`Fortschritt persistiert ("${progress2}")`, progress2 === "(1/8)");
  await page.close();
}

// --- Lauf 3b: Konfetti ist DEKORATION – wer Bewegung reduziert, bekommt
// beim Sieg keine (der Klang und die Zeit sagen dasselbe). ---
if (want("3b")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);
  await page.click("#tutorialBtn");
  await page.waitForTimeout(3300);
  await page.click("#interPrimary");
  await page.keyboard.down("ArrowRight");
  let seen = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(120);
    const c = await page.evaluate(() => window.__tiltrConfetti);
    seen = Math.max(seen, c?.count ?? 0);
    if ((await page.textContent("#status")).includes("Ziel in")) break;
  }
  await page.keyboard.up("ArrowRight");
  const won = (await page.textContent("#status")).includes("Ziel in");
  check(
    `Reduced Motion: Sieg ohne Konfetti (gewonnen=${won}, gesehene Schnipsel=${seen})`,
    won && seen === 0,
  );
  await page.close();
}

// --- Lauf 4: Kampagne – Levelauswahl, w1-01 gewinnen, Sterne, Freischaltung ---
if (want("4")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  await page.click("#campaignBtn");
  await page.waitForTimeout(200);
  const items = page.locator(".level-item");
  check(
    `Kampagnen-Liste zeigt 28 Level (${await items.count()})`,
    (await items.count()) === 28,
  );
  const lockedCount = await page.locator(".level-item.locked").count();
  check(
    `nur Level 1 ist freigeschaltet (${28 - lockedCount} offen)`,
    lockedCount === 27,
  );

  await items.first().click();
  await page.waitForTimeout(3300); // Kalibrier-Countdown
  const introTitle = (await page.textContent("#interTitle")).trim();
  check(`Kampagnen-Intro ("${introTitle}")`, introTitle.includes("Aufbruch"));
  await page.click("#interPrimary"); // Los!

  // Spine von w1-01: Spalte 0 hinab, dann unten nach rechts.
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(2600);
  await page.keyboard.up("ArrowDown");
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(2600);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(2300); // Sieg-Reveal + Ergebnis

  const resultTitle = (await page.textContent("#interTitle")).trim();
  check(
    `Kampagnen-Ergebnis mit Sternen ("${resultTitle}")`,
    /★/.test(resultTitle) && resultTitle.includes("Aufbruch"),
  );
  // Blind-Stern: der Lauf kam ohne einen einzigen Ping aus -> 🌑 in der Karte.
  const resultText = (await page.textContent("#interText")).trim();
  check(
    `Blind-Stern in der Ergebnis-Karte ("${resultText.split("\n").pop()}")`,
    resultText.includes("🌑"),
  );

  await page.click("#interSecondary"); // Menü
  await page.click("#campaignBtn");
  await page.waitForTimeout(200);
  const lockedAfter = await page.locator(".level-item.locked").count();
  check(
    `Level 2 nach Sieg freigeschaltet (${28 - lockedAfter} offen)`,
    lockedAfter === 26,
  );
  const firstMeta = (
    await page.locator(".level-item .level-meta").first().textContent()
  ).trim();
  check(
    `Blind-Stern 🌑 in der Levelliste ("${firstMeta}")`,
    firstMeta.includes("🌑"),
  );

  // Geist-Replay: derselbe Level nochmal – die eben gespeicherte Bestzeit
  // rollt jetzt als blasser Halo mit (Hook: __tiltrGhost).
  await page.locator(".level-item").first().click(); // Sensoren sind schon aktiv: kein Countdown
  await page.waitForTimeout(400);
  await page.click("#interPrimary"); // Los!
  await page.waitForTimeout(600);
  const ghostInfo = await page.evaluate(() => window.__tiltrGhost);
  check(
    `Geist-Replay der Bestzeit läuft mit (time=${ghostInfo?.time?.toFixed?.(1)})`,
    !!ghostInfo &&
      typeof ghostInfo.time === "number" &&
      ghostInfo.active === true,
  );
  await page.close();
}

// --- Lauf 5: Multi-Ebenen (W2-01) – ?unlock, Weltsektionen, echter Warp ---
if (want("5")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?unlock&nosplash`);

  await page.click("#campaignBtn");
  await page.waitForTimeout(200);
  const items = await page.locator(".level-item").count();
  const headers = await page.locator(".world-header").count();
  check(
    `Kampagne: 28 Level in 4 Welten (${items}/${headers})`,
    items === 28 && headers === 4,
  );
  const locked = await page.locator(".level-item.locked").count();
  check("?unlock schaltet alles frei", locked === 0);

  await page.locator(".level-item").nth(10).click(); // W2-01 Unterführung
  await page.waitForTimeout(3300); // Countdown
  const introTitle = (await page.textContent("#interTitle")).trim();
  check(`W2-Intro ("${introTitle}")`, introTitle.includes("Unterführung"));
  await page.click("#interPrimary"); // Los!
  await page.waitForTimeout(200);

  const floor1 = (await page.textContent("#floor")).trim();
  check(`Ebenen-Anzeige im HUD ("${floor1}")`, floor1 === "⬍ E1");

  // Auf E1 nach rechts zum Transporter [4,0] rollen -> Warp nach E2
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(2400);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(1200); // Warp-Pause + Ankunft
  const floor2 = (await page.textContent("#floor")).trim();
  const pos = await page.evaluate(() => window.__tiltrBall);
  check(
    `Warp auf Ebene 2 (jetzt "${floor2}", Ball x=${pos.x.toFixed(0)})`,
    floor2 === "⬍ E2",
  );
  await page.close();
}

// --- Lauf 6: Tages-Challenge – Menü-Status und Herausforderungs-Link ---
if (want("6")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);
  const status = (await page.textContent("#dailyStatus")).trim();
  check(`Daily-Status im Menü ("${status}")`, status === "Heute noch offen");
  await page.close();
}
if (want("6")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash#daily=2026-01-05&t=42.3`);
  await page.waitForTimeout(300);
  const title = (await page.textContent("#interTitle")).trim();
  const text = (await page.textContent("#interText")).trim();
  check(
    `Herausforderung wird angeboten ("${title}")`,
    title.includes("Herausforderung") && text.includes("42.3 s"),
  );
  check(
    "Hash wurde aus der URL entfernt",
    await page.evaluate(() => location.hash === ""),
  );

  await page.click("#interPrimary"); // Annehmen
  await page.waitForTimeout(3300); // Kalibrier-Countdown
  const intro = (await page.textContent("#interTitle")).trim();
  const introText = (await page.textContent("#interText")).trim();
  check(`Challenge-Intro mit Datum ("${intro}")`, intro.includes("05.01.2026"));
  check("Intro nennt die Zielzeit", introText.includes("42.3 s"));
  await page.click("#interPrimary"); // Los!
  await page.waitForTimeout(300);
  const floor = (await page.textContent("#floor")).trim();
  check(`Daily ist mehrstöckig ("${floor}")`, floor === "⬍ E1");
  await page.close();
}

// --- Lauf 7: Installations-Hinweis (Android-Pfad synthetisch, iOS per User-Agent) ---
if (want("7")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?seed=42&nosplash`);
  await page.evaluate(() =>
    window.dispatchEvent(
      new Event("beforeinstallprompt", { cancelable: true }),
    ),
  );
  await page.waitForTimeout(100);
  const shown = !(
    await page.locator("#installHint").getAttribute("class")
  ).includes("hidden");
  check("Install-Hinweis erscheint (Android/beforeinstallprompt)", shown);
  const btnShown = !(
    await page.locator("#installBtn").getAttribute("class")
  ).includes("hidden");
  check("Installieren-Knopf sichtbar (Android)", btnShown);

  await page.click("#installDismiss");
  const hiddenNow = (
    await page.locator("#installHint").getAttribute("class")
  ).includes("hidden");
  await page.reload();
  await page.evaluate(() =>
    window.dispatchEvent(
      new Event("beforeinstallprompt", { cancelable: true }),
    ),
  );
  await page.waitForTimeout(100);
  const staysHidden = (
    await page.locator("#installHint").getAttribute("class")
  ).includes("hidden");
  check("Dismiss blendet aus und wird gemerkt", hiddenNow && staysHidden);
  await page.close();
}
if (want("7")) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    locale: "de-DE",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?seed=42&nosplash`);
  await page.waitForTimeout(200);
  const shown = !(
    await page.locator("#installHint").getAttribute("class")
  ).includes("hidden");
  const text = (await page.textContent("#installLabel")).trim();
  check(
    `iOS-Hinweis mit Teilen-Anleitung ("${text.slice(0, 40)}…")`,
    shown && /Home-Bildschirm/.test(text),
  );
  const btnHidden = (
    await page.locator("#installBtn").getAttribute("class")
  ).includes("hidden");
  check("kein Installieren-Knopf auf iOS", btnHidden);
  await page.close();
}

// --- Lauf 8: Safe-Area-Pflichttest – nachgebildete Insets (iPhone 402x874,
// oben 62 / unten 34) UND Gegenprobe ohne. Die Fehler dieser Kategorie sind
// im Browser unsichtbar; dieser Lauf ersetzt das installierte Gerät. ---
if (want("8")) {
  const page = await browser.newPage({
    viewport: { width: 402, height: 874 },
    locale: "de-DE",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  // Tokens VOR dem ersten Render überschreiben: nach dem Theme-<link> injiziert,
  // gewinnt der Style per Kaskade (gleiche Spezifität, späterer Ursprung).
  await page.route(`${BASE}/`, async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace(
      "</head>",
      "<style>:root{--safe-top:62px;--safe-bottom:34px}</style></head>",
    );
    await route.fulfill({ response: res, body });
  });
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(300);

  const m = await page.evaluate(() => {
    const hud = document.getElementById("hud");
    hud.classList.remove("hidden"); // nur für die Messung
    const hudTop = hud.getBoundingClientRect().top;
    hud.classList.add("hidden");
    const canvas = document.getElementById("game").getBoundingClientRect();
    const banners = document.getElementById("banners").getBoundingClientRect();
    document.getElementById("galleryLink").click();
    const gallery = getComputedStyle(document.getElementById("gallery"));
    return {
      hudTop,
      canvasW: canvas.width,
      canvasH: canvas.height,
      bannersBottom: banners.bottom,
      galleryPadTop: gallery.paddingTop,
      galleryPadBottom: gallery.paddingBottom,
      hearPadTop: getComputedStyle(document.getElementById("hearing"))
        .paddingTop,
      bodyTouch: getComputedStyle(document.body).touchAction,
      gameTouch: getComputedStyle(document.getElementById("game")).touchAction,
      innerH: innerHeight,
      innerW: innerWidth,
    };
  });
  check(
    `HUD beginnt unter dem oberen Inset (top=${m.hudTop})`,
    m.hudTop === 62,
  );
  check(
    `Canvas füllt den Layout-Viewport (${m.canvasW}x${m.canvasH})`,
    m.canvasW === m.innerW && m.canvasH === m.innerH,
  );
  check(
    `Banner enden über dem Home-Indicator (bottom=${m.bannersBottom})`,
    m.bannersBottom === m.innerH - 34 - 16,
  );
  check(
    `Panel-Padding respektiert Insets (${m.galleryPadTop}/${m.galleryPadBottom})`,
    m.galleryPadTop === "78px" && m.galleryPadBottom === "50px",
  );
  // Jedes neue Vollbild-Panel muss an derselben Regel hängen – sonst klebt es
  // in der installierten PWA unter der Notch.
  check(
    `Hörtest-Panel teilt die Panel-Regel (${m.hearPadTop})`,
    m.hearPadTop === "78px",
  );
  check(
    `touch-action: body=${m.bodyTouch}, game=${m.gameTouch}`,
    m.bodyTouch === "pan-x pan-y" && m.gameTouch === "none",
  );

  // Panels müssen scrollbar sein (der alte touch-action:none-Bug wäre hier unsichtbar,
  // aber die Struktur – overflow + genügend Inhalt – lässt sich prüfen).
  const scroll = await page.evaluate(() => {
    const g = document.getElementById("gallery");
    g.scrollTop = 200;
    return {
      scrolled: g.scrollTop > 0,
      overflows: g.scrollHeight > g.clientHeight,
    };
  });
  check("Galerie-Panel ist scrollbar", scroll.scrolled && scroll.overflows);
  await page.close();
}
if (want("8")) {
  // Gegenprobe ohne Insets (normaler Browser): alles bündig.
  const page = await browser.newPage({
    viewport: { width: 402, height: 874 },
    locale: "de-DE",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/`);
  const m = await page.evaluate(() => {
    const hud = document.getElementById("hud");
    hud.classList.remove("hidden");
    const hudTop = hud.getBoundingClientRect().top;
    hud.classList.add("hidden");
    return {
      hudTop,
      canvasH: document.getElementById("game").getBoundingClientRect().height,
      bannersBottom: document.getElementById("banners").getBoundingClientRect()
        .bottom,
      innerH: innerHeight,
    };
  });
  check(
    `Gegenprobe ohne Insets (hud=${m.hudTop}, banner=${m.bannersBottom})`,
    m.hudTop === 0 &&
      m.canvasH === m.innerH &&
      m.bannersBottom === m.innerH - 16,
  );
  await page.close();
}

// --- Lauf 9: Multiplayer Coop – zwei Tabs über den LocalTransport
// (BroadcastChannel, Raumcode "TEST…"): Host + QR/Code, Beitritt, Bereit-Flow,
// Druckplatte öffnet die Tür des Partners, beide im Ziel, Rematch, Disconnect. ---
if (want("9")) {
  const ctx = await browser.newContext({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  const pageA = await ctx.newPage(); // Host
  const pageB = await ctx.newPage(); // Gast
  for (const p of [pageA, pageB]) {
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    p.on("pageerror", (e) => errors.push(String(e)));
  }

  await pageA.goto(`${BASE}/?mpcode=TESTE2E&nosplash`);
  await pageA.click("#mpBtn");
  const coopCount = await pageA.locator("#mpLevelList .level-item").count();
  await pageA.click('[data-mpmode="race"]');
  const raceCount = await pageA.locator("#mpLevelList .level-item").count();
  await pageA.click('[data-mpmode="coop"]');
  check(
    `MP-Panel: je 6 Level + 🎲 Zufall (${coopCount}/${raceCount})`,
    coopCount === 7 && raceCount === 7,
  );

  await pageA
    .locator("#mpLevelList .level-item:not(#mpRandomBtn)")
    .first()
    .click(); // coop-01 Schleuse
  await pageA.waitForTimeout(300);
  const qrHtml = await pageA.innerHTML("#mpQr");
  const codeShown = (await pageA.textContent("#mpCode")).trim();
  check(
    `Lobby zeigt QR-Code + Raumcode ("${codeShown}")`,
    qrHtml.includes("<svg") && codeShown === "TESTE2E",
  );

  await pageB.goto(`${BASE}/?nosplash`);
  await pageB.click("#mpBtn");
  await pageB.fill("#mpCodeInput", "TESTE2E");
  await pageB.click("#mpJoinBtn");
  await pageB.waitForTimeout(600);

  const introA = (await pageA.textContent("#interTitle")).trim();
  const introB = (await pageB.textContent("#interTitle")).trim();
  check(
    `Beide sehen das Coop-Intro ("${introA}")`,
    introA.includes("Schleuse") && introB.includes("Schleuse"),
  );

  await pageA.click("#interPrimary"); // Bereit!
  await pageB.click("#interPrimary");
  await pageA.waitForTimeout(4200); // Kalibrier-Countdown beider Seiten

  const hudA = !(await pageA.locator("#hud").getAttribute("class")).includes(
    "hidden",
  );
  const hudB = !(await pageB.locator("#hud").getAttribute("class")).includes(
    "hidden",
  );
  const overlayA = (
    await pageA.locator("#overlay").getAttribute("class")
  ).includes("hidden");
  const overlayB = (
    await pageB.locator("#overlay").getAttribute("class")
  ).includes("hidden");
  check(
    "Coop startet auf beiden Seiten (HUD sichtbar, Menü zu)",
    hudA && hudB && overlayA && overlayB,
  );

  // A rollt nach rechts – B empfängt die Position (Datenbasis des Partner-Halos).
  await pageA.keyboard.down("ArrowRight");
  await pageA.waitForTimeout(2600);
  await pageA.keyboard.up("ArrowRight");
  await pageA.waitForTimeout(400);
  const remoteAtB = await pageB.evaluate(() => window.__tiltrMp?.remote);
  check(
    `B kennt A's Position für den Schein (x=${remoteAtB?.x?.toFixed(0)})`,
    !!remoteAtB && remoteAtB.x > 200,
  );

  // B rollt zur äußeren Druckplatte: rechts, runter (die Tür stoppt ihn),
  // dann links in die Sackgassen-Nische [4,4].
  await pageB.keyboard.down("ArrowRight");
  await pageB.waitForTimeout(2600);
  await pageB.keyboard.up("ArrowRight");
  await pageB.keyboard.down("ArrowDown");
  await pageB.waitForTimeout(2600);
  await pageB.keyboard.up("ArrowDown");
  await pageB.keyboard.down("ArrowLeft");
  await pageB.waitForTimeout(1000);
  await pageB.keyboard.up("ArrowLeft");
  await pageB.waitForTimeout(800);
  const holdsB = await pageB.evaluate(() => window.__tiltrMp?.localHolds ?? []);
  const remoteHoldsA = await pageA.evaluate(
    () => window.__tiltrMp?.remoteHolds ?? [],
  );
  check(
    `B hält die Platte, A's Tür ist offen (${JSON.stringify(holdsB)})`,
    holdsB.includes("g1") && remoteHoldsA.includes("g1"),
  );

  const litBefore = await pageA.evaluate(() => window.__tiltrMp?.goalLit);
  // A rollt durch die offene Tür ins Ziel. Ab hier steht die UHR, nicht der Ball.
  await pageA.keyboard.down("ArrowDown");
  await pageA.waitForTimeout(2600);
  await pageA.keyboard.up("ArrowDown");
  await pageA.waitForTimeout(600);
  const finA = await pageA.evaluate(() => window.__tiltrMp?.localFinished);
  const statusA = (await pageA.textContent("#status")).trim();
  check(
    `A ist im Ziel und darf weiterrollen ("${statusA}")`,
    finA === true && statusA.includes("Die Uhr steht"),
  );

  // Die Uhr bleibt auf der erreichten Zeit stehen (grüne Pille) – das ist das
  // „du bist durch", das vorher der festhängende Ball erzählen musste.
  const timerAtFinish = (await pageA.textContent("#timer")).trim();
  const timerClass = await pageA.getAttribute("#timer", "class");
  await pageA.waitForTimeout(1200);
  const timerLater = (await pageA.textContent("#timer")).trim();
  check(
    `A's Uhr steht auf der Zielzeit (${timerAtFinish} -> ${timerLater}, class="${timerClass}")`,
    timerAtFinish === timerLater &&
      /\d/.test(timerAtFinish) &&
      timerClass.includes("done"),
  );

  // Der eigentliche Fehler: Vorher fror der Ball im Ziel ein – das sah kaputt
  // aus UND machte im Coop die Platten unbenutzbar. Jetzt rollt A weiter …
  const posBefore = await pageA.evaluate(() => window.__tiltrBall);
  const remoteBefore = await pageB.evaluate(() => window.__tiltrMp?.remote);
  await pageA.keyboard.down("ArrowUp");
  await pageA.waitForTimeout(700);
  await pageA.keyboard.up("ArrowUp");
  await pageA.waitForTimeout(400);
  const posAfter = await pageA.evaluate(() => window.__tiltrBall);
  const holdsAaway = await pageA.evaluate(
    () => window.__tiltrMp?.localHolds ?? [],
  );
  check(
    `A rollt nach dem Zieleinlauf weiter (dy=${(posAfter.y - posBefore.y).toFixed(0)})`,
    posAfter.y < posBefore.y - 20,
  );
  // Das Ziel leuchtet ruhig weiter, obwohl A weggerollt ist (kein Debug, kein
  // Reveal): So SIEHT man, dass man durch ist – vorher sagte es der
  // festhängende Ball.
  const litAfter = await pageA.evaluate(() => window.__tiltrMp?.goalLit);
  check(
    `Geschafftes Ziel leuchtet weiter (vorher=${litBefore}, nachher=${litAfter})`,
    litBefore === false && litAfter === true,
  );
  // … und B sieht den Schein wandern statt festhängen, markiert als „durch".
  const remoteAfter = await pageB.evaluate(() => window.__tiltrMp?.remote);
  check(
    `B sieht A's Schein wandern und als „im Ziel" (fin=${remoteAfter?.finished}, dy=${(remoteAfter.y - remoteBefore.y).toFixed(0)})`,
    remoteAfter?.finished === true &&
      Math.abs(remoteAfter.y - remoteBefore.y) > 15,
  );

  // A rollt zurück ins Ziel und hält dort wieder die innere Platte – genau das
  // war mit eingefrorenem Ball unmöglich (Coop-Deadlock für den Nachzügler).
  await pageA.keyboard.down("ArrowDown");
  await pageA.waitForTimeout(1400);
  await pageA.keyboard.up("ArrowDown");
  await pageA.waitForTimeout(500);
  const holdsAafter = await pageA.evaluate(
    () => window.__tiltrMp?.localHolds ?? [],
  );
  check(
    `A verlässt die Platte und hält sie wieder (weg=${JSON.stringify(holdsAaway)}, zurück=${JSON.stringify(holdsAafter)})`,
    holdsAaway.length === 0 && holdsAafter.includes("g1"),
  );

  // B verlässt die Platte – die Tür bleibt offen, weil A im Ziel die innere hält.
  await pageB.keyboard.down("ArrowRight");
  await pageB.waitForTimeout(1000);
  await pageB.keyboard.up("ArrowRight");
  await pageB.keyboard.down("ArrowDown");
  await pageB.waitForTimeout(1600);
  await pageB.keyboard.up("ArrowDown");
  await pageB.waitForTimeout(2600); // Ergebnis-Karte erscheint nach 1,8 s

  const resultA = (await pageA.textContent("#interTitle")).trim();
  const resultB = (await pageB.textContent("#interTitle")).trim();
  check(
    `Coop-Sieg auf beiden Seiten ("${resultA}")`,
    resultA.includes("Gemeinsam geschafft") &&
      resultB.includes("Gemeinsam geschafft"),
  );

  // Rematch: beide klicken "Nochmal" – startet sofort neu (ohne Countdown).
  await pageA.click("#interPrimary");
  await pageB.click("#interPrimary");
  await pageA.waitForTimeout(800);
  const rematchPhase = await pageA.evaluate(() => window.__tiltrMp?.phase);
  check(
    `Rematch startet sofort (phase=${rematchPhase})`,
    rematchPhase === "playing",
  );

  // Disconnect: B geht weg (pagehide -> @bye) -> A zeigt den 10s-Countdown.
  // Synthetisch ausgelöst: beim echten Tab-Schließen flusht der
  // BroadcastChannel nicht zuverlässig, der Handler ist derselbe.
  await pageB.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await pageA.waitForTimeout(800);
  const statusGone = (await pageA.textContent("#status")).trim();
  check(
    `Disconnect-Countdown bei A ("${statusGone}")`,
    statusGone.includes("Verbindung verloren"),
  );

  // Zufallslevel: Host würfelt, der Gast regeneriert es aus der ID (Seed).
  const pageC = await ctx.newPage();
  const pageD = await ctx.newPage();
  for (const p of [pageC, pageD]) {
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    p.on("pageerror", (e) => errors.push(String(e)));
  }
  await pageC.goto(`${BASE}/?mpcode=TESTR01&nosplash`);
  await pageC.click("#mpBtn");
  await pageC.click("#mpRandomBtn");
  await pageC.waitForTimeout(300);
  const rndLobby = !(
    await pageC.locator("#mpLobby").getAttribute("class")
  ).includes("hidden");
  const rndQr = (await pageC.innerHTML("#mpQr")).includes("<svg");
  check("Zufallslevel: Lobby mit QR erscheint sofort", rndLobby && rndQr);

  await pageD.goto(`${BASE}/?nosplash`);
  await pageD.click("#mpBtn");
  await pageD.fill("#mpCodeInput", "TESTR01");
  await pageD.click("#mpJoinBtn");
  await pageD.waitForTimeout(600);
  const rndIntroC = (await pageC.textContent("#interTitle")).trim();
  const rndIntroD = (await pageD.textContent("#interTitle")).trim();
  check(
    `Zufallslevel: beide sehen das Intro ("${rndIntroD}")`,
    rndIntroC.includes("Zufallslevel") && rndIntroD.includes("Zufallslevel"),
  );

  await pageC.click("#interPrimary");
  await pageD.click("#interPrimary");
  await pageC.waitForTimeout(4200);
  const idC = await pageC.evaluate(() => window.__tiltrMp?.levelId);
  const idD = await pageD.evaluate(() => window.__tiltrMp?.levelId);
  const phaseC = await pageC.evaluate(() => window.__tiltrMp?.phase);
  check(
    `Zufallslevel: beide spielen DASSELBE regenerierte Level (${idC})`,
    phaseC === "playing" &&
      typeof idC === "string" &&
      idC.startsWith("mpq-coop-") &&
      idC === idD,
  );

  await ctx.close();
}

// --- Lauf 9b: iOS-Standalone-Viewport – zwei Zustände nachgebildet.
// (A) status-bar-style 'black': Container liegt UNTER der Statusbar, es gibt
//     eine Lücke zu screen.height, aber env oben = 0 -> KEINE Eingriffe.
// (B) Alt-Installation 'black-translucent': Lücke UND Insel-Überlappung
//     (env oben > 0) -> --app-height/--safe-top-fallback gleichen aus. ---
if (want("9b")) {
  const mkPage = async (envTopPx) => {
    const page = await browser.newPage({
      viewport: { width: 400, height: 800 },
      locale: "de-DE",
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript((envTop) => {
      const origMatch = window.matchMedia.bind(window);
      window.matchMedia = (q) =>
        q === "(display-mode: standalone)"
          ? {
              matches: true,
              media: q,
              addEventListener() {},
              removeEventListener() {},
              addListener() {},
              removeListener() {},
              onchange: null,
              dispatchEvent: () => false,
            }
          : origMatch(q);
      Object.defineProperty(Screen.prototype, "width", { get: () => 400 });
      Object.defineProperty(Screen.prototype, "height", { get: () => 855 });
      if (envTop > 0) {
        // env() lässt sich nicht faken – das Mess-Element (#vp-env-probe)
        // bekommt seinen top-Wert stattdessen per gepatchtem Rect.
        const orig = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function () {
          const r = orig.call(this);
          if (this.id === "vp-env-probe") {
            return {
              top: envTop,
              bottom: r.bottom,
              left: r.left,
              right: r.right,
              width: r.width,
              height: r.height,
              x: r.x,
              y: envTop,
            };
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
      const hud = document.getElementById("hud");
      hud.classList.remove("hidden");
      const hudTop = hud.getBoundingClientRect().top;
      hud.classList.add("hidden");
      return {
        appHeight: cs.getPropertyValue("--app-height").trim(),
        overlayH: document.getElementById("overlay").getBoundingClientRect()
          .height,
        gameH: document.getElementById("game").getBoundingClientRect().height,
        canvasBackingH: document.getElementById("game").height,
        hudTop,
        bannersBottom: document
          .getElementById("banners")
          .getBoundingClientRect().bottom,
      };
    });

  // (A) Lücke, aber env oben 0: Container unter der Statusbar -> nichts anfassen.
  {
    const page = await mkPage(0);
    const m = await dump(page);
    check(
      `Standalone 'black' (env oben 0): keine Eingriffe (app-h="${m.appHeight}", overlay=${m.overlayH})`,
      m.appHeight === "" &&
        m.overlayH === 800 &&
        m.gameH === 800 &&
        m.hudTop === 0 &&
        m.bannersBottom === 800 - 16,
    );
    await page.close();
  }

  // (B) Alt-Zustand translucent: Lücke + Insel-Überlappung -> ausgleichen.
  {
    const page = await mkPage(62);
    const m = await dump(page);
    check(
      `Standalone translucent (env oben 62): Vollflächen bis 855 (overlay=${m.overlayH}, game=${m.gameH})`,
      m.appHeight === "855px" && m.overlayH === 855 && m.gameH === 855,
    );
    check(
      `Standalone translucent: Canvas-Backing folgt (h=${m.canvasBackingH})`,
      m.canvasBackingH === 855,
    );
    check(
      `Standalone translucent: HUD unter der Insel (top=${m.hudTop})`,
      m.hudTop === 55,
    );
    check(
      `Standalone translucent: Banner an der echten Unterkante (bottom=${m.bannersBottom})`,
      m.bannersBottom === 855 - 16,
    );
    await page.close();
  }
}

// --- Lauf 10: Splash – Version + Credits, verschwindet von selbst ---
if (want("10")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(200);
  const splashShown = await page.locator("#splash").isVisible();
  const splashVersion = (await page.textContent("#splashVersion")).trim();
  const splashCredit = (await page.textContent("#splashCredit")).trim();
  check(
    `Splash mit Version + Credits ("${splashVersion}" / "${splashCredit}")`,
    splashShown &&
      /^v\d+\.\d+\.\d+$/.test(splashVersion) &&
      splashCredit.includes("Dominik Rössler") &&
      splashCredit.includes("Claude"),
  );
  // --- Choreografie (M25): Kugel von unten ein, Titel, dann Kugel raus
  // WÄHREND das Menü von unten hereinfährt. Messbar über die echten
  // Transforms – der Splash steht auf keiner Stoppuhr, die hier doppelt
  // gepflegt wird. `ty` liest die Y-Verschiebung aus der Matrix. ---
  const ty = (m) =>
    m === "none" ? 0 : Number(m.slice(m.lastIndexOf(",") + 1, -1).trim());
  const stage = () =>
    page.evaluate(() => {
      const sp = document.getElementById("splash");
      const ov = document.getElementById("overlay");
      const ball = document.querySelector(".splash-ball");
      const logo = document.querySelector(".splash-logo");
      return {
        splash: sp ? sp.className : null,
        body: document.body.className,
        menu: getComputedStyle(ov).transform,
        ball: ball ? getComputedStyle(ball).transform : null,
        logo: logo ? Number(getComputedStyle(logo).opacity) : null,
        vh: innerHeight,
      };
    });

  // Akt 1: Die Kugel kommt von UNTEN (positive Y-Verschiebung), das Menü
  // wartet um eine volle Bildhöhe nach unten geparkt.
  const act1 = await stage();
  check(
    `Akt 1: Kugel rollt von unten ein (dy=${ty(act1.ball).toFixed(0)}px), Menü parkt unten (${ty(act1.menu).toFixed(0)} = ${act1.vh})`,
    ty(act1.ball) > 40 &&
      act1.body.includes("splashing") &&
      Math.abs(ty(act1.menu) - act1.vh) < 2,
  );

  // Akt 2: Kugel steht in der Mitte, Titel sichtbar, Menü noch unten.
  await page.waitForTimeout(1600);
  const act2 = await stage();
  check(
    `Akt 2: Kugel steht, Titel da (Deckkraft ${act2.logo}), Menü wartet (${ty(act2.menu).toFixed(0)})`,
    Math.abs(ty(act2.ball)) < 2 &&
      act2.logo > 0.9 &&
      ty(act2.menu) > act2.vh - 2,
  );

  // Akt 3: Kugel nach OBEN raus (negative Y) und Menü GLEICHZEITIG unterwegs
  // (zwischen unten und angekommen) – die eigentliche Zusicherung des Umbaus.
  let act3 = null;
  /* Die FORM der Einfahrt exakt vermessen, statt sie abzutasten: Die
     Web-Animations-API lässt sich an eine Zeitmarke setzen und der echte
     Transform ablesen. Nötig, weil ein 60-ms-Raster die Spitze wegglättet –
     die alte, zu schnelle Kurve (8900 px/s im ersten Frame) maß so nur
     5464 px/s und wäre durch eine Peak-Schwelle geschlüpft. */
  let shape = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(60);
    const st = await stage();
    if (
      st.splash?.includes("leave") &&
      ty(st.menu) > 4 &&
      ty(st.menu) < st.vh - 4
    ) {
      act3 = st;
      shape = await page.evaluate(() => {
        const ov = document.getElementById("overlay");
        const anims = ov.getAnimations();
        const a =
          anims.find((x) => x.animationName === "menu-rise") ?? anims[0];
        if (!a) return null;
        const timing = a.effect.getComputedTiming();
        const dur = Number(timing.duration);
        const delay = Number(timing.delay);
        const was = a.currentTime;
        // Fortschritt (0 = unten, 1 = angekommen) an einer Zeitmarke.
        const progressAt = (ms) => {
          a.currentTime = delay + ms;
          const m = getComputedStyle(ov).transform;
          const y =
            m === "none" ? 0 : Number(m.slice(m.lastIndexOf(",") + 1, -1));
          return 1 - y / innerHeight;
        };
        const out = { dur, early: progressAt(80), half: progressAt(dur / 2) };
        a.currentTime = was; // weiterlaufen lassen, wo sie war
        return out;
      });
      break;
    }
    if (st.splash === null) break;
  }
  check(
    `Akt 3: Kugel rollt nach oben raus (dy=${act3 ? ty(act3.ball).toFixed(0) : "?"}px), während das Menü hereinfährt (${act3 ? ty(act3.menu).toFixed(0) : "?"}px über dem Rand)`,
    !!act3 && ty(act3.ball) < -20 && act3.body.includes("splash-leaving"),
  );
  // Der Splash-Titel muss WEG sein, bevor das Menü seinen eigenen zeigt –
  // sonst stehen zwei „tiltr" übereinander (genau das zeigte die 1. Fassung).
  const logoGone = act3 ? act3.logo : 1;
  check(
    `Akt 3: Splash-Titel ist weg, bevor der Menü-Titel kommt (Deckkraft ${logoGone})`,
    logoGone !== null && logoGone < 0.15,
  );

  // Die Einfahrt ZIEHT AN und BREMST dann aus – beides Zusicherungen an die
  // Kurve, nicht an ihre Deklaration: „80 ms nach dem Start liegt noch der
  // Großteil des Weges vor ihr" (die alte Kurve war da schon bei 65 %) und
  // „zur Hälfte der Zeit ist der Weg fast geschafft, der Rest ist Bremse".
  check(
    `Menü zieht an statt zu schnappen (${shape ? Math.round(shape.early * 100) : "?"} % nach 80 ms, Fahrt ${shape?.dur} ms)`,
    !!shape && shape.dur >= 600 && shape.early < 0.4,
  );
  check(
    `Menü bremst am Ende aus (${shape ? Math.round(shape.half * 100) : "?"} % nach halber Zeit – der Rest ist Bremse)`,
    !!shape && shape.half > 0.8,
  );

  await page.waitForTimeout(1200);
  const done = await stage();
  check(
    `Splash verschwindet von selbst und lässt das Menü ohne Transform zurück ("${done.body}", ${done.menu})`,
    (await page.locator("#splash").count()) === 0 &&
      done.body === "" &&
      done.menu === "none",
  );

  // Debug-Ansicht ist versteckt und wird mit 5 Taps auf die Version freigeschaltet.
  const debugHidden = (
    await page.locator("#debugBtn").getAttribute("class")
  ).includes("hidden");
  for (let i = 0; i < 5; i++) await page.click("#version");
  const debugShown = !(
    await page.locator("#debugBtn").getAttribute("class")
  ).includes("hidden");
  const diag = (await page.textContent("#diag")).trim();
  check(
    `Debug-Knopf + Viewport-Diagnose nach 5 Version-Taps ("${diag.slice(0, 40)}…")`,
    debugHidden &&
      debugShown &&
      diag.startsWith("scr ") &&
      diag.includes("env "),
  );

  // Grundton = Spielfeld-Ton: kein heller Streifen neben dem Canvas möglich.
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  check(`Body-Grundton ist bg-deep (${bg})`, bg === "rgb(5, 7, 15)");
  await page.close();
}

// --- Lauf 10b: Splash-Sonderwege – prefers-reduced-motion inszeniert NICHT
// (das Menü darf dort nie unter dem Bildrand parken), und ein Tap überspringt
// in Akt 3 statt hart abzuschneiden. ---
if (want("10b")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(250);
  const rm = await page.evaluate(() => ({
    splash: document.getElementById("splash") !== null,
    menuTop: document.getElementById("overlay").getBoundingClientRect().top,
    menuT: getComputedStyle(document.getElementById("overlay")).transform,
  }));
  check(
    `Reduced Motion: Menü parkt NICHT (top=${rm.menuTop}, ${rm.menuT})`,
    rm.splash === true && rm.menuTop === 0 && rm.menuT === "none",
  );
  await page.waitForTimeout(1600);
  check(
    "Reduced Motion: Splash geht ohne Inszenierung",
    (await page.locator("#splash").count()) === 0,
  );
  await page.close();
}
if (want("10b")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(1000); // mitten in Akt 2 antippen
  await page.mouse.click(200, 400);
  await page.waitForTimeout(120);
  const skipping = await page.evaluate(() => document.body.className);
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => ({
    gone: document.getElementById("splash") === null,
    body: document.body.className,
    menuTop: document.getElementById("overlay").getBoundingClientRect().top,
  }));
  check(
    `Tap überspringt in Akt 3 ("${skipping}") und endet aufgeräumt (top=${after.menuTop})`,
    skipping.includes("splash-leaving") &&
      after.gone &&
      after.body === "" &&
      after.menuTop === 0,
  );
  await page.close();
}

// --- Lauf 11: i18n – Auto-Detect (en-US), manueller Wechsel, Persistenz ---
if (want("11")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "en-US",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  const lang = await page.evaluate(() => document.documentElement.lang);
  const dailyEn = (await page.textContent("#dailyStatus")).trim();
  const quickEn = (await page.textContent("#quickBtn")).trim();
  check(
    `Browser-Locale en-US => Englisch (lang=${lang}, "${dailyEn}")`,
    lang === "en" &&
      dailyEn === "Still open today" &&
      quickEn.includes("Quick Game"),
  );

  // Neues Menü: 7 Modus-Karten, Tutorial als Einstieg empfohlen
  const modeItems = await page.locator("#modeList .mode-item").count();
  const suggested = await page.locator("#tutorialBtn.suggest").count();
  check(
    `Startscreen: 7 Modus-Karten, Tutorial empfohlen (${modeItems}/${suggested})`,
    modeItems === 7 && suggested === 1,
  );
  const hearingTitle = (
    await page.textContent("#hearingBtn .mode-title")
  ).trim();
  check(
    `Hörtest-Karte auf Englisch ("${hearingTitle}")`,
    hearingTitle === "Hearing test",
  );

  // Galerie übersetzt (erster Registry-Eintrag: Loch -> "Hole")
  await page.click("#galleryLink");
  await page.waitForTimeout(300);
  const firstTitle = (
    await page.locator(".gallery-item h3").first().textContent()
  ).trim();
  check(`Galerie auf Englisch ("${firstTitle}")`, firstTitle === "Hole");
  await page.click("#galleryClose");

  // Manueller Wechsel auf FR + Persistenz über Reload
  await page.click('[data-lang="fr"]');
  const dailyFr = (await page.textContent("#dailyStatus")).trim();
  check(
    `Sprachwechsel auf FR ("${dailyFr}")`,
    dailyFr.includes("Encore ouvert"),
  );
  await page.reload();
  await page.waitForTimeout(200);
  const dailyFr2 = (await page.textContent("#dailyStatus")).trim();
  const langFr = await page.evaluate(() => document.documentElement.lang);
  check(
    `FR überlebt Reload (lang=${langFr})`,
    langFr === "fr" && dailyFr2.includes("Encore ouvert"),
  );
  await page.close();
}

// --- Lauf 12: Werkstatt – Tablet-Dreispalter, Element platzieren, Badges,
// Preview mit ✏️-Rücksprung, Speichern, Bibliothek; Phone-Gegenprobe. ---
if (want("12")) {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  // Tablet-Menü (≥900px): Modus-Karten zweispaltig in verbreiterter Mitte,
  // Schnellstart als Querzeile – und der Footer passt ohne Scrollen auf
  // 1024x768 (Querformat war vorher abgeschnitten).
  const menu = await page.evaluate(() => ({
    cols: getComputedStyle(
      document.getElementById("modeList"),
    ).gridTemplateColumns.split(" ").length,
    width: document.getElementById("menuButtons").getBoundingClientRect().width,
    quickDir: getComputedStyle(document.getElementById("quickGroup"))
      .flexDirection,
    footerBottom: document.getElementById("menuFooter").getBoundingClientRect()
      .bottom,
    vh: innerHeight,
  }));
  check(
    `Tablet-Menü: 2 Spalten, breite Mitte (${menu.cols} Spalten, ${Math.round(menu.width)}px)`,
    menu.cols === 2 && menu.width > 600 && menu.quickDir === "row",
  );
  check(
    `Tablet-Menü: Footer ohne Scrollen sichtbar (${Math.round(menu.footerBottom)} <= ${menu.vh})`,
    menu.footerBottom <= menu.vh,
  );

  await page.click("#workshopBtn");
  const wsShown = !(
    await page.locator("#workshop").getAttribute("class")
  ).includes("hidden");
  check("Werkstatt-Panel öffnet", wsShown);

  // Werkstatt-Start: Aktionen als Modus-Karten (Icon + Titel + Untertitel)
  // statt umbrechender Buttons – auf dem Tablet als Drei-Spalten-Grid.
  const wsGrid = await page.evaluate(() => ({
    cols: getComputedStyle(
      document.getElementById("workshopActions"),
    ).gridTemplateColumns.split(" ").length,
    card:
      !!document.querySelector("#wsNewBtn .mode-title") &&
      !!document.querySelector("#wsNewBtn .mode-sub"),
  }));
  check(
    `Werkstatt-Aktionen als Karten-Grid (${wsGrid.cols} Spalten)`,
    wsGrid.cols === 3 && wsGrid.card,
  );
  await page.click("#wsNewBtn");
  await page.waitForTimeout(500);
  const edShown = !(
    await page.locator("#editor").getAttribute("class")
  ).includes("hidden");
  const cols = await page.evaluate(
    () =>
      getComputedStyle(document.getElementById("edBody")).gridTemplateColumns,
  );
  check(
    `Editor öffnet als Tablet-Dreispalter (${cols})`,
    edShown && cols.split(" ").length === 3,
  );

  // Phone-Chrome (Element-Button, Drawer-Griff) existiert, bleibt hier aber
  // unsichtbar – der Dreispalter zeigt Palette und Eigenschaften direkt.
  const chromeHidden = await page.evaluate(() => {
    const gone = (id) => {
      const el = document.getElementById(id);
      return !!el && getComputedStyle(el).display === "none";
    };
    return gone("edElementBtn") && gone("edDrawerHandle");
  });
  check(
    "Tablet: Element-Button und Drawer-Griff nur auf dem Phone",
    chromeHidden,
  );

  // Icon-Buttons erklären sich: [data-tip]-Blase beim Hover (Desktop) …
  await page.hover("#edShare");
  await page.waitForTimeout(300);
  const tipDesk = await page.evaluate(() => {
    const s = getComputedStyle(document.getElementById("edShare"), "::after");
    return { content: s.content, opacity: s.opacity };
  });
  check(
    `Tablet: Tooltip am Icon-Button beim Hover (${tipDesk.content} / ${tipDesk.opacity})`,
    tipDesk.content.toLowerCase().includes("teilen") && tipDesk.opacity === "1",
  );

  // Live-Badges: das leere 6x8-Level ist beweisbar gesund (alle grün).
  const badges = await page.locator("#edBadges .ed-badge").count();
  const failed = await page.locator("#edBadges .ed-badge.fail").count();
  check(
    `Live-Validierung: ${badges} Badges, ${failed} rot`,
    badges >= 6 && failed === 0,
  );

  // Loch in die Zellmitte (3,4) setzen – Screen-Punkt exakt aus dem
  // Editor-Transform berechnet (Hook __tiltrEd).
  const before = await page.evaluate(() => window.__tiltrEd?.elements);
  const pt = await page.evaluate(() => {
    const ed = window.__tiltrEd;
    const box = document.getElementById("edCanvas").getBoundingClientRect();
    return {
      x: box.left + (ed.ox + 350 * ed.scale) / ed.dpr,
      y: box.top + (ed.oy + 450 * ed.scale) / ed.dpr,
    };
  });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__tiltrEd?.elements);
  const propsText = (await page.textContent("#edProps")).trim();
  check(
    `Element platziert (${before} -> ${after})`,
    before === 0 && after === 1 && propsText.includes("Auswahl"),
  );

  // Belegt-Regeln: dieselbe Zelle nochmal antippen wählt das Element AUS
  // statt ein zweites zu stapeln; Start-/Zielzellen bleiben ganz frei.
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
  const sameCell = await page.evaluate(() => ({
    n: window.__tiltrEd.elements,
    sel: window.__tiltrEd.selected,
  }));
  check(
    `Tap auf bestehendes Element wählt aus statt zu stapeln (n=${sameCell.n}, sel=${sameCell.sel})`,
    sameCell.n === 1 && sameCell.sel === 0,
  );
  const ptStart = await page.evaluate(() => {
    const ed = window.__tiltrEd;
    const box = document.getElementById("edCanvas").getBoundingClientRect();
    return {
      x: box.left + (ed.ox + 50 * ed.scale) / ed.dpr,
      y: box.top + (ed.oy + 50 * ed.scale) / ed.dpr,
    };
  });
  await page.mouse.click(ptStart.x, ptStart.y);
  await page.waitForTimeout(300);
  const startTry = await page.evaluate(() => window.__tiltrEd.elements);
  const takenMsg = (await page.textContent("#edStatus")).trim();
  check(
    `Start-Zelle bleibt frei ("${takenMsg}")`,
    startTry === 1 && takenMsg.includes("belegt"),
  );

  // Preview: Testen -> echte Spielschleife mit ✏️-Rücksprung.
  await page.click("#edTest");
  await page.waitForTimeout(3600); // Kalibrier-Countdown
  const hudShown = !(await page.locator("#hud").getAttribute("class")).includes(
    "hidden",
  );
  const editBtnShown = !(
    await page.locator("#editBtn").getAttribute("class")
  ).includes("hidden");
  const homeHidden = (
    await page.locator("#homeBtn").getAttribute("class")
  ).includes("hidden");
  const ball = await page.evaluate(() => window.__tiltrBall);
  check(
    "Preview läuft in der Spielschleife (HUD + ✏️ + Ball, 🏠 versteckt)",
    hudShown && editBtnShown && homeHidden && !!ball,
  );
  await page.click("#editBtn");
  await page.waitForTimeout(300);
  const backInEditor = !(
    await page.locator("#editor").getAttribute("class")
  ).includes("hidden");
  const stillOne = await page.evaluate(() => window.__tiltrEd?.elements);
  check(
    `✏️ führt zurück in den Editor (Entwurf erhalten: ${stillOne} Element)`,
    backInEditor && stillOne === 1,
  );

  // Speichern -> Bibliothek zeigt das Level, Menü zählt es.
  await page.click("#edSave");
  const savedMsg = (await page.textContent("#edStatus")).trim();
  await page.click("#edClose");
  await page.waitForTimeout(300);
  // ‹ führt zurück in die WERKSTATT, nicht ins Hauptmenü.
  const backInWorkshop = !(
    await page.locator("#workshop").getAttribute("class")
  ).includes("hidden");
  check("Editor-‹ führt zurück in die Werkstatt", backInWorkshop);

  // Aktionszeile einer Bibliothek-Karte: zwei Text-Buttons + Icon-Gruppe,
  // auf dem Tablet alles in EINER Zeile (vorher brachen 6 Buttons um).
  const actions = await page.evaluate(() => {
    const row = document.querySelector("#workshopList .ws-actions");
    if (!row) return null;
    const btns = [...row.querySelectorAll("button")];
    return {
      icons: row.querySelectorAll(".ws-icons .ws-icon").length,
      rows: new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top)))
        .size,
      tips: btns.filter((b) => b.dataset.tip).length,
    };
  });
  check(
    `Bibliothek-Karte: eine Aktionszeile (${actions?.rows} Zeile(n), ${actions?.icons} Icon-Aktionen mit ${actions?.tips} Tooltips)`,
    !!actions &&
      actions.rows === 1 &&
      actions.icons === 4 &&
      actions.tips === 4,
  );
  if (
    (await page.locator("#workshop").getAttribute("class")).includes("hidden")
  )
    await page.click("#workshopBtn");
  const items = await page.locator(".ws-item").count();
  const wsName = (await page.textContent(".ws-name")).trim();
  await page.click("#workshopClose");
  const count = (await page.textContent("#workshopCount")).trim();
  check(
    `Speichern + Bibliothek ("${savedMsg}" / "${wsName}" / ${count})`,
    savedMsg.includes("Gespeichert") &&
      items === 1 &&
      wsName === "Mein Level" &&
      count === "(1)",
  );

  // Löschen (Zwei-Tap) muss auch den Menü-Zähler mitziehen – er hing bisher
  // am Editor-Speichern und blieb nach dem Löschen auf dem alten Wert.
  await page.click("#workshopBtn");
  await page.waitForTimeout(200);
  await page.click("#workshopList .ws-danger");
  await page.waitForTimeout(200);
  await page.click("#workshopList .ws-danger"); // Bestätigung
  await page.waitForTimeout(300);
  const itemsAfterDelete = await page.locator("#workshopList .ws-item").count();
  await page.click("#workshopClose");
  const countAfterDelete = (await page.textContent("#workshopCount")).trim();
  check(
    `Löschen erniedrigt den Menü-Zähler (${itemsAfterDelete} Level, Zähler "${countAfterDelete}")`,
    itemsAfterDelete === 0 && countAfterDelete === "",
  );

  // Für die folgenden Prüfungen wieder ein Level anlegen.
  await page.click("#workshopBtn");
  await page.click("#wsImportBtn");
  await page.fill(
    "#wsImportText",
    JSON.stringify({
      id: "custom-e2e-again",
      name: "Mein Level",
      pingBudget: 3,
      floors: [
        {
          size: [6, 8],
          maze: { seed: 4 },
          elements: [],
          start: [0, 0],
          goal: [5, 7],
        },
      ],
    }),
  );
  await page.click("#wsImportGo");
  await page.waitForTimeout(300);
  await page.click("#wsImportBtn");
  await page.click("#workshopClose");

  // Normales Spielen aus der Bibliothek (kein Editor-Preview): 🏠 ist wieder
  // da, ✏️ nicht – nur der Preview bindet den Rückweg an den Editor.
  await page.click("#workshopBtn");
  await page.locator("#workshopList .ws-actions .btn-primary").first().click(); // ▶ Spielen
  await page.waitForTimeout(600);
  const homeShown = !(
    await page.locator("#homeBtn").getAttribute("class")
  ).includes("hidden");
  const editHidden = (
    await page.locator("#editBtn").getAttribute("class")
  ).includes("hidden");
  check(
    "Bibliothek-Spielen: 🏠 sichtbar, ✏️ versteckt",
    homeShown && editHidden,
  );
  await page.close();
}
if (want("12")) {
  // Phone-Gegenprobe: unter 900px wird der Editor zur Leisten-Ansicht.
  // Dazu die drei Phone-Regressionen: Karte bleibt nach dem Layout-Settle
  // und nach Viewport-Resizes sichtbar (Renderer-Backing-Reset löscht den
  // Canvas – der Editor muss selbst neu malen), der Kopf bleibt kompakt
  // (einzeilige Badge-Leiste), und das Wand-Werkzeug trifft die NÄCHSTE
  // Kante statt einer 10-px-Fingerzone.
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    locale: "de-DE",
    hasTouch: true,
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  // Gegenprobe: unter 900px bleibt das Menü die bewährte Phone-Säule.
  const menuCols = await page.evaluate(
    () =>
      getComputedStyle(document.getElementById("modeList")).gridTemplateColumns,
  );
  check(`Phone-Menü bleibt einspaltig (${menuCols})`, menuCols === "none");

  await page.click("#workshopBtn");
  const wsCols = await page.evaluate(
    () =>
      getComputedStyle(document.getElementById("workshopActions"))
        .gridTemplateColumns,
  );
  check(`Phone: Werkstatt-Karten gestapelt (${wsCols})`, wsCols === "none");
  await page.click("#wsNewBtn");
  await page.waitForTimeout(1200); // Layout-Settle: hier verschwand die Karte
  const cols = await page.evaluate(
    () =>
      getComputedStyle(document.getElementById("edBody")).gridTemplateColumns,
  );
  check(`Phone-Editor: eine Spalte (${cols})`, cols.split(" ").length === 1);

  // Wand-Blau mit debug-Alpha 0.55 über bgDeep ≈ RGB(62, 95, 147).
  const mapVisible = () =>
    page.evaluate(() => {
      const c = document.getElementById("edCanvas");
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) {
        if (
          d[i] > 45 &&
          d[i] < 80 &&
          d[i + 1] > 75 &&
          d[i + 1] < 115 &&
          d[i + 2] > 120 &&
          d[i + 2] < 170
        )
          return true;
      }
      return false;
    });
  check("Phone: Karte nach Layout-Settle sichtbar", await mapVisible());
  await page.setViewportSize({ width: 390, height: 700 }); // Browser-Toolbar-Effekt
  await page.waitForTimeout(600);
  check(
    "Phone: Karte nach Toolbar-Resize weiterhin sichtbar",
    await mapVisible(),
  );

  const bodyTop = await page.evaluate(
    () => document.getElementById("edBody").getBoundingClientRect().top,
  );
  check(`Phone: kompakter Editor-Kopf (Karte ab y=${bodyTop})`, bodyTop < 240);

  // Phone-Umbau: das Spielfeld dominiert – Palette ist eine kompakte
  // Werkzeugleiste, Elemente wählt man in einem Grid-Sheet, Eigenschaften
  // liegen in einem Drawer unten. Die Karte bekommt >55% der Höhe.
  const mapShare = await page.evaluate(
    () =>
      document.getElementById("edCanvasWrap").getBoundingClientRect().height /
      innerHeight,
  );
  check(
    `Phone: Spielfeld dominiert (${Math.round(mapShare * 100)}% der Höhe)`,
    mapShare > 0.55,
  );

  const tapPhone = async (cx, cy) => {
    const pt = await page.evaluate(
      ([x, y]) => {
        const ed = window.__tiltrEd;
        const box = document.getElementById("edCanvas").getBoundingClientRect();
        return {
          x: box.left + (ed.ox + x * ed.scale) / ed.dpr,
          y: box.top + (ed.oy + y * ed.scale) / ed.dpr,
        };
      },
      [cx * 100 + 50, cy * 100 + 50],
    );
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(250);
  };

  // Element-Wahl: Button öffnet ein Grid-Sheet (mehrspaltig, kein
  // einzeiliges Horizontal-Scrollen mehr), Auswahl schließt es.
  const elBtn = await page.locator("#edElementBtn:visible").count();
  let sheetCols = 0;
  let sheetClosed = false;
  if (elBtn === 1) {
    await page.click("#edElementBtn");
    sheetCols = await page.evaluate(
      () =>
        getComputedStyle(
          document.getElementById("edElements"),
        ).gridTemplateColumns.split(" ").length,
    );
    await page
      .locator("#edElements .ed-tile", { hasText: "Glasboden" })
      .click();
    sheetClosed = await page.evaluate(
      () =>
        getComputedStyle(document.getElementById("edElements")).display ===
        "none",
    );
  }
  check(
    `Phone: Element-Wahl als Grid-Sheet (${sheetCols} Spalten)`,
    elBtn === 1 && sheetCols >= 3 && sheetClosed,
  );

  // Eigenschaften-Drawer: Tap auf ein Element öffnet ihn, der Griff schließt.
  const drawerY = () =>
    page.evaluate(() => {
      const tf = getComputedStyle(
        document.getElementById("edDrawer"),
      ).transform;
      return tf === "none" ? 0 : new DOMMatrixReadOnly(tf).m42;
    });
  const hasDrawer = await page.locator("#edDrawer").count();
  let openY = -1;
  let closedY = -1;
  if (hasDrawer === 1 && elBtn === 1) {
    await tapPhone(1, 1); // Glasboden platzieren …
    await tapPhone(1, 1); // … und antippen: auswählen + Drawer öffnen
    openY = await drawerY();
    await page.click("#edDrawerHandle");
    await page.waitForTimeout(400);
    closedY = await drawerY();
  }
  check(
    `Phone: Auswahl öffnet den Eigenschaften-Drawer (y=${Math.round(openY)})`,
    hasDrawer === 1 && openY === 0,
  );
  check(
    `Phone: Drawer-Griff schließt wieder (y=${Math.round(closedY)})`,
    hasDrawer === 1 && closedY > 50,
  );

  // Drawer-Kopf identifiziert das Element (Galerie-Icon + Name) und hat
  // ein ✕ zum Schließen – der Griff allein war nicht selbsterklärend.
  let handleInfo = { text: "(fehlt)", icon: 0 };
  let closeY = -1;
  if (hasDrawer === 1 && elBtn === 1) {
    await tapPhone(1, 1); // Glasboden erneut auswählen -> Drawer auf
    handleInfo = await page.evaluate(() => ({
      text:
        document.getElementById("edDrawerHandle")?.textContent?.trim() ??
        "(fehlt)",
      icon: document.querySelectorAll("#edDrawerHandle canvas").length,
    }));
    if (await page.locator("#edDrawerClose:visible").count()) {
      await page.click("#edDrawerClose");
      await page.waitForTimeout(400);
      closeY = await drawerY();
    }
  }
  check(
    `Phone: Drawer-Kopf zeigt Element-Icon + Name ("${handleInfo.text}")`,
    handleInfo.icon === 1 && handleInfo.text.includes("Glasboden"),
  );
  check(`Phone: ✕ schließt den Drawer (y=${Math.round(closeY)})`, closeY > 50);

  // … und auf Touch per Fokus nach dem Tap (title-Attribute können das
  // nicht): Tap aufs Werkzeug zeigt die Blase mit dem Namen.
  if (await page.locator("#edTool-select").count()) {
    await page.tap("#edTool-select");
    await page.waitForTimeout(300);
  }
  const tipPhone = await page.evaluate(() => {
    const b = document.getElementById("edTool-select");
    if (!b) return { content: "fehlt", opacity: "0", focused: false };
    const s = getComputedStyle(b, "::after");
    return {
      content: s.content,
      opacity: s.opacity,
      focused: document.activeElement === b,
    };
  });
  check(
    `Phone: Tooltip nach Tap auf Icon-Button (${tipPhone.content} / ${tipPhone.opacity})`,
    tipPhone.content.includes("Auswählen") &&
      tipPhone.opacity === "1" &&
      tipPhone.focused,
  );

  // Wand-Werkzeug: Tap 30 Welteinheiten neben der Gridlinie (alte Zone: 18)
  // schaltet die nächste Kante trotzdem (carve +1).
  await page.locator(".ed-tile", { hasText: "▤" }).click();
  const pt = await page.evaluate(() => {
    const ed = window.__tiltrEd;
    const box = document.getElementById("edCanvas").getBoundingClientRect();
    return {
      x: box.left + (ed.ox + 130 * ed.scale) / ed.dpr,
      y: box.top + (ed.oy + 150 * ed.scale) / ed.dpr,
    };
  });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
  const edits = await page.evaluate(() => ({
    carve: window.__tiltrEd.carve,
    add: window.__tiltrEd.add,
  }));
  check(
    `Phone: Wand-Tap neben der Linie trifft die nächste Kante (carve=${edits.carve})`,
    edits.carve === 1 && edits.add === 0,
  );
  await page.close();
}

// --- Lauf 13: Werkstatt-Teilen – Mehr-Ebenen mit Transporter-Paar, Share-Link
// (deflate im Hash), Empfang auf zweiter Seite, Import per Einfügen. ---
if (want("13")) {
  const ctx = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    locale: "de-DE",
  });
  const pageA = await ctx.newPage();
  pageA.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  pageA.on("pageerror", (e) => errors.push(String(e)));
  await pageA.goto(`${BASE}/?nosplash`);
  await pageA.click("#workshopBtn");
  await pageA.click("#wsNewBtn");
  await pageA.waitForTimeout(500);

  // Zweite Ebene anlegen (Tab ＋) -> aktiv ist E2.
  await pageA.locator("#edFloorTabs .chip", { hasText: "＋" }).click();
  await pageA.waitForTimeout(300);
  const floors = await pageA.evaluate(() => ({
    n: window.__tiltrEd?.floors,
    active: window.__tiltrEd?.activeFloor,
  }));
  check(
    `Ebenen-Tabs: zweite Ebene angelegt (E${(floors.active ?? 0) + 1} von ${floors.n})`,
    floors.n === 2 && floors.active === 1,
  );

  // Transporter-Paar: E1 -> E2 und zurück (Zwei-Tap mit Tab-Wechsel).
  const tapCell = async (cx, cy) => {
    const pt = await pageA.evaluate(
      ([x, y]) => {
        const ed = window.__tiltrEd;
        const box = document.getElementById("edCanvas").getBoundingClientRect();
        return {
          x: box.left + (ed.ox + x * ed.scale) / ed.dpr,
          y: box.top + (ed.oy + y * ed.scale) / ed.dpr,
        };
      },
      [cx * 100 + 50, cy * 100 + 50],
    );
    await pageA.mouse.click(pt.x, pt.y);
    await pageA.waitForTimeout(250);
  };
  const tab = (label) =>
    pageA.locator("#edFloorTabs .chip", { hasText: label }).first();
  await pageA.locator(".ed-tile", { hasText: "Transporter" }).click();
  await tab("E1").click();
  await tapCell(2, 2); // Pad auf E1 …
  await tab("E2").click();
  await tapCell(1, 1); // … Ziel auf E2
  await tapCell(4, 4); // Rückweg-Pad auf E2 …
  await tab("E1").click();
  await tapCell(3, 3); // … Ziel auf E1
  await pageA.waitForTimeout(600);
  const e1Count = await pageA.evaluate(() => window.__tiltrEd?.elements);
  const failCount = await pageA.locator("#edBadges .ed-badge.fail").count();
  check(
    `Transporter-Paar über zwei Ebenen, alle Beweise grün (E1: ${e1Count} Element, ${failCount} rot)`,
    e1Count === 1 && failCount === 0,
  );

  // Share-Link erzeugen (nur mit grünen Pflicht-Badges möglich).
  await pageA.fill("#edName", "Ebenen-Probe");
  await pageA.dispatchEvent("#edName", "change");
  await pageA.click("#edShare");
  await pageA.waitForTimeout(400);
  const shareUrl = await pageA.evaluate(() => window.__tiltrShareUrl);
  check(
    `Share-Link erzeugt (deflate, ${shareUrl?.length ?? 0} Zeichen)`,
    typeof shareUrl === "string" &&
      shareUrl.includes("#level=1") &&
      shareUrl.length < 4000,
  );

  // Empfang auf einer zweiten Seite: Interstitial -> in die Werkstatt übernehmen.
  const pageB = await ctx.newPage();
  pageB.on("pageerror", (e) => errors.push(String(e)));
  await pageB.goto(shareUrl.replace(BASE, "") ? shareUrl : shareUrl); // vollständige URL inkl. Hash
  await pageB.waitForTimeout(600);
  const shareTitle = (await pageB.textContent("#interTitle")).trim();
  const shareText = (await pageB.textContent("#interText")).trim();
  check(
    `Geteiltes Level wird angeboten ("${shareTitle}")`,
    shareTitle.includes("Geteiltes Level") &&
      shareText.includes("Ebenen-Probe"),
  );
  check(
    "Level-Hash wurde aus der URL entfernt",
    await pageB.evaluate(() => location.hash === ""),
  );
  await pageB.click("#interSecondary"); // In die Werkstatt
  await pageB.waitForTimeout(300);
  const wsOpen = !(
    await pageB.locator("#workshop").getAttribute("class")
  ).includes("hidden");
  const wsName = (await pageB.textContent(".ws-name")).trim();
  check(
    `Übernommen: Werkstatt zeigt "${wsName}"`,
    wsOpen && wsName === "Ebenen-Probe",
  );

  // Import per Einfügen (Tablet-Weg ohne Datei).
  await pageB.click("#wsImportBtn");
  await pageB.fill(
    "#wsImportText",
    JSON.stringify({
      id: "custom-e2e-import",
      name: "Import-Probe",
      pingBudget: 3,
      floors: [
        {
          size: [4, 4],
          maze: { seed: 5 },
          elements: [],
          start: [0, 0],
          goal: [3, 3],
        },
      ],
    }),
  );
  await pageB.click("#wsImportGo");
  await pageB.waitForTimeout(200);
  const importMsg = (await pageB.textContent("#wsImportStatus")).trim();
  const wsItems = await pageB.locator(".ws-item").count();
  check(
    `Import per Einfügen ("${importMsg}", ${wsItems} Level)`,
    importMsg.includes("importiert") && wsItems === 2,
  );
  await ctx.close();
}

// --- Lauf 14: Editor-Verknüpfungen – Tür ohne Öffner ist ein normaler
// Zwischenzustand (Badge „Verknüpfungen" statt Load-Exception), Auto-Link auf
// die NÄCHSTE Tür, 🔗-Tap-Verknüpfen, global eindeutige Tür-IDs, aufräumendes
// Löschen, Rename mit Referenz-Umhängen, Transporter-Ziel neu wählbar. ---
if (want("14")) {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);
  await page.click("#workshopBtn");
  await page.click("#wsNewBtn");
  await page.waitForTimeout(500);

  const tap = async (cx, cy, edge = null) => {
    const pt = await page.evaluate(
      ([cx, cy, edge]) => {
        const ed = window.__tiltrEd;
        const box = document.getElementById("edCanvas").getBoundingClientRect();
        let wx = cx * 100 + 50;
        let wy = cy * 100 + 50;
        if (edge === "e") wx = (cx + 1) * 100;
        if (edge === "s") wy = (cy + 1) * 100;
        return {
          x: box.left + (ed.ox + wx * ed.scale) / ed.dpr,
          y: box.top + (ed.oy + wy * ed.scale) / ed.dpr,
        };
      },
      [cx, cy, edge],
    );
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(250);
  };
  const els = (fl = 0) =>
    page.evaluate((fl) => window.__tiltrEd.def.floors[fl].elements, fl);
  const status = async () => (await page.textContent("#edStatus")).trim();

  // Tür ohne Öffner: lädt weiter (Loader mild), nur „Verknüpfungen" ist rot.
  await page.locator(".ed-tile", { hasText: /^Tür$/ }).click();
  await tap(2, 2, "e");
  await page.waitForTimeout(500); // Validate-Debounce
  const doorState = await page.evaluate(() => ({
    loadError: window.__tiltrEd.loadError,
    badges: [...document.querySelectorAll("#edBadges .ed-badge")].map(
      (b) => b.textContent,
    ),
  }));
  check(
    'Tür ohne Öffner lädt – Badge „Verknüpfungen" statt Load-Exception',
    doorState.loadError === null &&
      doorState.badges.some((b) => b === "✓ Lädt") &&
      doorState.badges.some((b) => b === "✗ Verknüpfungen"),
  );

  // Zweite Tür + Schlüssel daneben: Auto-Link auf die NÄCHSTE Tür.
  await tap(4, 5, "s");
  await page.locator(".ed-tile", { hasText: /^Schlüssel & Tür$/ }).click();
  await tap(4, 6);
  let key = (await els()).find((e) => e.type === "key");
  check(
    `Auto-Link auf die nächstgelegene Tür (${key?.opens})`,
    key?.opens === "tor2",
  );

  // 🔗-Tap: Schlüssel auswählen, „Tür wählen", Tür 1 antippen.
  await page.locator(".ed-tile", { hasText: "☝" }).first().click();
  await tap(4, 6);
  await page.locator("#edProps .ed-link").click();
  await tap(2, 2, "e");
  key = (await els()).find((e) => e.type === "key");
  check(
    `🔗-Tap verknüpft um ("${await status()}")`,
    key?.opens === "tor1" && (await status()).includes("tor1"),
  );

  // Tür-IDs sind GLOBAL eindeutig: die neue Tür auf E2 heißt tor3.
  await page.locator("#edFloorTabs .chip", { hasText: "＋" }).click();
  await page.locator(".ed-tile", { hasText: /^Tür$/ }).click();
  await tap(2, 2, "e");
  const e2Door = (await els(1)).find((e) => e.type === "door");
  check(
    `Tür-ID global eindeutig über Ebenen (${e2Door?.id})`,
    e2Door?.id === "tor3",
  );

  // Tür 1 löschen: der Schlüssel wird auf die nächste verbleibende Tür
  // derselben Ebene umgehängt statt ins Leere zu zeigen.
  await page.locator("#edFloorTabs .chip", { hasText: "E1" }).first().click();
  await page.locator(".ed-tile", { hasText: "☝" }).first().click();
  await tap(2, 2, "e");
  await page.locator("#edProps .btn-ghost", { hasText: "⌫" }).click();
  await page.waitForTimeout(300);
  key = (await els()).find((e) => e.type === "key");
  check(
    `Tür löschen hängt Öffner um ("${await status()}")`,
    key?.opens === "tor2" && (await status()).includes("umgehängt"),
  );

  // Rename: alle Referenzen ziehen mit.
  await tap(4, 5, "s");
  await page.locator("#edProps input[type=text]").fill("haupttor");
  await page.locator("#edProps input[type=text]").press("Enter");
  await page.waitForTimeout(300);
  key = (await els()).find((e) => e.type === "key");
  const renamed = (await els()).find((e) => e.type === "door");
  check(
    `Tür-Rename zieht Referenzen mit (${renamed?.id} / ${key?.opens})`,
    renamed?.id === "haupttor" && key?.opens === "haupttor",
  );

  // Transporter-Ziel per 🔗 neu wählen – auch über Ebenen (Pad E1, Ziel E2).
  await page.locator(".ed-tile", { hasText: "Transporter" }).click();
  await tap(1, 6);
  await tap(3, 6);
  await page.locator(".ed-tile", { hasText: "☝" }).first().click();
  await tap(1, 6);
  await page.locator("#edProps .ed-link").click();
  await page.locator("#edFloorTabs .chip", { hasText: "E2" }).first().click();
  await tap(2, 5);
  const pad = (await els(0)).find((e) => e.type === "transporter");
  check(
    `Transporter-Ziel per 🔗 neu gewählt (E${(pad?.target?.floor ?? -1) + 1} ${JSON.stringify(pad?.target?.cell)})`,
    pad?.target?.floor === 1 &&
      pad?.target?.cell?.[0] === 2 &&
      pad?.target?.cell?.[1] === 5,
  );

  await page.close();
}

// --- Lauf 15: Bearbeitungs-Draft – jede Änderung landet im localStorage
// (Reload-fest, „Weiter an …" in der Werkstatt), Neu/Zufall/Bearbeiten
// verwerfen den Draft nur nach Zwei-Tap-Bestätigung, Speichern räumt ihn. ---
if (want("15")) {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);
  await page.click("#workshopBtn");
  await page.click("#wsNewBtn");
  await page.waitForTimeout(500);

  const tap = async (cx, cy) => {
    const pt = await page.evaluate(
      ([x, y]) => {
        const ed = window.__tiltrEd;
        const box = document.getElementById("edCanvas").getBoundingClientRect();
        return {
          x: box.left + (ed.ox + x * ed.scale) / ed.dpr,
          y: box.top + (ed.oy + y * ed.scale) / ed.dpr,
        };
      },
      [cx * 100 + 50, cy * 100 + 50],
    );
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(250);
  };
  const editorOpen = async () =>
    !(await page.locator("#editor").getAttribute("class")).includes("hidden");

  // Bearbeitung: Loch setzen, Name ändern – dann RELOAD (PWA-Realität:
  // Tab stirbt, App-Wechsel). Die Werkstatt bietet danach „Weiter an …".
  await tap(1, 1);
  await page.fill("#edName", "Draft-Probe");
  await page.dispatchEvent("#edName", "change");
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForTimeout(800);
  await page.click("#workshopBtn");
  const resumeVisible = await page.locator("#wsResumeBtn:visible").count();
  const resumeText = resumeVisible
    ? (await page.textContent("#wsResumeBtn")).trim()
    : "(fehlt)";
  check(
    `Draft überlebt den Reload: „Weiter an …" in der Werkstatt ("${resumeText}")`,
    resumeVisible === 1 && resumeText.includes("Draft-Probe"),
  );

  let resumedEls = -1;
  if (resumeVisible) {
    await page.click("#wsResumeBtn");
    await page.waitForTimeout(500);
    resumedEls = await page.evaluate(() => window.__tiltrEd?.elements);
  }
  check(
    `Fortsetzen öffnet den Editor mit dem Draft (${resumedEls} Element)`,
    resumedEls === 1 && (await editorOpen()),
  );

  // „Neu" bei vorhandenem Draft: erster Tap warnt (Editor bleibt zu),
  // zweiter Tap startet wirklich leer. (Klicks abgesichert, damit der
  // Rot-Lauf ohne Feature nicht in Timeouts läuft.)
  const ensureWorkshop = async () => {
    if (await editorOpen()) {
      await page.click("#edClose");
      await page.waitForTimeout(200);
    }
    if (
      (await page.locator("#workshop").getAttribute("class")).includes("hidden")
    ) {
      await page.click("#workshopBtn");
      await page.waitForTimeout(200);
    }
  };
  await ensureWorkshop();
  await page.click("#wsNewBtn");
  await page.waitForTimeout(300);
  const armedText = (await page.textContent("#wsNewBtn")).trim();
  const stillClosed = !(await editorOpen());
  check(
    `„Neu" verlangt Bestätigung, solange ein Draft existiert ("${armedText}")`,
    stillClosed && armedText.includes("Sicher"),
  );
  if (stillClosed) {
    await page.click("#wsNewBtn");
    await page.waitForTimeout(500);
  }
  const blankEls = await page.evaluate(() => window.__tiltrEd?.elements);
  check(
    `Zweiter Tap startet leer (${blankEls} Elemente)`,
    stillClosed && (await editorOpen()) && blankEls === 0,
  );

  // Speichern legt das Level in die Bibliothek UND räumt den Draft weg:
  // kein „Weiter an …" mehr für bereits Gesichertes.
  if (await editorOpen()) await page.click("#edSave");
  await ensureWorkshop();
  const hasResumeBtn = await page.locator("#wsResumeBtn").count();
  const resumeAfterSave = await page.locator("#wsResumeBtn:visible").count();
  check(
    'Speichern räumt den Draft (kein „Weiter an …" mehr)',
    hasResumeBtn === 1 && resumeAfterSave === 0,
  );
  await page.close();
}

// --- Lauf 16: Geist-Duell – ein gewonnener Lauf wird zur Herausforderung
// (Link mit Level + Spur + Zeit), der Empfänger rennt gegen die echte Spur.
// Zusätzlich: kaputte Tokens werden abgewiesen, unplausible Spuren treten
// ohne Geist an (der Beweis greift im echten Flow). ---
if (want("16")) {
  const ctx = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    locale: "de-DE",
  });
  const pageA = await ctx.newPage();
  pageA.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  pageA.on("pageerror", (e) => errors.push(String(e)));
  await pageA.goto(`${BASE}/?nosplash`);

  // Ein Level, das in einer Sekunde zu gewinnen ist: Ziel direkt unter dem
  // Start, Wand dazwischen aufgeschnitten. Kommt per Einfüge-Import rein.
  const sprint = {
    id: "custom-sprint",
    name: "Sprint",
    pingBudget: 3,
    parTimeS: 30,
    floors: [
      {
        size: [4, 5],
        maze: { seed: 3, carve: [[[0, 0], "s"]] },
        elements: [],
        start: [0, 0],
        goal: [0, 1],
      },
    ],
  };
  // Absendername (optional, im Menü-Footer): macht das Duell persönlich.
  if (await pageA.locator("#playerName").count()) {
    await pageA.fill("#playerName", "Dominik");
    await pageA.dispatchEvent("#playerName", "change");
  }
  await pageA.click("#workshopBtn");
  await pageA.click("#wsImportBtn");
  await pageA.fill("#wsImportText", JSON.stringify(sprint));
  await pageA.click("#wsImportGo");
  await pageA.waitForTimeout(300);
  await pageA.locator("#workshopList .ws-actions .btn-primary").first().click(); // ▶ Spielen
  await pageA.waitForTimeout(3800); // Kalibrier-Countdown

  // Mit der Pfeiltaste nach unten ins Ziel rollen.
  await pageA.keyboard.down("ArrowDown");
  await pageA.waitForTimeout(1500);
  await pageA.keyboard.up("ArrowDown");
  await pageA.waitForTimeout(2600); // Ergebnis-Karte kommt nach 1,8 s
  const winTitle = (await pageA.textContent("#interTitle")).trim();
  check(`Sprint-Level gewonnen ("${winTitle}")`, winTitle.includes("Ziel in"));
  const hasExtra =
    (await pageA.locator("#interExtra").count()) &&
    (await pageA.locator("#interExtra").isVisible());
  const extraLabel = hasExtra
    ? (await pageA.textContent("#interExtra")).trim()
    : "(fehlt)";
  check(
    `Ergebnis-Karte bietet Herausfordern an ("${extraLabel}")`,
    extraLabel.includes("Herausfordern"),
  );

  if (hasExtra) {
    await pageA.click("#interExtra");
    await pageA.waitForTimeout(600);
  }
  const duelUrl = await pageA.evaluate(() => window.__tiltrDuelUrl);
  check(
    `Duell-Link erzeugt (${duelUrl ? duelUrl.length : 0} Zeichen)`,
    typeof duelUrl === "string" &&
      duelUrl.includes("#duel=1") &&
      duelUrl.length < 4000,
  );
  // Der Link teilt, schließt aber die Karte NICHT – man entscheidet danach.
  check(
    "Teilen lässt die Ergebnis-Karte offen",
    hasExtra && (await pageA.locator("#interstitial").isVisible()),
  );

  // Empfang auf einer zweiten Seite: Herausforderung -> antreten -> der
  // Rivale rollt mit (Geist aktiv, Zielzeit aus dem Link).
  const pageB = await ctx.newPage();
  pageB.on("pageerror", (e) => errors.push(String(e)));
  await pageB.goto(typeof duelUrl === "string" ? duelUrl : `${BASE}/?nosplash`);
  await pageB.waitForTimeout(700);
  const duelTitle = (await pageB.textContent("#interTitle")).trim();
  const duelText = (await pageB.textContent("#interText")).trim();
  check(
    `Herausforderung wird angeboten ("${duelTitle}")`,
    duelTitle.includes("Herausforderung") &&
      duelText.includes("Sprint") &&
      duelText.includes("hörst"),
  );
  check(
    `Absendername steht in der Herausforderung ("${duelText.slice(0, 24)}…")`,
    duelText.startsWith("Dominik"),
  );
  check(
    "Duell-Hash wurde aus der URL entfernt",
    typeof duelUrl === "string" &&
      (await pageB.evaluate(() => location.hash === "")),
  );

  if (await pageB.locator("#interPrimary").isVisible()) {
    await pageB.click("#interPrimary"); // Antreten
    await pageB.waitForTimeout(4200);
  }
  const rival = await pageB.evaluate(() => window.__tiltrGhost);
  check(
    `Rivale läuft im Duell mit (Zielzeit ${rival ? rival.time : "?"} s, aktiv: ${rival?.active})`,
    !!rival && rival.active === true && rival.time > 0 && rival.time < 30,
  );

  // Kaputtes Token: klare Absage statt Absturz.
  const pageC = await ctx.newPage();
  pageC.on("pageerror", (e) => errors.push(String(e)));
  await pageC.goto(`${BASE}/?nosplash#duel=1kaputtesTokenOhneSinn`);
  await pageC.waitForTimeout(600);
  const badText = (await pageC.textContent("#interText")).trim();
  check(
    `Kaputtes Duell-Token wird abgewiesen ("${badText.slice(0, 34)}…")`,
    badText.includes("beschädigt"),
  );

  // App SCHON OFFEN, Link angetippt: Es ändert sich nur der Hash (kein
  // Neuladen) – der Empfang muss trotzdem greifen (PWA-Realität).
  if (typeof duelUrl === "string") {
    await pageC.evaluate((tok) => {
      location.hash = `#duel=${tok}`;
    }, duelUrl.split("#duel=")[1]);
    await pageC.waitForTimeout(800);
  }
  const openAppText = (await pageC.textContent("#interText")).trim();
  check(
    `Duell-Link erreicht auch die offene App ("${openAppText.slice(0, 30)}…")`,
    openAppText.includes("Sprint"),
  );

  // Unplausible Spur (Teleport mitten im Lauf): Das Duell startet, aber OHNE
  // Geist – ein Phantom mit 0,1 s tritt nicht an.
  const pageD = await ctx.newPage();
  pageD.on("pageerror", (e) => errors.push(String(e)));
  const cheatToken = await pageC.evaluate(async (def) => {
    // Encoder unabhängig nachgebaut: prüft auch das Token-FORMAT.
    const frames = [];
    for (let i = 0; i < 40; i++)
      frames.push(i * 0.125, 0, 50 + i * 3, 50 + i * 3);
    const payload = {
      v: 1,
      def,
      t: 4.875,
      by: "Phantom",
      g: { s: [0, 50, 50], d: frames.map(() => 0).slice(0, 78), f: [] },
    };
    // d: erst harmlose Nullen, dann ein Teleport quer über die Karte
    payload.g.d[40] = 3000;
    const json = new TextEncoder().encode(JSON.stringify(payload));
    const packed = new Uint8Array(
      await new Response(
        new Blob([json])
          .stream()
          .pipeThrough(new CompressionStream("deflate-raw")),
      ).arrayBuffer(),
    );
    let bin = "";
    for (const b of packed) bin += String.fromCharCode(b);
    return (
      "1" +
      btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
    );
  }, sprint);
  await pageD.goto(`${BASE}/?nosplash#duel=${cheatToken}`);
  await pageD.waitForTimeout(700);
  const cheatText = (await pageD.textContent("#interText")).trim();
  if (await pageD.locator("#interPrimary").isVisible()) {
    await pageD.click("#interPrimary");
    await pageD.waitForTimeout(4200);
  }
  const noGhost = await pageD.evaluate(() => window.__tiltrGhost);
  check(
    `Unplausible Spur tritt ohne Geist an ("${cheatText.split("\n").pop()?.slice(0, 30)}…")`,
    cheatText.includes("Zielzeit") && noGhost === null,
  );
  await ctx.close();
}

// --- Lauf 17: Hörtest – der echte Echo-Ping kommt aus einer zufälligen
// Richtung, die Kompassrose nimmt die Antwort, die Auswertung trennt
// Seiten- und Tiefen-Achse (der Sinn des Modus). ---
if (want("17")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  await page.click("#hearingBtn");
  await page.waitForTimeout(700);
  const open = await page.locator("#hearing").isVisible();
  const cells = await page.locator("#hearGrid .hear-cell").count();
  const dirCells = await page.locator("#hearGrid .hear-cell[data-dir]").count();
  const repeat = await page.locator("#hearGrid #hearRepeat").count();
  check(
    `Hörtest öffnet mit Kompassrose (offen=${open}, ${cells} Zellen: ${dirCells} Richtungen + ${repeat}× 🔊)`,
    open && cells === 9 && dirCells === 8 && repeat === 1,
  );

  const hook = () => page.evaluate(() => window.__tiltrHearing);
  /** Wartet auf eine Phase. Wichtig: Nach einer Antwort läuft ~1,1 s Feedback,
   *  in dem Taps IGNORIERT werden – „Runde hochgezählt" ist also NICHT
   *  gleich „nächste Frage steht". Deshalb wird auf !locked gewartet. */
  const awaitState = async (pred) => {
    for (let i = 0; i < 60; i++) {
      const st = await hook();
      if (st && pred(st)) return st;
      await page.waitForTimeout(100);
    }
    return await hook();
  };
  const state0 = await awaitState((s) => s.round === 0 && !s.locked);
  check(
    `Runde 1 läuft mit gezogener Richtung ("${state0?.asked}", ${state0?.round}/${state0?.total})`,
    !!state0 &&
      state0.round === 0 &&
      state0.total === 8 &&
      typeof state0.asked === "string",
  );

  const DIRS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  /* Was hat das OHR bekommen? Panning kann ein Automat nicht hören, die
     STRUKTUR des Reizes schon – und genau die war beim ersten Anlauf falsch
     („kommt immer aus derselben Richtung"): Der ungepannte Emissions-Chirp
     war das lauteste Ereignis, und der gepannte Teil war ein fast reiner Ton
     um 1 kHz, den das Ortungsgehör nicht verwerten kann. Geprüft wird
     deshalb: Chirp leise, ZWEI gepannte Anschläge, Position = gefragte
     Richtung, breitbandiger Anschlag vorhanden. */
  const Q = Math.SQRT1_2;
  const VEC = {
    n: [0, -1],
    ne: [Q, -Q],
    e: [1, 0],
    se: [Q, Q],
    s: [0, 1],
    sw: [-Q, Q],
    w: [-1, 0],
    nw: [-Q, -Q],
  };
  const readPing = async (dir) => {
    await page.click("#hearRepeat");
    await page.waitForTimeout(120);
    const ping = await page.evaluate(() => window.__tiltrPing);
    const [ex, ez] = VEC[dir].map((v) => v * 3);
    return {
      ping,
      ok:
        !!ping &&
        ping.chirpGain <= 0.08 &&
        ping.refl.length === 2 &&
        ping.refl.every(
          (r) =>
            Math.abs(r.x - ex) < 0.02 &&
            Math.abs(r.z - ez) < 0.02 &&
            r.broadband === true,
        ),
    };
  };
  const pings = [];
  const heard = new Set();

  // Runde 1 ABSICHTLICH daneben (zwei Schritte): Das Feedback muss die
  // richtige Richtung nachliefern, sonst lernt niemand etwas.
  pings.push(await readPing(state0.asked));
  heard.add(`${pings[0].ping?.refl?.[0]?.x},${pings[0].ping?.refl?.[0]?.z}`);
  const wrong = DIRS[(DIRS.indexOf(state0.asked) + 2) % 8];
  await page.click(`#hearGrid .hear-cell[data-dir="${wrong}"]`);
  await page.waitForTimeout(200);
  const feedback = (await page.textContent("#hearStatus")).trim();
  check(
    `Falsche Antwort nennt die echte Richtung ("${feedback}")`,
    feedback.startsWith("✗") && feedback.includes("es kam aus"),
  );

  // Restliche sieben Runden richtig beantworten.
  for (let n = 1; n < 8; n++) {
    const st = await awaitState((s) => s.round === n && !s.locked);
    const p = await readPing(st.asked);
    pings.push(p);
    heard.add(`${p.ping?.refl?.[0]?.x},${p.ping?.refl?.[0]?.z}`);
    await page.click(`#hearGrid .hear-cell[data-dir="${st.asked}"]`);
  }
  const bad = pings.find((p) => !p.ok);
  check(
    `Reiz ist ortbar aufgebaut: leiser Chirp + 2 gepannte Breitband-Anschläge (${pings.length} Pings, Chirp ${pings[0].ping?.chirpGain})`,
    pings.length === 8 && !bad,
  );
  check(
    `Die gepannte Position folgt der Richtung (${heard.size} verschiedene Positionen in 8 Runden)`,
    heard.size >= 3,
  );
  const done = await awaitState((s) => s.over);
  check(
    `Durchgang endet mit 7/8 exakt (exakt=${done?.score?.exact}, nah=${done?.score?.close})`,
    !!done &&
      done.done === true &&
      done.over === true &&
      done.score.total === 8 &&
      done.score.exact === 7,
  );

  const lines = (await page.locator("#hearResult p").allTextContents()).map(
    (l) => l.trim(),
  );
  const result = lines.join(" | ");
  const status = (await page.textContent("#hearStatus")).trim();
  check(
    `Auswertung trennt Seite und Tiefe ("${lines[2] ?? ""}" / "${lines[3] ?? ""}")`,
    lines.length === 5 &&
      result.includes("Seite (links/rechts)") &&
      result.includes("Tiefe (vorn/hinten)") &&
      status.includes("7 von 8"),
  );

  // Neuer Durchgang setzt zurück (frische Zufallsfolge, Zähler auf 0).
  await page.click("#hearRestart");
  await page.waitForTimeout(300);
  const fresh = await hook();
  const resultHidden = await page.locator("#hearResult").isVisible();
  check(
    `Neuer Durchgang startet bei 0 (round=${fresh?.round}, Ergebnis sichtbar=${resultHidden})`,
    !!fresh && fresh.round === 0 && fresh.done === false && !resultHidden,
  );

  await page.click("#hearClose");
  await page.waitForTimeout(200);
  check(
    "Schließen führt zurück ins Menü",
    !(await page.locator("#hearing").isVisible()) &&
      (await page.locator("#overlay").isVisible()),
  );
  await page.close();
}

// --- Lauf 18: Bildschirmsperre – man spielt durch NEIGEN, also darf Android
// nicht mitten im Lauf abdunkeln. Das Headless-Chromium hier bringt die API
// nicht mit, deshalb wird sie VOR dem App-Start durch eine getreue Attrappe
// ersetzt: So läuft der echte Pfad (anfordern, im Hintergrund verlieren, neu
// holen, hergeben) unter Test. ---
if (want("18")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    window.__wakeLog = { requests: 0, released: 0, sentinels: [] };
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request(type) {
          window.__wakeLog.requests++;
          const listeners = [];
          const s = {
            type,
            release() {
              window.__wakeLog.released++;
              for (const cb of listeners) cb();
              return Promise.resolve();
            },
            addEventListener(_t, cb) {
              listeners.push(cb);
            },
          };
          window.__wakeLog.sentinels.push(s);
          return Promise.resolve(s);
        },
      },
    });
  });
  await page.goto(`${BASE}/?seed=28&nosplash`);

  const wake = () =>
    page.evaluate(() => ({
      ...window.__tiltrWake,
      log: { ...window.__wakeLog, sentinels: undefined },
    }));
  const idle = await wake();
  check(
    `Im Menü keine Sperre (unterstützt=${idle.supported}, angefordert=${idle.log.requests})`,
    idle.supported === true &&
      idle.wanted === false &&
      idle.active === false &&
      idle.log.requests === 0,
  );

  await page.click("#quickBtn");
  await page.waitForTimeout(400);
  const playing = await wake();
  check(
    `Lauf hält den Bildschirm wach (${playing.log.requests}× angefordert, aktiv=${playing.active})`,
    playing.wanted === true &&
      playing.active === true &&
      playing.log.requests === 1,
  );

  // Wegschauen und Zurückkommen: Das System nimmt die Sperre im Hintergrund –
  // ohne Neuanforderung wäre sie für den Rest der Sitzung weg (der eigentliche
  // Stolperstein dieser API).
  await page.evaluate(async () => {
    await window.__wakeLog.sentinels[0].release(); // System gibt sie her
    const hide = (v) =>
      Object.defineProperty(document, "visibilityState", {
        get: () => v,
        configurable: true,
      });
    hide("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    hide("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(200);
  const back = await wake();
  check(
    `Nach Hintergrund wird die Sperre neu geholt (${back.log.requests}× angefordert, aktiv=${back.active})`,
    back.log.requests === 2 && back.active === true,
  );

  await page.waitForTimeout(3400); // Kalibrierung abwarten, dann heimgehen
  await page.click("#homeBtn");
  await page.waitForTimeout(250);
  const home = await wake();
  check(
    `Im Menü wird die Sperre hergegeben (aktiv=${home.active}, ${home.log.released}× freigegeben)`,
    home.wanted === false && home.active === false && home.log.released === 2,
  );

  // Der Hörtest lauscht minutenlang, ohne dass jemand tippt – erst recht wach.
  await page.click("#hearingBtn");
  await page.waitForTimeout(300);
  const hearing = await wake();
  check(
    `Hörtest hält den Bildschirm wach (${hearing.log.requests}× angefordert)`,
    hearing.wanted === true &&
      hearing.active === true &&
      hearing.log.requests === 3,
  );
  await page.click("#hearClose");
  await page.waitForTimeout(250);
  check(
    "Schließen des Hörtests gibt die Sperre her",
    (await wake()).wanted === false,
  );
  await page.close();
}

// --- Lauf 19: First Person (M23) – die Welt dreht sich um die Kugel. Per
// Tastatur gefahren: Lenkrad-Drehen hebt das Heading, Schub rollt in die
// GEDREHTE Weltrichtung, die Ansicht rotiert mit, und die Ping-Reflexionen
// wandern im Hörer-System um exakt -Δheading (Audio dreht mit). ---
if (want("19")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  // Umschalter im Menü-Footer: Draufsicht ist Default, FP wird aktiv und
  // überlebt einen Reload (Profil).
  const topActive = await page
    .locator('#controlsRow .chip[data-ctl="top"].active')
    .count();
  await page.click('#controlsRow .chip[data-ctl="fp"]');
  const fpActive = await page
    .locator('#controlsRow .chip[data-ctl="fp"].active')
    .count();
  await page.reload();
  await page.waitForTimeout(300);
  const fpAfterReload = await page
    .locator('#controlsRow .chip[data-ctl="fp"].active')
    .count();
  check(
    `Steuerungs-Umschalter: Default Draufsicht, FP wählbar und reload-fest (${topActive}/${fpActive}/${fpAfterReload})`,
    topActive === 1 && fpActive === 1 && fpAfterReload === 1,
  );

  // Offene 5×5-Arena (Start mittig): keine Innenwände, damit Manöver frei
  // messbar sind. Kommt per Einfüge-Import in die Werkstatt.
  const carve = [];
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 5; y++) {
      if (x < 4) carve.push([[x, y], "e"]);
      if (y < 4) carve.push([[x, y], "s"]);
    }
  }
  const arena = {
    id: "custom-fp-arena",
    name: "FP-Arena",
    pingBudget: 3,
    floors: [
      {
        size: [5, 5],
        maze: { seed: 1, carve },
        elements: [],
        start: [2, 2],
        goal: [4, 4],
      },
    ],
  };
  await page.click("#workshopBtn");
  await page.click("#wsImportBtn");
  await page.fill("#wsImportText", JSON.stringify(arena));
  await page.click("#wsImportGo");
  await page.waitForTimeout(300);
  await page.locator("#workshopList .ws-actions .btn-primary").first().click(); // ▶ Spielen

  // Der Kalibrier-Countdown sagt die FP-Haltung an (~45°, Lenkrad).
  await page.waitForTimeout(600);
  const calibText = (await page.textContent("#interText")).trim();
  check(
    `FP-Kalibrierung sagt die 45°-Haltung an ("${calibText.slice(0, 40)}…")`,
    calibText.includes("45°"),
  );
  await page.waitForTimeout(3400);

  const fp0 = await page.evaluate(() => window.__tiltrFp);
  check(
    `FP aktiv, Heading startet nach Norden (${fp0?.heading?.toFixed(3)})`,
    !!fp0 && Math.abs(fp0.heading) < 0.02 && !!fp0.view,
  );

  // Ping-Szene VOR dem Drehen festhalten (Hörer-System, Heading 0).
  await page.keyboard.press(" ");
  await page.waitForTimeout(250);
  const ping0 = await page.evaluate(() => window.__tiltrPing);

  // Lenkrad: ArrowRight gehalten dreht rechtsherum; die Rate klingt nach dem
  // Loslassen aus (Glättung), dann steht das Heading.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(800);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(500);
  const fp1 = await page.evaluate(() => window.__tiltrFp);
  const h1 = fp1?.heading ?? 0;
  check(
    `Lenkrad dreht das Heading (h=${h1.toFixed(2)} rad, Rate ausgeklungen: ${fp1?.turnRate?.toFixed(3)})`,
    h1 > 0.35 && h1 < 2.2 && Math.abs(fp1?.turnRate ?? 1) < 0.05,
  );
  check(
    `Die Ansicht rotiert mit dem Heading (rot=${fp1?.view?.rot?.toFixed(2)})`,
    !!fp1?.view && Math.abs(fp1.view.rot - h1) < 0.05,
  );

  // Audio dreht mit: dieselbe Szene, zweiter Ping – im Hörer-System wandern
  // ALLE Reflexionen um exakt -Δheading (der Ball hat sich nicht bewegt).
  await page.keyboard.press(" ");
  await page.waitForTimeout(250);
  const ping1 = await page.evaluate(() => window.__tiltrPing);
  const h = (await page.evaluate(() => window.__tiltrFp))?.heading ?? 0;
  const norm = (a) => {
    let r = a % (Math.PI * 2);
    if (r > Math.PI) r -= Math.PI * 2;
    if (r <= -Math.PI) r += Math.PI * 2;
    return r;
  };
  const angle = (r) => Math.atan2(r.x, -r.z);
  let maxErr = -1;
  if (
    ping0 &&
    ping1 &&
    ping0.refl.length === ping1.refl.length &&
    ping0.refl.length >= 4
  ) {
    maxErr = Math.max(
      ...ping0.refl.map((r0, i) =>
        Math.abs(norm(angle(ping1.refl[i]) - angle(r0) + h)),
      ),
    );
  }
  check(
    `Audio dreht mit: alle ${ping0?.refl?.length ?? 0} Reflexionen wandern um -h (maxErr=${maxErr.toFixed(3)} rad)`,
    maxErr >= 0 && maxErr < 0.15,
  );

  // Schub rollt in die GEDREHTE Weltrichtung (nicht nach Screen-oben=Welt-oben).
  const pos0 = await page.evaluate(() => window.__tiltrBall);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(700);
  await page.keyboard.up("ArrowUp");
  const pos1 = await page.evaluate(() => window.__tiltrBall);
  const disp = { x: pos1.x - pos0.x, y: pos1.y - pos0.y };
  const dispAngle = Math.atan2(disp.x, -disp.y);
  const dist = Math.hypot(disp.x, disp.y);
  check(
    `Vorwärts rollt entlang der Blickrichtung (Weg=${dist.toFixed(0)}, Winkel ${dispAngle.toFixed(2)} vs. h ${h.toFixed(2)})`,
    dist > 60 && Math.abs(norm(dispAngle - h)) < 0.35,
  );

  // FP-Kamera: Kugel bleibt zentriert – auch abseits der Weltmitte (die
  // Einpass-Kamera würde sie hier ~70 px versetzt zeigen).
  await page.waitForTimeout(1400);
  const view = (await page.evaluate(() => window.__tiltrFp))?.view;
  const offCx = view ? Math.abs(view.ballX - view.cw / 2) : 999;
  const offCy = view ? Math.abs(view.ballY - view.ch / 2) : 999;
  check(
    `FP-Kamera hält die Kugel zentriert (Abweichung ${offCx.toFixed(1)}/${offCy.toFixed(1)} px)`,
    offCx < 10 && offCy < 10,
  );

  // Zurück auf Draufsicht: der Umschalter wirkt in beide Richtungen.
  await page.click("#homeBtn");
  await page.waitForTimeout(200);
  await page.click('#controlsRow .chip[data-ctl="top"]');
  const backTop = await page
    .locator('#controlsRow .chip[data-ctl="top"].active')
    .count();
  check("Umschalter zurück auf Draufsicht", backTop === 1);
  await page.close();
}

// --- Lauf 20: Editor-Vorschau (M24) – Ton-Vorschau im Eigenschaften-Panel
// und Play/Pause für bewegte Elemente. Die Bewegung ist prüfbar, ohne Pixel
// zu lesen: Der Editor legt offen, welche Werte der Renderer zeichnet
// (Schiebewand-Öffnung, Loch-Öffnung, Wächter-Position). ---
if (want("20")) {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    // Zählt erzeugte Klangquellen: Damit ist „der Knopf spielt wirklich
    // etwas" prüfbar, egal welche Signatur das Element hat.
    window.__srcCount = 0;
    for (const fn of ["createOscillator", "createBufferSource"]) {
      const orig = AudioContext.prototype[fn];
      AudioContext.prototype[fn] = function (...args) {
        window.__srcCount++;
        return orig.apply(this, args);
      };
    }
  });
  await page.goto(`${BASE}/?nosplash`);

  // Level mit allen drei Bewegungsarten: Schiebewand, atmendes Loch, Wächter
  // mit zwei Wegpunkten. Kommt per Einfüge-Import in die Werkstatt.
  const moving = {
    id: "custom-motion",
    name: "Bewegung",
    pingBudget: 3,
    floors: [
      {
        size: [4, 4],
        maze: {
          seed: 5,
          carve: [
            [[0, 0], "e"],
            [[1, 0], "e"],
            [[2, 0], "e"],
            [[0, 1], "e"],
            [[1, 1], "e"],
            [[2, 1], "e"],
            [[0, 0], "s"],
            [[3, 0], "s"],
            [[0, 1], "s"],
            [[3, 1], "s"],
            [[0, 2], "e"],
            [[1, 2], "e"],
            [[2, 2], "e"],
            [[0, 2], "s"],
            [[3, 2], "s"],
            [[0, 3], "e"],
            [[1, 3], "e"],
            [[2, 3], "e"],
          ],
        },
        elements: [
          {
            type: "slidingWall",
            edge: [[1, 0], "s"],
            cycle: { open: 1, closed: 1, ramp: 0.4, offset: 0 },
          },
          {
            type: "hole",
            cell: [2, 1],
            breathing: { open: 0.5, closed: 0.5, ramp: 0.3, offset: 0 },
          },
          {
            type: "guard",
            patrol: [
              [0, 2],
              [3, 2],
            ],
            speed: 120,
          },
        ],
        start: [0, 0],
        goal: [3, 3],
      },
    ],
  };
  await page.click("#workshopBtn");
  await page.click("#wsImportBtn");
  await page.fill("#wsImportText", JSON.stringify(moving));
  await page.click("#wsImportGo");
  await page.waitForTimeout(300);
  await page.locator("#workshopList .ws-actions .btn-ghost").first().click(); // ✏️ Bearbeiten
  await page.waitForTimeout(600);

  // Robustheit: Der Import lässt `maze.add` weg (vollkommen gültig – das
  // Schema füllt es erst beim Parsen). Der Editor arbeitet auf dem ROHEN
  // Draft; ohne Auffüllen lief paint() auf und die Karte blieb schwarz.
  const edState = await page.evaluate(() => window.__tiltrEd);
  check(
    `Import ohne maze.add öffnet den Editor sauber (${edState ? `${edState.elements} Elemente, add=${edState.add}` : "kein Paint"})`,
    !!edState && edState.elements === 3 && edState.add === 0,
  );

  // --- Ton-Vorschau: Element wählen, „Anhören" steht im Auswahl-Kopf --------
  const noListen = await page.locator("#edProps .ed-listen").count();
  await page.click("#edTool-select");
  const geom = await page.evaluate(() => window.__tiltrEd);
  if (geom) {
    const box = await page.locator("#edCanvas").boundingBox();
    const hole = {
      x: geom.ox / geom.dpr + (2.5 * 100 * geom.scale) / geom.dpr,
      y: geom.oy / geom.dpr + (1.5 * 100 * geom.scale) / geom.dpr,
    };
    await page.mouse.click(box.x + hole.x, box.y + hole.y);
    await page.waitForTimeout(250);
  }
  const sel = await page.evaluate(() => window.__tiltrEd?.selected);
  const hasListen = (await page.locator("#edProps .ed-listen").count()) > 0;
  const listenTxt = hasListen
    ? ((await page.textContent("#edProps .ed-listen")) ?? "")
    : "";
  check(
    `Ton-Vorschau erscheint erst mit Auswahl ("${listenTxt.trim()}", vorher ${noListen})`,
    noListen === 0 && sel >= 0 && listenTxt.includes("Anhören"),
  );
  // Klick spielt die Signatur AUS DER REGISTRY – dieselbe, die die Galerie
  // anspielt (galleryEntries als einzige Quelle). Ob wirklich geklungen hat,
  // zeigt die Zahl erzeugter Klangquellen: vorher still, nachher nicht.
  const srcBefore = await page.evaluate(() => window.__srcCount);
  await page.waitForTimeout(400);
  const srcIdle = await page.evaluate(() => window.__srcCount);
  if (hasListen) {
    await page.click("#edProps .ed-listen");
    await page.waitForTimeout(500);
  }
  const srcAfter = await page.evaluate(() => window.__srcCount);
  check(
    `Anhören spielt die Klang-Signatur (Quellen ${srcBefore} → still ${srcIdle} → nach Klick ${srcAfter})`,
    srcIdle === srcBefore && srcAfter > srcBefore,
  );

  // --- Play/Pause: bewegte Elemente laufen lassen --------------------------
  const still0 = await page.evaluate(() => window.__tiltrEd?.motion);
  await page.waitForTimeout(600);
  const still1 = await page.evaluate(() => window.__tiltrEd?.motion);
  check(
    `Ohne Play steht die Karte still (Wand ${still0?.slides?.[0]} / Loch ${still0?.holes?.[0]} / Wächter ${JSON.stringify(still0?.guards?.[0])})`,
    JSON.stringify(still0) === JSON.stringify(still1),
  );

  await page.click("#edPlay");
  // Serie statt zweier Stichproben: Ein Zyklus kann zwischen zwei Messpunkten
  // zufällig denselben Wert zeigen (das Loch stand in seiner Offen-Phase).
  // Gemessen wird deshalb, wie viele VERSCHIEDENE Werte über eine Sekunde
  // vorkommen – „bewegt sich" heißt: mehr als einer.
  const series = { slides: new Set(), holes: new Set(), guards: new Set() };
  let run1 = null;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(120);
    const st = await page.evaluate(() => window.__tiltrEd);
    run1 ??= st;
    series.slides.add(st?.motion?.slides?.[0]);
    series.holes.add(st?.motion?.holes?.[0]);
    series.guards.add(st?.motion?.guards?.[0]?.[0]);
  }
  const run2 = await page.evaluate(() => window.__tiltrEd);
  check(
    `Play lässt die Vorschau-Uhr laufen (t ${run1?.animT?.toFixed(2)} → ${run2?.animT?.toFixed(2)})`,
    run1?.playing === true && run2?.animT > run1?.animT + 0.5,
  );
  // Jede Bewegungsart EINZELN: sonst würde ein einziger laufender Wert reichen.
  check(
    `Schiebewand, Loch und Wächter bewegen sich alle (${series.slides.size}/${series.holes.size}/${series.guards.size} verschiedene Werte in 1 s)`,
    series.slides.size > 1 && series.holes.size > 1 && series.guards.size > 1,
  );

  // Pause friert das Bild ein – man kann eine halboffene Wand ansehen.
  await page.click("#edPlay");
  await page.waitForTimeout(200);
  const froze1 = await page.evaluate(() => window.__tiltrEd);
  await page.waitForTimeout(700);
  const froze2 = await page.evaluate(() => window.__tiltrEd);
  check(
    `Pause friert Bewegung UND Uhr ein (Wand ${froze1?.motion?.slides?.[0]}, t=${froze1?.animT?.toFixed(2)})`,
    froze1?.playing === false &&
      froze1.animT === froze2.animT &&
      JSON.stringify(froze1.motion) === JSON.stringify(froze2.motion),
  );

  // Der Knopf trägt seinen Zustand sichtbar (▶ / ⏸ + Akzent).
  await page.click("#edPlay");
  await page.waitForTimeout(150);
  const playing = {
    txt: (await page.textContent("#edPlay")).trim(),
    cls: await page.getAttribute("#edPlay", "class"),
  };
  await page.click("#edPlay");
  await page.waitForTimeout(150);
  const paused = {
    txt: (await page.textContent("#edPlay")).trim(),
    cls: await page.getAttribute("#edPlay", "class"),
  };
  check(
    `Knopf zeigt den Zustand ("${playing.txt}" aktiv / "${paused.txt}" pausiert)`,
    playing.txt === "⏸" &&
      playing.cls.includes("active") &&
      paused.txt === "▶" &&
      !paused.cls.includes("active"),
  );

  // Editor verlassen stoppt die Vorschau (keine Schleife im Hintergrund).
  await page.click("#edPlay");
  await page.waitForTimeout(150);
  await page.click("#edClose");
  await page.waitForTimeout(300);
  check(
    "Schließen stoppt die Vorschau",
    (await page.evaluate(() => window.__tiltrEd?.playing)) === false,
  );
  await page.close();
}

// --- Lauf 21: Die Jukebox (M27) – der Automat als Möbel UND Wahrzeichen.
// Geprüft wird, was man am Klang nicht sehen kann: dass Noten wirklich in den
// Audio-Takt gelegt werden, dass die Lautstärke mit der NÄHE steigt, dass der
// Echo-Ping die Musik wegdrückt (Sidechain – sonst wäre der Raum um den
// Automaten unspielbar), dass ein Rempler den Titel weiterschaltet und dass
// der Kasten DICHT ist. ---
if (want("21")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  // Drei-Zellen-Korridor mit dem Automaten in einer NISCHE unter der letzten
  // Zelle und dem Ziel in einer Nische unter der ERSTEN. Zwei Absichten:
  // Der Ball hat am Ostende einen definierten Halt (Weltrand), von dem aus
  // sich zielsicher rempeln lässt – und er kann beim Rempeln nicht
  // versehentlich ins Ziel rollen, weil das hinter ihm liegt.
  const jbLevel = {
    id: "custom-jukebox",
    name: "Jukebox",
    pingBudget: 9,
    floors: [
      {
        size: [3, 2],
        maze: {
          seed: 3,
          carve: [
            [[0, 0], "e"],
            [[1, 0], "e"],
            [[0, 0], "s"],
            [[2, 0], "s"],
          ],
          add: [[[1, 0], "s"]],
        },
        // Playlist bewusst aus Titeln, die inhaltlich stabil sind: zwei
        // Originale und die Ode. Der Lauf soll nicht rot werden, wenn ein
        // Klassiker gegen eine belegte Quelle ausgetauscht wird.
        elements: [
          {
            type: "jukebox",
            cell: [2, 1],
            playlist: ["tiltr", "ode", "galopp"],
          },
        ],
        start: [0, 0],
        goal: [0, 1],
      },
    ],
  };

  await page.click("#workshopBtn");
  await page.click("#wsImportBtn");
  await page.fill("#wsImportText", JSON.stringify(jbLevel));
  await page.click("#wsImportGo");
  await page.waitForTimeout(300);
  await page.locator("#workshopList .ws-actions .btn-primary").first().click(); // ▶ Spielen
  await page.waitForTimeout(4200); // Kalibrier-Countdown

  const jb0 = await page.evaluate(() => window.__tiltrJukebox);
  check(
    `Automat spielt von selbst (Titel „${jb0?.title}", ${jb0?.notes} Noten eingeplant, ${jb0?.tracks} in der Playlist)`,
    !!jb0 &&
      jb0.boxes === 1 &&
      jb0.index === 0 &&
      jb0.title === "tiltr-Theme" &&
      jb0.notes > 4 &&
      jb0.tracks === 3,
  );

  // NÄHE: Der Automat ist ein Wahrzeichen – näher heißt lauter. Vom Start
  // (Zelle 0) aus leise, am Ostende direkt über ihm deutlich lauter.
  const volFar = jb0?.vol ?? 0;
  await page.keyboard.down("ArrowRight");
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(100);
    if ((await page.evaluate(() => window.__tiltrBall))?.x > 240) break;
  }
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(600); // an der Ostwand auslaufen lassen
  const near = await page.evaluate(() => ({
    jb: window.__tiltrJukebox,
    ball: window.__tiltrBall,
  }));
  const volNear = near.jb?.vol ?? 0;
  check(
    `Lautstärke steigt mit der Nähe (x 50 → ${near.ball?.x.toFixed(0)}: vol ${volFar.toFixed(3)} → ${volNear.toFixed(3)})`,
    volFar > 0.001 && volNear > volFar * 1.5,
  );
  check(
    `Noten laufen weiter (${jb0?.notes} → ${near.jb?.notes} eingeplant)`,
    near.jb?.notes > jb0?.notes,
  );

  // DUCKING: Der Echo-Ping drückt die Musik weg (≈ -12 dB) und lässt sie
  // danach zurückkommen. Ohne das wäre der Raum um den Automaten unspielbar.
  const duckBefore =
    (await page.evaluate(() => window.__tiltrJukebox))?.duck ?? 0;
  await page.keyboard.press(" ");
  await page.waitForTimeout(150);
  const duckPing =
    (await page.evaluate(() => window.__tiltrJukebox))?.duck ?? 0;
  await page.waitForTimeout(1200);
  const duckAfter =
    (await page.evaluate(() => window.__tiltrJukebox))?.duck ?? 0;
  check(
    `Ping duckt die Musik und lässt sie zurück (${duckBefore.toFixed(2)} → ${duckPing.toFixed(2)} → ${duckAfter.toFixed(2)})`,
    duckBefore > 0.9 && duckPing < 0.45 && duckAfter > 0.9,
  );

  // REMPLER: Erst Abstand holen, dann zustoßen – ein Ball, der am Kasten
  // LIEGT, erzeugt keinen Anschlag mehr (die Physik meldet nur bei
  // Annäherungsgeschwindigkeit einen Treffer). Gewartet wird auf den
  // Titelwechsel, nicht auf eine Zeit: Physik ist nicht taktfest.
  const bump = async () => {
    const before = (await page.evaluate(() => window.__tiltrJukebox))?.index;
    // In die Nordost-Ecke der Zelle: dort steht der Ball mittig ÜBER dem
    // Kasten. Ohne das Nach-rechts hängt er an der Oberkante der Nischenwand
    // (x 195…205) und rutscht nur zäh hinunter.
    await page.keyboard.down("ArrowUp");
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowUp");
    await page.keyboard.up("ArrowRight");
    let maxY = 0;
    await page.keyboard.down("ArrowDown");
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(100);
      const st = await page.evaluate(() => ({
        jb: window.__tiltrJukebox,
        ball: window.__tiltrBall,
      }));
      maxY = Math.max(maxY, st.ball?.y ?? 0);
      if (st.jb?.index !== before) break;
    }
    await page.keyboard.up("ArrowDown");
    await page.waitForTimeout(200);
    return {
      before,
      maxY,
      after: await page.evaluate(() => window.__tiltrJukebox),
      flash: (await page.textContent("#status")).trim(),
    };
  };

  const b1 = await bump();
  check(
    `Anrempeln schaltet auf den nächsten Titel (${b1.before} „${jb0?.title}" → ${b1.after?.index} „${b1.after?.title}")`,
    b1.after?.index === 1 && b1.after?.title === "Ode an die Freude",
  );
  check(
    `Der neue Titel steht im Status („${b1.flash}")`,
    b1.flash.includes("Ode an die Freude"),
  );
  // Der Plattenkratzer bekommt einen eigenen Zähler: „mehr Klangquellen als
  // vorher" wäre wertlos, weil die Musik selbst laufend Quellen erzeugt.
  check(
    `Der Plattenkratzer klingt (${b1.after?.scratches}× gekratzt)`,
    b1.after?.scratches === 1,
  );
  // Der Kasten ist DICHT: Der Ball kam beim Rempeln nie über seine Oberkante
  // (Zellrand 100 + Einzug 12).
  check(
    `Der Kasten ist dicht (tiefster Ballpunkt y=${b1.maxY.toFixed(0)}, Kastenoberkante 112)`,
    b1.maxY > 40 && b1.maxY < 112,
  );

  const b2 = await bump();
  check(
    `Zweiter Rempler läuft weiter im Kreis (${b2.after?.index} „${b2.after?.title}", ${b2.after?.scratches}× gekratzt)`,
    b2.after?.index === 2 &&
      b2.after?.title === "Galopp" &&
      b2.after?.scratches === 2,
  );

  await page.click("#homeBtn");
  await page.waitForTimeout(250);
  const silenced = await page.evaluate(() => window.__tiltrMusic);
  check(
    `Zurück im Menü schweigt der Automat (vol ${silenced?.vol}, duck ${silenced?.duck})`,
    silenced?.vol === 0,
  );
  await page.close();
}

// --- Lauf 21b: Der Automat im Editor – Playlist-Feld und der Beweis, dass
// ein Möbel auf dem Pflichtweg das Level rot stempelt. ---
if (want("21b")) {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    window.__srcCount = 0;
    for (const fn of ["createOscillator", "createBufferSource"]) {
      const orig = AudioContext.prototype[fn];
      AudioContext.prototype[fn] = function (...args) {
        window.__srcCount++;
        return orig.apply(this, args);
      };
    }
  });
  await page.goto(`${BASE}/?nosplash`);

  // Derselbe Korridor, aber der Automat steht MITTEN DRIN (2,0).
  const blocking = {
    id: "custom-jb-block",
    name: "Möbel im Weg",
    pingBudget: 3,
    floors: [
      {
        size: [5, 2],
        maze: {
          seed: 3,
          carve: [
            [[0, 0], "e"],
            [[1, 0], "e"],
            [[2, 0], "e"],
            [[3, 0], "e"],
            [[4, 0], "s"],
          ],
          add: [
            [[0, 0], "s"],
            [[1, 0], "s"],
            [[2, 0], "s"],
            [[3, 0], "s"],
          ],
        },
        elements: [
          {
            type: "jukebox",
            cell: [2, 0],
            playlist: ["tiltr", "ode", "galopp"],
          },
        ],
        start: [0, 0],
        goal: [4, 1],
      },
    ],
  };
  await page.click("#workshopBtn");
  await page.click("#wsImportBtn");
  await page.fill("#wsImportText", JSON.stringify(blocking));
  await page.click("#wsImportGo");
  await page.waitForTimeout(300);
  await page.locator("#workshopList .ws-actions .btn-ghost").first().click(); // ✏️ Bearbeiten
  await page.waitForTimeout(600);

  // Badge: Das Möbel versiegelt den einzigen Weg – Pflicht-Badge rot.
  const badges = await page.$$eval("#edBadges .ed-badge", (els) =>
    els.map((e) => ({
      text: e.textContent.trim(),
      fail: e.className.includes("fail"),
    })),
  );
  const jbBadge = badges.find((b) => b.text.includes("Jukebox"));
  check(
    `Jukebox im Pflichtweg stempelt das Level rot ("${jbBadge?.text}" fail=${jbBadge?.fail})`,
    !!jbBadge && jbBadge.fail === true,
  );

  // Playlist-Feld: Auswahl anklicken, dann steht die Titelliste im Panel.
  await page.click("#edTool-select");
  const geom = await page.evaluate(() => window.__tiltrEd);
  if (geom) {
    const box = await page.locator("#edCanvas").boundingBox();
    await page.mouse.click(
      box.x + geom.ox / geom.dpr + (2.5 * 100 * geom.scale) / geom.dpr,
      box.y + geom.oy / geom.dpr + (0.5 * 100 * geom.scale) / geom.dpr,
    );
    await page.waitForTimeout(250);
  }
  const tracks = await page.$$eval("#edProps .ed-playlist .ed-track", (els) =>
    els.map((e) => ({
      title:
        e.querySelector("span:not(.ed-order):not(.ed-embedded)")?.textContent ??
        "",
      order: e.querySelector(".ed-order")?.textContent ?? "",
      checked: e.querySelector("input").checked,
    })),
  );
  check(
    `Playlist listet alle mitgelieferten Titel (${tracks.length}) und hakt die drei gewählten an (${tracks.filter((t) => t.checked).length})`,
    tracks.length >= 10 && tracks.filter((t) => t.checked).length === 3,
  );
  // Die Ziffer ist die ABSPIELFOLGE, nicht die Listenposition. Geprüft wird
  // beides: dass jeder Titel SEINE Playlist-Nummer trägt, und dass die Ziffern
  // in Listenreihenfolge NICHT aufsteigen – sonst wäre die Zusicherung auch
  // erfüllt, wenn der Editor einfach durchnummeriert.
  const numbered = tracks.filter((t) => t.order);
  const digits = numbered.map((t) => Number(t.order.replace(".", "")));
  const byTitle = Object.fromEntries(
    numbered.map((t) => [t.title, Number(t.order.replace(".", ""))]),
  );
  const ascending = digits.every((d, i) => i === 0 || d > digits[i - 1]);
  check(
    `Die Ziffer zeigt die Abspielfolge (${numbered.map((t) => t.order + t.title).join(" ")})`,
    numbered.length === 3 &&
      byTitle["tiltr-Theme"] === 1 &&
      byTitle["Ode an die Freude"] === 2 &&
      byTitle["Galopp"] === 3 &&
      !ascending,
  );

  // ▶ hört den Titel vor – über denselben Musik-Bus wie im Spiel.
  const srcBefore = await page.evaluate(() => window.__srcCount);
  await page.waitForTimeout(300);
  const srcIdle = await page.evaluate(() => window.__srcCount);
  await page.locator("#edProps .ed-playlist .ed-track button").first().click();
  await page.waitForTimeout(500);
  const srcAfter = await page.evaluate(() => window.__srcCount);
  check(
    `▶ spielt den Titel vor (Quellen ${srcBefore} → still ${srcIdle} → nach Klick ${srcAfter})`,
    srcIdle === srcBefore && srcAfter > srcBefore + 4,
  );

  // Der letzte Titel lässt sich nicht abwählen: Eine Jukebox ohne Titel wäre
  // nach dem Schema unladbar – der Editor fängt es ab, statt das Level zu
  // zerlegen.
  const uncheck = async (title) => {
    const rows = await page.$$("#edProps .ed-playlist .ed-track");
    for (const r of rows) {
      const txt = await r.textContent();
      if (txt.includes(title)) {
        await r.$eval("input", (i) => i.click());
        await page.waitForTimeout(200);
        return;
      }
    }
  };
  await uncheck("Galopp");
  await uncheck("Ode");
  const twoGone = await page.$$eval(
    "#edProps .ed-playlist .ed-track input:checked",
    (e) => e.length,
  );
  await uncheck("tiltr");
  const lastLeft = await page.$$eval(
    "#edProps .ed-playlist .ed-track input:checked",
    (e) => e.length,
  );
  const warn = (await page.textContent("#edStatus")).trim();
  check(
    `Der letzte Titel bleibt (nach zwei Abwahlen ${twoGone}, nach der dritten ${lastLeft}: "${warn}")`,
    twoGone === 1 && lastLeft === 1 && warn.includes("Mindestens ein Titel"),
  );

  // GEGENPROBE: Derselbe Automat in einer NISCHE ist kein Riegel – Badge grün
  // und teilbar. Ohne diese Richtung würde ein Check, der immer rot ist, oben
  // durchgehen.
  await page.click("#edClose");
  await page.waitForTimeout(300);
  const niche = JSON.parse(JSON.stringify(blocking));
  niche.id = "custom-jb-niche";
  niche.name = "Möbel in der Nische";
  // Nische unter (2,0) AUFSCHNEIDEN: aus `add` heraus (sonst mauert es die
  // Kante nach dem Carven wieder zu) und in `carve` hinein – das Seed-Maze
  // hätte dort sonst vielleicht von sich aus eine Wand.
  niche.floors[0].maze.add = niche.floors[0].maze.add.filter(
    (e) => !(e[0][0] === 2 && e[1] === "s"),
  );
  niche.floors[0].maze.carve.push([[2, 0], "s"]);
  niche.floors[0].elements[0].cell = [2, 1];
  // Der Einfüge-Bereich ist ein Umschalter – nach dem ersten Import steht er
  // schon offen, ein zweiter Klick würde ihn zuklappen.
  if (!(await page.locator("#wsImportText").isVisible()))
    await page.click("#wsImportBtn");
  await page.fill("#wsImportText", JSON.stringify(niche));
  await page.click("#wsImportGo");
  await page.waitForTimeout(300);
  // Bearbeiten bestätigt per ZWEI-TAP, wenn noch ein Draft in der Werkstatt
  // liegt (M15) – der erste Tap fragt nur.
  await page.locator("#workshopList .ws-actions .btn-ghost").first().click(); // ✏️ Bearbeiten
  await page.waitForTimeout(400);
  if ((await page.inputValue("#edName")) !== niche.name) {
    await page.locator("#workshopList .ws-actions .btn-ghost").first().click();
    await page.waitForTimeout(600);
  }
  const openName = await page.inputValue("#edName");
  check(
    `Der Editor zeigt das Nischen-Level ("${openName}")`,
    openName === niche.name,
  );
  const nicheBadges = await page.$$eval("#edBadges .ed-badge", (els) =>
    els.map((e) => ({
      text: e.textContent.trim(),
      fail: e.className.includes("fail"),
    })),
  );
  const nicheJb = nicheBadges.find((b) => b.text.includes("Jukebox"));
  const nicheShare = await page.evaluate(() => window.__tiltrEd?.shareable);
  check(
    `In der Nische ist der Automat kein Riegel ("${nicheJb?.text}" fail=${nicheJb?.fail}, teilbar=${nicheShare})`,
    !!nicheJb && nicheJb.fail === false && nicheShare === true,
  );
  await page.close();
}

// --- Lauf 22: Debug-Ansicht in der Editor-Vorschau (👁 immer da). Im SPIEL
// ist sie versteckt (5 Taps auf die Versionsnummer), beim TESTEN eines
// eigenen Entwurfs gehört sie dazu – und darf beim Verlassen nicht in den
// nächsten Lauf mitkommen. ---
if (want("22")) {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  const lvl = {
    id: "custom-debugview",
    name: "Debug-Ansicht",
    pingBudget: 3,
    floors: [
      {
        size: [3, 2],
        maze: {
          seed: 3,
          carve: [
            [[0, 0], "e"],
            [[1, 0], "e"],
            [[2, 0], "s"],
          ],
          add: [
            [[0, 0], "s"],
            [[1, 0], "s"],
          ],
        },
        elements: [],
        start: [0, 0],
        goal: [2, 1],
      },
    ],
  };
  await page.click("#workshopBtn");
  await page.click("#wsImportBtn");
  await page.fill("#wsImportText", JSON.stringify(lvl));
  await page.click("#wsImportGo");
  await page.waitForTimeout(300);

  const eyeHidden = async () =>
    (await page.getAttribute("#debugBtn", "class")).includes("hidden");

  // 1) Normaler Lauf aus der Bibliothek (nicht aus dem Editor): 👁 versteckt.
  await page.locator("#workshopList .ws-actions .btn-primary").first().click(); // ▶ Spielen
  await page.waitForTimeout(4200);
  const hiddenInPlay = await eyeHidden();
  check(
    `Im normalen Lauf bleibt die Debug-Ansicht versteckt (hidden=${hiddenInPlay})`,
    hiddenInPlay === true,
  );

  // 2) Editor-Vorschau: 👁 ist da, ohne Freischalt-Taps.
  await page.click("#homeBtn");
  await page.waitForTimeout(250);
  await page.click("#workshopBtn");
  await page.locator("#workshopList .ws-actions .btn-ghost").first().click(); // ✏️ Bearbeiten
  await page.waitForTimeout(400);
  if ((await page.inputValue("#edName")) !== lvl.name) {
    await page.locator("#workshopList .ws-actions .btn-ghost").first().click();
    await page.waitForTimeout(600);
  }
  await page.click("#edTest");
  await page.waitForTimeout(4200);
  const shownInPreview = !(await eyeHidden());
  check(
    `In der Editor-Vorschau ist die Debug-Ansicht immer da (sichtbar=${shownInPreview})`,
    shownInPreview,
  );

  // 3) Der Knopf wirkt: Die Statuszeile schaltet auf die Debug-Anzeige um.
  const statusBefore = (await page.textContent("#status")).trim();
  await page.click("#debugBtn");
  await page.waitForTimeout(2200); // Flash-Meldungen ausklingen lassen
  const statusOn = (await page.textContent("#status")).trim();
  check(
    `👁 schaltet die Debug-Ansicht ein ("${statusBefore}" → "${statusOn.slice(0, 24)}…")`,
    !statusBefore.startsWith("Debug") && statusOn.startsWith("Debug"),
  );

  // 4) Und sie kommt NICHT mit: zurück in den Editor, dann normal spielen –
  // Knopf wieder weg UND Ansicht aus (sonst hätte man ein aufgedecktes
  // Labyrinth im nächsten Lauf und keinen Knopf, um es abzuschalten).
  await page.click("#editBtn");
  await page.waitForTimeout(300);
  await page.click("#edClose");
  await page.waitForTimeout(300);
  await page.locator("#workshopList .ws-actions .btn-primary").first().click(); // ▶ Spielen
  await page.waitForTimeout(4200);
  const hiddenAgain = await eyeHidden();
  const statusAfter = (await page.textContent("#status")).trim();
  check(
    `Die Debug-Ansicht kommt nicht mit in den nächsten Lauf (hidden=${hiddenAgain}, Status "${statusAfter}")`,
    hiddenAgain === true && !statusAfter.startsWith("Debug"),
  );
  await page.close();
}

// --- Lauf 23: Der Start gehört Ebene 1. `start` ist pro Ebene PFLICHT
// (schema.ts), aber nur floors[0].start setzt die Kugel (loader.ts) – auf
// tieferen Ebenen kommt man über den Transporter an. Drei Folgen, alle hier
// festgenagelt: (a) die geteilte Kugel wird auf E2 NICHT gezeichnet, sonst
// sieht sie dort aus wie ein eigener Startpunkt, (b) das ●-Werkzeug erklärt
// sich statt zu wirken, (c) die Zelle ist frei bebaubar – und wenn Ebene 1
// gelöscht wird, rückt der nachrückende Start aus dem Element heraus. ---
if (want("23")) {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  // Zwei Ebenen: E1 ein Korridor mit Transporter in der Nische, E2 trägt das
  // Ziel. E2s `start` steht auf (0,0) – tot, aber vom Format verlangt.
  const twoFloors = {
    id: "custom-two-floors",
    name: "Zwei Ebenen",
    pingBudget: 3,
    floors: [
      {
        size: [3, 2],
        maze: {
          seed: 3,
          carve: [
            [[0, 0], "e"],
            [[1, 0], "e"],
            [[1, 0], "s"],
          ],
          add: [
            [[0, 0], "s"],
            [[2, 0], "s"],
          ],
        },
        elements: [
          {
            type: "transporter",
            cell: [1, 1],
            target: { floor: 1, cell: [0, 1] },
          },
        ],
        start: [0, 0],
        goal: null,
      },
      {
        size: [3, 2],
        maze: {
          seed: 4,
          carve: [
            [[0, 1], "e"],
            [[1, 1], "e"],
            [[0, 0], "s"],
          ],
          add: [
            [[1, 0], "s"],
            [[2, 0], "s"],
          ],
        },
        elements: [],
        start: [0, 0],
        goal: [2, 1],
      },
    ],
  };
  await page.click("#workshopBtn");
  await page.click("#wsImportBtn");
  await page.fill("#wsImportText", JSON.stringify(twoFloors));
  await page.click("#wsImportGo");
  await page.waitForTimeout(300);
  await page.locator("#workshopList .ws-actions .btn-ghost").first().click(); // ✏️ Bearbeiten
  await page.waitForTimeout(600);

  const tap = async (cx, cy) => {
    const pt = await page.evaluate(
      ([cx, cy]) => {
        const ed = window.__tiltrEd;
        const box = document.getElementById("edCanvas").getBoundingClientRect();
        return {
          x: box.left + (ed.ox + (cx * 100 + 50) * ed.scale) / ed.dpr,
          y: box.top + (ed.oy + (cy * 100 + 50) * ed.scale) / ed.dpr,
        };
      },
      [cx, cy],
    );
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(250);
  };
  const floorTab = (label) =>
    page.locator("#edFloorTabs .chip", { hasText: label }).first();
  const startTool = () =>
    page.evaluate(() => {
      const b = document.getElementById("edTool-start");
      return {
        off: b.className.includes("off"),
        active: b.className.includes("active"),
        tip: b.dataset.tip,
      };
    });
  const ballDrawn = () => page.evaluate(() => window.__tiltrEd.ballDrawn);
  const status = async () => (await page.textContent("#edStatus")).trim();

  // (a) Ebene 1: Kugel im Bild, ●-Werkzeug normal.
  const e1 = { ball: await ballDrawn(), tool: await startTool() };
  check(
    `Ebene 1: Kugel gezeichnet, ●-Werkzeug scharf (ball=${e1.ball}, off=${e1.tool.off})`,
    e1.ball === true && e1.tool.off === false,
  );

  // Ebene 2: Die geteilte Kugel steht an FREMDEN Koordinaten – nicht zeichnen.
  await floorTab("E2").click();
  await page.waitForTimeout(400);
  const e2 = { ball: await ballDrawn(), tool: await startTool() };
  check(
    `Ebene 2: keine Phantom-Kugel, ●-Werkzeug gedämpft (ball=${e2.ball}, off=${e2.tool.off})`,
    e2.ball === false &&
      e2.tool.off === true &&
      e2.tool.tip.includes("Ebene 1"),
  );

  // (b) Der gedämpfte Knopf ERKLÄRT sich, statt das Werkzeug zu wechseln.
  await page.click("#edTool-start");
  await page.waitForTimeout(250);
  const afterClick = await startTool();
  check(
    `● auf Ebene 2 erklärt sich statt zu wirken ("${(await status()).slice(0, 32)}…")`,
    afterClick.active === false && (await status()).includes("Ebene 1"),
  );

  // (c) Die Zelle des toten Starts ist frei bebaubar: ein Loch auf (0,0).
  await page.locator(".ed-tile", { hasText: /^Loch$/ }).click();
  await tap(0, 0);
  const placed = await page.evaluate(
    () => window.__tiltrEd.def.floors[1].elements,
  );
  check(
    `Auf dem toten Start der Ebene 2 lässt sich bauen (${JSON.stringify(placed.map((e) => [e.type, e.cell]))})`,
    placed.length === 1 &&
      placed[0].type === "hole" &&
      placed[0].cell[0] === 0 &&
      placed[0].cell[1] === 0,
  );

  // Und Ebene 1 löschen befördert diesen toten Start – er muss AUS dem Loch
  // heraus wandern, sonst wacht die Kugel im nächsten Lauf darin auf.
  await floorTab("E1").click();
  await page.waitForTimeout(300);
  await page.locator("#edFloorTabs .chip", { hasText: "−" }).click();
  await page.waitForTimeout(600);
  const promoted = await page.evaluate(() => {
    const d = window.__tiltrEd.def;
    return {
      floors: d.floors.length,
      start: d.floors[0].start,
      elements: d.floors[0].elements.map((e) => [e.type, e.cell]),
    };
  });
  const onHole = promoted.elements.some(
    ([type, cell]) =>
      type === "hole" &&
      cell[0] === promoted.start[0] &&
      cell[1] === promoted.start[1],
  );
  check(
    `Ebene 1 löschen rückt den beförderten Start aus dem Loch (start=${JSON.stringify(promoted.start)})`,
    promoted.floors === 1 && onHole === false,
  );

  await page.close();
}

// --- Lauf 24: Das Eigenschaften-Panel mischt DREI Geltungsbereiche –
// Element, Level, Ebene. Ohne Beschriftung sieht „Spalten" wie eine
// Level-Eigenschaft aus. Jeder Block muss deshalb selbst sagen, wofür er
// gilt, und die Ebenen-Nummer muss MITWANDERN. ---
if (want("24")) {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    locale: "de-DE",
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  await page.click("#workshopBtn");
  await page.locator("#wsNewBtn").click();
  await page.waitForTimeout(600);

  const scopes = () =>
    page.$$eval("#edProps .ed-scope", (els) =>
      els.map((e) => e.textContent.trim()),
    );
  const selHead = () =>
    page.$$eval("#edProps .ed-selhead .ed-group-label", (els) =>
      els.map((e) => e.textContent.trim()),
    );

  // Ohne Auswahl: zwei Köpfe – Level (alle Ebenen) und Ebene 1 (nur hier).
  const bare = await scopes();
  check(
    `Bereiche ohne Auswahl: ${JSON.stringify(bare)}`,
    bare.length === 2 &&
      bare[0].includes("alle Ebenen") &&
      bare[1].includes("Ebene 1") &&
      bare[1].includes("nur hier"),
  );

  // Der erste Kopf trägt KEINE Trennlinie (nichts steht darüber).
  const firstRule = await page.evaluate(() => {
    const el = document.querySelector("#edProps .ed-scope");
    return getComputedStyle(el).borderTopWidth;
  });
  check(
    `erster Bereichs-Kopf ohne Trennlinie (${firstRule})`,
    firstRule === "0px",
  );

  // Ebene 2 anlegen: die Nummer im Ebenen-Kopf wandert mit.
  await page.locator("#edFloorTabs .chip", { hasText: "＋" }).click();
  await page.waitForTimeout(500);
  const onE2 = await scopes();
  check(
    `Ebenen-Kopf nennt die AKTIVE Ebene: ${JSON.stringify(onE2)}`,
    onE2.length === 2 &&
      onE2[1].includes("Ebene 2") &&
      !onE2[1].includes("Ebene 1"),
  );

  // Element setzen und auswählen: der Auswahl-Kopf nennt seinen Bereich,
  // und Level/Ebene bleiben als eigene Blöcke darunter stehen.
  await page.locator(".ed-tile", { hasText: /^Loch$/ }).click();
  const pt = await page.evaluate(() => {
    const ed = window.__tiltrEd;
    const box = document.getElementById("edCanvas").getBoundingClientRect();
    return {
      x: box.left + (ed.ox + 150 * ed.scale) / ed.dpr,
      y: box.top + (ed.oy + 150 * ed.scale) / ed.dpr,
    };
  });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(400);
  const head = await selHead();
  const withSel = await scopes();
  check(
    `Auswahl-Kopf nennt seinen Bereich ("${head[0]}")`,
    head.length === 1 &&
      head[0].includes("Loch") &&
      head[0].includes("nur dieses Element"),
  );
  check(
    `alle drei Bereiche gleichzeitig sichtbar (1 + ${withSel.length})`,
    withSel.length === 2 &&
      withSel[0].includes("alle Ebenen") &&
      withSel[1].includes("Ebene 2"),
  );

  await page.close();
}

// --- Lauf 25: Import aus dem Teilen-Link. Ein geteilter Link öffnet immer
// den BROWSER, nie die installierte PWA – also muss die Werkstatt den Link
// auch EINGEFÜGT annehmen: als Text im Feld und per 📋 aus der Zwischenablage.
// Beides durch dieselbe Stelle wie JSON. ---
if (want("25")) {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    locale: "de-DE",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  // Einen Link ERZEUGEN wie die App selbst: gleicher Codec, gleiche Form.
  const def = {
    id: "custom-linktest",
    name: "Per Link",
    pingBudget: 3,
    floors: [
      {
        size: [4, 4],
        maze: { seed: 11 },
        elements: [],
        start: [0, 0],
        goal: [3, 3],
      },
    ],
  };
  const url = await page.evaluate(async (d) => {
    const json = new TextEncoder().encode(JSON.stringify(d));
    const packed = new Uint8Array(
      await new Response(
        new Blob([json])
          .stream()
          .pipeThrough(new CompressionStream("deflate-raw")),
      ).arrayBuffer(),
    );
    let bin = "";
    for (const b of packed) bin += String.fromCharCode(b);
    const token =
      "1" +
      btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    return `${location.origin}${location.pathname}#level=${token}`;
  }, def);

  await page.click("#workshopBtn");
  const countBefore = await page.locator("#workshopList .ws-item").count();
  await page.click("#wsImportBtn");
  const placeholder = await page.getAttribute("#wsImportText", "placeholder");
  check(
    `Import-Feld nennt den Link als Quelle ("${placeholder}")`,
    /Link/.test(placeholder ?? ""),
  );

  // (a) Link als Text einfügen.
  await page.fill("#wsImportText", url);
  await page.click("#wsImportGo");
  await page.waitForTimeout(400);
  const statusA = (await page.textContent("#wsImportStatus")).trim();
  const countA = await page.locator("#workshopList .ws-item").count();
  check(
    `Teilen-Link im Textfeld importiert ("${statusA}", ${countBefore} → ${countA})`,
    statusA.includes("Per Link") &&
      statusA.includes("✓") &&
      countA === countBefore + 1,
  );

  // (b) Link aus der Zwischenablage, ein Tap. Zweiter Import desselben
  // Levels bekommt eine frische ID – die Bibliothek wächst um eins.
  await page.evaluate((u) => navigator.clipboard.writeText(u), url);
  await page.click("#wsImportPaste");
  await page.waitForTimeout(500);
  const statusB = (await page.textContent("#wsImportStatus")).trim();
  const countB = await page.locator("#workshopList .ws-item").count();
  const fieldB = await page.inputValue("#wsImportText");
  check(
    `📋 liest die Zwischenablage und importiert ("${statusB}", ${countA} → ${countB})`,
    statusB.includes("Per Link") &&
      statusB.includes("✓") &&
      countB === countA + 1,
  );
  check("nach Erfolg ist das Feld geleert", fieldB === "");

  // (c) Müll bleibt Müll – und JSON geht weiterhin.
  await page.fill("#wsImportText", "https://example.test/#level=nichtsGutes");
  await page.click("#wsImportGo");
  await page.waitForTimeout(400);
  const statusC = (await page.textContent("#wsImportStatus")).trim();
  check(
    `kaputter Link wird abgewiesen ("${statusC}")`,
    statusC.includes("Kein gültiges"),
  );
  await page.fill(
    "#wsImportText",
    JSON.stringify({ ...def, name: "Per JSON" }),
  );
  await page.click("#wsImportGo");
  await page.waitForTimeout(400);
  const statusD = (await page.textContent("#wsImportStatus")).trim();
  check(
    `JSON läuft über dasselbe Feld ("${statusD}")`,
    statusD.includes("Per JSON") && statusD.includes("✓"),
  );

  await page.close();
}

// --- Lauf 26: iOS-Startbildschirm. Die installierte PWA war beim Kaltstart
// kurz WEISS: iOS zeigt vor dem Laden einen System-Startbildschirm und nimmt
// dafür NUR apple-touch-startup-image – und nur bei EXAKT passender Pixelgröße,
// sonst still verworfen. Deshalb hier: jedes Tag hat ein Bild, jedes Bild hat
// genau die Größe, die sein Media-Query verspricht, und die Farbe ist der
// Spielfeld-Ton. Dazu color-scheme dark für die Leinwand vor dem ersten Paint. ---
if (want("26")) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    locale: "de-DE",
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nosplash`);

  const scheme = await page.getAttribute(
    'meta[name="color-scheme"]',
    "content",
  );
  check(`color-scheme dark im Head ("${scheme}")`, scheme === "dark");
  const rootScheme = await page.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme,
  );
  check(
    `color-scheme dark auch als CSS ("${rootScheme}")`,
    rootScheme === "dark",
  );

  const links = await page.$$eval(
    'link[rel="apple-touch-startup-image"]',
    (els) =>
      els.map((e) => ({
        media: e.getAttribute("media") ?? "",
        href: e.getAttribute("href") ?? "",
      })),
  );
  check(`18 Startbilder verlinkt (${links.length})`, links.length === 18);
  check(
    "jedes Media-Query ist Hochkant (Manifest: portrait)",
    links.every((l) => /orientation: portrait/.test(l.media)),
  );

  // Farbe des Spielfelds, wie sie wirklich gerendert ist – gegen die Palette des PNG.
  const bgDeep = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--bg-deep")
      .trim(),
  );
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  let sizeOk = 0,
    colourOk = 0,
    tiny = 0,
    missing = [];
  for (const l of links) {
    const m = l.media.match(
      /device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d+)\)/,
    );
    const res = await page.request.get(`${BASE}/${l.href}`);
    if (!m || res.status() !== 200) {
      missing.push(l.href);
      continue;
    }
    const buf = Buffer.from(await res.body());
    const w = buf.readUInt32BE(16),
      h = buf.readUInt32BE(20); // IHDR
    if (w === Number(m[1]) * Number(m[3]) && h === Number(m[2]) * Number(m[3]))
      sizeOk++;
    const plte = buf.indexOf("PLTE", 0, "ascii");
    const rgb = [buf[plte + 4], buf[plte + 5], buf[plte + 6]];
    if (rgb.join(",") === hexToRgb(bgDeep).join(",")) colourOk++;
    if (buf.length < 2048) tiny++;
  }
  check(
    `jedes Bild ist da (fehlend: ${JSON.stringify(missing)})`,
    missing.length === 0,
  );
  check(
    `jedes Bild hat GENAU die Pixelgröße seines Media-Querys (${sizeOk}/${links.length})`,
    sizeOk === links.length,
  );
  check(
    `jedes Bild trägt den Spielfeld-Ton --bg-deep ${bgDeep} (${colourOk}/${links.length})`,
    colourOk === links.length,
  );
  check(
    `jedes Bild bleibt unter 2 KB – Precache-Disziplin (${tiny}/${links.length})`,
    tiny === links.length,
  );

  await page.close();
}

check("keine Konsolen-/Seitenfehler", errors.length === 0);
console.log(
  `# gefahren: ${only ? only.size : KNOWN_RUNS.length} von ${KNOWN_RUNS.length} Läufen`,
);
if (errors.length) console.log(errors);

await browser.close();
stop();
process.exit(failed ? 1 : 0);
