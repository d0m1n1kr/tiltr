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
  Öffner-Fixpunkt, Softlock, Timer, hazardsBlocked): EINE Quelle der
  Wahrheit für Testsuite (tests/helpers.ts re-exportiert) UND die
  Live-Badges des Editors. Modell-Änderungen nur hier.
- `src/workshop.ts` + `src/ui/editor.ts` – Werkstatt: eigene Level in
  localStorage, Editor editiert rohe Defs (Vorschau = parseLevel →
  loadLevel → Renderer mit debug), Preview läuft in der echten
  Spielschleife (Modus 'custom', ✏️ zurück).
- `src/levels/` – Levelformat (zod), Loader, Tutorial-/Kampagnen-Level,
  Quick-Generator. Jedes neue Level braucht einen Lösbarkeits-Test
  (siehe tests/campaign.test.ts – inkl. Tür-Semantik: Schlüssel vor der
  Tür erreichbar). Handgebaute Level werden per `mirrorLevel`
  (src/levels/mirror.ts) gespiegelt, damit Starts/Ziele nicht alle oben
  links/unten rechts liegen – Achse passend zu Richtungsbezügen im
  Intro-Text wählen ('x' erhält oben/unten, 'y' links/rechts);
  tests/mirror.test.ts erzwingt die Ecken-Verteilung.
- Audio ist das Leitmedium: Jedes Element hat eine eindeutige, räumlich
  ortbare Klang-Signatur (HRTF-PannerNodes). Kein Element ohne Sound.

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
