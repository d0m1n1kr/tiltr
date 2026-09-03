// README-Screenshots (M64): erzeugt docs/screenshots/*.png gegen den GEBAUTEN
// Stand (vite preview auf 8766) – dieselbe Mechanik wie e2e/smoke.mjs (Vite
// direkt starten, vorinstalliertes Chromium, Raumcodes „TEST…" auf dem
// BroadcastChannel-Transport). Phone-Shots 390×844 @2x, Editor zusätzlich als
// Tablet-Dreispalter. Aufruf: `npm run build && node tools/screenshots.mjs`.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = 8766;
const BASE = `http://localhost:${PORT}`;
const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;
const executablePath = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const VITE = new URL("../node_modules/vite/bin/vite.js", import.meta.url).pathname;
const preview = spawn(process.execPath, [VITE, "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
process.on("exit", () => preview.kill("SIGTERM"));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* noch nicht bereit */
  }
  await new Promise((r) => setTimeout(r, 200));
}

const until = async (fn, timeout = 8000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`✓ ${name}.png`);
};

const browser = await chromium.launch({ executablePath, args: ["--autoplay-policy=no-user-gesture-required"] });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
const phone = async (locale = "de-DE") => browser.newContext({ ...PHONE, locale });

// Zwei-Spieler-Level aus E2E Lauf 33 (hell, Platte + Schlüssel über Kreuz).
const carveRow = (y) => [0, 1, 2].map((x) => [[x, y], "e"]);
const sealRow = (y) => [0, 1, 2, 3].map((x) => [[x, y], "s"]);
const MP_LEVEL = {
  id: "custom-shot-mp",
  name: "Zwei Gänge",
  players: 2,
  mpMode: "coop",
  pingBudget: 3,
  floors: [
    {
      size: [4, 3],
      maze: { seed: 7, carve: [...carveRow(0), ...carveRow(2)], add: [...sealRow(0), ...sealRow(1)] },
      elements: [
        { type: "door", id: "g", edge: [[1, 0], "e"] },
        { type: "plate", cell: [0, 2], opens: "g" },
        { type: "door", id: "k", edge: [[1, 2], "e"] },
        { type: "key", cell: [2, 0], opens: "k" },
      ],
      start: [0, 0],
      goal: [3, 0],
      start2: [0, 2],
      goal2: [3, 2],
      bright: true,
    },
  ],
};
// Ein Solo-Level mit vielen Elementen für Werkstatt und Editor.
const SOLO_LEVEL = {
  id: "custom-shot-solo",
  name: "Uhrwerk-Studie",
  pingBudget: 4,
  parTimeS: 45,
  floors: [
    {
      size: [6, 8],
      maze: { seed: 4242, carve: [], add: [], brittleChance: 0.15 },
      elements: [
        { type: "hole", cell: [2, 2], breathing: { offset: 0 } },
        { type: "hole", cell: [4, 5], breathing: { offset: 2.5 } },
        { type: "gem", cell: [5, 0] },
        { type: "gem", cell: [0, 7] },
        { type: "checkpoint", cell: [3, 4] },
        { type: "windZone", cell: [1, 5], dir: "e" },
        { type: "hourglass", cell: [4, 1] },
        { type: "bell", cell: [2, 6] },
      ],
      start: [0, 0],
      goal: [5, 7],
    },
  ],
};

async function importLevel(page, def) {
  // #wsImportBtn ist ein SCHALTER – nur öffnen, wenn das Feld noch zu ist.
  if ((await page.locator("#wsImportBox").getAttribute("class")).includes("hidden")) await page.click("#wsImportBtn");
  await page.fill("#wsImportText", JSON.stringify(def));
  await page.click("#wsImportGo");
  await until(async () => (await page.locator(`#workshopList .ws-item[data-level-id="${def.id}"]`).count()) > 0);
}

// 1) Splash + Menü (de/en)
{
  const ctx = await phone("de-DE");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await sleep(1150);
  await shot(page, "splash");
  await page.goto(`${BASE}/?nosplash`);
  await sleep(400);
  await shot(page, "menu-de");
  await ctx.close();
  const en = await phone("en-US");
  const p2 = await en.newPage();
  await p2.goto(`${BASE}/?nosplash`);
  await sleep(400);
  await shot(p2, "menu-en");
  await en.close();
}

// 2) Schnelles Spiel mit Echo-Ping
{
  const ctx = await phone();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?seed=1207&nosplash`);
  await page.click("#quickBtn");
  await until(async () => (await page.evaluate(() => window.__tiltrBall)) != null, 6000);
  await page.keyboard.down("ArrowRight");
  await sleep(450);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.press("Space");
  await sleep(380);
  await shot(page, "gameplay");
  await ctx.close();
}

// 3) Kampagne (alles frei) + Tutorial-Ergebnis mit Konfetti
{
  const ctx = await phone();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?unlock&nosplash`);
  await page.click("#campaignBtn");
  await sleep(300);
  await shot(page, "campaign");
  await page.click("#campaignClose");
  await page.click("#tutorialBtn");
  await until(async () => (await page.textContent("#interTitle")).includes("Rollen"), 6000);
  await sleep(300);
  await shot(page, "tutorial-intro");
  await page.click("#interPrimary");
  await page.keyboard.down("ArrowRight");
  await until(async () => (await page.evaluate(() => window.__tiltrConfetti?.count ?? 0)) > 0, 8000);
  await page.keyboard.up("ArrowRight");
  await sleep(1900);
  await shot(page, "result-confetti");
  await ctx.close();
}

// 4) Werkstatt + Editor (Phone) + Editor (Tablet)
{
  const ctx = await phone();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?nosplash`);
  await page.click("#workshopBtn");
  await importLevel(page, SOLO_LEVEL);
  await importLevel(page, MP_LEVEL);
  await page.click("#wsImportBtn"); // Import-Feld wieder zu
  await sleep(300);
  await shot(page, "workshop");
  await page.locator('#workshopList .ws-item[data-level-id="custom-shot-solo"]').locator("button", { hasText: "✏️" }).click();
  await until(async () => (await page.locator("#edBadges .ed-badge").count()) > 0);
  await sleep(300);
  await shot(page, "editor-phone");
  await page.click("#edClose");
  const tablet = await ctx.newPage();
  await tablet.setViewportSize({ width: 1024, height: 768 });
  await tablet.goto(`${BASE}/?nosplash`);
  await tablet.click("#workshopBtn");
  const mpCard = tablet.locator('#workshopList .ws-item[data-level-id="custom-shot-mp"]');
  await mpCard.locator("button", { hasText: "✏️" }).click();
  // Ein Entwurf liegt vor (Phone-Editor oben) – Zwei-Tap „Entwurf verwerfen?".
  const arm = mpCard.locator("button", { hasText: "Entwurf verwerfen" });
  if (await arm.count()) await arm.click();
  await until(async () => !(await tablet.locator("#editor").getAttribute("class")).includes("hidden"));
  await until(async () => (await tablet.locator("#edBadges .ed-badge").count()) > 0);
  // Ein Element auswählen, damit das Eigenschaften-Panel gefüllt ist.
  await tablet.click("#edTool-select");
  const pt = await tablet.evaluate(() => {
    const ed = window.__tiltrEd;
    const box = document.getElementById("edCanvas").getBoundingClientRect();
    return { x: box.left + (ed.ox + 50 * ed.scale) / ed.dpr, y: box.top + (ed.oy + 250 * ed.scale) / ed.dpr };
  });
  await tablet.mouse.click(pt.x, pt.y);
  await sleep(400);
  await shot(tablet, "editor-tablet");
  // MP-Testmodus (M69): Vorschau des Zwei-Spieler-Levels auf dem PHONE – beide
  // Kugeln im Bild (der ruhende Partner ist der rote Ball) und die Kachel 👥1.
  // FRISCHE Seite: Auf der alten lag ein Entwurf, und die Karte rutschte
  // hinter die Modus-Karten (Klick wurde abgefangen).
  const mpPage = await ctx.newPage();
  await mpPage.goto(`${BASE}/?nosplash`);
  await mpPage.click("#workshopBtn");
  const mpCardPhone = mpPage.locator('#workshopList .ws-item[data-level-id="custom-shot-mp"]');
  const mpEdit = mpCardPhone.locator("button", { hasText: "✏️" });
  await mpEdit.scrollIntoViewIfNeeded();
  await mpEdit.click();
  const armPhone = mpCardPhone.locator("button", { hasText: "Entwurf verwerfen" });
  if (await armPhone.count()) await armPhone.click();
  await until(async () => (await mpPage.locator("#edBadges .ed-badge").count()) > 0);
  await mpPage.click("#edTest");
  await until(async () => await mpPage.evaluate(() => window.__tiltrMpTest), { timeout: 20000 });
  await until(async () =>
    await mpPage.evaluate(() => document.getElementById("interstitial")?.classList.contains("hidden")),
  );
  await sleep(600);
  await shot(mpPage, "editor-mptest");
  await ctx.close();
}

// 5) Multiplayer: Lobby (Host), Coop dunkel (Schein), Coop hell (roter Ball)
{
  const ctx = await phone();
  const host = await ctx.newPage();
  await host.goto(`${BASE}/?mpcode=TESTSHOT1&nosplash`);
  await host.click("#mpBtn");
  await host.locator("#mpLevelList .level-item:not(#mpRandomBtn)").first().click();
  await until(async () => (await host.innerHTML("#mpQr")).includes("<svg"));
  await sleep(300);
  await shot(host, "mp-lobby-qr");
  const guest = await ctx.newPage();
  await guest.goto(`${BASE}/?nosplash#join=TESTSHOT1`);
  await until(async () => (await guest.textContent("#interTitle")).includes("Schleuse"));
  await host.click("#interPrimary");
  await guest.click("#interPrimary");
  await until(
    async () =>
      (await host.evaluate(() => window.__tiltrMp?.phase)) === "playing" &&
      (await guest.evaluate(() => window.__tiltrMp?.phase)) === "playing",
    12000,
  );
  // Der Gast rollt aus der Startzelle – sonst läge sein Schein unter dem
  // eigenen Ball. Dann ein Ping beim Host: Wände sichtbar, Schein daneben.
  await guest.keyboard.down("ArrowRight");
  await until(async () => ((await guest.evaluate(() => window.__tiltrBall))?.x ?? 0) > 260, 5000);
  await guest.keyboard.up("ArrowRight");
  await until(async () => ((await host.evaluate(() => window.__tiltrMp?.remote))?.x ?? 0) > 200, 3000);
  await host.keyboard.press("Space");
  await sleep(450);
  await shot(host, "mp-ingame-halo");
  await ctx.close();
}
{
  const ctx = await phone();
  const host = await ctx.newPage();
  await host.goto(`${BASE}/?mpcode=TESTSHOT2&nosplash`);
  await host.click("#workshopBtn");
  await importLevel(host, MP_LEVEL);
  await host.locator('#workshopList .ws-item[data-level-id="custom-shot-mp"]').locator("button", { hasText: "Zu zweit" }).click();
  await until(async () => !(await host.locator("#mp").getAttribute("class")).includes("hidden"));
  await host.click("#mpCustomItem");
  await until(async () => (await host.innerHTML("#mpQr")).includes("<svg"));
  const guest = await ctx.newPage();
  await guest.goto(`${BASE}/?nosplash#join=TESTSHOT2`);
  await until(async () => (await guest.textContent("#interTitle")).includes("Zwei Gänge"));
  await sleep(200);
  await shot(guest, "mp-intro"); // Zwei-Spieler-Level: Intro nennt die Rolle (Spieler 2)
  await host.click("#interPrimary");
  await guest.click("#interPrimary");
  await until(
    async () =>
      (await host.evaluate(() => window.__tiltrMp?.phase)) === "playing" &&
      (await guest.evaluate(() => window.__tiltrMp?.phase)) === "playing",
    12000,
  );
  await guest.keyboard.down("ArrowRight");
  await sleep(500);
  await guest.keyboard.up("ArrowRight");
  await until(async () => (await host.evaluate(() => window.__tiltrMp?.buddySolid)) === true, 4000);
  await sleep(200);
  await shot(host, "mp-bright-partner");
  await ctx.close();
}

// 6) Hörtest + Galerie
{
  const ctx = await phone();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?nosplash`);
  await page.click("#hearingBtn");
  await sleep(600);
  await shot(page, "hearing");
  await page.goto(`${BASE}/?nosplash`);
  await page.click("#galleryLink");
  await sleep(400);
  await shot(page, "gallery");
  await ctx.close();
}

await browser.close();
preview.kill("SIGTERM");
console.log("fertig:", OUT);
