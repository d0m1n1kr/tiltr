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
npm run e2e        # Playwright-Smoke, PARALLEL: ein Server, 4 Arbeiter (e2e/parallel.mjs)
npm run e2e:serial # dieselben Läufe in einem Prozess (e2e/smoke.mjs)
E2E_ONLY=23,24 npm run e2e:serial   # nur diese Läufe – zum Iterieren, 20 s statt 4 min
```

E2E_ONLY kennt die Lauf-Namen aus den Köpfen (`// --- Lauf 21b …`); ein
unbekannter Name ist ein FEHLER (exit 2), damit ein Tippfehler nicht mit null
Checks grün durchgeht. E2E_WORKERS überschreibt die Arbeiterzahl. Die Läufe
sind unabhängig (eigene Seiten, eigener localStorage je Kontext) – wer einen
neuen Lauf schreibt, hält das so, sonst bricht die Parallelisierung. Vite wird
DIREKT gestartet (nicht über npx): SIGTERM an npx ließ den Server überleben,
und ein Altserver auf 8765 lässt jeden späteren Start still scheitern. JEDER
Top-Level-Block eines Laufs steht in `if (want('id')) { … }` – auch ein
zweiter Block unter demselben Kopf; ein nacktes `{` liefe in jedem Arbeiter
und bei jedem Filter mit. Kontrolle nach dem Umbau: parallel = seriell + 3 ✓.
Jeder Block steht außerdem in `try { … } catch (e) { check('Lauf X läuft ohne
Absturz durch (…)', false) }`: Ein unbehandelter Wurf (etwa ein 30-s-Timeout
von `page.click`) riss vorher den ganzen Arbeiter mit, und die Läufe hinter
ihm fehlten STILL – 207 ✓ statt 247, exit 0 an keiner Stelle rot. Der
Dispatcher meldet zusätzlich jeden zugeteilten Lauf, der nie sein `# Lauf X`
druckte (`NICHT gelaufen`), und setzt exit ≠ 0. Ein Lauf, der allein grün ist
und unter 4 Arbeitern rot, ist ein LAST-Flake (Lauf 9 „Coop" mit 34 s Sleep):
Sleeps durch Zustands-Warten ersetzen, nicht die Arbeiterzahl senken.

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
  Öffner-Fixpunkt, Softlock, Timer, links, guards, jukebox): EINE Quelle der
  Wahrheit für Testsuite (tests/helpers.ts re-exportiert) UND die
  Live-Badges des Editors. Modell-Änderungen nur hier.
  Es gibt KEIN „Glas abseits"-Badge mehr (M39): Glas hält EINE Überfahrt aus
  und wird dann zum Loch – an dessen Rand kommt man mit Gefühl vorbei, ein
  Pflichtweg über Glas ist Schwierigkeit, kein Riegel. Auch der SOG-ANKER ist
  keiner: `force ≤ 2400` liegt per Schema-Invariante unter `accel 2600`. Die
  Flags `glassBlocked`/`anchorsBlocked` in `reachable` bleiben – als
  QUALITÄTS-Regel unserer Generatoren (tests/levels.test.ts, tests/daily.test.ts),
  nicht als Beweis; jede Aufrufstelle sagt, was sie meint. Ein Badge, das ein
  spielbares Level unteilbar macht (`isShareable` verlangt alle Badges), ist
  falsch – das war zweimal die Lektion (M32 Anker, M39 Glas).
  Der `openers`-Check fragt PRO TÜR, nicht pro Schlüssel: Ist mindestens EIN
  Öffner erreichbar, wenn GENAU DIESE Tür nie aufgeht
  (`coopReachable(def, {tür})`)? Alle anderen Türen öffnen dabei normal – sonst
  gilt die gewöhnlichste Progression als Fehler (Schlüssel 1 → Tür 1 →
  Schlüssel 2 → Tür 2). Pro Tür, weil zwei Schlüssel dieselbe Tür öffnen
  dürfen: Liegt einer dahinter, ist das kein Fehler, solange der andere davor
  liegt. GEPRÜFT werden nur Türen mit Schlüssel/Zeitschloss, ERFÜLLEN darf
  jeder Öffner inklusive Platte (Coop). Wer hier schraubt, prüfe zuerst den
  BERICHT auf Widersprüche: Der Bug fiel auf, weil `goal` grün und `openers`
  rot sagte – zwei Checks derselben Datei mit zwei Meinungen. Der Loader ist bei
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
  In der PREVIEW ist der 👁-Knopf (Debug-Ansicht) IMMER da – im Spiel ist er
  versteckt (5 Taps auf die Versionsnummer), beim Testen eines eigenen
  Entwurfs gehört er dazu. `updateDebugButton()` schaltet ihn bei jedem
  Levelstart: verlässt man die Vorschau, geht er weg UND die Ansicht aus,
  damit kein aufgedecktes Labyrinth in den nächsten Lauf mitkommt.
  DER START GEHÖRT EBENE 1: `start` ist pro Ebene Pflicht (Schema), aber nur
  `floors[0].start` setzt die Kugel (Loader) und startet den Beweis – tiefer
  kommt man über den Transporter an. Deshalb zeichnet der Editor die (EINE,
  geteilte) Kugel nur auf Ebene 1 (`hideBall`, prüfbar über
  `renderer.ballDrawn`), das ●-Werkzeug ist ab E2 gedämpft und erklärt sich
  beim Tap, und `cellFree`/`jukebox`-Check prüfen den Start nur auf Ebene 1 –
  sonst sperrt ein toter Wert grundlos einen Bauplatz. Ebenen-Löschung wohnt
  in der REINEN `removeFloor()`: Sie räumt Transporter auf UND rückt den
  beförderten Start wie das gerettete Ziel per `freeCellFor()` in eine freie
  Zelle (Wächter-Wegpunkte gelten als belegt). Sonst wacht die Kugel nach dem
  Löschen von Ebene 1 in einem Loch auf.
  WAND-WERKZEUG ist ein SCHALTER nach SICHTBAREM Zustand (`toggleEdge`, rein):
  Wand oder keine Wand, die Listen carve/add werden so gesetzt, dass es
  stimmt – egal, was der Seed an der Kante gewürfelt hat (der alte Zyklus
  über die Listen hatte je nach Seed einen unsichtbaren Tap). Die VARIANTE
  einer Wand (massiv / brüchig / Schallschutz) ist eine EIGENSCHAFT:
  Auswählen auf eine Wandkante ohne Element wählt die Wand (`selEdge`), das
  Feld `#edWallVariant` schreibt über `setEdgeVariant` in GENAU EINE der
  Listen `maze.brittle`/`maze.absorb`. Beide verlangen im Loader eine
  EXISTIERENDE Wand – der Editor bietet die Auswahl deshalb nur für Wände an,
  und Entfernen/Radieren nimmt die Variante mit. LANDEPLÄTZE (`landingsOn`,
  rein): Jede Transporter-Zielzelle auf der sichtbaren Ebene bekommt einen
  gestrichelten Ring in Portal-Farbe plus „←E<n>" von einer anderen Ebene. Ein
  Landeplatz ist KEIN Element: `elementAt`/`cellFree` kennen ihn nicht, die
  Zelle bleibt bebaubar. `__tiltrEd.landings`, `.edgeState(e)`, `.selEdge`
  legen das für E2E offen.
  ⚑ TEST AB HIER: Das Werkzeug setzt einen Teststart (Ebene + Zelle,
  `testStart`, Tap auf dieselbe Zelle hebt auf) – die Vorschau setzt die Kugel
  DORT ab und wechselt auf die Ebene (`startCustom(def, true, from)` →
  `launch`), Respawn ebenfalls dort. Kein Teil der Def: nicht gespeichert,
  nicht geteilt, lebt nur im Editor (überlebt aber den ✏️-Rücksprung).
- `src/core/occlusion.ts` – SCHALLSCHUTZWAND (`maze.absorb`, Wand mit
  `absorb`, Palette `absorb` Filz-Khaki): Der Echo-Ping deckt sie auf, aber
  sie antwortet NICHT; Klangquellen, deren Strahl vom Ball eine solche Wand
  kreuzt (`shielded`, Slab-Test gegen die Wand-Rechtecke), sind abgeschirmt –
  app.ts skaliert die Nähe stetiger Quellen mit `ABSORB_GAIN`, der Beacon
  nimmt `muffled`, der Rempler ist `audio.hit(…, soft)`. Ein Strahl, keine
  Akustik: keine Beugung, kein Filter auf den Stetigkeits-Quellen. Für die
  Lösbarkeit ist sie eine normale Wand. Galerie: Extra-Eintrag `wallAbsorb`
  (wie `wallEcho`), `extraEntries` exportiert für den Editor-Kopf.
  IMPORT NIMMT JSON UND TEILEN-LINK: Ein geteilter Link (`#level=`, auch
  `#duel=`) öffnet immer den BROWSER, nie die installierte PWA – deshalb
  akzeptiert das Import-Feld den Link (oder das nackte Token) eingefügt, plus
  📋 aus der Zwischenablage. `parseShareText` (rein) zieht Kind + Token aus
  freiem Text, `importAny` versucht JSON zuerst (synchron), dann den Codec;
  beide enden in `importRaw` (validieren, fremde IDs frisch, speichern).
  Der Editor arbeitet auf ROHEN Defs, in denen optionale Felder fehlen
  dürfen – `normalizeDraft()` füllt sie beim Öffnen EINMAL auf, statt an
  jeder Zugriffsstelle zu prüfen. Der Auswahl-Kopf spielt die Klang-Signatur
  des Elements aus der Registry (dieselbe wie die Galerie); `#edPlay` lässt
  bewegte Elemente laufen – reine Ansicht ohne Ball und Physik (Zyklen über
  core/breathing.ts, Patrouillen über `world.advanceGuards`), stumm und
  pausierbar. `window.__tiltrEd.motion` legt offen, was gezeichnet wird.
- `src/levels/` – Levelformat (zod), Loader, Tutorial-/Kampagnen-Level,
  Quick-Generator. Jedes neue Level braucht einen Lösbarkeits-Test
  (siehe tests/campaign.test.ts – inkl. Tür-Semantik: Schlüssel vor der
  Tür erreichbar). Handgebaute Level werden per `mirrorLevel`
  (src/levels/mirror.ts) gespiegelt, damit Starts/Ziele nicht alle oben
  links/unten rechts liegen – Achse passend zu Richtungsbezügen im
  Intro-Text wählen ('x' erhält oben/unten, 'y' links/rechts);
  tests/mirror.test.ts erzwingt die Ecken-Verteilung.
- `src/levels/daily.ts` – Tages-Challenge: Wächter werden GENERIERT UND
  BEWIESEN. Am Ende läuft `guardsProof` (aus validate.ts herausgezogen –
  derselbe Beweis, den das Editor-Badge zeigt); ist er rot, wird der
  schuldige Wächter entfernt. Grund: Eine Zwei-Zellen-Patrouille in einem ein
  Zelle breiten Gang versiegelt ihn DAUERHAFT (M18-Klasse) – das machte 8 von
  28 Tagen unlösbar, und zwar für alle, denn das Level ist für alle dasselbe.
  `patrolCrossable` filtert dieselbe Falle schon bei der Auswahl; das ist
  QUALITÄT, nicht Korrektheit (mit Filter überleben 76 % der Wächter, ohne
  60 %) – nicht als redundant wegräumen.
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

- `src/ui/confetti.ts` – Sieges-Konfetti: reines, geseedetes Partikelmodell
  (`spawnConfetti`/`stepConfetti`, Units in tests/confetti.test.ts) plus
  eigene Canvas-Ebene zwischen Spielfeld und Panels, angetrieben von der
  bestehenden Spielschleife. Farben aus der Weltpalette, `GRAVITY/DRAG` ist
  die Endgeschwindigkeit (Papier taumelt). Ausgelöst über `celebrate()` in
  app.ts – EINE Stelle für alle Single-Player-Siege (Tutorial inklusive),
  plus Coop und gewonnenes Race. `audio.confetti()` ist STEREO gepannt, nicht
  HRTF: Die Feier kommt vom Schirm, nicht aus der Welt.
  ACHTUNG: Eine Canvas-Ebene braucht `width`/`height` EXPLIZIT – mit
  `inset: 0` allein streckt sich ein replaced element nicht (siehe DESIGN.md).
- `src/core/breathing.ts` – Atem-Uhr (öffnen → offen → schließen → zu) für
  atmende Löcher, Schiebewände UND die Play-Vorschau des Editors: EINE
  Quelle für alle drei (`breathAt`, `breathOpenRemaining`), deterministisch,
  Units in tests/breathing.test.ts.
- `src/core/fp.ts` – First Person (M23): zweiter Steuerungsmodus für ALLE
  Varianten (`profile.controls`, Umschalter im Menü-Footer). Draufsicht
  bleibt, aber die Kugel hat ein Heading, das auf dem Screen immer nach
  oben zeigt – es dreht sich die WELT (Renderer), der HÖRER
  (`audio.setHeading`, gedreht an einer Stelle: `unitPos`) und der SCHUB
  (`fpStep` rotiert den Neigungsvektor VOR `world.step`). Die Physik bleibt
  Weltkoordinaten – Geister, Duelle, Daily, MP sind kompatibel, jeder
  Spieler wählt seinen Modus. Geglättet wird die DREHRATE (τ = 90 ms):
  ein gemeinsames, ruckelfreies Heading für Kamera, Schub und Ohr.
  Tastatur: ↑/↓ Schub, ←/→ drehen. `window.__tiltrFp` zeigt Heading und
  Ansicht; Kalibrier-Countdown sagt die Haltung je Modus an (Tablett/45°).
- `src/render/renderer.ts` – Der eigene Ball ist der EINZIGE feste Körper im
  Bild. Alles Fremde (Partner im MP, Geist der Bestzeit) ist ein SCHEIN:
  `haloLayers()` liefert weiche Lichtschichten ohne gezeichneten Rand, stets
  unter `BALL_CORE_ALPHA` (Units in tests/render.test.ts). Wer im MP im Ziel
  ist, friert NICHT ein – es steht die Uhr (`.hud-chip.done`), das eigene
  Ziel leuchtet ruhig weiter (`goalDone`) und der Ball rollt weiter; sonst
  könnte ein Fertiger dem Coop-Partner keine Druckplatte mehr halten.
  `renderer.goalLit` sagt, ob das Ziel-Licht gezeichnet wurde (E2E).
- `src/audio/chiptune.ts` + `src/music/` – Die Jukebox spielt NOTEN, keine
  Dateien: Ein Titel ist eine Notenzeile (klebrige Längen, `repeat` für
  Begleitstimmen), die der bestehende WebAudio-Graph mit 8-Bit-Stimmen
  (25-%-Pulswelle, Dreieck, Rauschen) spielt. Grund: Die PWA cacht ALLES vor –
  ein Dutzend mp3s wären Megabytes offline. `chiptune.ts` ist rein und
  DOM-frei wie `core/`; der Loop wohnt in `notesAt(tune, von, bis)`, nicht im
  Scheduler (app.ts plant nur ein Fenster von 250 ms in den AUDIO-Takt – nach
  `performance.now()` gesetzte Noten eiern hörbar). Musik läuft über EINEN
  Bus mit Sidechain: Der Echo-Ping duckt sie um ~12 dB, sonst wäre der Raum
  um den Automaten unspielbar. Was in `src/music/` hereindarf, steht in
  dessen README (gemeinfrei = Komponist vor 1956 gestorben, oder eigenes) –
  und die TÖNE kommen aus einer Quelle, nicht aus dem Gedächtnis:
  `tools/score2tiltr.py` übersetzt MIDI/MusicXML (Mutopia, music21-Korpus,
  KernScores) in unsere Notenschrift. Die erste Fassung war frei geschrieben
  und hatte in drei von acht Klassikern falsche Töne –
  geschützte Werke NIE ins Repo, sie können als eingebetteter Titel im Level
  eines Dritten reisen (`playlist`-Eintrag als Objekt statt als ID).
  Der Automat selbst ist ein MASSIVER Kasten aus dem vorhandenen
  Wand-Mechanismus (`Wall.jukebox`): Kollision, Echo und Treffer-Klang sind
  gratis, der Rempler ist `hit.wall.jukebox`. Seine Zelle gilt deshalb in
  JEDEM Erreichbarkeits-Modell als gesperrt (nicht nur konservativ wie
  Glas/Anker) – der `jukebox`-Check sagt zusätzlich, WELCHER Automat im Weg
  steht, auf dem Start/Ziel sitzt, nicht anrempelbar ist oder auf einer
  Patrouille liegt. Es klingt immer nur der NÄCHSTE Automat (ein Bus, eine
  Richtung) – deshalb steht in Zufalls- wie Kampagnenleveln HÖCHSTENS EINER
  pro Ebene; zwei wären nicht doppelt Musik, nur doppelt Fehlerquelle. Die
  Generatoren (quick/daily) setzen ihn abseits ALLER Pflichtwege: geschützt
  sind Rückgrat plus die Wege zu Gems, Kristallen, Transportern und
  Wächter-Patrouillen, und die Zelle muss vom Start aus erreichbar sein
  (`floodMaze` in core/maze.ts). In der Kampagne stehen vier von Hand
  gesetzte Automaten (w2-05, w2-06, w3-05, w3-06) – nie im Tutorial, nie in
  Welt 1 und nie in Welt 4 „Die Stille". `window.__tiltrMusic` legt den Bus als GETTER offen (wie
  `__tiltrWake`) – der Frame-Haken `__tiltrJukebox` friert im Menü ein, weil
  die Schleife dort früh aussteigt, und „ist es wirklich still?" muss gerade
  dann prüfbar sein.
- `tools/startup.mjs` – iOS-STARTBILDSCHIRM: Beim Kaltstart der installierten
  PWA zeigt iOS einen System-Startbildschirm, und der ist WEISS, solange kein
  `apple-touch-startup-image` EXAKT zur Pixelgröße passt (Manifest-
  background_color ignoriert iOS dafür). EINE Geräteliste (`DEVICES`), aus der
  der Build die PNGs (emitFile, 1-Bit-Palette, ~500 Byte je Bild) UND die
  `<link>`-Tags erzeugt – nichts eingecheckt, nichts doppelt gepflegt. Farbe
  ist `--bg-deep`; E2E-Lauf 26 prüft Tag ↔ Bildgröße ↔ Token. Zweiter Teil des
  Weißblitzes: WebKits Leinwand vor dem ersten Paint – `color-scheme: dark`
  (Meta + :root). Neues Gerät ⇒ ein Eintrag in DEVICES.
- `src/ui/wakelock.ts` – Bildschirmsperre: Gespielt wird durch NEIGEN, ohne
  Wake Lock dimmt Android mitten im Lauf. `want()` beim Spielstart und im
  Hörtest, `release()` im Menü. Die Sperre geht im HINTERGRUND verloren und
  muss beim Zurückkommen NEU geholt werden – dafür der Zustandsautomat
  (`createWakeLock`, injizierbares `request`, Units in
  tests/wakelock.test.ts). iOS/Safari kennt die API nicht: `supported:
  false`, kein Fehler. `window.__tiltrWake` zeigt den Zustand.

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
