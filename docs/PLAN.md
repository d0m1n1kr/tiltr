# tiltr – Plan Phase 1: Vom Prototyp zum Spiel

Stand: 2026-08-29. Dieses Dokument ist die Referenz für den Ausbau.
Der Prototyp (Repo-Root, Vanilla JS) hat die Machbarkeit bewiesen:
Sensorik, Spatial Audio, Haptik, PWA, Gefahren-Gameplay funktionieren.

## 1. Technische Basis

**Entscheidungen:**

| Bereich | Wahl | Begründung |
|---|---|---|
| Sprache | **TypeScript** (strict) | Levelformate, Element-Registry und Netzcode brauchen Typen |
| Build/Dev | **Vite** | schnell, HTTPS-Dev-Server fürs Handy (`@vitejs/plugin-basic-ssl`), Standard |
| PWA | **vite-plugin-pwa** (Workbox) | ersetzt den handgeschriebenen SW, automatisches Precache-Versioning |
| Unit-Tests | **Vitest** | Physik, Maze, Level-Loader, Scoring, RNG – schnell, ohne Browser |
| E2E | **Playwright** | Smoke: Start, Achsen (synthetische Sensor-Events), Ping, Levelwechsel |
| Lint/Format | ESLint + Prettier | |
| Game-Framework | **keins** (Canvas 2D + eigene Physik + Web Audio) | Kern ist Audio, nicht Grafik; winziges Bundle; deterministische eigene Physik ist Voraussetzung für Multiplayer & Daily Challenge. PixiJS erst, falls visuelle Ambitionen wachsen |
| UI (Menüs) | plain DOM + CSS, kein React | eine Handvoll Screens rechtfertigt kein Framework |
| Validierung | **zod** für Level-Dateien | Levelformat ist die zentrale Schnittstelle, Fehler sollen beim Laden knallen, nicht im Spiel |
| RNG | **seeded** (mulberry32) überall | Reproduzierbare Mazes = Daily Challenge, Multiplayer, Replays |
| Deploy | GitHub Actions → Pages (besteht) | Workflow bekommt `npm ci && test && build`, deployt `dist/` |

**Architektur** – wichtigster Grundsatz: `core/` ist eine **deterministische,
DOM-freie Simulation** (fixed timestep, seeded RNG, keine `performance.now()`-
Abhängigkeit). Sie läuft identisch im Host und in Clients (WebRTC), in Tests
und in Replays (Daily-Challenge-Verifikation).

```
src/
  core/       Simulation: Physik, Entities, Level-Zustand, seeded RNG, fixed timestep
  elements/   Element-Bibliothek (siehe 4): je Element ein Modul gegen ein Interface
  levels/     Levelformat (zod-Schema), Loader, Generator (Maze), Kampagnen-Dateien (JSON)
  audio/      Mixer, Spatial-Bus (HRTF), Sound-Rezepte je Element (weiter prozedural)
  render/     Canvas-Renderer, Kamera/Viewport (Maps größer als der Screen)
  input/      Tilt (Kalibrierung, Orientierung), Touch (Ping), Tastatur
  ui/         Screens: Hauptmenü, Tutorial, Spiel, Ergebnis, Galerie, Einstellungen
  net/        (später) WebRTC: Signaling, Host-Sim, Client-Prediction
  app.ts      Verdrahtung, Modus-Statemachine, Profil/Persistenz
```

Der Prototyp wandert nach `prototype/` (bleibt als Referenz erreichbar),
bis M1 Feature-Parität hat, dann wird er entfernt.

## 2. Spielmodi

### Tutorial
Kette von Micro-Leveln (je < 60 s), jedes führt genau EIN Element ein und
erzwingt seine Benutzung: 1 Rollen & Ziel-Beacon → 2 Wände & Echo →
3 Echo-Ping → 4 Loch (statisch) → 5 atmendes Loch → 6 Wind → 7 brüchige
Wand → 8 Checkpoint & Sturz. Kurzer Text-Overlay pro Level, Fortschritt im
Profil. Neue Kampagnen-Elemente (Wächter, Schlüssel …) bekommen später
eigene Tutorial-Level, die vor ihrem ersten Kampagnen-Auftritt freigeschaltet
werden.

### Schnelles Spiel
Der heutige Prototyp als Modus: seeded Zufalls-Maze, Schwierigkeit als
Preset (Größe, Anzahl Löcher/Wind/brüchige Wände, Ping-Budget),
Bestzeiten pro Preset lokal.

### Kampagne
Feste, aufbauende Level aus **Level-Dateien (JSON)**, gruppiert in Welten.
Neue Elemente pro Welt (siehe 4): Wächter, Schlüssel & Türen, Gems,
mehrere **Ebenen mit Transportern**, **Multi-Screen-Maps** (Kamera folgt
dem Ball), **Durchgangs-Ping** (Durchgänge antworten auf den Echo-Ping
mit eigener Signatur, damit man Ausgänge findet).

**Levelformat (Skizze):**
```jsonc
{
  "id": "w1-05", "name": "Atemlos", "parTimeS": 60,
  "floors": [{
    "size": [12, 8],                    // Multi-Screen: größer als der Viewport
    "maze": { "seed": 1234, "carve": [[2,3,"e"]] },  // Generator + Hand-Edits
    "elements": [
      { "type": "hole",       "cell": [4, 2], "breathing": { "open": 2.6, "closed": 2.2, "offset": 1.0 } },
      { "type": "windZone",   "cell": [6, 3], "dir": "e", "force": 1150 },
      { "type": "guard",      "patrol": [[1,1],[1,6],[3,6]], "speed": 60 },
      { "type": "key",        "cell": [9, 1], "opens": "door-a" },
      { "type": "door",       "id": "door-a", "edge": [[10,4],"e"] },
      { "type": "gem",        "cell": [2, 7] },
      { "type": "transporter","cell": [11, 7], "target": { "floor": 1, "cell": [0, 0] } },
      { "type": "checkpoint", "cell": [6, 4] }
    ],
    "start": [0, 0], "goal": null       // Ziel liegt auf Floor 2
  }, { ... }]
}
```
zod validiert beim Laden; ein Vitest prüft alle Kampagnen-Dateien
(Schema + Lösbarkeit per BFS über Türen/Transporter hinweg).

**Scoring:** Punkte = Zeitbonus (relativ zu `parTimeS`) + Gems + Bonus für
sturzfreie Runs; daraus 1–3 Sterne. Fortschritt/Sterne im Profil
(`localStorage`, exportierbar).

### Steuerung der Modi
Eine kleine Modus-Statemachine in `app.ts`: `menu → tutorial|quick|campaign
→ result → menu`. Spiel-Sessions sind immer: „Level-Definition rein,
Ergebnis raus" – derselbe Code für alle Modi.

## 3. Multiplayer (nach M6)

**Architektur:** Host-autoritative deterministische Sim (`core/` läuft nur
beim Host), Clients senden Inputs (Tilt, Pings), Host broadcastet kompakte
Snapshots + Events. DataChannels: unreliable/unordered für Snapshots,
reliable für Events. Dank Determinismus & Seeds ist die Bandbreite winzig.

**Signaling ohne eigenen Server (v1):** [Trystero](https://github.com/dmotz/trystero)
– Raum-Code, Peers finden sich über öffentliche Tracker; funktioniert im
LAN und übers Internet, GitHub Pages bleibt ausreichend. Eigener
Signaling-Server erst, wenn nötig.

**Modi:**
- **Race:** gleicher Seed, jeder sein Ball, Gegner als „Geist" hörbar
  (Rollen/Pings räumlich aus seiner Richtung). Wer zuerst im Ziel ist.
- **Coop „Findet euch":** getrennte Spawns in derselben Map, Phase 1:
  einander finden (man hört den anderen; Annäherung = gemeinsamer
  Herzschlag), Phase 2: Hürde, die nur zu zweit geht (Druckplatte hält
  Tür für den Partner offen, Doppel-Schalter, Transporter-Weiche).

## 4. Element-Bibliothek

Jedes Spielelement ist ein Modul gegen ein festes Interface – Level-Loader,
Renderer, Audio und (später) der Netzcode kennen nur das Interface:

```ts
interface GameElement {
  type: string;
  schema: ZodSchema;                       // Level-Datei-Parameter
  update(sim: Sim, dt: number): void;      // deterministisch!
  onBallHit?(sim: Sim, impact: Impact): void;
  onPing?(sim: Sim, ping: Ping): PingEcho | void;  // eigene Echo-Signatur
  render(ctx: RenderCtx): void;
  sounds: SoundRecipe[];                   // prozedurale Rezepte, zentral registriert
}
```

Bestand: Wand (normal/brüchig), Loch (statisch/atmend), Windzone,
Checkpoint, Ziel-Beacon. Neu für die Kampagne: **Wächter** (Patrouille,
brummt räumlich, Berührung = Checkpoint-Reset), **Schlüssel/Tür**
(klimpert/brummt, Tür antwortet dumpf auf Ping), **Gem** (eigene helle
Ping-Antwort + Glitzer beim Einsammeln), **Transporter** (Shimmer-Sound,
Ebenenwechsel), **Durchgang** (Ping-Antwort „offen" – hell und hallend
statt Wand-Blip).

**Galerie:** Dev-/Menü-Screen, der jedes Element zeigt (Visual, Sounds
abspielbar, Parameter). Dient als lebende Doku, Sound-Design-Werkzeug
und QA-Checkliste – und ist die Vorstufe eines Level-Editors.

## 5. Challenge of the Day

- **Seed = UTC-Datum** → deterministisches Level für alle, komplett
  offline/serverlos. Schwierigkeitskurve über den Wochentag (Mo leicht …
  So fies).
- Ein Versuch zählt (weitere Versuche = Training, markiert), Ergebnis =
  Zeit + Punkte.
- **Sharing/Herausfordern ohne Backend:** Web Share API / Link:
  `…/tiltr/#d=2026-08-29&t=42.3&p=1240` – der Empfänger öffnet den Link,
  bekommt „Schlag 42,3 s!" als Overlay und spielt denselben Seed.
  Streak & Historie lokal im Profil.
- Echte globale Leaderboards brauchen ein Backend (Cloudflare Worker +
  KV wäre der leichteste Weg) – bewusst **nach** dem Multiplayer, mit
  Replay-Checksumme als leichtem Cheat-Schutz.

## Meilensteine

| # | Inhalt | Ergebnis |
|---|---|---|
| **M1** | Fundament: Vite+TS+Vitest+Playwright+PWA-Plugin, Port des Prototyps in die Modul-Architektur, CI (test→build→deploy) | identisches Spielgefühl, neue Basis |
| **M2** | Element-Registry, Levelformat+Loader (zod), Kamera/Viewport (Multi-Screen), seeded RNG durchgängig, Galerie | Level aus Dateien ladbar |
| **M3** | Modus-Gerüst: Menü, Profil/Persistenz, Tutorial (8 Micro-Level), Schnelles Spiel mit Presets | spielbare App-Struktur |
| **M4** | Kampagne Welt 1 (10 Level) + neue Elemente: Wächter, Schlüssel/Tür, Gem, Durchgangs-Ping; Scoring/Sterne | erste echte Kampagne |
| **M5** | Ebenen + Transporter, Kampagne Welt 2 | vertikale Maps |
| **M6** | Challenge of the Day + Share-Links | täglicher Anreiz |
| **M7** | Multiplayer: Race, dann Coop (Trystero-Signaling) | lokales Netzwerkspiel |
| **M8** | Design-Politur (Startscreen, Splash mit Credits) + i18n DE/EN/FR/ES (Auto-Detect + Umschalter) | internationale, polierte App |

Jeder Meilenstein endet deploybar (Pages) und mit grüner Test-Suite.

## Ausbau nach 1.0 (Singleplayer)

Leitplanken wie immer: Jedes Element braucht eine eindeutige, räumlich
ortbare Klang-Signatur (Audio first), Determinismus im Core und eine
beweisbare Lösbarkeits-Invariante für die Testsuite (plus Galerie-Eintrag,
zod-Schema, Weltfarbe nach DESIGN.md: eine Farbe = eine Bedeutung).

| Baustein | Idee | Klang | Testbarkeit |
|---|---|---|---|
| **Schiebewand** | Wand öffnet/schließt zyklisch (Wand-Gegenstück zu atmenden Löchern) | rhythmisches Steinschleifen, Takt beschleunigt vorm Schließen | wie atmende Löcher: offen = passierbar |
| **Zeitschloss-Schalter** | Betreten öffnet verknüpfte Tür für N Sekunden (SP-Druckplatte) | tickender Countdown, hektischer zum Ende | Platten/Tür-Fixpunkt existiert; zusätzlich beweisbar: Pfadlänge Schalter→Tür ÷ Maxspeed ≤ Timer |
| **Strömung/Förderband** | unüberwindbar starker Schub = Einbahnstraße | pulsierendes, gerichtetes Rauschen | gerichtete Kante im Erreichbarkeits-Modell (wie Transporter) |
| **Horcher** | Wächter, der sich nur bewegt, während DU rollst; stillstehen = sicher | Schnüffeln/Knistern, schwillt mit eigener Rollgeschwindigkeit an | Patrouillenfrei; Fangverhalten deterministisch aus Ballbewegung |
| **Nebelzone** | dämpft ALLE Klänge (Lowpass), auch den Beacon | – (das Element IST die Klangveränderung) | kein Physik-Einfluss |
| **Eisfläche** | reibungsarme Zellen, Ball gleitet | kristallines Sirren beim Gleiten | kein Einfluss auf Erreichbarkeit |
| **Echo-Kristall** | Pickup: +1 Ping | heller Glockenton, klare Ping-Antwort | Erreichbarkeit wie Gems |
| **Sog-Anker** | zieht den Ball im Radius an (violett = Gefahr) | elektrisches Brummen, steigt mit Nähe | Platzierung abseits des Pflichtwegs prüfen |
| **Glasboden** | Zelle zerbricht beim 2. Überrollen zum Loch (1. Mal: Knacken) | Knacken → Splittern | konservativ als „einmal passierbar" modellieren |

Level & Features:

- **Welt 3 „Das Räderwerk"** (6 Level): Schiebewände, Zeitschlösser,
  Strömungen – Rhythmus-Welt, Finale „Taktstraße" (Multi-Screen).
- **Welt 4 „Die Stille"** (6 Level): Horcher, Nebel, Eis, Glas –
  Schleich-Welt, Finale „Das Ohr" (3 Ebenen, Nebelkern, zwei Horcher).
- **Geist-Replay**: Bestzeit rollt als blasser Halo mit (Partner-Halo-
  Rendering wiederverwenden); deterministische Aufzeichnung in
  localStorage; wirkt in Quick, Daily und Kampagne.
- **Blind-Stern**: vierter, optionaler Stern pro Kampagnen-Level –
  geschafft ohne einen einzigen Echo-Ping.
- Generatoren (Quick/Daily) nehmen neue Elemente stufenweise auf.

Schnitte:

| Meilenstein | Inhalt | Ergebnis |
|---|---|---|
| **M9 „Räderwerk"** ✓ | Schiebewand + Zeitschloss + Strömung, Welt 3, Geist-Replay | Timing-Gameplay + Wiederspielwert (v1.1.0) |
| **M10 „Stille"** ✓ | Horcher + Nebel + Eis, Welt 4, Blind-Stern | Schleich-Gameplay, Audio-Design-Schau (v1.2.0) |
| **M11** ✓ | Echo-Kristall, Sog-Anker, Glasboden, Generator-Integration | Würze für alle Modi (v1.3.0) |

## M12 „Werkstatt" – Level-Editor (Planung)

Eigene Level bauen, lokal sammeln, testen und serverlos teilen. Leitidee:
Der Editor erfindet NICHTS neu – er editiert rohe LevelDefs und nutzt
dieselben Bausteine wie das Spiel: zod-Schema als Formularquelle, Loader +
Renderer für die Vorschau, die Lösbarkeits-Beweise der Testsuite als
Live-Validierung. Tablet-first (drei Spalten), Phone funktioniert.

### Datenmodell & Speicherung (localStorage)

- `tiltr.workshop.v1` = `{ levels: CustomLevel[] }`, fehlertolerant wie
  das Profil (Private Mode: Editor läuft, warnt nur beim Speichern).
- `CustomLevel = { id: 'custom-<base36>', def: <rohe LevelDef>,
  createdAt, updatedAt, format: 1 }` – `def.id === id`, `def.name` ist der
  Anzeigename. Ein handgebautes Level hat ~2–10 KB JSON; localStorage
  (~5 MB) trägt hunderte.
- Bestzeiten/Geister/`?unlock` funktionieren automatisch: alles hängt an
  der Level-ID, `custom-*` reiht sich neben `quick-*`/`daily-*` ein.
  Kampagnen-Sterne bleiben unberührt (keine `custom`-IDs in CAMPAIGN_IDS).

### Bibliothek („🛠 Werkstatt" im Startmenü)

Levelliste im Kampagnen-Look (`.level-item`): Name, Größe/Ebenen,
Validierungs-Badge (✓ lösbar / ⚠ Fehler), Bestzeit. Aktionen pro Level:
Spielen · Bearbeiten · Duplizieren · Teilen · Exportieren · Löschen
(mit Rückfrage). Kopfzeile: Neu (leer 6×8 oder „aus Zufallslevel" – der
Quick-Generator liefert das Grundgerüst) · Importieren.

### Editor-Kern

- **Quelle der Wahrheit**: die rohe Def. Jede Änderung läuft durch
  `parseLevel` → `loadLevel` → `Renderer.draw(world, { debug: true })`.
  Die Vorschau IST das Spiel-Rendering (Weltfarben, Schiebewand-Zyklen
  eingefroren offen); wirft der Loader, bleibt das letzte gültige Bild
  stehen und ein Banner nennt den Fehler (z. B. „Tür-Kante ist zu").
  Darüber liegt eine Editor-Ebene: Gridlinien, Auswahl, Verknüpfungslinien.
- **Layout Tablet-first**: ab ~900 px drei Spalten – links Palette
  (Werkzeuge + alle Registry-Elemente mit Galerie-Miniaturen), Mitte
  Canvas (Pinch-Zoom + Zwei-Finger-Pan), rechts Eigenschaften. Unter
  ~900 px: Palette als horizontale Chip-Leiste, Eigenschaften als
  Bottom-Sheet – gleiche Bausteine, andere Anordnung (theme.css-Tokens,
  Safe-Area-Regeln gelten unverändert).
- **Werkzeuge** (Chips, ein Modus aktiv): Auswählen · Platzieren
  (gewähltes Element) · Wand · Radieren · Start · Ziel. Wand-Werkzeug:
  Tap nahe einer Kante schaltet zyklisch offen (carve) → zu (add) →
  brüchig → Seed-Zustand; Tap-Ziel-Erkennung Kante vs. Zelle über die
  Distanz zum Zellzentrum (auf dem Tablet mit Zoom präzise). Dazu
  „Maze neu würfeln" (neuer Seed, Edits bleiben).
- **Eigenschaften-Panel**: aus dem zod-Schema abgeleitete Felder des
  ausgewählten Elements (Radius, Timer, Richtung, Atem-Zyklus, Kraft …)
  plus Level-Metadaten (Name, Intro, Par-Zeit, Ping-Budget).
- **Verknüpfungs-Modus**: Tür/Zeitschloss/Schlüssel auswählen → Ziel
  antippen setzt `opens`; Transporter → Ebenen-Tab + Zelle. Goldene
  gestrichelte Linien zeigen bestehende Verknüpfungen.
- **Ebenen**: Tabs für bis zu 4 Ebenen (Schema-Limit), je Ebene Größe
  2–64. Druckplatten bleiben ausgeblendet (Multiplayer-Element ohne
  SP-Semantik – das Zeitschloss ist das SP-Pendant).

### Live-Validierung = Testsuite im Spiel

Das Erreichbarkeits-Modell zieht von `tests/helpers.ts` nach
`src/levels/validate.ts` um (die Tests re-exportieren von dort – EINE
Quelle der Wahrheit für Beweise in CI und Editor). Der Editor zeigt
Badges, live nach jeder Änderung: Ziel erreichbar · Schlüssel/Schalter
vor ihrer Tür · Zeitschloss-Timer reicht (2,5×-Schranke) · kein Softlock
(Öffner-Fixpunkt, gerichtete Strömungen) · Anker/Glas abseits des
Pflichtwegs. Teilen/Exportieren ist erst mit grünen Pflicht-Badges
möglich – geteilte Level sind damit beweisbar lösbar.

### Preview-Modus

„▶ Testen" startet das Level in der ECHTEN Spielschleife (neuer Modus
`{ kind: 'custom' }`): Sensoren/Tastatur, Audio, Geist, HUD – alles wie
im Spiel, plus ein ✏️-Knopf, der ohne Umweg zurück in den Editor führt
(Entwurf bleibt erhalten). Debug-Ansicht 👁 wie gehabt.

### Import / Export / Share-Link (serverlos)

- **Export**: JSON-Datei `{ format: 'tiltr-level', version: 1, def }`
  per Blob-Download; **Import**: Datei-Picker UND Einfüge-Textfeld
  (Tablet-freundlich), `parseLevel`-validiert, ID-Kollision ⇒ neue ID.
- **Share-Link**: `#level=<base64url(deflate(JSON))>` – wie die
  Daily-Challenge komplett serverlos. Kompression über das native
  `CompressionStream('deflate-raw')` (iOS ≥ 16.4; Fallback:
  unkomprimiert). Typische Links 1–3 KB; ab ~8 KB warnt der Editor.
  Empfang im bestehenden Hash-Handler: Interstitial „Level ‚X'
  ausprobieren / in die Werkstatt übernehmen" – Hash wird wie bei
  `#daily`/`#join` aus der URL entfernt. Teilen über Web Share API,
  sonst Zwischenablage.

### Tests & E2E

- Unit: validate.ts-Umzug (bestehende Beweise bleiben grün), Storage-
  Roundtrip, Share-Codec-Roundtrip (encode→decode = identische Def,
  deterministisch; CompressionStream gibt es in Node ≥ 18), Import
  weist kaputte/fremde JSONs ab.
- E2E: Werkstatt-Lauf (Neu → Element platzieren → Badge grün → Testen →
  Ball-Hook → zurück → Speichern → Bibliothek zeigt Eintrag),
  Share-Roundtrip über zwei Pages (`#level=…`), Tablet-Layout
  (1024×768 ⇒ drei Spalten sichtbar) + Phone-Gegenprobe (400×800 ⇒
  Leisten-Layout). Neue Zusicherungen einmal rot sehen.

### Schnitte

| Meilenstein | Inhalt | Ergebnis |
|---|---|---|
| **M12a „Werkstatt-Kern"** ✓ | Bibliothek + Editor (eine Ebene): Platzieren, Wände, Eigenschaften, Live-Validierung, Preview, Speichern | Eigene Level bauen & spielen (v1.4.0) |
| **M12b „Teilen"** ✓ | Mehr-Ebenen + Transporter-Ziele, Import/Export, Share-Link + Empfang (natives deflate-raw statt pako), Fit-Knopf | Level-Tausch ohne Server (v1.5.0) |

## M13 „Verknüpfungen" ✓ (v1.6.0)

Tür/Öffner-Mechanik im Editor grundüberholt – Kern: **Loader mild, Beweis
streng**. Hängende Verknüpfungen (Tür ohne Öffner, Schlüssel ohne Tür) sind
lauffähige Editor-Zwischenzustände; die Strenge wohnt im neuen Pflicht-Check
`links` in validate.ts (blockiert Teilen). Damit friert die Vorschau nie mehr
ein und statt Loader-Exceptions gibt es Badge + Hinweis.

- Schlüssel öffnen Türen jetzt auf ALLEN Ebenen (app.ts) – das Spiel folgt
  dem Lösbarkeits-Modell (coopReachable behandelt Öffner ebenenübergreifend).
- Auto-Link auf die NÄCHSTGELEGENE Tür (statt der zuletzt gesetzten);
  🔗 „Tür wählen" in den Props verknüpft per Tap (Pending-Mechanik wie beim
  Transporter, Ebenenwechsel für Schlüssel erlaubt, Zeitschloss nur gleiche
  Ebene – Timer-Beweis).
- Tür-IDs global eindeutig (nextDoorId über alle Ebenen); Tür-Props zeigen
  editierbare ID (Rename hängt alle Öffner-Referenzen um) + Öffner-Zähler.
- Tür löschen räumt auf: Öffner werden auf die nächste verbleibende Tür
  umgehängt, sonst Status-Hinweis + rotes Badge.
- Sichtbarkeit: Paar-Hervorhebung (Öffner ↔ Tür golden bei Auswahl),
  ID-Labels an Türkanten ab der zweiten Tür, Transporter-Ziel als
  Magenta-Linie (gleiche Ebene) bzw. „→E<n>"-Label, Ziel in den Props +
  🔗 „Ziel neu wählen" per Tap (auch über Ebenen).

## M26 „Konfetti" ✓ (v2.3.0)

Jeder geschaffte Lauf wird gefeiert – Tutorial eingeschlossen, denn alle
Single-Player-Siege laufen durch EINE Stelle (`celebrate()` in app.ts:
Jubel-Akkord, Konfetti-Klang, Haptik, Salve). Der Multiplayer feiert den
Coop-Sieg und ein gewonnenes Race; ein verlorenes Race feiert nicht.

**Bild** (`src/ui/confetti.ts`): Zwei Kanonen aus den unteren Bildecken,
schräg nach innen-oben. Das Partikelmodell ist REIN und geseedet
(`spawnConfetti`/`stepConfetti`, mulberry32) – dieselbe Disziplin wie im
Kern, damit die Testsuite Flugbahnen festnageln kann (14 Units), ohne Pixel
zu lesen. Die Farben kommen aus der WELTPALETTE (Ball-Teal, Wand-Blau,
Ziel-Grün, Gold, Bernstein, Gem-Eisblau): Das Spiel hat eine Farbsprache,
und Feiern ist kein Grund, sie zu verlassen. Eigene Canvas-Ebene ZWISCHEN
Spielfeld und Panels – die Ergebnis-Karte zieht nach 1,8 s über das noch
fallende Papier auf und bleibt lesbar. Angetrieben wird es von der
bestehenden Spielschleife (keine zweite rAF).

Schwerkraft und Luftwiderstand sind aufeinander eingestellt, nicht geraten:
`GRAVITY / DRAG` = 700/3 ≈ 233 px/s ist die Endgeschwindigkeit – das TAUMELN
von Papier statt des Sturzes eines Steins. Der kräftige Widerstand bremst
die Salve nach ~0,3 s ab: erst Knall, dann Flattern, wie eine echte
Konfetti-Kanone. Nachgerechnet (800px-Bild): Gipfel bei 33–58 % Bildhöhe,
Flugdauer 2,2–3,2 s. Die erste Fassung war mit `g=1400, drag=0.62` in 1,4 s
vorbei – das Konfetti war weg, bevor die Karte kam.

**Klang** (`audio.confetti()`): Vier kurze Papier-Knaller (Bandpass-Rauschen,
1,1–1,9 kHz) plus fünf absteigende Funkel-Blips. Bewusst STEREO gepannt und
NICHT über den HRTF-Pfad: Die Feier kommt vom SCHIRM, nicht aus der
Spielwelt – über `place()` würde sie in First Person mit der Blickrichtung
mitdrehen, und ein Konfetti-Knall „hinter dem Ball" ist Unsinn.

`prefers-reduced-motion` schaltet die Salve ganz ab (Dekoration, kein
Spielsignal – Zeit und Klang sagen dasselbe).

**Der Fund unterwegs war eine alte Falle aus docs/DESIGN.md:** Die
Konfetti-Ebene feuerte in einen 200 px hohen Streifen. Ein `<canvas>` ist ein
REPLACED ELEMENT und streckt sich mit `inset: 0` allein NICHT – es nimmt sein
Eigenverhältnis 300×150 an (bei 400 px Breite also 200 px hoch). Genau davor
warnt der Abschnitt „Keine Höhenangaben für App-Flächen", und `#game` macht
es richtig (`width/height` explizit). Sichtbar wurde es erst durch die
gemessene Canvas-Größe im Test-Haken – das Konfetti war „nach 200 ms oben aus
dem Bild". Der E2E prüft die Ebenengröße deshalb jetzt mit.

E2E-Lauf 3 (Tutorial) prüft: Salve fliegt (70 Schnipsel, 6 Farben), Ebene
füllt das Bild, Start im unteren Bilddrittel, Klangquellen entstehen, und das
Papier räumt sich selbst auf. Lauf 3b: reduced-motion gewinnt ohne Konfetti.
Alle sechs neuen Zusicherungen rot gesehen.

## M25 „Der Vorhang" ✓ (v2.2.0)

Die Start-Animation erzählt jetzt eine Bewegung statt zweier: Die Kugel
rollt von UNTEN ein, Titel und Credits blenden ein und stehen kurz, dann
rollt die Kugel nach OBEN aus dem Bild – und GLEICHZEITIG fährt der
Startscreen von unten herein. Vorher rollte die Kugel von links ein und der
ganze Splash blendete einfach aus; der Übergang ins Menü war ein Schnitt.

Drei Dinge, die beim Bauen nicht offensichtlich waren und jetzt im Code
stehen (Details in docs/DESIGN.md):

1. **Eine einfarbige Kugel dreht sich unsichtbar.** „Einrollen" braucht eine
   Marke – ein Glanzpunkt (`.splash-ball::after`) macht aus dem Schieben ein
   Rollen. 1,5 Umdrehungen sind die Stilisierung (echtes Abrollen wären bei
   r=9px fast acht).
2. **Die Reihenfolge in Akt 3 ist Pflicht, nicht Geschmack.** Der
   Startscreen trägt selbst ein „tiltr". Die erste Fassung ließ Splash-Titel
   und Menü-Titel überlappen – im Screenshot eine Doppelbelichtung. Jetzt
   räumt die Schrift zuerst (160 ms), dann fährt das Menü.
3. **Der Menü-Transform gehört an den `body`, nicht an `#overlay`.** So hat
   der Startscreen ohne `body.splashing` GAR keinen Transform: `?nosplash`
   (E2E) und `prefers-reduced-motion` sehen nichts von der Inszenierung, und
   ein abgebrochener Splash kann das Menü nicht unter dem Bildrand vergessen.

Zwei Sachfehler fielen beim Ansehen der Screenshot-Serie auf: Die Echo-Ringe
standen wegen `animation-fill-mode: both` schon WÄHREND ihrer Verzögerung
als Umriss auf der Bühne (mit der wandernden Kugel sah das wie eine Pille
aus) – `forwards` behebt es. Und die erste Einfahrt war mit 650 ms und einer
stark vorgezogenen Kurve praktisch vorbei, bevor man sie sah (bei 150 ms
stand die Kugel fast in der Mitte) – jetzt 850 ms ease-out.

**Nachtrag v2.2.1 – „fährt zu schnell rein, sollte am Ende bremsen".** Die
erste Fassung fuhr mit 460 ms und `cubic-bezier(0.16, 0.84, 0.3, 1)`: Spitze
8900 px/s im ERSTEN Frame, nach 17 % der Zeit schon 61 % des Weges – sie
schnappte herein. Neu 640 ms mit `cubic-bezier(0.38, 0.62, 0.2, 1)`: Die
Kurve ZIEHT ERST AN (Spitze 3200 px/s bei ~150 ms, im Browser nachgemessen)
und bremst dann lang aus – die letzten 10 % des Weges brauchen ~320 ms, die
halbe Animation ist Bremse.

Die Kurve wurde nicht geraten: Ein kleines Skript wertet die Kandidaten-
Beziers exakt aus (Spitze, Zeit bis zur halben Strecke, Dauer der letzten
10 %), danach hat der Browser das Profil bestätigt (2094 → 3256 → 1650 →
759 → 361 → 232 → 144 → 56 → 17 px/s).

Und eine Lehre für die Zusicherung: Ein 60-ms-Abtastraster GLÄTTET die
Spitze weg – die alte Kurve maß so nur 5464 statt 8900 px/s und wäre durch
eine Peak-Schwelle geschlüpft (genau das passierte im ersten Sabotage-Lauf).
Deshalb vermisst der E2E die FORM der Fahrt exakt über die
Web-Animations-API (Animation an eine Zeitmarke setzen, echten Transform
lesen): „80 ms nach dem Start liegt noch der Großteil des Weges vor ihr"
(23 % statt 63 %) und „zur Hälfte der Zeit ist der Weg fast geschafft"
(90 %). Beide Klauseln einzeln rot gesehen – die erste mit der alten
Kurve, die zweite mit `linear`.

Das Ende der Inszenierung hängt am `animationend` der Menü-Fahrt statt an
einer zweiten Zahl in JS, die mit der CSS-Dauer auseinanderlaufen kann
(`ev.target === overlay`, weil das Event bubbelt, plus ein Timeout als
Sicherheitsnetz für Hintergrund-Tabs). E2E-Lauf 10 prüft die drei Akte an
den ECHTEN Transforms (Kugel unten → Mitte → oben raus, Menü geparkt →
unterwegs → ohne Transform) samt „Splash-Titel weg, bevor der Menü-Titel
kommt"; Lauf 10b deckt reduced-motion und den Tap ab. Alle acht neuen
Zusicherungen rot gesehen.

## M24 „Bauen mit Ohr und Auge" ✓ (v2.1.0)

Zwei Wünsche aus dem Editor-Betrieb – beide zielen darauf, einen Entwurf
BEURTEILEN zu können, ohne ihn zu verlassen.

**1. Ton-Vorschau im Eigenschaften-Panel.** Ein Element IST sein Klang; ihn
erst im Testlauf zu suchen war absurd. Der Auswahl-Kopf trägt jetzt neben
Miniatur und Name einen „🔊 Anhören"-Knopf, der die Signatur aus der
ELEMENT-REGISTRY spielt – dieselbe, die die Galerie anspielt
(`galleryEntries().demoSound`). Ein Element, ein Klang, eine Quelle.

**2. Play/Pause für bewegte Elemente** (`#edPlay`, im Canvas-Kopf neben ⤢).
Reine ANSICHT, keine Simulation: kein Ball, keine Physik, keine
Kollisionen – nur die Zyklen (atmende Löcher, Schiebewände) und die
Patrouillen (`world.advanceGuards`, dafür von privat auf öffentlich
gehoben). Damit lässt sich Taktung beurteilen („passt die Lücke zum
Rhythmus?"), was vorher nur der Testlauf konnte. Pause friert Bild UND Uhr
ein, damit man eine halboffene Wand ansehen kann; der Knopf trägt seinen
Zustand (▶/⏸ plus Akzentfarbe). Bewusst STUMM: Ohne Ball gibt es keinen
Hörerort, und Klang gibt es gezielt über die Ton-Vorschau. Horcher stehen
still – sie jagen den Ball, und den gibt es hier nicht.

**Nebenprodukt: eine Quelle für die Atem-Uhr.** Die Phasenrechnung
(öffnen → offen → schließen → zu) stand ZWEIMAL identisch in app.ts (Löcher
und Schiebewände) – und der Editor hätte sie ein drittes Mal gebraucht. Sie
wohnt jetzt in `src/core/breathing.ts` (`breathAt`, `breathPeriod`,
`breathOpenRemaining`), deterministisch und DOM-frei, mit 11 Units auf den
Phasengrenzen; Mutations-Gegenprobe (Rampe invertiert, Restzeit-Fenster
aufgeweitet) rot gesehen.

**Und ein echter Fund des neuen E2E-Laufs:** Ein importiertes Level ohne
`maze.add` ist vollkommen gültig (das Schema füllt Vorgaben erst beim
Parsen) – der Editor arbeitet aber direkt auf dem ROHEN Draft und schob in
genau diese Listen. `paint()` lief auf, die Karte blieb schwarz. Fix:
`normalizeDraft()` füllt beim Öffnen einmal auf, statt an jeder
Zugriffsstelle zu prüfen; danach hält der Draft, was `RawFloor` verspricht.

Testbar ohne Pixel: `window.__tiltrEd` legt offen, WAS der Renderer
zeichnet (`motion`: Schiebewand-Öffnung, Loch-Öffnung, Wächter-Position)
plus `playing`/`animT`. Lauf 20 prüft die Bewegung als SERIE über eine
Sekunde (wie viele verschiedene Werte kommen vor) statt mit zwei
Stichproben – zwei Punkte können zufällig in dieselbe Phase fallen, was der
erste Anlauf prompt vorführte. Alle neun neuen Zusicherungen rot gesehen.

## M23 „First Person" ✓ (v2.0.0)

Zweiter, ZUSÄTZLICHER Steuerungsmodus für alle Spielvarianten (Quick,
Daily, Kampagne, MP, Duell, Werkstatt-Preview). Die Visualisierung bleibt
die Draufsicht – aber die Kugel bekommt eine BLICKRICHTUNG (Heading), und
die zeigt auf dem Screen immer nach oben: Es dreht sich die WELT um die
Kugel, nicht die Kugel auf dem Screen. Die Kugel sitzt fix in der
Bildschirmmitte (Kamera folgt immer, auch in kleinen Leveln).

### Steuerungsmodell (Lenkrad, entschieden)

Haltung: Handy ~45° vor sich. Die Kalibrierung im Countdown nimmt wie
bisher die tatsächliche Haltung als Nullpunkt – 45° ist Empfehlung, nicht
Pflicht (das heutige `beta0/gamma0`-Modell trägt das unverändert).

- **Vor/zurück** = Kippen relativ zum Nullpunkt: flacher (nach vorn
  gekippt) = vorwärts entlang der Blickrichtung, steiler = rückwärts.
- **Drehen** = Lenkrad: das Handy um die Blickachse neigen; gehaltene
  Schräglage = kontinuierliches Drehen. Totzone gegen Drift (liefert
  `tilt` heute schon), progressive Kurve `x·|x|` für Präzision um die
  Mitte, volles Einschlagen ≈ 2,4 rad/s (Tuning-Wert).
- **Kein Strafen**: Die Querachse dreht ausschließlich. Seitliche
  Bewegung entsteht nur noch aus Impuls (Drift um Kurven – gewollt).
- **Tastatur-Fallback fällt gratis ab**: `tilt` liefert für Tasten dasselbe
  {x,y}-Signal – in FP heißt ↑/↓ dann Schub, ←/→ Drehen. Damit ist der
  Modus auch im E2E fahrbar.

### Warum das dem Spiel besonders steht: Das AUDIO dreht mit

Der Hörer schaut in Blickrichtung (`audio.setHeading(rad)`, gedreht wird
an EINER Stelle: `place()`/`unitPos()`). Damit wird „links/rechts von MIR"
zur tragenden Achse – exakt die, die das Ohr laut Hörtest (M20) sicher
kann. Die schwache Vorn/Hinten-Achse löst man in FP durch DREHEN, bis das
Ziel-Beacon mittig vorn liegt. First Person macht die HRTF-Ortung damit
voll spielbar; die Draufsicht bleibt der Modus für die Karten-Denker.

### Architektur: FP ist Steuerung + Kamera + Hörer – NICHT Physik

Der Kern (`src/core/`) bleibt unangetastet: Impuls, Kollisionen, Elemente,
alles in Weltkoordinaten. FP ist eine reine Transformation davor/danach:

1. `src/core/fp.ts` (NEU, deterministisch, DOM-frei):
   `fpStep(tilt, heading, dt) -> { worldTilt, heading }` – Drehkurve +
   Rotation des Schubvektors ins Weltsystem. Heading 0 = Norden (Screen-
   oben), sodass Level-Intros mit Richtungsbezügen beim Start stimmen.
   Units nageln die Vorzeichen fest (θ=0, nach vorn gekippt ⇒ Beschleunigung
   nach Welt-oben; θ=90° ⇒ nach Welt-rechts; Totzone; Kurve; max. Rate).
2. `app.ts`: hält `heading` pro Lauf (Respawn und Transporter erhalten es),
   ruft `fpStep` nur im FP-Modus, übergibt `worldTilt` an `world.step`.
3. `renderer.draw({ heading })`: Rotation um die Ballmitte, Kamera immer
   zentriert. Alle Weltkoordinaten laufen durch EIN `worldToScreen`
   (bisher offset+scale, jetzt + Rotation) – damit klemmen auch Partner-
   Schein/Geist korrekt am gedrehten Rand. Debug-Ansicht dreht mit.
4. `audio.setHeading(rad)` – siehe oben. Menü/Hörtest bleiben bei 0.
5. `window.__tiltrFp = { heading, mode }` als E2E-Haken.

**Kompatibilität dadurch gratis:** Geister, Duell-Tokens, Daily-Seeds und
MP-Positionen sind Weltkoordinaten – ein FP-Spieler kann gegen einen
Draufsicht-Geist antreten, im MP darf jeder seinen Modus wählen. Kein
Format, kein Codec, kein Beweis (validate.ts) ändert sich.

### UI

- Umschalter im MENÜ-FOOTER als Chip-Paar („🥣 Draufsicht / 🧭 First
  Person") – dort wohnen die globalen Einstellungen (Name, Sprache), und
  die Steuerung gilt wie die Sprache für ALLE Varianten. Persistiert in
  `profile.controls` (`'top' | 'fp'`, Default `'top'`). Ab 900px wird der
  Footer einzeilig – die zusätzliche Zeile hätte sonst das
  Tablet-Versprechen „Startscreen ohne Scrollen" gebrochen (der
  E2E-Tablet-Lauf hat genau das gefangen; die Regel muss NACH der
  Basisregel stehen, gleiche Spezifität).
- Kalibrier-Interstitial bekommt je Modus den passenden Hinweis
  („flach wie ein Tablett halten" vs. „~45° vor dich halten").
- i18n: ~6 neue Schlüssel ×4 (Toggle-Labels, Untertitel, FP-Kalibrierhinweis).
- Galerie/README: FP als Steuerungsvariante dokumentieren.

### Umsetzung (M23a–c)

- `core/fp.ts`: 16 Units (Vorzeichen-Matrix, Kurve, Raten-Deckel,
  dt-Unabhängigkeit der Glättung, Winkel-Normalisierung); Mutations-
  Gegenprobe auf Vorzeichen und Glättung rot gesehen. Die KAMERA-Glättung
  steckt bewusst in der DREHRATE (exponentiell, τ = 90 ms): Heading ist
  damit C¹-stetig, und weil Kamera, Schub und Hörer dasselbe Heading
  benutzen, laufen Sicht und Steuerung nie auseinander.
- Renderer: Drehung um die Ballmitte über den Canvas-Transform; Schein/
  Geist werden NACH dem restore in Screen-Koordinaten gezeichnet
  (`rotateAround`, eine Implementierung für Transform und Randklemmung),
  damit Klemmung und Ebenen-Label aufrecht bleiben. FP erzwingt die
  Folge-Kamera ohne Weltrand-Klemmung (das Drehzentrum braucht die exakte
  Mitte). `renderer.lastView` meldet, was der Frame wirklich getan hat.
- E2E-Lauf 19 fährt den Modus per Tastatur in einer offenen 5×5-Arena:
  Lenkrad hebt das Heading (Rate klingt aus), die Ansicht rotiert mit,
  Schub rollt in die GEDREHTE Weltrichtung, die FP-Kamera hält die Kugel
  auch abseits der Weltmitte zentriert, und der Umschalter ist
  reload-fest. Fürs AUDIO vergleicht der Lauf dieselbe Ping-Szene vor und
  nach dem Drehen: alle Reflexionen müssen im Hörer-System um exakt
  -Δheading wandern (`window.__tiltrPing`). Alle neun Zusicherungen rot
  gesehen (zwei Sabotage-Läufe).

### Tuning-Werte (beim Playtest zu justieren)

`FP_MAX_TURN` = 2,4 rad/s · Drehkurve `x·|x|` · Glättung
`FP_TURN_SMOOTH_S` = 90 ms · Schub-Skala = bisherige Neigungsskala ·
Totzone aus `tilt` (0,04).

## M22 „Der Partner ist ein Schein" ✓ (v1.13.0)

Zwei Meldungen aus dem Spielbetrieb, beide über die Darstellung des
Mitspielers – und die zweite entpuppte sich als echter Coop-Fehler.

**1. Der Partner sah wie eine zweite Kugel aus.** Der Halo bestand aus
weichem Schein PLUS einem gezeichneten Ring (`stroke`, Alpha 0,75) – und ein
harter Rand liest sich als Körper. Der Ball ist aber der einzige feste
Körper im Bild; alles Fremde soll Licht bleiben. Der Ring ist weg, geblieben
sind zwei weiche Lichtschichten (`haloLayers`, rein und deshalb testbar):
außen weit und blass, innen kompakt und etwas heller, alles unter
`BALL_CORE_ALPHA`. Der Atem ist langsamer als Ping und Ziel-Puls (420 ms
statt 250) – ein Schein, der lebt, aber nicht ruft. Am Bildrand (oder auf
einer anderen Ebene) wird er kompakter und kräftiger, sonst findet man ihn
nicht mehr. Der Geist der eigenen Bestzeit nutzt denselben Schein mit
`alphaScale` 0,45.

**2. Wer zuerst im Ziel war, hing fest.** Das sah wie ein Bug aus – und war
im Coop einer: Ein eingefrorener Ball kann dem Nachzügler keine Druckplatte
mehr HALTEN, die er nicht schon unter sich hat. Neu gilt: Ab dem Zieleinlauf
steht die **UHR**, nicht die Kugel.

- Die Uhr bleibt auf der erreichten Zeit stehen und wird grün
  (`.hud-chip.done`) – das unmissverständliche „du bist durch".
- Das eigene Ziel leuchtet ruhig weiter (`goalDone`, langsamer Puls, ohne
  Debug/Reveal): Man SIEHT, dass man drin war, auch nachdem man weggerollt
  ist.
- Der Ball rollt weiter, Gefahren und Transporter bleiben scharf. Ein Sturz
  danach kostet nichts – die Zeit ist gebucht (`localFinished` ist sticky,
  `mpLocalFinish` läuft nur einmal).
- Der Partner-Schein wechselt in die Zielfarbe, sobald er durch ist: Er
  bewegt sich UND man weiß, dass er fertig ist.

Testbar ohne Pixel zu lesen: `haloLayers` ist eine reine Funktion (6 Units
in tests/render.test.ts, u. a. „bleibt in jeder Lage schwächer als der
Ball-Glow"), und der Renderer sagt selbst, was er gezeichnet hat
(`renderer.goalLit` → `window.__tiltrMp.goalLit`). E2E-Lauf 9 prüft jetzt
den ganzen Ablauf: Uhr steht auf der Zielzeit und ist grün, das geschaffte
Ziel leuchtet weiter, A rollt nach dem Zieleinlauf weiter, B sieht den
Schein wandern und als „durch" markiert, und A verlässt seine Platte und
hält sie wieder – der Coop-Deadlock ist damit festgenagelt.

## M21 „Bildschirm bleibt wach" ✓ (v1.12.0)

Meldung aus dem Spielbetrieb: Android dunkelt nach kurzer Zeit ab und
sperrt. Kein Wunder – man steuert durch NEIGEN, für das System sieht ein
laufender Lauf also aus wie ein unbenutztes Gerät. `src/ui/wakelock.ts`
holt die Screen-Wake-Lock beim Spielstart und im Hörtest und gibt sie im
Menü zurück.

Die API hat zwei Fallen, und beide wohnen im Zustandsautomaten
(`createWakeLock` mit injizierbarem `request`, deshalb ohne Browser
testbar):

1. **Die Sperre wird im Hintergrund automatisch freigegeben** (Tab-Wechsel,
   Anruf, Sperrtaste) und muss beim Zurückkommen NEU geholt werden – sonst
   ist sie nach dem ersten Wegschauen für die restliche Sitzung weg. Daher
   der `visibilitychange`-Pfad.
2. **`request()` darf jederzeit ablehnen** (Akkusparmodus, unsichtbare
   Seite, fehlende Unterstützung). Ein Fehlschlag wird gemerkt, nicht
   gemeldet – und beim nächsten Sichtbarwerden neu versucht.

Plattform: Chromium (Android Chrome, Edge, Desktop-Chrome). iOS/Safari
bringt die API nicht mit; dort meldet `state().supported` false und es
passiert schlicht nichts. Ein Video-Loop-Hack als iOS-Ersatz ist bewusst
NICHT eingebaut (Akku, Audio-Session, Wartungslast) – wenn es dort weh tut,
ist das eine eigene Entscheidung.

Testbar: `window.__tiltrWake` legt den Zustand offen (supported/wanted/
active/attempts/error). Das Headless-Chromium der Suite bringt
`navigator.wakeLock` nicht mit, deshalb ersetzt E2E-Lauf 18 die API VOR dem
App-Start durch eine getreue Attrappe und fährt den echten Pfad:
anfordern → im Hintergrund verlieren → neu holen → im Menü hergeben, plus
den Hörtest. Acht Units auf dem Automaten.

## M20 „Hörtest" ✓ (v1.11.0, Reiz-Fix v1.11.1)

Ein eigener Modus (7. Karte im Startmenü, `src/ui/hearing.ts`), der das
Leitmedium prüft, statt es zu behaupten: Der ECHTE Echo-Ping
(`audio.echoPing`) kommt aus einer von acht Richtungen, die Antwort geht
auf eine Kompassrose (3×3-Raster, Mitte = nochmal hören). Acht Runden,
sofortiges Feedback mit der wahren Richtung.

Der Wert steckt in der Auswertung: Sie zählt nicht nur Treffer, sondern
trennt **Seiten-Achse** (links/rechts) und **Tiefen-Achse** (vorn/hinten).
Das Spatial Audio ist echtes 3D über HRTF-`PannerNode`s – links/rechts
trägt starke Ohr-Differenzen (Laufzeit + Lautstärke) und wird zuverlässig
erkannt, vorn/hinten hängt an feinen Klangfarben-Unterschieden einer
FREMDEN Ohrform und ist deshalb schwach (Front-Back-Konfusion; die
Quellen liegen zudem in der Horizontalebene, `y = 0`). Der Test macht das
messbar und erklärt es im Ergebnis – wer weiß, dass die Tiefe wackelt,
wiederholt im Spiel den Ping statt sich zu verrennen. Nebeneffekt:
Der Modus ist der Kopfhörer-Check vor der ersten Runde.

`dirVector`/`scoreRounds` sind reine, DOM-freie Funktionen (Units in
`tests/hearing.test.ts`), die Runden-Mechanik hängt über
`window.__tiltrHearing` im E2E-Lauf 17.

**Nachtrag v1.11.1 – „der Ping kommt immer aus derselben Richtung".** Der
erste Spieltest hat den Modus sofort entlarvt, und der Fehler saß nicht im
Panning (die gemessenen PannerNode-Positionen waren für alle acht
Richtungen korrekt), sondern im REIZ:

1. Das lauteste Ereignis war der Emissions-Chirp – und der ist bewusst
   UNGEPANNT (er kommt vom Ball, nicht von der Welt). Man hörte also
   zuverlässig die Mitte. Neu: `echoPing(refl, { chirpGain })`, im Test
   0,05.
2. Der gepannte Teil war ein fast reiner Ton um 1 kHz – der schlechteste
   Reiz, den man dem Ortungsgehör geben kann (Laufzeitunterschiede werden
   dort phasen-mehrdeutig, Lautstärkeunterschiede sind noch klein). Neu:
   Jede Reflexion bekommt einen breitbandigen Anschlag (Rausch-Transient,
   Band um 2,6 kHz, 50 ms) durch DENSELBEN Panner – im Test UND im Spiel,
   denn dort galt dieselbe Grenze: Wände waren kaum ortbar. Die tonale
   Signatur der Elemente (`freq`) bleibt unangetastet.
3. Der Test spielt zwei Anschläge statt einem: Einem einzelnen kurzen Reiz
   traut das Gehör nicht, beim zweiten entscheidet es sich.

Lehre für die Testsuite: Panning kann ein Automat nicht hören, die
STRUKTUR des Reizes schon. `window.__tiltrPing` legt offen, was das Ohr
bekommen hat (Chirp-Gain, Position und Breitband-Anteil jeder Reflexion);
Lauf 17 prüft das pro Runde und zählt, wie viele VERSCHIEDENE Positionen
in acht Runden vorkommen – die Sabotage-Gegenprobe meldet genau das
gemeldete Symptom („1 verschiedene Positionen in 8 Runden").

## M19 „Werkstatt-Politur" ✓ (v1.10.0)

Drei Meldungen aus dem Spielbetrieb:

- **Wandernde brüchige Wände** (Bug): Die zufällige Brüchigkeit
  (`brittleChance`) wurde im Loader durch Iteration über die WAND-LISTE
  gezogen. Schnitt man im Editor eine Wand auf, verschob sich die
  Zuordnung – die nächste Wand bekam deren Ziehung, und plötzlich war eine
  ganz andere Wand brüchig. Fix: Der Wurf ist jetzt ein Spatial Hash aus
  Seed UND Wandposition; „diese Wand ist brüchig" ist damit eine
  Eigenschaft der Wand und übersteht jede Änderung an anderen Wänden.
  Nebenwirkung: In generierten Leveln (Quick/Daily/MP) sind andere Wände
  brüchig als vorher – die Verteilung bleibt statistisch gleich.
  Zusätzlich backt „Aus Zufallslevel" die brüchigen Kanten jetzt EXPLIZIT
  in die Def ein (`generatedBrittleEdges`, `brittleChance: 0`): Im Editor
  sind sie damit normal bearbeitbar, und ein geteilter Link hängt nicht
  mehr an der Zufalls-Formel des Generators.
- **‹ im Editor** führt zurück in die Werkstatt statt ins Hauptmenü
  (neuer `onClose`-Callback).
- **Bibliothek-Karten** neu gestaltet: Kopf (Name + Meta), darunter EINE
  Aktionszeile – „▶ Spielen" und „✏️ Bearbeiten" als Text, die vier
  Sekundäraktionen (Duplizieren, Teilen, Export, Löschen) als Icon-Gruppe
  rechts mit Touch-Tooltips. Die Gruppe bricht als GANZES um, nie einzeln;
  ob umgebrochen wird, entscheidet eine CONTAINER QUERY über die
  Kartenbreite (dieselbe Karte steht auf dem Phone einspaltig und auf dem
  Desktop zweispaltig). Die zweispaltige Bibliothek beginnt erst bei
  1200 px, wo eine Karte die ganze Zeile trägt.

## M18 „Wächter sind keine Riegel" ✓ (v1.9.1)

Bugfund aus dem Spielbetrieb: **2.2 „Doppelter Boden" war nicht lösbar.**
Auf Ebene 2 patrouillierte ein Wächter im einzigen Abstieg-Korridor. An
einem Wächter kommt man in einem Ein-Zellen-Korridor NICHT vorbei
(Kollision ab 48 Einheiten Abstand, seitlich passen höchstens 23) und
überholen kann man ihn nie – man betrat die Ebene östlich von ihm, also
waren Schlüssel UND Rück-Transporter unerreichbar: kein Weg zum Ziel und
nicht einmal zurück (Softlock). Per Simulation der echten Physik über 100
Startzeitpunkte und zwei Strategien bestätigt: westlichste erreichbare
Position x=197, die Sperre beginnt bei 198.

Warum die Suite das nicht sah: Der Erreichbarkeits-Beweis kannte Wände,
Türen, Transporter und Strömungen – Wächter kamen darin nicht vor.

**Neuer Pflicht-Check `guards`** (validate.ts): Patrouillenzellen sind
kein Durchgangsgebiet, sondern werden ABSCHNITTSWEISE gequert. Modell:
Die Zellen einer Patrouille werden gesperrt und durch gerichtete Kanten
zwischen ihren Zugängen ersetzt – eine Kante existiert nur, wenn beim
Queren dieses Abschnitts mindestens eine Patrouillenzelle frei bleibt (da
hält sich der Wächter auf, während man huscht; der Ball ist rund zehnmal
schneller). Eine Patrouillenzelle selbst darf betreten werden, solange die
Patrouille länger als diese eine Zelle ist – Schlüssel dürfen also auf
einer Patrouille liegen.

Damit sind erlaubt: Quer-Passagen (rein/raus an derselben Zelle) und
Etappen über Ausweichbuchten. Verboten ist die Ende-zu-Ende-Durchquerung
ohne Zuflucht – genau der Fall von 2.2. Über alle 28 Kampagnen-Level
gemessen: nur dieses eine Level fiel durch (w1-03, w1-08, w1-10, w2-06
haben Buchten bzw. Quer-Übergänge und bleiben grün).

**Level-Fix**: In w2-02 öffnet eine zusätzliche Süd-Kante die Zelle unter
dem Wächter-Wendepunkt – Fluchtweg und Umweg in einem. Simulation: 36 von
41 Startzeitpunkten kommen durch. Der kurze Weg links am Wächter vorbei
bleibt die riskante Abkürzung, das Intro („an der Wache vorbei") stimmt
weiterhin.

## M17 „Geist-Duell" ✓ (v1.9.0) – asynchrones Rennen gegen eine echte Spur

Ein Lauf wird zur Herausforderung: Der Share-Link trägt **Level + Geist +
Zeit**. Wer ihn öffnet, spielt dasselbe Labyrinth gegen die aufgezeichnete
Spur – und **hört** den Rivalen als räumlich geortetes Rollen neben sich.
Serverlos wie alles andere; die drei Bausteine existieren bereits
(GhostRecorder, shareCodec, Hash-Empfang) und werden nur verbunden.

Leitideen:

- **Selbstenthaltend**: Das Token trägt die komplette LevelDef, nie eine
  Referenz auf eine Kampagnen-ID. Ein Duell-Link bleibt damit gültig, auch
  wenn ein Kampagnen-Level später nachgeschärft wird – sonst rennen zwei
  Leute gegen verschiedene Labyrinthe.
- **Audio first**: Der Rivale ist primär ein KLANG, keine Zahl. Hörst du
  ihn hinter dir, bist du vorn. Kein Live-Zahlen-Delta im HUD (das wäre
  ein Bildschirm-Feature in einem Blindspiel); die Zahlen kommen am Ziel.
- **Duell schreibt keine Rekorde**: eigener Modus, damit ein Duell auf
  Kampagnen-Level keine Sterne, keine Daily-Wertung und keinen lokalen
  Geist überschreibt. Der Duell-Lauf zählt nur gegen den Rivalen.
- **Plausibilität statt Vertrauen**: Ohne Server ist keine Zeit beweisbar,
  aber eine Spur muss zu ihrer Zeit passen. Der Empfänger prüft das und
  lehnt Unsinn ab (siehe „Beweis" unten).

### Datenformat

Heute speichert `ghost.ts` `[tSek, Ebene, x, y, …]` mit ~8 Hz und
Mindestabstand – für localStorage gut, für eine URL zu fett (60 s ≈ 9 KB
JSON). Für das Duell kommt eine kompakte Variante:

| Schritt | Wirkung |
|---|---|
| **Exaktes Raster** statt Mindestabstand: auf 8 Hz resamplen (`sampleGhost` kann das schon) | Zeitspalte entfällt komplett – Index = Zeit |
| **Delta-Kodierung** von x/y (Ball bewegt sich ≤ ~112 px pro Sample) | zweistellige Zahlen statt vierstelliger |
| **Ebene nur bei Wechsel** (Sentinel im Strom) | eine Spalte weniger |
| durch denselben `deflate-raw`-Pfad wie Level-Tokens | Deltas komprimieren sehr gut |

GEMESSEN (Level allein wiegt 156 Zeichen): 30 s ≈ 1,0 kB, 60 s ≈ 1,7 kB,
120 s ≈ 3,1 kB bei realistischem Kurs; ein 1,2-s-Sprint kommt auf 297
Zeichen. Die Suite hält „60 s < 2500 Zeichen" als Regressionsgrenze. Der
Zeit-only-Fallback greift damit erst ab ~4,5 Minuten Laufzeit.
Bewusst KEIN Varint/Binärformat: JSON-Deltas durch deflate liegen nah dran
und bleiben lesbar, testbar und debugbar.

Umschlag (neue Codec-Funktion, Token-Version wie gehabt als erstes Zeichen):

```
{ v: 1, def: {…LevelDef…}, duel: { time: 42.3, ghost: [Δ-Strom], by?: "Name" } }
```

Neuer Hash `#duel=TOKEN` – `#level=` bleibt unverändert, alte Links
funktionieren weiter.

### Beweis (validate.ts-Tradition)

`validateGhostRun(def, ghost, time)` prüft eine empfangene Spur, bevor sie
als Rivale antritt:

- Startpunkt ≈ Level-Start, Endpunkt ≈ Ziel (Toleranz Ballradius).
- Jeder Schritt ≤ `maxSpeed` × Δt (plus Toleranz) – niemand teleportiert.
- Länge der Spur ≈ `time` (±1 Rasterschritt).
- Ebenenwechsel nur an Transporter-Zellen.

Fällt der Test durch: Interstitial „Diese Herausforderung ist beschädigt"
statt eines unschlagbaren Phantoms. Kein Anti-Cheat (unmöglich ohne
Server), aber ein Filter gegen kaputte und alberne Tokens.

### Klang des Rivalen

Neue Audio-Quelle `setRival(closeness01, dx, dy)`: leises, tiefpass-
gefiltertes Rollen auf einem eigenen HRTF-Panner – dasselbe Rezept wie
`setGuard`/`setCurrent`, aber freundlich statt bedrohlich (kein Herzschlag-
Beitrag!). Lautstärke steigt mit Nähe, verstummt bei Ebenen-Unterschied
(gedämpft wie der Beacon im Nebel). Dazu zwei Ereignis-Töne:

- **Überholen** (du ziehst vorbei): kurzer, aufsteigender Zweiklang.
- **Überholt werden**: derselbe Zweiklang abwärts.

Fortschrittsvergleich dafür ohne Live-BFS: Beide laufen dasselbe Level, der
Geist ist eine Zeitfunktion – „vorn" = wer der Ziel-Luftlinie näher ist
(die Renderer-Beacon-Distanz existiert bereits). Grob, aber für einen
Überhol-Jingle genau richtig; die Wahrheit sagt am Ende die Uhr.

### Empfangs- und Rückspiel-Flow

1. `#duel=…` → dekodieren, `parseLevel`, `validateGhostRun`.
2. Interstitial: „🏁 Herausforderung – schlage 42,3 s" mit „Antreten" /
   „Später". (Kein „In die Werkstatt" – dafür ist `#level=` da.)
3. Lauf im Modus `{kind:'duel', time, ghost, name?}`: Geist-Halo + Rival-
   Klang, HUD wie gewohnt (Timer, Pings).
4. Ergebnis: „Gewonnen – 38,2 s gegen 42,3 s (+4,1 s)" bzw. „Verloren".
   Primär-Aktion **„⟳ Revanche schicken"**: erzeugt aus DEINEM Lauf das
   nächste Duell-Token → Ping-Pong-Loop zwischen zwei Leuten.
5. Verlieren = neuer Versuch am selben Link („⟳ Nochmal"), der Rivale
   bleibt im Speicher der Sitzung.

### Absender-Seite

„🏁 Herausfordern" erscheint in der Ergebnis-Karte JEDES geist-fähigen
Modus (Quick, Daily, Kampagne, Werkstatt-Level) – überall dort, wo schon
heute ein Geist aufgezeichnet wird. Bedingung: Lauf gewonnen und Spur
vollständig (`GhostRecorder.result() !== null`). Bei Daily bleibt der
bestehende `#daily=`-Link daneben bestehen (er ist kürzer und braucht kein
Level im Token) – das Duell ist die Variante MIT hörbarem Gegner.

Optionaler Absendername: ein Feld im Profil (leer = „Rivale"), rein
kosmetisch, nie erzwungen.

### Schnitte

| Meilenstein | Inhalt | Ergebnis |
|---|---|---|
| **M17a „Geist-Codec"** ✓ | 8-Hz-Resampling, Delta-Kodierung, `encodeDuel`/`decodeDuel`, `validateGhostRun` + 11 Units | Duelle sind transportierbar und prüfbar |
| **M17b „Duell-Modus"** ✓ | Modus + `#duel=`-Empfang, Rival-Klang, Ergebnis mit Revanche, „Herausfordern" in allen Ergebnis-Karten, Namensfeld, i18n ×4, E2E-Lauf 16 (Sprint gewinnen → Link → zweite Seite → antreten → Rivale rollt mit) | das Feature spielbar |
| **M17c (optional)** | Duell-Historie in der Werkstatt/Profil („3:1 gegen Rivale"), QR-Code für Duell-Links | Wiederkehr-Anreiz |

So entschieden (alle drei wie empfohlen umgesetzt):

1. **Kein Live-Delta im HUD** – nur Klang plus ein Überhol-Zweiklang; das
   Spiel ist blind spielbar, die Zahlen kommen am Ziel.
2. **Duell-Läufe zählen nirgends**: keine Sterne, keine Daily-Wertung, kein
   Überschreiben des eigenen Geists.
3. **Automatischer Zeit-only-Fallback**, wenn das Token die Warnschwelle
   reißt.

Nebenbei gefunden und behoben: Ein Link, der bei SCHON OFFENER App
angetippt wird, ändert nur den Hash (kein Neuladen) – der Empfang lief
gar nicht. Ein `hashchange`-Listener deckt jetzt alle Link-Arten ab
(`#duel=`, `#level=`, `#daily=`, `#join=`).

## M16 „Werkstatt-Startscreen" ✓ (v1.8.1)

Aktionen als Modus-Karten in der Design-Sprache des Startmenüs (Icon +
Titel + Untertitel) statt umbrechender Buttons; „Weiter an …" als
Empfehlungs-Karte (`.suggest`) mit Größe + Datum. Ab 900px:
Drei-Spalten-Grid (Hero über die volle Breite) und zweispaltige
Bibliothek; Empty-State zentriert. Die Zwei-Tap-Bestätigung warnt im
Karten-Untertitel (Bernstein, `.mode-sub.warn`).

## M15 „Bearbeitungs-Draft" ✓ (v1.8.0)

Die laufende Bearbeitung ist reload-fest: Der Editor schreibt bei jeder
Änderung einen Draft nach localStorage (`tiltr.workshop.draft.v1`), die
Werkstatt bietet ihn als „Weiter an „…""-Knopf an. Speichern in die
Bibliothek räumt den Draft (gesichert ist gesichert). Aktionen, die eine
vorhandene Bearbeitung ersetzen würden (Neu, Aus Zufallslevel, Bearbeiten
aus der Bibliothek), verlangen eine Zwei-Tap-Bestätigung wie das Löschen.

## M14 „Phone-Editor" ✓ (v1.7.0)

Unter 900px dominiert das SPIELFELD (>55% der Höhe statt ~31%): Die
Palette schrumpft zu einer kompakten Werkzeugleiste (Icons) plus
Element-Button; die Element-Auswahl ist ein mehrspaltiges Grid-Sheet
(statt einzeiliger Horizontal-Scroll-Leiste), die Eigenschaften liegen in
einem Bottom-Drawer mit stets sichtbarem Griff, der sich bei Element-
Auswahl automatisch öffnet. Beides sind Overlays über der Karte – sie
nehmen ihr keine Höhe weg. Desktop/Tablet (Dreispalter) unverändert.
