# tiltr – Hinweise für die Entwicklung

Immersives Sensor-Spiel als PWA: Ball per Neigung durch ein unsichtbares
Labyrinth, die Welt offenbart sich über Klang (Spatial Audio), Vibration und
sparsames Licht. Live: https://d0m1n1kr.github.io/tiltr/

## Befehle

```bash
npm run dev        # Dev-Server (Desktop: WASD/Pfeile, Leertaste = Ping)
npm run typecheck  # tsc --noEmit
npm test           # Vitest-Units
npm run lint       # ESLint
npm run build      # Produktions-Build (dist/, inkl. PWA/Workbox)
npm run e2e        # Playwright-Smoke gegen vite preview (fester Seed)
```

CI (`.github/workflows/pages.yml`) führt alle fünf aus und deployt `dist/`
auf GitHub Pages. Vor jedem Push: komplette Suite lokal grün. Bei jedem
Release die Version in `package.json` bumpen – sie erscheint auf dem
Startscreen und steuert den Update-Toast (version.json, NetworkOnly).

## Architektur (Details: docs/PLAN.md)

- `src/core/` – deterministische, DOM-freie Simulation (Physik, Maze,
  seeded RNG). Kein `performance.now()`/`Math.random()` hier drin:
  Determinismus ist Grundlage für Daily Challenge und Multiplayer.
  `?seed=…` in der URL macht Läufe reproduzierbar; `?unlock` schaltet
  alle Kampagnen-Level frei (Playtesting).
- `src/elements/` – Element-Registry: Jedes Spielelement ist ein Modul mit
  `build()` (Loader), Galerie-Eintrag (Visual + Klang-Demo) und zod-Schema
  in `src/levels/schema.ts`. Neue Elemente brauchen alle drei plus eine
  Weltfarbe in `src/render/palette.ts`.
- `src/levels/validate.ts` – die Lösbarkeits-Beweise (Erreichbarkeit,
  Öffner-Fixpunkt, Softlock, Timer, hazardsBlocked, links, guards): EINE Quelle der
  Wahrheit für Testsuite (tests/helpers.ts re-exportiert) UND die
  Live-Badges des Editors. Modell-Änderungen nur hier. Der Loader ist bei
  Verknüpfungen bewusst MILD (Tür ohne Öffner / Schlüssel ohne Tür laden –
  Editor-Zwischenzustände); die Strenge wohnt im `links`-Check. Wächter
  gehören ins Modell (`guards`): An einem Wächter kommt man in einem
  Ein-Zellen-Korridor NICHT vorbei, also werden Patrouillen abschnittsweise
  gequert – nur solange eine Patrouillenzelle für den Wächter frei bleibt.
  Neue Level mit Wächtern brauchen Ausweichbuchten oder Quer-Passagen.
- `src/workshop.ts` + `src/ui/editor.ts` – Werkstatt: eigene Level in
  localStorage, Editor editiert rohe Defs (Vorschau = parseLevel →
  loadLevel → Renderer mit debug), Preview läuft in der echten
  Spielschleife (Modus 'custom', ✏️ zurück). Die laufende Bearbeitung
  liegt reload-fest als Draft im Store (saveDraft bei jeder Änderung,
  clearDraft beim Speichern); die Werkstatt bietet „Weiter an …" an und
  bestätigt per Zwei-Tap, bevor Neu/Zufall/Bearbeiten den Draft ersetzen.
- `src/levels/` – Levelformat (zod), Loader, Tutorial-/Kampagnen-Level,
  Quick-Generator. Jedes neue Level braucht einen Lösbarkeits-Test
  (siehe tests/campaign.test.ts – inkl. Tür-Semantik: Schlüssel vor der
  Tür erreichbar). Handgebaute Level werden per `mirrorLevel`
  (src/levels/mirror.ts) gespiegelt, damit Starts/Ziele nicht alle oben
  links/unten rechts liegen – Achse passend zu Richtungsbezügen im
  Intro-Text wählen ('x' erhält oben/unten, 'y' links/rechts);
  tests/mirror.test.ts erzwingt die Ecken-Verteilung.
- `src/levels/duel.ts` – Geist-Duell: Spur auf exaktes 8-Hz-Raster
  resampeln, delta-kodieren und mit Level + Zeit in EIN Token packen
  (`#duel=`, gemeinsamer deflate-Pfad mit `#level=` über
  shareCodec.encodePayload). `validateGhostRun` prüft empfangene Spuren
  auf Plausibilität (Start/Ziel, maxSpeed, Transporter) – kein Anti-Cheat,
  ein Filter gegen kaputte Tokens. Duell-Läufe schreiben NICHTS mit.
- Audio ist das Leitmedium: Jedes Element hat eine eindeutige, räumlich
  ortbare Klang-Signatur (HRTF-PannerNodes). Kein Element ohne Sound.
  Jede Reflexion des Echo-Pings hat einen BREITBANDIGEN Anschlag (kurzer
  Rausch-Transient, Band um 2,6 kHz) vor dem tonalen Körper: Ein fast
  reiner Ton um 1 kHz ist der schlechteste Reiz fürs Ortungsgehör
  (Laufzeit phasen-mehrdeutig, Lautstärkeunterschied noch klein) – ohne
  den Anschlag ist selbst perfektes HRTF-Panning nicht hörbar. Der
  ungepannte Emissions-Chirp kommt vom Ball, nicht von der Welt;
  `echoPing(refl, { chirpGain })` fährt ihn leise, wo die Richtung
  beurteilt werden soll.
  `src/ui/hearing.ts` ist der Hörtest-Modus: echter Echo-Ping aus einer
  von acht Richtungen, Antwort auf der Kompassrose, Auswertung TRENNT
  Seiten- und Tiefen-Achse (links/rechts trägt, vorn/hinten ist bei
  generischer HRTF schwach). Wer am Panning schraubt, prüft es hier –
  `window.__tiltrPing` legt offen, WAS das Ohr bekommen hat (Chirp-Gain,
  Position und Breitband-Anteil jeder Reflexion).

## UI & Layout

- **i18n**: Alle nutzersichtbaren Texte über `src/i18n/` (de/en/fr/es;
  Deutsch = Referenz, typisiert die Schlüsselmenge). Neuer String ⇒
  Schlüssel in allen vier Wörterbüchern (tests/i18n.test.ts erzwingt das).
  Level-Namen/-Intros: Anzeige über `lvName`/`lvIntro`, deutsche Texte in
  den Level-Defs bleiben Quelle der Wahrheit. E2E läuft mit
  `locale: 'de-DE'` und `?nosplash`.

- **docs/DESIGN.md ist verbindlich**: Tokens/Komponenten aus
  `src/ui/theme.css`, Weltfarben aus `src/render/palette.ts` – keine
  Magic Values, kein Inline-Style.
- **Safe-Area-Regeln beachten** (Abschnitt „Safe-Area & Viewport" in
  docs/DESIGN.md): Fehler dieser Kategorie sind im Browser unsichtbar
  und brechen erst in der installierten PWA. Jede Layout-Änderung muss
  den Safe-Area-Lauf in `e2e/smoke.mjs` (nachgebildete Insets 62/34 +
  Gegenprobe) grün halten; neue Zusicherungen einmal rot sehen.

## Git

- Branch: `claude/sensor-ball-game-pwa-f6jg9b` (Default). Jeder Push
  deployt nach Tests automatisch live.
- `prototype/` ist der eingefrorene Phase-0-Prototyp (Referenz).
