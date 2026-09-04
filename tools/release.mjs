#!/usr/bin/env node
// RELEASE-SCHRITTFOLGE: Die Versionsnummer wird ZULETZT gesetzt – erst wenn die
// komplette Suite grün ist.
//
// Der Anlass war 3.22.0: Die Zahl stand im ersten Commit, die CI fiel zweimal
// (ein Last-Flake im E2E, dann ein echter Fehler im Feature), und damit trug
// eine Version, die nie live war, zwei rote Läufe. Die Zahl ist kein Etikett:
// Sie erscheint auf dem Startscreen und steuert den Update-Toast (version.json,
// NetworkOnly). Ein Stand mit falscher Zahl ist also ein falsches Versprechen.
//
// Was dieses Werkzeug NICHT tut, mit Grund: Es committet und pusht nicht. Die
// Commit-Nachricht ist Teil der Arbeit, nicht ihr Beiprodukt – und ein zweiter
// Push nur für die Zahl (also „bumpen erst NACH grüner CI") würde einen
// zweiten CI-Lauf kosten UND einen Deploy ohne Update-Toast dazwischen legen.
// Die Version gehört in DENSELBEN Commit wie das Feature; dieses Werkzeug
// sorgt nur dafür, dass sie erst entsteht, wenn alles grün ist.
//
// Aufruf:  npm run release -- 3.23.0
//          npm run release -- 3.23.0 --check   (nur die Prüfungen, ohne Suite)

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PKG = new URL('../package.json', import.meta.url);

/** „3.22.0" → [3, 22, 0]; null, wenn es keine drei Zahlen sind. */
export function parseVersion(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(s).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Ist `next` echt höher als `cur`? Gleichstand ist NEIN – ein Release, das
 *  die Zahl nicht hebt, weckt keinen Update-Toast. */
export function isHigher(cur, next) {
  const a = parseVersion(cur);
  const b = parseVersion(next);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (b[i] > a[i]) return true;
    if (b[i] < a[i]) return false;
  }
  return false;
}

/** Version in package.json ersetzen – NUR das erste `"version"`-Feld, damit
 *  Formatierung und Reihenfolge der Datei unangetastet bleiben (ein
 *  JSON.stringify-Rundlauf hätte Einrückung und Schlüsselfolge umgeschrieben). */
export function bumpJson(text, next) {
  const re = /^(\s*"version":\s*")([^"]+)(")/m;
  if (!re.test(text)) throw new Error('kein "version"-Feld in package.json');
  return text.replace(re, `$1${next}$3`);
}

const STEPS = [
  ['typecheck', ['run', 'typecheck']],
  ['lint', ['run', 'lint']],
  ['units', ['test']],
  ['build', ['run', 'build']],
  ['e2e', ['run', 'e2e']],
];

function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const check = argv.includes('--check');
  const next = args[0];
  const pkgText = readFileSync(PKG, 'utf8');
  const cur = JSON.parse(pkgText).version;

  if (!next) {
    console.error(`Aufruf: npm run release -- <version>   (aktuell ${cur})`);
    process.exit(2);
  }
  if (!parseVersion(next)) {
    console.error(`„${next}" ist keine Version im Format x.y.z`);
    process.exit(2);
  }
  if (!isHigher(cur, next)) {
    console.error(`${next} ist nicht höher als die aktuelle ${cur} – die Zahl muss steigen (Update-Toast).`);
    process.exit(2);
  }
  console.log(`Release ${cur} → ${next}: erst die Suite, dann die Zahl.\n`);
  if (check) {
    console.log('--check: Prüfungen bestanden, Suite übersprungen, Version NICHT gesetzt.');
    return;
  }

  for (const [name, cmdArgs] of STEPS) {
    const t0 = Date.now();
    process.stdout.write(`… ${name}`);
    try {
      execFileSync('npm', cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      // Die letzten Zeilen sagen, WAS gefallen ist – ohne sie müsste man den
      // Lauf blind wiederholen.
      console.log(`\r✗ ${name} gefallen:\n${out.split('\n').slice(-25).join('\n')}`);
      console.error(`\nVersion bleibt ${cur}. Erst grün, dann die Zahl.`);
      process.exit(1);
    }
    console.log(`\r✓ ${name} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }

  writeFileSync(PKG, bumpJson(pkgText, next));
  // Neu bauen, damit dist/version.json und der Startscreen die neue Zahl
  // tragen – wer danach noch einmal e2e fährt, prüft den echten Stand.
  execFileSync('npm', ['run', 'build'], { stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(`\nSuite grün → package.json steht auf ${next} (neu gebaut).`);
  console.log('Jetzt: Doku (PLAN/CLAUDE.md), dann committen und pushen.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
