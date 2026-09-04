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
npm run release -- 3.23.0   # ganze Suite, und NUR bei grün die neue Version
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
und unter 4 Arbeitern rot, ist ein LAST-Flake: Sleeps durch Zustands-Warten
ersetzen, nicht die Arbeiterzahl senken. ZWEI-SEITEN-MP GEHÖRT IN EINEN
ARBEITER (M88): Die Läufe 9, 33 und 45 fahren je ZWEI Seiten mit einem vollen
Multiplayer-Lauf; zwei davon gleichzeitig sind auf zwei CI-Kernen vier schwere
Seiten neben den übrigen Arbeitern, und dann hungert die PHYSIK – Ball A kam
nicht mehr ins Ziel, am Ende schlug Playwrights eigener Klick-Timeout zu
(Arbeiter 1 bei 358 s gegen 65–93 s, 7 ✗ in Lauf 9, einzeln und lokal alles
grün). `AFFINITY` in e2e/parallel.mjs packt sie deshalb in DENSELBEN Eimer, wo
sie hintereinander laufen; ein Budget hilft dagegen nicht, denn es fehlt keine
Zeit, sondern Rechenkraft. Wer einen neuen Lauf mit zwei Seiten schreibt,
trägt ihn dort ein. Und die BUDGETS skalieren mit der
Arbeiterzahl: der Dispatcher setzt `E2E_TIMEOUT_SCALE` (= Zahl der Arbeiter),
`until` multipliziert damit, und jeder Kontext bekommt `setDefaultTimeout(30 s
× Skala)` – vier Arbeiter auf zwei CI-Kernen strecken die Wand-Uhr, und in
Lauf 9 warf am Ende Playwrights EIGENER 30-s-Klick-Timeout (Arbeiter bei 146 s
statt 53 s, 7 ✗ in der CI, lokal grün). Dafür gibt es seit v3.0.1 die Helfer
`until(fn, {timeout})` (pollt bis wahr, gibt sonst den letzten Wert zurück –
die Zusicherung danach sagt, was fehlte), `settled(page)` (Ball ruht) und
`holdUntil(page, key, pred)`: Taste halten, bis die Bedingung gilt UND der
Ball ruht. Das UND ist die Lektion aus Lauf 9 „Coop": Wer die Taste im Flug
loslässt, prallt von der Wand zurück – A rollte in Spalte 4 zurück, B aus der
Platten-Nische; die alten festen 2,6 s hatten den Ball bis dahin angepinnt.
Lauf 17 „Hörtest" wartet auf den NEUEN `__tiltrPing` (Fallback: der alte,
wenn dieselbe Richtung zweimal kommt), Lauf 21 „Jukebox" auf Noten, Ducking
und Titel. Lauf 10 „Splash" misst den GRÖSSTEN Kugel-Versatz während der
Einfahrt (Schleife ab goto) statt eines Zeitpunkts – nach 200 ms plus
Text-Checks war die Einfahrt unter Last schon vorbei (v3.0.6). Eine neue
Zusicherung nach einer Bewegung oder einem Klick wartet auf den Zustand, den
sie prüft – nie auf eine Zeit. Das gilt AUCH für die Statuszeile: Sie wird vom
FRAME geschrieben (`statusEl.textContent = message`), nicht vom Tastendruck –
ein Lesezugriff direkt nach `press()` kam unter CI-Last vor dem nächsten Bild
und fand sie leer (Lauf 46, CI #146; lokal grün). Und wer eine MELDUNG prüft,
wartet vorher ab, bis die alte weg ist, sonst prüft er die vorige. Zweite
Falle desselben Laufs: Wer eine Taste im Flug loslässt, dessen Kugel PRALLT von
der Wand zurück (y 273 → wieder 153) – dafür gibt es `holdUntil` (hält, bis die
Bedingung gilt UND der Ball ruht); ich hatte mir stattdessen einen eigenen
Helfer gebaut, ehe ich die Lektion aus Lauf 9 hier nachlas.

`npm run screenshots` (tools/screenshots.mjs) erzeugt alle README-Bilder in
`docs/screenshots/` gegen den GEBAUTEN Stand (vite preview auf 8766, Phone
390×844 @2x, Editor zusätzlich als Tablet): dieselbe Mechanik wie die E2E
(Vite direkt, TEST-Raumcodes auf dem BroadcastChannel). Neue Oberfläche ⇒
Bild dort ergänzen, nie von Hand schießen – die Bilder müssen zum Stand
passen, und der Stand ändert sich.

CI (`.github/workflows/pages.yml`) führt alle fünf aus und deployt `dist/`
auf GitHub Pages – bei ROTEM Schritt wird der Deploy ÜBERSPRUNGEN, `version.json`
bleibt dann einfach stehen. Nach jedem Push also den CI-LAUF ansehen, nicht nur
`version.json` pollen: Ein rotes E2E sieht von außen aus wie ein langsamer
Deploy. Vor jedem Push: komplette Suite lokal grün.

DIE VERSION ENTSTEHT ZULETZT (`npm run release -- 3.23.0`, tools/release.mjs):
Das Werkzeug fährt typecheck, lint, units, build und e2e und setzt die Zahl in
`package.json` ERST, wenn alles grün ist – bei rot bleibt die alte stehen und
die letzten Zeilen des gefallenen Schritts stehen da. Grund: Die Zahl ist kein
Etikett, sie erscheint auf dem Startscreen und steuert den Update-Toast
(version.json, NetworkOnly) – 3.22.0 trug zwei rote CI-Läufe, bevor sie je live
war. Sie gehört trotzdem in DENSELBEN Commit wie das Feature: „bumpen erst nach
grüner CI" hieße ein zweiter Push nur für die Zahl, also ein zweiter CI-Lauf
und ein Deploy ohne Update-Toast dazwischen. Committen und pushen macht das
Werkzeug NICHT – die Commit-Nachricht ist Teil der Arbeit.

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
  JEDES BADGE ERKLÄRT SICH (M71): Der Bericht trägt neben `detail` (technisch)
  ein `at?: Place` (Ebene + Zelle in DEF-Koordinaten) – der Editor macht daraus
  Klartext („Ebene 2, Zelle 0/0") und „👁 Zeigen" (Ebenenwechsel, Zelle
  hervorgehoben, Ansicht mittig). Wer einen Check ergänzt, füllt `at`, wenn der
  Beweis den Ort kennt, und schreibt `ed.help.<key>` in ALLE vier Wörterbücher
  (was geprüft wird + was ein Rot bedeutet) – sonst steht der Nutzer wieder
  vor einem Kreuz ohne Erklärung.
  'timer' ist seit M66 WEICH (`SOFT_CHECKS`, wie 'items' und 'fair'): Die
  2,5×-Ideallinie ist eine Schätzung, ein knapper Timer ist Schwierigkeit –
  weiche Badges zeigen ⚠ statt ✗ und blockieren das Teilen nicht.
  EINSEITIG BRÜCHIG (M66): `maze.brittleSide` = Kante aus `brittle` + Seite;
  `Wall.hpSide`, `brittleBreakable` in core/brittle.ts entscheidet den
  Treffer, der Beweis lässt die Wand zu und legt eine GERICHTETE Kante von
  der Bruchseite (`brittlePassage`) – wie Strömungen. Variante/Wand entfernen
  nimmt die Seite mit (`sideDrop` im Editor). GEBROCHEN BLEIBT GEBROCHEN
  (M68): Der Softlock-Beweis rechnet mit Wandzustand – `brokenBrittle`
  (offen) / `sealedBrittle` (keine Kante) in `CellConfig`, Schlüssel
  `brittleKey(fl, edge)`. Eine Zelle, die man ohne die Wand nicht erreicht,
  hat sie gebrochen; von dort ist sie offen. Erreicht man sie auch anders
  (Strömung), gilt die Wand als zu – echter Softlock. Wände sind im MP nicht
  synchronisiert: `pairReachable` nimmt den Zustand je Spieler.
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
  TÜR NUR FÜR EINEN SPIELER (M72): `door.player` 1|2 – für den anderen ist sie
  eine WAND, überall gleich: Das Element baut sie ohne `door`-Eigenschaft
  (`ctx.player` im BuildContext), `buildFloorCells` mauert die Kante in JEDEM
  Modell zu (auch mit `doorsOpen`). Sie klingt dann auch wie eine Wand – eine
  Tür, die nie aufgeht, wäre ein Versprechen, das das Level nicht hält.
  WÄCHTER-BAHN (M72): beliebig viele Wegpunkte plus `guard.pause` (parallele
  Liste, Index = Wegpunkt, Sekunden). `Guard.waitLeft` wird VOR der Bewegung
  abgezogen, der Rest des Schritts verfällt; ein Schläfer wartet nicht.
  `guardsProof` bleibt unberührt – er nimmt an, der Wächter stehe überall auf
  seiner Bahn, eine Pause ändert nur das Timing. Editor: Pausenfeld je
  Wegpunkt, ＋/− für die Bahn, achsenparallel erzwungen (diagonal liefe durch
  Wände).
  TÜREN MIT MEHREREN ÖFFNERN (M41): `door.require` 'any' | 'all'. Die EINE
  Türregel wohnt in `core/doors.ts` (`doorState`), im Spiel ruft NUR
  `updateDoors(now)` in app.ts sie – Schlüssel, Zeitschloss und MP-Platten
  schalten keine Tür mehr selbst. `permanent` (Schutt) nur bei reinen
  Schlüssel-Bedingungen.
  WIE LANGE OFFEN (M76): Schlüssel dauerhaft, PLATTE nur solange gehalten,
  ZEITSCHALTER nur solange der Timer läuft – und je Tür einstellbar über
  `door.latch` („bleibt offen"): War die Bedingung EINMAL erfüllt, bleibt die
  Tür offen (`doorState(openers, require, latched)`, Zustand in
  `Wall.door.latched`; der `timer`-Check überspringt latchende Türen, denn
  dann gibt es keinen Sprint). EINE PLATTE IST EINE PLATTE (M76): Der
  Halte-Zustand hängt an `Plate.id` („Ebene:Spalte,Zeile"), NICHT an
  `plate.opens` – über die Tür-ID hielt eine Platte ihre Geschwister mit, und
  ein 'all' ging mit einer Kugel auf (im Testmodus wie in der Netz-Nachricht
  `plate`, die jetzt die Platten-Kennung trägt: beide Seiten brauchen dieselbe
  Version). WER HALTEN KANN, ENTSCHEIDET DIE TÜR
  (M76/M77): Eine 'all'-Tür braucht so viele HALTER wie Platten, und wie viele
  Füße frei sind, sagt die Tür – fällt sie wieder zu, muss jemand GLEICHZEITIG
  durchrollen und hält nichts (ein freier Spieler: der Partner), „bleibt offen"
  verlangt beim Öffnen niemanden im Durchgang (BEIDE Spieler dürfen stehen,
  danach tauschen sie die Seiten – so baut man einen Seitenwechsel). Dazu die
  Steine: `holdCheck(plates, feetReach, stonePlates, boulders, feetFree)` in
  validate.ts zählt wie bei Hall und speist `pairReachable` UND den
  `openers`-Bericht (`holdDetail` nennt den Ausweg: „… – „bleibt offen" löst
  das"); die Prüfung steht VOR dem Ausstieg für reine Platten-Türen, sonst
  bliebe der häufigste Fall stumm. Bei einer latchenden Tür zählt auch die
  EIGENE Platte als Öffner – M74 gilt nur für Türen, die wieder zufallen.
  DER PARTNER IST MITGEKOMMEN (M82, dritte Fassung derselben Regel:
  FORTSCHRITT IST MONOTON): Der Softlock-Beweis setzt einen Spieler mitten ins
  Level und hielt den Partner an seinem START – unmöglich in einem Level mit
  gemeinsamer Choreografie (gekreuzte Zeitschalter, Tür mit zwei Platten): Wer
  die Tür passiert hat, war zu zweit dort. `pairReachable` nimmt deshalb eine
  Saat `reachSeed` ({p1,p2}), und die Softlock-Schleife gibt dem Partner seine
  Reichweite aus dem VOLLEN Lauf mit (`seed1`/`seed2`); die Ursachen-Probe
  bekommt dieselbe Saat, sonst widerspricht der Satz dem Befund. Was der
  Partner NIE erreicht, hält er weiter nicht (M74 gilt), und eine echte Einbahn
  (Strömung) bleibt eine Falle – Gegenproben in tests/coopPlates.test.ts.
  EINGERASTET BLEIBT EINGERASTET (M78, wie M68 für Wände): Der Softlock-Beweis
  setzt je Zelle neu an – bei einer latchenden Tür wäre „kannst du sie von
  DORT öffnen?" die falsche Frage. Wer eine Zelle NUR durch sie erreicht, hat
  sie eingerastet; ab dort gilt sie als offen, für BEIDE Spieler. Saat über
  `pairReachable(…, latched)` bzw. `coopReachable(…, {latched})`, je Zelle
  abgeleitet in `latchedAt(k, …)` aus der Reichweite mit GENAU DIESER Tür
  gebannt. Eine Zelle, die man auch ohne sie erreicht, zählt ohne sie.
  DER SOFTLOCK NENNT DEN GRUND (M79): `nameCause` probiert für die EINE
  gemeldete Zelle – alle Türen offen ⇒ Einzelprobe je Tür („Tür X fällt hinter
  dir zu"), sonst andere Ebene ⇒ „von Ebene N führt kein Weg zurück
  (Transporter?)", sonst „kein Rückweg (Einbahn-Strömung oder brüchige Wand)".
  BRUCHSEITE VERKEHRT (M81): Zusätzlich probiert `nameCause` jede einseitig
  brüchige Wand GEDREHT – öffnet das den Rückweg, sagt der Satz „die brüchige
  Wand bei Ebene N, Zelle x/y bricht nur von der anderen Seite" (angehängt an
  die Tür-Ursache, denn beides ist wahr). Das ist der häufigste Baufehler: Die
  Wand ist als Rückweg gedacht, ihre gerichtete Kante führt aber hinein. Im
  Editor steht deshalb unter „Bricht von" (`ed.brittleSideHint`), dass die
  Seite die des BALLS ist – als Rückweg die Seite, auf der man eingeschlossen
  ist. Der Beweis selbst konnte den Rückweg schon immer (Units in
  tests/brittleTorch.test.ts, „Rückweg durch eine einseitig brüchige Wand").
  WICHTIG: HORCHER und WÄCHTER kommen im Softlock-Beweis NICHT vor
  (`patrolLines` sammelt nur `guard`, und die Softlock-Abfragen laufen ohne
  `guardSafe`) – ein Bericht, der nur den Ort nennt, verleitet zur falschen
  Ursache („da steht doch ein Horcher"); das sagt jetzt auch
  `ed.help.softlock` in allen vier Sprachen. Der Editor zeigt Ort UND Grund in
  EINER Zeile: `checkDetailText` streicht den Zellschlüssel (steht schon in
  Klartext da) und putzt dabei den Gedankenstrich weg, der ihn vom Grund
  trennte – sonst stand da „Ebene 2, Zelle 0/0 · – von Ebene 2 führt kein Weg
  zurück" (v3.11.1). `coopReachable` und der `openers`-Check rechnen
  'all' als „alle Öffner erreichbar"; `timer` prüft weiter je Schalter.
  HELLE EBENE: `floor.bright` → Renderer `revealAll` für diese Ebene.
  DÄMMERUNG (M43): `floor.dusk` = hell bis zur ersten Wandberührung, dann
  blendet app.ts über 2 s aus (`duskStart`, Renderer `revealGain`). Licht
  hat EINE Quelle: `lightGain(now)`/`lightOpts(now)` in app.ts speist beide
  draw()-Aufrufe; `profile.tutorialBright` (Chip „💡 Tutorial hell") hält
  NUR Tutorial-Ebenen hell. LANDEPLATZ = RESPAWN (M43): `startWarp` setzt
  `respawnPoint` auf die Ankunft – sonst wirft ein Sturz auf Ebene 3 zurück
  auf Ebene 1 (das war „Das Ohr" mit einem Checkpoint auf drei Ebenen).
- `src/workshop.ts` + `src/ui/editor.ts` – Werkstatt: eigene Level in
  localStorage, seit M40 in LEVEL-BUNDLES (`tiltr.workshop.v2`): ein Bundle =
  geordnete Level-Reihe mit ID, Version, Titel, Beschreibung – spielbar wie
  eine Kampagne (Modus `bundle`, Freischaltung über die Bestzeit des
  Vorgängers, „weiter bei" aus `profile.bundleAt` + `bundleProgress`), als
  Ganzes exportierbar (`bundles.exportFile` ZÄHLT DIE VERSION HOCH) und
  importierbar (`parseFile`/`applyFile`: gleiche ID + höhere Version ersetzt
  ungefragt, gleiche/ältere per Zwei-Tap; Level-IDs bleiben, damit der
  Fortschritt bleibt; IDs aus einem ANDEREN Bundle werden frisch). Die
  Werkstatt zeigt immer EIN Bundle (`bundles.current`, reload-fest); der
  Editor speichert ins Bundle, das das Level schon enthält, sonst ins
  aktuelle (`workshop.save`). Einzel-Import (JSON/Link) fragt IMMER nach dem
  Ziel-Bundle (`#wsImportTarget`, auch „Neues Bundle"). v1 (flache Liste)
  wird beim ersten Laden zu EINEM Bundle „Meine Level" migriert, älteste
  zuerst; der v1-Schlüssel bleibt liegen. ID-Helfer stehen im Modul VOR
  `load()` – die Migration ruft sie beim Start, ein `let` weiter unten wäre in
  der TDZ und der Fehler verschwände still im try/catch. Debug-Modus (5×
  Version): „⇪ In Werkstatt importieren" je Welt im Kampagnen-Screen
  (`bundles.importBuiltin`, ID `builtin-w<n>`, App-Version als Bundle-
  Version) – zum Überarbeiten der eingebauten Kampagne; die Defs sind
  GESPIEGELT (`mirror`), der Editor rechnet deshalb `buildFloorCells` mit
  `def.mirror` wie der Loader. Editor editiert rohe Defs (Vorschau = parseLevel →
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
  und Entfernen/Radieren nimmt die Variante mit. DAS LEERE FELD (M87): Zum
  Würfeln gehört das Gegenstück – „🧹 Alle Wände löschen" (Zwei-Tap, es gibt
  kein Rückgängig) räumt die Ebene über die REINE `clearWalls(maze, cols,
  rows, seedOpen)`: jede innere Seed-Wand nach `carve`, `add` und ALLE
  Varianten (brüchig samt Seite, Schallschutz, Spiegel) weg – eine Variante
  ohne Wand lehnt der Loader ab. Gefragt wird der SEED, nicht der sichtbare
  Zustand, sonst stünde jede Kante des Feldes im Teilen-Link (bei 20×24 über
  900); die Seed-Rechnung läuft EINMAL (`seedOpenAll`), denn `edgeOpen` parst
  je Aufruf die ganze Def. Der Außenrand bleibt außen vor, Elemente bleiben
  stehen (Tür und Schiebewand wollen ohnehin eine OFFENE Kante).
  LANDEPLÄTZE (`landingsOn`,
  rein): Jede Transporter-Zielzelle auf der sichtbaren Ebene bekommt einen
  gestrichelten Ring in Portal-Farbe plus „←E<n>" von einer anderen Ebene. Ein
  Landeplatz ist KEIN Element: `elementAt`/`cellFree` kennen ihn nicht, die
  Zelle bleibt bebaubar. `__tiltrEd.landings`, `.edgeState(e)`, `.selEdge`
  legen das für E2E offen.
  ELEMENT-SHEET IST MODAL (v3.8.1): Auf dem Phone ist `#edElements` ein
  SCHIRM über dem Editor mit opaker Karte (`#edElementCard`: Kopf „Elemente"
  + Schließen, darunter das scrollende 3-Spalten-Grid `#edElementGrid`). Als
  bodennahe Karte mit `max-height: 60vh` wuchs es auf kurzen Geräten über die
  Werkzeugleiste und verdeckte SEINEN EIGENEN Öffner – heraus kam man nur
  noch durch eine Auswahl. Regel daraus: Ein Overlay über einer Bedienleiste
  ist modal (Tap daneben + Schließen-Knopf), und der Schirm lässt über der
  Karte eine Fingerbreite frei. Dabei gelernt: Ein `<button>` als Grid-Kind
  meldet seine Inhaltshöhe NICHT an die Zeile – zweizeilige Namen ragten in
  die Kachel darunter; es braucht `min-height: max-content` an der Kachel UND
  `grid-auto-rows: max-content` am Grid (nur eines macht es schlimmer).
  ZWEI-TAP (`twoTap`/`disarm` in workshopPanel.ts): Der bewaffnete Knopf
  stellt Text und Tip in BEIDEN Pfaden zurück (Ausführen und 3-s-Ablauf) –
  vorher blieb der Bundle-Löschknopf nach dem Löschen mit dem langen Text
  stehen. In der Bundle-Leiste bekommt die Zeile `.confirming`: die übrigen
  Aktionen weichen, die kurze Frage („2 Level löschen?") ersetzt sie, statt
  die Zeile auf dem Phone zu sprengen (E2E Lauf 28 misst Überlauf und
  Zeilenhöhe bei 400 px). REGEL FÜR RÜCKMELDUNGEN IM KNOPF (v3.0.2): Ein Knopf
  in einer Flex-Zeile neben anderem Inhalt bekommt nur KURZE Wechseltexte
  („✓ In der Werkstatt", „⚠ Entwurf verwerfen?"); der volle Satz gehört in
  eine eigene Zeile (Status, Modus-Karte). Chip-Zeilen im Menü (`#controlsRow`,
  `#backupRow`) brechen um. Listen-Grids brauchen `minmax(0, 1fr)`: ein
  `auto`-Track wächst auf die min-content-Breite des breitesten Kinds und
  dehnt damit ALLE Karten. E2E misst den SICHTBAREN Überlauf (rechteste
  Kind-Kante gegen den Container) bei 400 px – Läufe 27 und 28.
  ⚑ TEST AB HIER: Das Werkzeug setzt einen Teststart (Ebene + Zelle,
  `testStart`, Tap auf dieselbe Zelle hebt auf) – die Vorschau setzt die Kugel
  DORT ab und wechselt auf die Ebene (`startCustom(def, true, from)` →
  `launch`), Respawn ebenfalls dort. Kein Teil der Def: nicht gespeichert,
  nicht geteilt, lebt nur im Editor (überlebt aber den ✏️-Rücksprung).
- ELEMENTE M45 (Phase 2 von 3.0.0): SANDUHR `hourglass` verlängert die Par
  (`core/stars.ts` ist die EINE Sterne-Rechnung – app.ts ruft `starsFor`);
  SCHLÄFER `guard.sleeper` (schläft auf Wegpunkt 0, `World.wakeSleepers` beim
  Ping, `World.asleep(g)` für Renderer und Schnarch-Bus, Beweis wie Wächter);
  ECHO-SPIEGEL `maze.mirrors` (Wand-Variante wie absorb, Ping-Antwort vom
  gespiegelten Punkt via `mirrorReflection`, Editor-Variante 'mirror');
  STIMMGABEL `key.voice: 'fork'` (`core/fork.ts` `forkTone`: Schwebung aus
  Neigungswinkel, UNGEPANNT – Ortung über Tonhöhe). Neue Merkmale melden sich
  im Aufleuchten über `levelFeatures` (sleeper, fork, wallMirror).
- ELEMENTE M46 (Phase 3): LOCKGLOCKE `bell` (Kanten-Trigger `updateBells`,
  `consumeRings()` für den Klang; klingende Glocke = Ziel ALLER Horcher in
  `updateListeners`). ZU ZWEIT LÄUTET SIE FÜR BEIDE (M83): Jeder Spieler hat
  eine eigene Welt und eigene Horcher – die Nachricht `bell` ({f, i} wie
  'key'/'switch') schlägt sie beim Partner über `World.ringBellAt(i)` an (kein
  Kanten-Trigger, kein `rungNow`; Klang + Meldung kommen aus der Nachricht),
  in COOP UND RACE, denn Ablenkung ist keine Progression. Dazu zwei Helfer:
  `advanceBells(dt)` zählt den Nachklang in Welten herunter, die die Schleife
  NICHT schrittet (`decayIdleBells` – sonst lockt beim Betreten der Ebene ein
  Läuten von vor einer Minute), und `advanceListeners(dt)` lässt die Horcher
  der ruhenden Seite im MP-Testmodus mitlaufen (wie `advanceGuards`), sonst
  sieht man dort die Wirkung nicht. E2E Lauf 41. HALLRAUM `reverbZone` (Feedback-Delay-Send am Master,
  `setReverb`, `World.inReverb()`); WANDERLOCH `roamingHole` (liegt in
  `world.holes` mit `roam`, `advanceHoles` wie `advanceGuards` – auch in der
  Editor-Vorschau; Modell passierbar wie atmendes Loch, Patrouille im
  Kampagnen-Test achsenparallel). Editor: Wanderloch nutzt den Zwei-Tap-
  Fluss des Wächters (`pendingGuard`).
- ROLLSTEIN M47 (Phase 4): zweiter Körper, ZELLWEISE. Physik in
  `World.updateBoulders` (Stoß ≥ `pushSpeed` rollt genau eine Zelle, wenn
  `boulderCellFree`; Loch füllen, Eis weiterrollen, Platte halten via
  `plate.boulder` – `updateDoors` zählt `held || boulder`). Beweis in
  `levels/boulders.ts` (`boulderProof`): BFS über (Ebene, Ballzelle,
  Steinzellen, gefüllte Löcher) + Rückwärtssuche für Softlock; Badge
  `boulder` ist Pflicht fürs Teilen. Abgrenzung bewusst: kein Stein-Stein,
  kein Transporter, keine Schiebewand-Zelle – hält beide Seiten klein. Neue
  Regeln IMMER in Physik UND Beweis eintragen (zwei Stellen, eine Wahrheit).
  DIE KUGEL IST ÜBER ALLE EBENEN DIESELBE (M84b): Der Loader baut EINE
  `Ball`-Instanz und gibt sie jeder Ebenen-Welt (`new World(walls, ball,
  goal)`). Wer eine Welt anfasst, auf der der Spieler NICHT steht, darf die
  Kugel deshalb nicht mitrechnen – `advanceBoulders(dt, withBall = false)`
  lässt die Ball-Kollision aus, und nur die ruhende Seite im MP-Testmodus
  bekommt `true` (dort ist es ihre eigene Kugel auf ihrer eigenen Ebene). Ohne
  das schob ein Stein auf Ebene 3 die Kugel auf Ebene 1 aus der Zelle – so
  gemeldet, Unit in tests/boulder.test.ts. Gilt für JEDE künftige
  `advance…`-Methode: erst fragen, ob sie `this.ball` berührt.
  ZU ZWEIT ROLLT ER FÜR BEIDE (M84): Die Nachricht `boulder` ({f, i, d})
  überträgt den STOSS, nicht die Position – `World.pushBoulderAt(i, dir)`
  wendet dieselbe Regel an („Zielzelle frei?"), Loch/Eis/Platte folgen daraus.
  Eine ferngesteuerte Position wäre falsch: Wände sind im MP nicht
  synchronisiert (M68), sie könnte den Stein in eine Wand setzen. Gesendet wird
  NUR der Ball-Stoß (`startBoulderMove(…, sync)` markiert ihn im Ereignis, das
  `i`/`dir` trägt); die Eis-Fortsetzung macht die Physik drüben selbst, sonst
  rollt der Stein dort zwei Zellen. `advanceBoulders(dt)` treibt Steine in
  Welten weiter, die die Schleife nicht schrittet (`advanceIdleWorlds`, ihre
  Klang-Ereignisse werden dort verworfen) – eine Platte kann eine Tür ÜBER
  Ebenen öffnen. Im echten Netz zählt für die Tür nur die EIGENE Welt, im
  Testmodus sammelt `collectOpeners` beide: Wer die Übertragung prüfen will,
  schaut auf die Steinzellen je Seite (E2E Lauf 42), nicht auf die Tür.
- ZWEI-SPIELER-LEVEL M57 (v3.1.0): `players: 1 | 2`, `mpMode`, `floor.start2`
  (nur Ebene 1), `floor.goal2` (eine Ebene). ROLLEN FEST: Host = Spieler 1,
  Gast = Spieler 2. `loadLevel(def, { player })` baut die Welt für EINEN
  Spieler (Kugel an seinem Start, Zielzone = sein Ziel, das andere Ziel ist
  für ihn nicht da); Default 1, `playerRole()` in app.ts ist die eine Stelle,
  die entscheidet (MP: mp.host; Editor-Vorschau: „Vorschau als" = die Seite,
  die BEGINNT). MP-TESTMODUS (M69): Die Editor-Vorschau eines Zwei-Spieler-
  Levels lädt BEIDE Welten (`mpTest` in app.ts, eine Seite je Spieler mit
  eigener Ebene, eigenem Respawn und eigenem Ping-Budget); 👥 im HUD oder
  Taste „p" wechselt, die abgegebene Kugel liegt ohne Schwung still, ihre
  Welt läuft weiter (`advanceGuards`/`advanceHoles` – sonst steht dieselbe
  Patrouille für beide woanders). Der Ruhende IST der Partner im Bild
  (dieselbe `buddy`-Darstellung wie im echten Spiel). Öffner wie im Spiel:
  Platten für beide (die Nachricht 'plate' kennt keinen Modus), Schlüssel und
  Zeitschalter nur im Coop – der Phantom-Partner „hält ALLE Platten" ist
  damit weg. Coop gewinnt mit BEIDEN im Ziel, Race mit dem ersten.
  `collectOpeners` (core/doors.ts) ist die EINE Sammelstelle über beliebig
  viele Welten, `updateDoors`/`applyDoors` trennt Quellen und Ziele. Beweis:
  `pairReachable(def, coop)` – pro Spieler eigener Fixpunkt vom eigenen
  Start; im COOP zählt JEDER Öffner (Platte, Schlüssel, Zeitschalter), wenn
  einer der beiden ihn erreicht – das Spiel synchronisiert sie über die
  Nachrichten `plate`/`key`/`switch` (M59: „ich hole den Schlüssel für deine
  Tür" ist die Coop-Idee); im RACE wirken Schlüssel/Schalter lokal, Platten
  zählen gar nicht. Neue Öffner-Arten IMMER an beiden Stellen (Sync in
  app.ts UND pairReachable) eintragen.
  WER HÄLT DIE PLATTE (M74): Eine PLATTE zählt für Spieler P nur, wenn der
  ANDERE sie erreicht oder ein STEIN sie halten kann – auf einer Platte, die
  P selbst besetzen müsste, kann er nicht gleichzeitig stehen und durch die
  Tür rollen (das Modell spazierte hindurch und meldete danach einen Softlock
  in einem Raum, den man nie betritt). Schlüssel/Zeitschalter bleiben geteilt:
  die wirken weiter, wenn man weitergerollt ist. Steine und Paar-Beweis reden
  seit M74 miteinander: `BoulderProof.stonePlates` sagt, welche Platten ein
  Stein halten kann, `boulderProof(def, start, heldPlates)` nimmt umgekehrt
  die Platten des Partners; `validateLevel` rechnet `stonePlates` EINMAL (je
  Spieler `heldBy`, bei Steinen aus BEIDEN Starts) und reicht es an jeden
  `pairReachable`-Aufruf und den `openers`-Check durch. Badges
  `coop`/`race` ERSETZEN `goal` bei zwei Spielern (bei 'any' beide Pflicht),
  `fair` ist weich (`SOFT_CHECKS`, wie `items`). TRANSPORTER JE SPIELER
  (M65): `transporter.player` 1|2 – der Loader baut das Pad nur in die Welt
  dieses Spielers (`elementForPlayer`; der Editor lädt mit
  `allTransporters`), `reachable({ player })` zählt nur seine Sprünge, und
  `pairReachable`/`guardsProof`/`pathSteps` reichen den Spieler durch. Wer
  ein weiteres Element je Spieler will, hängt es an `elementForPlayer` und
  dieselbe `player`-Option – EINE Stelle für Spiel und Beweis. KEINE EIGENEN KACHELN für
  Start 2/Ziel 2 (M58): Die Werkzeugleiste hat SECHS Kacheln, mehr sind auf
  dem Phone nicht erreichbar – ● und ◎ tragen `toolPlayer` (Feld „Setzt für"
  im Eigenschaften-Panel, aktive Kachel nochmal tippen wechselt). Wer ein
  Werkzeug braucht, macht es zur Eigenschaft eines vorhandenen, nicht zur
  siebten Kachel. Die DRUCKPLATTE steht nur
  bei zwei Spielern in der Palette: solo hielte sie niemand, und
  `coopReachable` zählte sie trotzdem als Öffner – ein grünes, unlösbares
  Level. JEDER Öffner-Typ braucht im Editor drei Dinge: Auto-Link beim
  Setzen (`placeAt` → `nearestDoorId`), das Feld „Öffnet Tür" + 🔗 in
  `renderProps` und einen Fallback in `normalizeDraft` – die Platte hatte
  keins davon, parste nicht und blieb unsichtbar (M60). Werkstatt: „👥 Zu zweit" statt Spielen → Lobby mit `#mpCustomItem`,
  Bundles überspringen MP-Level (`bundleProgress.skipped`). Protokoll: Host
  hängt die Def an `setup`, der Gast prüft `validateLevel` + `isShareable`
  vor dem Intro; Ergebniskarte des Gasts: „In Werkstatt speichern". E2E Lauf
  33 – Host und Gast im SELBEN Kontext (BroadcastChannel überbrückt keine
  Playwright-Kontexte), der Gast tritt über `#join=` beim KALTSTART bei:
  `checkChallengeHash()` muss als LETZTES Modul-Statement vor der Schleife
  laufen – module-level `const`/`let` sind vor ihrer Zeile in der TDZ, und
  bis 3.0.7 starb jeder gescannte QR-Code im frischen Tab genau daran.
- `src/core/occlusion.ts` – SCHALLSCHUTZWAND (`maze.absorb`, Wand mit
  `absorb`, Palette `absorb` Filz-Khaki): Der Echo-Ping deckt sie auf, aber
  sie antwortet NICHT; Klangquellen, deren Strahl vom Ball eine solche Wand
  kreuzt (`shielded`, Slab-Test gegen die Wand-Rechtecke), sind abgeschirmt –
  app.ts skaliert die Nähe stetiger Quellen mit `ABSORB_GAIN`, der Beacon
  nimmt `muffled`, der Rempler ist `audio.hit(…, soft)`. Ein Strahl, keine
  Akustik: keine Beugung, kein Filter auf den Stetigkeits-Quellen. Für die
  Lösbarkeit ist sie eine normale Wand. Galerie: Extra-Eintrag `wallAbsorb`
  (wie `wallEcho`), `extraEntries` exportiert für den Editor-Kopf.
  DIAGNOSE-TEILEN (M80): Rote Badges verbieten das Teilen nicht mehr, sie
  fragen nach – 🔗 wird zum ⚠ (Zwei-Tap, `twoTap` liegt dafür jetzt in
  `src/ui/twoTap.ts`, mit eigenem `armedTip` für Icon-Knöpfe), die FRAGE steht
  in der Statuszeile, und danach heißt der Link „Diagnose-Link". Was nicht
  LÄDT, hat weiter keinen Link (`ed.shareLoadBad`) – ein undekodierbares Token
  hilft niemandem, dafür ist die Datei da. Die Export-Hülle trägt dann die
  BEFUNDE (`findings` in `src/levels/diagnosis.ts`, rein: Schlüssel,
  hart/weich, Detail, Ebene 1-basiert; `exportPayload(def, report)` hängt sie
  plus App-Version an) – der Import liest nur `def` und merkt nichts davon. Und
  der Empfänger wird gewarnt: `offerSharedLevel` prüft selbst und schreibt
  `share.diag` ins Angebot, sonst wäre „Ausprobieren" ein Versprechen, das das
  Level nicht hält.
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
- `tests/mazeprint.test.ts` – KARTEN-DRUCKER für den Levelbau (M44):
  `PRINT_IDS=w1-04,w3-04 npx vitest run tests/mazeprint.test.ts` druckt die
  Level als ASCII, GESPIEGELT wie der Loader sie sieht (rohe Def-Koordinaten
  = Spiegelung rückwärts). Ohne Karte sind Loch-, Wand- und Anker-Plätze
  Raterei – zwei Türen der Kampagne waren jahrelang umgehbar, bis der Test
  „Schlüssel-Türen sind Pflicht" (tests/campaign) hinsah. `switchDoorSteps`/
  `timerSeconds` (validate.ts) sind die EINE Timer-Rechnung für Badge und
  Test – über höchstens einen Transporter-Sprung (Maschinenraum w3-05).
- `src/levels/` – Levelformat (zod), Loader, Tutorial-/Kampagnen-Level,
  Quick-Generator. Jedes neue Level braucht einen Lösbarkeits-Test
  (siehe tests/campaign.test.ts – inkl. Tür-Semantik: Schlüssel vor der
  Tür erreichbar). Handgebaute Level werden per `mirrorLevel`
  (src/levels/mirror.ts) gespiegelt, damit Starts/Ziele nicht alle oben
  links/unten rechts liegen – Achse passend zu Richtungsbezügen im
  Intro-Text wählen ('x' erhält oben/unten, 'y' links/rechts);
  tests/mirror.test.ts erzwingt die Ecken-Verteilung.
- `src/levels/firstAppearances.ts` – AUFLEUCHTEN (M43): rein abgeleitet, in
  welchem Level ein Merkmal (Element-Typ, `wallBrittle`, `wallAbsorb`) zuerst
  vorkommt – Lehr-Reihenfolge Tutorial, dann Kampagne (`TEACH_LEVELS` in
  app.ts). Beim Start eines solchen Levels: Renderer `spotlight` (4 s Puls,
  unabhängig von Ping/Licht) + Galerie-`demoSound` des ersten Merkmals; der
  Intro-Screen zeigt „Neu: … 🔊"-Chips (`#interNew`) und in der Kampagne die
  Sterne-Vorschau (`#interStars`). Kein Level-Feld: Wer ein Level einfügt,
  ändert die Liste automatisch – `tests/firstAppearances.test.ts` hält die
  Lehr-Reihenfolge fest. Kampagnen-Regeln aus dem Review (tests/campaign):
  Par-Band 1,2–2,6 s je ZELLE (nicht nach dem Rückgrat schätzen), Ping-Budget
  je Welt konstant (3/4/4/3). Horcher hören abgeschirmt (`shielded` in
  `updateListeners`, ABSORB_GAIN) – Deckung ist eine Schleich-Mechanik; im
  NEBEL hören sie gar nichts (M67, `World.inFog()` – dieselbe Methode speist
  den Nebel-Lowpass in app.ts).
- WELT 5 „Trugbild" (M48, `defs5` in campaign.ts): sieben Level aus den
  vorher ungenutzten Bausteinen (helle Ebene, Echo-Spiegel, Schallschutz,
  Kristall, Glocke, Hallraum, Stimmgabel, Glas, Tür 'all' über Ebenen,
  Rollstein, Schläfer). Wand-Varianten und Türen brauchen existierende bzw.
  offene Kanten: erst Karte drucken (mazeprint), dann Kanten eintragen. Ein
  grüner `boulder`-Beweis heißt nicht spielbar: Seiteneingänge in Steinkanäle
  zumauern (Mühlstein). Kampagne: 36 Level, fünf Welten, Debug-Import
  `builtin-w5` automatisch über WORLDS.
- `src/levels/puzzle.ts` – TÜR-RÄTSEL für die Generatoren (M42):
  `planDoorPuzzle` setzt EINE Tür auf den Pflichtweg einer Ebene, alle Öffner
  (Schlüssel, optional Zeitschloss ≤ 6 Zellen davor, 8 s) in den
  ANKUNFTS-TEIL des Baums – im perfekten Maze teilt eine Türkante den Baum in
  genau zwei Teile, deshalb bleiben goal/openers/softlock/timer beweisbar
  grün; `require: 'all'` bei mehr als einem Öffner. Läuft VOR den anderen
  Zutaten, liefert die Öffner-Wege als Pflichtwege (Schutz vor Anker, Glas,
  Automat). Quick-Presets: `floors`, `brightChance`, `puzzle` („Schwer" hat
  zwei Ebenen); Daily-Wochentage: `bright`, `puzzle` (Mo/Di keins). Nie alle
  Ebenen hell; das Rätsel liegt auf der ersten hellen Ebene.
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
  ortbare Klang-Signatur (HRTF-PannerNodes). Kein Element ohne Sound – mit
  EINER Ausnahme: die FACKEL (M66, `torch`) ist Licht und nur Licht; ein Ton
  stiftete eine zweite Bedeutung. Renderer: `torchGain(x, y)` in draw() hebt
  alles Aufdeckbare im Radius ins Licht (Wände, Löcher, Checkpoints,
  revealAlpha); wer ein neues gezeichnetes Objekt einführt, hängt es dort an.
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

- `src/net/transport.ts` + `src/net/health.ts` – MULTIPLAYER-NETZ: trystero
  über eine FESTE Liste von 8 Nostr-Relays. Die Liste MUSS gesetzt bleiben:
  `getRelays` in trystero nimmt `relayConfig.urls` unverändert, ohne sie
  würfelt jedes Gerät eine Teilmenge – zwei Spieler finden sich dann nur bei
  Überschneidung. `Transport.info()` ist die Auskunft für die Diagnose (Art,
  eigene Peer-ID, Relay-Zustände, Peers, Ereignis-Protokoll); `health.ts` ist
  rein: `relayHealth` zählt, `lobbyHint` entscheidet zwischen verbinde /
  offline / warte / hängt (M70). WICHTIG für jede Lobby-Änderung: `connect()`
  liefert einen Raum, OHNE dass ein Relay antwortet – „warte auf Partner"
  allein ist eine Lüge. In der Lobby läuft deshalb ein Ticker
  (`mpLobbyTick`, 500 ms), der Bildschirm bleibt WACH (sonst sterben die
  WebSockets beim Sperren – das war die häufigste Ursache für „findet sich
  nicht"), und „🔄 Neu verbinden" (`mpReconnect`) baut dieselbe Rolle mit
  DEMSELBEN Raumcode neu auf – automatisch nach Hintergrund/`online`. Ein
  neuer Code würde einen schon gescannten QR entwerten. `?netdebug` zeigt
  alles; ein ignorierter dritter Peer steht im Protokoll (Zombie aus einer
  alten Sitzung).
  WEITERLEITER (TURN, M75): Der Handshake kann laufen und die STRECKE fehlen –
  im Mobilfunk (Carrier-NAT, symmetrisch) und im Gastnetz mit Client-Isolation
  ist das der Normalfall, nicht ein Ausrutscher: Die Relays sind ✓, der
  Partner wird gefunden, und trystero meldet `could not connect to peer …
  after exchanging SDP`. Der Transport setzt daraufhin `iceFailed`, und
  `lobbyHint` gibt 'blocked' zurück – VOR jeder Zeitregel, denn „warte auf
  Partner" wäre gelogen. Einen verlässlichen kostenlosen TURN gibt es nicht
  (die alten offenen Relays sind nachgemessen tot), deshalb wird er
  EINGETRAGEN und liegt auf dem GERÄT (`tiltr.turn.v1`), nie im Repo:
  `src/net/ice.ts` ist der reine Teil (`parseIceServers` nimmt Zeilenform
  `turn:wirt:3478|nutzer|passwort` UND Anbieter-JSON, `iceHosts` zeigt nur
  Wirte – Passwörter gehören nie ins Bild), `turnConfig` hängt die Liste an
  trysteros eingebaute STUN-Server AN (es konkateniert, ersetzt nicht).
  `src/net/iceProbe.ts` ist der Selbsttest OHNE Partner: Die Kandidatentypen
  sind die ganze Auskunft ('srflx' = STUN antwortet, 'relay' = TURN
  antwortet), `iceVerdict` unterscheidet ok/turnDead/noTurn/blind. Wer am Netz
  schraubt, MISST erst hier – sonst ist „sie finden sich nicht" nicht von
  „Zugangsdaten abgelaufen" zu trennen. KEIN Datenweg über die Nostr-Relays
  als TURN-Ersatz: 20 Positionen je Sekunde sind dort nicht vorgesehen.
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
- `src/core/orientation.ts` – NEIGUNG → BILDSCHIRM (`screenTilt`, v3.0.5):
  Der Sensor meldet beta/gamma IMMER im Geräterahmen (Hochformat); die
  Drehung nach `screen.orientation.angle` wohnt hier, rein und mit Units in
  der Sprache der Kanten („Unterkante unten → wohin rollt es"). 90° (Oberkante
  links) = (gy, −gx), 270° = (−gy, gx), 180° = (−gx, −gy) – das ist das seit M1
  verwendete Schnipsel, GEMESSEN auf einem iPhone (M53/M54). 3.0.3 hatte es
  mit einer falschen Kantenzuordnung „korrigiert" (rechte Gerätekante liegt
  bei 90° OBEN im Bild, nicht unten): Herleitung ohne Messung ist Vermutung.
  E2E Lauf 2 dreht den Bildschirm synthetisch per defineProperty.
  WELCHER WINKEL: `physicalAngle()` in tilt.ts – iPadOS zählt
  `screen.orientation.angle` von der QUERlage (landscape-secondary = 180°),
  der Sensor vom Hochformat; deshalb auf Apple-Geräten der TYP über
  `angleFromType` (Spec-Tabelle für Hochformat-Geräte, auf iPhone und iPad
  gemessen), sonst `angle`. Das war die Tablet-Meldung „Achsen vertauscht".
  SENSOR-DIAGNOSE (v3.0.4): Debug-Modus (5× Version oder `?debug`) zeigt in
  `#diag` Typ/Winkel/natürliche Lage, β/γ/α, accelerationIncludingGravity und
  tilt – Geräte weichen von der Spec ab (Tablets!), also ERST messen, dann
  korrigieren. `input.diagnostics()` ist die eine Quelle (Menü + Debug-Status).
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
- `src/core/buddy.ts` – DER PARTNER KLINGT (M88): Bis 3.21 war der Partner
  akustisch NICHT VORHANDEN (nur ein Schein, M62) – `setRival` gab es, aber nur
  fürs Duell. `buddySound(dist, speed, maxSpeed)` ist rein und liefert ZWEI
  Anteile: `closeness` für den GRUNDTON (ruhend findet man ihn) und `moving`
  für den ROLLANTEIL (rollend verrät er sich) – Stillstand ist Tarnung, ohne
  dass er je verschwindet. `audio.setBuddy` ist TONAL (warme Quinte D3+A3,
  leiser als der Rivale), wo der Rivale Rauschen ist; kein Pulsieren, denn Puls
  ist der Herzschlag = Gefahr. NUR IM COOP: Im Race bleibt er stumm, dort ist
  die Blindheit das Rennen (wie dort Platten nicht zählen, M57). Regeln wie
  jede Quelle: HRTF, `shield()` hinter Schallschutz, andere Ebene = `muffled`,
  Nebel dämpft am Master. Die GESCHWINDIGKEIT kommt NICHT über das Netz – sie
  folgt aus zwei `state`-Meldungen und wird geglättet (`smoothSpeed`); ein Feld
  mehr hätte beide Seiten ohne Not auf dieselbe Version festgelegt. Kein Funk
  > 400 ms ⇒ er gilt als ruhend, ein Ebenenwechsel wird nicht als Bewegung
  gemessen. Im MP-Testmodus liegt die abgegebene Kugel ohne Schwung: nur
  Grundton. KEIN PHANTOM AM URSPRUNG: `mp.remote` steht bis zur ersten
  `state`-Nachricht auf (0,0) – das ist keine Position, sondern „noch nichts
  gehört". Es gibt den Partner (im Bild UND im Ohr) deshalb erst mit
  `remote.lastAt > 0`; vorher klang und leuchtete er kurz in der Weltecke – die
  CI hat es gefunden, lokal war die erste Meldung schneller da als der
  Lesezugriff. `window.__tiltrBuddy` (E2E Lauf 45).
- `src/core/marks.ts` + `src/core/features.ts` – WEGMARKEN (M89): Klangbojen,
  die BEIDE hören – das erste Werkzeug, mit dem ein Spieler dem anderen etwas
  ÜBER DIE WELT sagt, ohne zu reden (der Sehende auf der hellen Ebene markiert
  dem Blinden den Weg um die Löcher). Der Vorrat steht im LEVEL (`marks`,
  Vorgabe 3, 0…9, Editor-Feld nur bei zwei Spielern) und gilt JE SPIELER; 0
  heißt „dieses Level kennt sie nicht", dann ist auch der HUD-Knopf weg.
  Eine Boje sitzt in der ZELLMITTE (`markSpot`), nicht dort, wo die Kugel
  rollte: Sie ist ein Wegzeichen, kein Schnappschuss – daraus folgt die Regel
  fürs Aufnehmen (`toggleMark`: derselbe Tap auf DERSELBE Zelle nimmt die
  EIGENE zurück, der Vorrat steigt wieder). FREMDE Bojen bleiben liegen: Wer
  eine Marke setzt, will sie wiederfinden. Nachricht `mark` ({f,x,y,on}) wie
  `plate` ein Zustandswechsel, kein Strom; nur im ECHTEN Netz (im Testmodus
  wäre „meine" und „seine" dieselbe Hand). Klang: weicher Holz-Tick
  (`audio.markTick`, 430→300 Hz), Takt schneller je näher, und es tickt immer
  nur die NÄCHSTE auf dieser Ebene – ein Bus, eine Richtung, wie beim
  Automaten; Abschirmung/Nebel wie jede Quelle. Renderer: Kreide-Ring
  (`WORLD.mark`), eigene durchgezogen, fremde gestrichelt (Sprache der
  Landeplätze), immer sichtbar – eine Boje deckt nichts auf außer sich selbst.
  MERKMALS-GATE (`core/features.ts`, rein): Neue Felder sind additiv, aber ein
  SPIELMITTEL, das nur eine Seite hat, ist ungleich. Der Host hängt an `setup`,
  was das LEVEL braucht (`needsFor(marks)`), der Gast an `ready`, was er kann
  (`FEATURES`) – beide prüfen (`canDo`), also fällt es auf, egal welche Seite
  die ältere ist (`mp.needsUpdate` in der Lobby). Das Gate hängt am LEVEL:
  Ein Level ohne Bojen spielt weiter mit jeder Fassung. `window.__tiltrMarks`
  (E2E Lauf 46).
- `src/core/together.ts` – GEMEINSAM ANKOMMEN (M90): Level-Flag `together`
  macht aus dem Coop-Ende eine Verabredung – gewonnen ist erst, wenn BEIDE
  gleichzeitig in ihren Zielzonen liegen (vorher: beide irgendwann durch, zwei
  Einzelläufe addiert). `state` trägt neben `fin` ein `g` („liege ich JETZT im
  Ziel"), die Gegenseite merkt sich den Zeitpunkt (`remote.goalAt`), und
  `togetherWin(mine, at, now)` gilt, solange seine letzte Meldung keine 700 ms
  alt ist: Die Nachsicht deckt AUSGEFALLENE Nachrichten, nicht das
  Weiterrollen – verlässt er das Ziel, setzt die nächste Meldung `goalAt` auf
  0. BEIDE Seiten schließen unabhängig ab (`mpTogetherWin`), niemand ist
  Schiedsrichter; ein Sieg, der auf die Bestätigung wartet, käme eine
  Nachrichtenlaufzeit zu spät. Teamzeit = der AUGENBLICK des Rendezvous
  (`mp.rendezvousTime`), nicht `max` zweier Einzelzeiten. RÜCKMELDUNG IST
  PFLICHT: Wer wartet, liest es in der Statuszeile und sieht sein Ziel leuchten
  (`goalDone`); der Nachzügler bekommt „◎ Partner wartet" (`#waitChip`,
  Partnerfarbe) und `audio.waitCall` (zwei Töne aufwärts, ungepannt, Sperre
  1,6 s) – kein Pulsieren, Puls ist hier der Herzschlag = Gefahr. Schema-
  Invariante: nur `players: 2` und `mpMode` coop/any (der Editor räumt die
  Regel beim Wechsel auf „Rennen" selbst weg, Feld „Coop-Sieg"). Am Netz hängt
  es am Merkmals-Gate (`needsFor(marks, together)`) – eine Gegenstelle von vor
  3.24 würde sonst nach der ALTEN Regel gewinnen. Der BEWEIS bleibt unberührt:
  Gleichzeitigkeit ist Timing, kein Erreichbarkeitsproblem (wie das weiche
  `timer`-Badge); wer es aufnähme, müsste Wege LÄNGENgleich beweisen.
  Eingebautes Lehrlevel: coop-07 „Gleichschritt" (Ring, zwei Ziele, keine Tür).
  `window.__tiltrMp` legt `mode` und `together` offen (E2E Lauf 47).
  FRAME-ORDNUNG, hier gelernt: Ein Zustand, der einmal je Frame gerechnet wird,
  wird NACH `world.step()` gerechnet und oben nur DEKLARIERT – die erste
  Fassung rechnete ihn davor, meldete die Lage des VORIGEN Bildes, und im
  ersten Bild in der Zielzone gewann noch die alte Regel.
  WER GEWINNT, VERSTUMMT (zweite Lektion, erst unter Last gefallen): Ab dem
  Sieg läuft die Schleife nicht mehr im Spielzweig, also geht keine
  `state`-Meldung mehr hinaus – die letzte kann noch `g: false` getragen haben.
  Der Wartende blieb dann für immer „playing". Deshalb schließt auch die
  `finish`-Meldung des Partners das Rendezvous ab (sie kommt nur, wenn er MICH
  im Ziel gesehen hat). Jede künftige Regel auf einem STROM von Meldungen
  braucht denselben Schluss: Der letzte Zustand muss in einer EINZELNEN
  Nachricht stehen.
- `src/core/resonance.ts` – DUETT (M91): Ein Tor, das nur ein DUETT öffnet.
  Zwei Resonanzfelder, eines je Spieler; wer auf einem steht, erzeugt einen
  Ton, dessen Höhe aus der NEIGUNGSRICHTUNG kommt (`pitchFromTilt`: Norden =
  Grundton, Süden = Quinte, Ost und West die Mitte – überall STETIG, ein Kreis
  hätte eine Naht). Das Tor öffnet, wenn beide Töne im Zielintervall stehen
  (`inTune`, 25 Cent Toleranz) und dort einen Augenblick BLEIBEN (`holdTuned`,
  `TUNE_HOLD_MS` 250 ms – sonst öffnete ein Durchwischen beim Suchen).
  DAS FELD IST EINE PLATTE, keine siebte Elementklasse: `plate.tune`
  ('unison' | 'fifth'). Der Plan wollte ein eigenes Element und begründete
  selbst, warum das nicht geht – „für das Modell ist es eine Platte, also
  rechnen coopReachable/pairReachable/holdCheck es GRATIS mit"; gratis ist es
  nur als EIGENSCHAFT (`el.type === 'plate'` steht an ~20 Stellen). Dieselbe
  Regel wie bei der Wand-Variante (M38) und „Setzt für" (M58).
  DAS FELD IST EINE SCHALE, KEIN SOG (v3.25.2, aus dem Spieltest): `bowlPull`
  ist eine MULDE – die Rückstellkraft wächst bis zur Lippe (halber Radius) und
  fällt dahinter auf null. Die erste Fassung hing am Anker-Profil (`force ·
  (1 − d/r)`, am ZENTRUM am stärksten), und das ist genau verkehrt: Eine SANFTE
  Neigung – die, mit der man stimmt – hat ihr Gleichgewicht dort, wo der Sog
  klein ist, nämlich am RAND (bei 0,3: 61 px, die Platte endet bei 41). Die
  Kugel rutschte beim Stimmen von der Platte, der Ton riss ab, sie rasselte an
  den Wänden – so gemeldet („zu viele Störgeräusche"). Umgekehrt hielt eine
  starke Neigung sie fest, und mit Tastatur (max. 0,7) kam man NIE heraus.
  ZWEI MESS-LEKTIONEN, beide in tests/resonance.test.ts festgeschrieben:
  (1) DIE EINGABE RAMPT (input/tilt.ts, 0,15 je Bild), deshalb folgt die Kugel
  dem Gleichgewicht und sammelt keinen Schwung – über die Lippe kommt nur, wer
  sie STATISCH übertrifft. Eine Auslegung „mit Schwung drüber" war im Unit-Test
  grün (dort lag die Neigung als RUCK an) und im Spiel eine Falle: Wer eine
  Kraft gegen die Neigung auslegt, simuliert MIT der Rampe. (2) Der Ausstieg
  muss in JEDER Richtung gehen, auch aus einer Nische mit einer offenen Seite –
  also unter 2600 · 0,7 = 1820. Daraus: `RESONANCE_FORCE` 1500 (ab Neigung 0,58
  hinaus), `RESONANCE_HOLD` 60 px als Feld-Radius für Ton UND Halten (nicht die
  enge Platten-Toleranz 41 – beim Stimmen schwingt die Kugel aus).
  GESTIMMT WIRD MIT EINEM TIPP: kurz antippen, loslassen, der Ton steht
  (`tuneStep`) – eine gehaltene Taste kippt einen hinaus. Das ist die Bewegung,
  die auch die E2E fährt.
  NUR DIE ZWEI TÖNE (v3.25.2): Wer im Feld steht, hört die Welt um ~20 dB
  gedämpft – `worldDuck` sitzt zwischen Master und Nebelfilter, die beiden
  Resonanzstimmen hängen dahinter, der Hall-Send am Welt-Bus. Abstimmen heißt
  vergleichen, und dazwischen darf nicht die halbe Welt rasseln. Und die Schale
  BRUMMT NICHT: Der Anker-Klang lässt `a.resonance` aus (ein Element, ein
  Klang – das Brummen lag genau auf den Tönen). `window.__tiltrDuck` zeigt den
  Bus (wie `__tiltrMusic`).
  BEIDE SEITEN RECHNEN DASSELBE: `state` trägt `tn` (Cent, null = auf keinem
  Feld), jede Seite kennt beide Töne und entscheidet lokal – keine Autorität,
  keine Nachricht „Tor auf"; `heldIds` in app.ts ist die EINE Stelle, die aus
  „ich stehe drauf" + „das Duett steht" ein Halten macht, danach greift die
  gewöhnliche Türregel (core/doors.ts). Merkmals-Gate: `needsFor(…, duet)` –
  eine Gegenstelle von vor 3.25 schickt kein `tn`, das Tor ginge NIE auf.
  Klang: zwei reine SINUS-Stimmen in denselben Master (`audio.setResonance`),
  die Schwebung entsteht also AKUSTISCH; der eigene Ton ungepannt, der des
  Partners an SEINEM Feld, plus ein Schimmer nach Genauigkeit (`tuneAim`).
  ZWEI AUSNAHMEN IM BEWEIS: Ein STEIN hält kein Resonanzfeld (keine Neigung) –
  `boulderProof` lässt sie aus `stonePlates` und zählt Steine darauf nicht;
  der PARTNER darf halten. Und eine 'all'-Tür mit zwei Feldern braucht
  „bleibt offen", sonst hat niemand mehr einen Fuß frei – das meldet
  `holdDetail` von selbst (M76/M77), der Beweis erzieht den Bauplan.
  DER TON IST ZUSTAND, kein Abbild der Neigung (v3.25.1, `tuneStep`): Solange
  die Kugel im Feld liegt, BLEIBT der Ton stehen – erst eine echte Neigung
  (über der Deadzone) dreht ihn weiter, das Feld verlassen macht ihn stumm,
  Betreten beginnt beim Grundton. Ein Stimmknopf springt nicht zurück, wenn man
  die Hand wegnimmt. Die erste Fassung war eine reine Abbildung, und daran
  scheiterte der SPIELERWECHSEL im MP-Testmodus: Wer 👥 antippt (oder auf dem
  Phone zum Knopf greift), hält das Gerät fast flach – gehalten wurde also der
  Grundton statt des gestimmten Tons. Mit der Zustands-Regel folgt der
  Spielerwechsel gratis (`TestSide.tone` je Seite, `duetTone` im echten Netz),
  und im Netz entspannt dieselbe Regel das Stimmen: Man darf das Gerät ruhig
  legen. Eingebautes Level: coop-08 „Duett".
  `window.__tiltrResonance` (E2E Lauf 48).
- `src/render/renderer.ts` – Der eigene Ball ist der EINZIGE feste Körper im
  Bild – in der DUNKLEN Welt. AUSNAHME M62: Im Coop auf einer hellen Ebene
  (`bright()`) ist der Partner ein fester roter Ball (`buddy.solid`,
  `drawPartnerBall`, Palette `partner`); im Race und im Dunkeln bleibt er ein
  Schein. Alles Fremde (Partner im MP, Geist der Bestzeit) ist sonst ein SCHEIN:
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
  gesetzte Automaten (w2-06, w2-05, w3-05, w3-06 – in Spielreihenfolge, M44) – nie im Tutorial, nie in
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
- `src/promo.ts` + `tools/promo.mjs` – WEITERSAGEN (M85): Der Startscreen teilt
  die APP. `promoShare(title, text)` ist rein: Text aus dem Wörterbuch der
  aktuellen Sprache, Adresse aus `APP_URL` – NICHT `location.href`, sonst teilt
  der Dev-Server einen toten Link. EIN Chip, EINE Nachricht: `title`, `text`,
  `url` – KEINE Datei. M86 hatte das GIF mitgeschickt (Bild + Unterschrift), und
  auf dem Gerät kam nur das Bild an: 2.11.4 gilt auch hier, hängt eine Datei
  dran, entscheidet die Ziel-App und lässt den Text liegen (M86b). Ein Promo
  ohne Link ist wertlos. Die Animation reist deshalb in der Vorschau
  (`og:image`) – und weil Messenger nur das ERSTE Bild eines GIFs zeigen, setzt
  tools/promo.mjs das HELLSTE Bild der Ping-Szene als Schaubild davor (gemessen
  über eine Pixel-Stichprobe, nicht geraten). Ohne Web Share: Zwischenablage
  (`promoCaption` = Text + Link in einem Block).
  DAS GIF: `npm run promo` fährt die App wie tools/screenshots.mjs und schneidet
  sechs Szenen (Splash, Echo-Ping im Dunkeln, Konfetti, Galerie, Hörtest,
  Editor + Zwei-Spieler-Testmodus aus `tools/promo-level.json`, einem ECHTEN
  Coop-Level des Autors). KEINE Text-Screens (Galerie, Hörtest): In 195 px
  liest sich Text nicht, ein Promo verkauft sich über Bewegung (v3.18.0). EIN
  Ping, nicht zwei – zwei hintereinander sehen aus wie ein Fehler (v3.20.0).
  Ohne ffmpeg entsteht es in JS: Screenshots → Box-Filter auf ein
  Viertel → EINE 256er-Palette (gifenc, MIT; upng-js dekodiert). Bildzeiten
  GEMESSEN (feste Delays liefen zu schnell), Verkleinern ERST NACH der Aufnahme
  (sonst halbiert das Dekodieren die Bildrate). Es liegt in `public/` und ist
  damit NICHT vorgecacht (`globPatterns` kennt kein gif) – 700 KB gehören nicht
  in den Offline-Cache. Neue Oberfläche im GIF ⇒ Szene dort ergänzen.
- `src/ui/download.ts` – `saveTextFile(name, text, kind)`: Web Share mit
  DATEI, wenn möglich, sonst Download. ZWEI Sorten, am Signal-Test auf iOS
  gelernt: 'text' (`text/plain`) fügt Signal als NACHRICHT ein (nutzt niemand
  mehr); 'file' (`application/octet-stream`, Endung `EXPORT_EXT` = `.tiltr`) kommt
  als ANHANG an. `application/json` ging gar nicht (nur der Titel kam an).
  Level-/Bundle-Exporte UND das Backup sind 'file'; Importe lesen den Inhalt, nie den Typ,
  und nehmen `.tiltr`/`.json`/`.txt`.
  Geteilt wird NUR die Datei, ohne `title`/`text`: Safari reicht den Titel
  als eigenes Text-Element mit, und Signal nimmt dann den Text statt der Datei.
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

## Lizenz

Code: PolyForm Noncommercial License 1.0.0 (`LICENSE`, vollständiger Text mit
Required Notice). Inhalte (Level, Notenschrift, docs/): CC BY-NC-SA 4.0
(`LICENSE-CONTENT`). Kommerzielle Nutzung nur nach Vereinbarung – Kontakt über
GitHub-Issues. `tests/license.test.ts` hält Dateien, Vollständigkeit und die
Verweise (package.json, README ×2) fest. Neue Abhängigkeiten müssen dazu
passen (MIT/BSD/Apache ja; GPL-Familie vorher prüfen).

## Git

- Branch: `claude/sensor-ball-game-pwa-f6jg9b` (Default). Jeder Push
  deployt nach Tests automatisch live.
  Große Releases (3.0.0 „Trugbild", sieben Phasen) laufen auf einem
  ARBEITS-BRANCH ohne Deploy (`claude/v3-trugbild`), je Phase ein Commit mit
  grüner Suite, am Ende Fast-Forward auf den Default-Branch.
- `prototype/` ist der eingefrorene Phase-0-Prototyp (Referenz).
