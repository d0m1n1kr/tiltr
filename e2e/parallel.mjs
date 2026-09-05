// E2E parallel: EIN Preview-Server, N Arbeiter (je ein eigener smoke.mjs-
// Prozess mit E2E_BASE + E2E_ONLY). Die 29 Läufe sind unabhängig – eigene
// Seiten, eigener localStorage pro Browser-Kontext, nur lesend gegen dist/.
//
// Warum nicht der Playwright-Test-Runner: der wäre die „richtige" Lösung,
// aber ein 2600-Zeilen-Umbau. Dieser Dispatcher ist 80 Zeilen und ändert an
// den Läufen NICHTS – smoke.mjs bleibt allein lauffähig (npm run e2e:serial).
//
// Verteilung: Greedy nach GEWICHT (gemessene Schlafsekunden je Lauf, Stand
// v2.6.0 – 183 s von 223 s E2E waren waitForTimeout). Ungenau ist egal, es
// geht nur darum, dass Lauf 9 (34 s) und Lauf 16 (20 s) nicht im selben
// Arbeiter landen. Unbekannte Läufe wiegen 5.

import { spawn } from "node:child_process";
import { cpus } from "node:os";

const PORT = 8765;
const BASE = `http://localhost:${PORT}`;
const WEIGHT = {
  54: 16,
  53: 14,
  52: 14,
  51: 14,
  50: 14,
  49: 12,
  48: 14,
  47: 22,
  46: 26,
  45: 24,
  44: 12,
  43: 10,
  42: 20,
  41: 18,
  40: 20,
  39: 12,
  38: 18,
  37: 14,
  36: 14,
  35: 20,
  34: 8,
  33: 26,
  32: 10,
  31: 12,
  30: 12,
  29: 25,
  28: 30,
  9: 34,
  16: 20,
  22: 17,
  4: 12,
  12: 11,
  19: 9,
  3: 9,
  21: 8,
  5: 7,
  2: 6,
};
const workers = Math.max(
  1,
  Number(process.env.E2E_WORKERS) || Math.min(4, cpus().length),
);

// Läufe aus smoke.mjs lesen – EINE Quelle, kein Abschreiben.
const { readFileSync } = await import("node:fs");
const src = readFileSync(new URL("./smoke.mjs", import.meta.url), "utf8");
// Robust gegen Prettier: die Liste darf umbrochen sein und einfache oder
// doppelte Anführungszeichen tragen – EIN Umbruch hat den Dispatcher schon
// einmal sofort sterben lassen.
const listSrc = src.match(/const KNOWN_RUNS = \[([\s\S]*?)\];/)?.[1];
if (!listSrc) {
  console.error("parallel.mjs: KNOWN_RUNS in smoke.mjs nicht gefunden");
  process.exit(2);
}
const known = [...listSrc.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
const only = process.env.E2E_ONLY
  ? process.env.E2E_ONLY.split(",").map((x) => x.trim())
  : null;
const runs = only ?? known;

// ZWEI-SEITEN-MP GEHÖRT IN EINEN ARBEITER (M88): Die Läufe 9, 33 und 45 fahren
// je ZWEI Seiten mit einem vollen Multiplayer-Lauf. Zwei davon gleichzeitig
// sind auf zwei CI-Kernen vier schwere Seiten neben den übrigen Arbeitern –
// dann hungert die Physik: In der CI kam Ball A nicht mehr ins Ziel, und am
// Ende schlug Playwrights EIGENER Klick-Timeout zu (Arbeiter 1 bei 358 s, die
// anderen bei 65–93 s, 7 ✗ in Lauf 9 – einzeln und lokal alles grün). Sie
// kommen deshalb in DENSELBEN Eimer und laufen dort hintereinander. Wer einen
// neuen Lauf mit zwei Seiten schreibt, trägt ihn hier ein.
const AFFINITY = [["9", "33", "45", "46", "47"]];

// Greedy: schwerste Einheit zuerst in den leichtesten Eimer. Eine „Einheit"
// ist ein Lauf – oder eine Affinitäts-Gruppe, die zusammenbleiben muss.
const bins = Array.from({ length: Math.min(workers, runs.length) }, () => ({
  w: 0,
  ids: [],
}));
const grouped = new Set();
const units = [];
for (const group of AFFINITY) {
  const ids = group.filter((id) => runs.includes(id));
  if (ids.length === 0) continue;
  for (const id of ids) grouped.add(id);
  units.push({ ids, w: ids.reduce((sum, id) => sum + (WEIGHT[id] ?? 5), 0) });
}
for (const id of runs)
  if (!grouped.has(id)) units.push({ ids: [id], w: WEIGHT[id] ?? 5 });
for (const unit of units.sort((a, b) => b.w - a.w)) {
  const bin = bins.reduce((m, b) => (b.w < m.w ? b : m));
  bin.w += unit.w;
  bin.ids.push(...unit.ids);
}

const VITE = new URL("../node_modules/vite/bin/vite.js", import.meta.url)
  .pathname;
const preview = spawn(
  process.execPath,
  [VITE, "preview", "--port", String(PORT), "--strictPort"],
  { stdio: "ignore" },
);
process.on("exit", () => preview.kill("SIGTERM"));
for (let i = 0; i < 50; i++) {
  // Stirbt UNSER Server (Port belegt: --strictPort), darf die Schleife nicht
  // einen fremden Server auf demselben Port für den eigenen halten.
  if (preview.exitCode !== null) {
    console.error(
      `parallel.mjs: vite preview beendet (exit ${preview.exitCode}) – Port ${PORT} belegt?`,
    );
    process.exit(2);
  }
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* noch nicht bereit */
  }
  await new Promise((r) => setTimeout(r, 200));
}

const t0 = Date.now();
console.log(
  `E2E parallel: ${runs.length} Läufe auf ${bins.length} Arbeiter\n` +
    bins.map((b, i) => `  [${i + 1}] ~${b.w}s: ${b.ids.join(", ")}`).join("\n"),
);

const results = await Promise.all(
  bins.map(
    (b, i) =>
      new Promise((resolve) => {
        const child = spawn(
          process.execPath,
          [new URL("./smoke.mjs", import.meta.url).pathname],
          {
            // Unter Last dehnt sich die WANDUHR: Vier Arbeiter auf zwei Kernen
            // lassen die Spielschleife (rAF) einbrechen, die Kugel rollt in
            // Sekunden dieselbe Strecke nicht mehr. Deshalb skalieren die
            // Wartebudgets mit der Arbeiterzahl – die Zusicherungen warten
            // weiter auf ZUSTAND, nur ihre Obergrenze wächst (das war der
            // CI-Ausfall von Lauf 9: 8 s Budget, Arbeiter bei 146 s statt 53).
            env: {
              ...process.env,
              E2E_BASE: BASE,
              E2E_ONLY: b.ids.join(","),
              E2E_TIMEOUT_SCALE: String(Math.max(1, bins.length)),
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let out = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (out += d));
        const start = Date.now();
        child.on("close", (code) =>
          resolve({ i, code, out, s: (Date.now() - start) / 1000 }),
        );
      }),
  ),
);

// Ausgabe je Arbeiter GESAMMELT, nicht verschränkt – ✓/✗-Zeilen bleiben greppbar.
let failed = false;
for (const r of results) {
  console.log(
    `\n===== Arbeiter ${r.i + 1} (${r.s.toFixed(0)} s, exit ${r.code}) =====`,
  );
  process.stdout.write(r.out);
  if (r.code !== 0) failed = true;
  // Ein abgestürzter Arbeiter (unbehandelte Ausnahme nach einem roten Check)
  // lässt seine restlichen Läufe STILL aus – nur der Exit-Code verrät es. Hier
  // steht, WELCHE Läufe nie ihren Marker geschrieben haben.
  const ran = new Set([...r.out.matchAll(/^# Lauf (\S+)$/gm)].map((m) => m[1]));
  const skipped = bins[r.i].ids.filter((id) => !ran.has(id));
  if (skipped.length) {
    console.log(
      `✗ Arbeiter ${r.i + 1}: NICHT gelaufen (Absturz davor?): ${skipped.join(", ")}`,
    );
    failed = true;
  }
}
const ok = results.reduce((n, r) => n + (r.out.match(/^✓/gm) ?? []).length, 0);
const bad = results.reduce((n, r) => n + (r.out.match(/^✗/gm) ?? []).length, 0);
console.log(
  `\nE2E gesamt: ${ok} ✓  ${bad} ✗  in ${((Date.now() - t0) / 1000).toFixed(0)} s (Wand-Uhr)`,
);
process.exit(failed ? 1 : 0);
