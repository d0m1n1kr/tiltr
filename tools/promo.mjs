// PROMO-GIF (M85): Ein Screencast der App, geschnitten zu Impressionen, die den
// CHARAKTER zeigen – Dunkelheit, Echo-Ping, Konfetti, Werkstatt. Läuft gegen den
// GEBAUTEN Stand (vite preview) mit derselben Mechanik wie tools/screenshots.mjs
// und e2e/smoke.mjs: Vite direkt starten, vorinstalliertes Chromium, ?nosplash
// bzw. ?unlock wo nötig.
//
// Es gibt in dieser Umgebung KEIN ffmpeg: Die Bilder kommen als PNG aus
// Playwright, werden sofort verkleinert (Speicher! ein 780×1688-Bild sind 5 MB
// dekodiert) und am Ende mit gifenc zu EINER Palette codiert. Die Bildzeiten
// sind GEMESSEN, nicht angenommen – ein Screenshot dauert 30–80 ms, feste
// Delays liefen sonst zu schnell.
//
// Aufruf: npm run build && node tools/promo.mjs   (schreibt public/promo.gif)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import UPNG from 'upng-js';
// gifenc ist CommonJS – ESM sieht nur den Default-Export.
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;

const PORT = 8767;
const BASE = `http://localhost:${PORT}`;
const OUT = new URL('../public/promo.gif', import.meta.url).pathname;
const SHRINK = 4; // 780×1688 (Phone @2x) → 195×422
const FPS = 10;

const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const VITE = new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname;
const preview = spawn(process.execPath, [VITE, 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
process.on('exit', () => preview.kill('SIGTERM'));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* noch nicht bereit */
  }
  await new Promise((r) => setTimeout(r, 200));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, timeout = 8000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) return v;
    await sleep(50);
  }
};

/** PNG → verkleinertes RGBA (Mittelwert über SHRINK×SHRINK, also ein Box-Filter:
 *  Nearest-Neighbour flimmert bei feinen Wandlinien). */
function shrink(png) {
  const img = UPNG.decode(png);
  const src = new Uint8Array(UPNG.toRGBA8(img)[0]);
  const w = Math.floor(img.width / SHRINK);
  const h = Math.floor(img.height / SHRINK);
  const out = new Uint8Array(w * h * 4);
  const n = SHRINK * SHRINK;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < SHRINK; dy++) {
        const row = (y * SHRINK + dy) * img.width;
        for (let dx = 0; dx < SHRINK; dx++) {
          const i = (row + x * SHRINK + dx) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { data: out, w, h };
}

const frames = []; // { png, ms }
let last = 0;
/** Aufnehmen für `ms` Millisekunden. Die GEMESSENE Zeit zwischen zwei Bildern
 *  wird zur Anzeigedauer – so läuft das GIF so schnell wie die App. Verkleinert
 *  wird ERST NACH dem Screencast: Dekodieren + Box-Filter kosten pro Bild mehr
 *  als der Screenshot selbst, und mitten in der Aufnahme fiele die Bildrate
 *  auf die Hälfte (die Kugel ruckelte). PNGs im Speicher sind billig (~150 KB). */
async function rec(page, ms) {
  const t0 = Date.now();
  do {
    const t = Date.now();
    const png = await page.screenshot();
    if (last) frames[frames.length - 1].ms = Math.min(400, t - last);
    last = t;
    frames.push({ png, ms: 1000 / FPS });
    const wait = 1000 / FPS - (Date.now() - t);
    if (wait > 0) await sleep(wait);
  } while (Date.now() - t0 < ms);
}
/** Harter Schnitt: die letzte Aufnahme etwas stehen lassen (ein GIF ohne
 *  Atempause wirkt wie ein Zucken) und die Zeitmessung neu ansetzen. */
function cut(hold = 260) {
  if (frames.length) frames[frames.length - 1].ms = hold;
  last = 0;
}

const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required'] });
const phone = () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'de-DE' });

// 1) Splash: die Kugel fährt ein, der Titel steht – und das Menü kommt hoch
// (die Einfahrt dauert gut 2,5 s, deshalb länger aufnehmen als sie läuft).
{
  const ctx = await phone();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await rec(page, 3600);
  cut();
  await ctx.close();
}

// 2) Der Kern: Dunkelheit, dann deckt der Echo-Ping die Wände auf.
{
  const ctx = await phone();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?seed=1207&nosplash`);
  await page.click('#quickBtn');
  await until(async () => (await page.evaluate(() => window.__tiltrBall)) != null, 8000);
  await page.keyboard.down('ArrowRight');
  await rec(page, 700);
  await page.keyboard.press('Space');
  await rec(page, 1500);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.press('Space');
  await rec(page, 1300);
  await page.keyboard.up('ArrowDown');
  cut();
  await ctx.close();
}

// 3) Sieg: Konfetti in Weltfarben.
{
  const ctx = await phone();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?unlock&nosplash`);
  await page.click('#tutorialBtn');
  await until(async () => (await page.textContent('#interTitle')).length > 0, 6000);
  await page.click('#interPrimary');
  await page.keyboard.down('ArrowRight');
  await until(async () => (await page.evaluate(() => window.__tiltrConfetti?.count ?? 0)) > 0, 12000);
  await page.keyboard.up('ArrowRight');
  await rec(page, 1600);
  cut();
  await ctx.close();
}

// 4) Galerie: jedes Element mit Klang-Signatur – die Vielfalt in einem Bild.
{
  const ctx = await phone();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?nosplash`);
  await page.click('#galleryLink');
  await sleep(400);
  await rec(page, 500);
  await page.evaluate(() => document.getElementById('galleryList')?.scrollBy({ top: 420, behavior: 'smooth' }));
  await rec(page, 900);
  cut();
  await ctx.close();
}

// 5) Hörtest: acht Richtungen, eine Kompassrose – das Ohr wird geschult.
{
  const ctx = await phone();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?nosplash`);
  await page.click('#hearingBtn');
  await sleep(500);
  await rec(page, 900);
  cut();
  await ctx.close();
}

// 6) Werkstatt: eigene Level, Lösbarkeits-Badges live.
{
  const ctx = await phone();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?nosplash`);
  await page.click('#workshopBtn');
  await page.click('#wsNewRandomBtn');
  await until(async () => (await page.locator('#edBadges .ed-badge').count()) > 0, 10000);
  await sleep(400);
  await rec(page, 1200);
  cut(600);
  await ctx.close();
}

await browser.close();

// --- Verkleinern (jetzt, nicht während der Aufnahme) und codieren: EINE
// globale Palette (256), sonst wächst jedes Bild um seine eigene Farbtabelle.
// Die Stichprobe nimmt jedes 4. Bild und jeden 3. Pixel.
for (const f of frames) {
  const small = shrink(f.png);
  f.data = small.data;
  f.w = small.w;
  f.h = small.h;
  delete f.png;
}
const { w, h } = frames[0];
const sample = [];
for (let i = 0; i < frames.length; i += 4) {
  const d = frames[i].data;
  for (let p = 0; p < d.length; p += 12) sample.push(d[p], d[p + 1], d[p + 2], 255);
}
const palette = quantize(new Uint8Array(sample), 256);
const gif = GIFEncoder();
for (const f of frames) {
  gif.writeFrame(applyPalette(f.data, palette), w, h, { palette, delay: Math.max(40, Math.round(f.ms)) });
}
gif.finish();
const bytes = gif.bytes();
writeFileSync(OUT, bytes);
const total = frames.reduce((s, f) => s + f.ms, 0);
console.log(`✓ public/promo.gif – ${w}×${h}, ${frames.length} Bilder, ${(total / 1000).toFixed(1)} s, ${(bytes.length / 1024).toFixed(0)} KB`);

// Kontrollbilder für den Blick von außen (PROMO_FRAMES=1): Ist die Szene
// wirklich da, oder ist sie schwarz? Ein GIF sieht man in der Konsole nicht.
if (process.env.PROMO_FRAMES) {
  const dir = process.env.PROMO_FRAMES_DIR ?? '/tmp';
  frames.forEach((f, i) => {
    if (i % 8) return;
    writeFileSync(`${dir}/promo-${String(i).padStart(3, '0')}.png`, Buffer.from(UPNG.encode([f.data.buffer], f.w, f.h, 0)));
  });
  console.log(`✓ Kontrollbilder in ${dir}`);
}

// Der vite-preview-Kindprozess hält die Schleife offen – wie in e2e/smoke.mjs.
process.exit(0);
