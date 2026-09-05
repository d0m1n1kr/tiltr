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

## M27 „Die Jukebox" ✓ (v2.4.0)

Ein Spaß-Element mit Ernst dahinter: ein Musikautomat, der im Labyrinth STEHT
und 8-Bit-Themen spielt. Anrempeln schaltet auf den nächsten Titel, im Editor
bekommt er eine Playlist. Fünf Entscheidungen tragen das Feature – die erste
ist eine Rechtsfrage, die letzte eine Physikfrage.

### Die Rechte-Frage zuerst, weil sie den Inhalt bestimmt

An einem Musikstück hängen ZWEI getrennte Rechte, und eine 8-Bit-Fassung löst
nur das falsche:

| Ebene | Was geschützt ist | Löst 8-Bit das? |
|---|---|---|
| Aufnahme | Tonträgerhersteller + Interpreten (§§ 85, 77 UrhG) | **Ja** – wir benutzen keine Aufnahme, wir erzeugen eigene Töne. |
| Komposition | Melodie/Werk, 70 Jahre nach Tod des Komponisten | **Nein** – vollkommen unberührt. |

Die Chiptune-Fassung ist eine BEARBEITUNG (§ 23 UrhG) und macht es damit eher
schlechter: Zum Nutzungsrecht am Werk käme das Bearbeitungsrecht. Zwei
Hoffnungen tragen nicht: „Freie Benutzung" (§ 24 alt) gibt es seit 2021 nicht
mehr, und § 51a („Pastiche") verlangt eine künstlerische AUSEINANDERSETZUNG –
ein Titel, der läuft, weil er gut klingt, ist Nutzung. Eine GEMA-Lizenz hilft
auch nicht: Für die Verbindung von Musik mit Bild liegt das Recht beim Verlag.
Dazu die asymmetrische Risikorechnung: tiltr liegt auf GitHub Pages unter
einem persönlichen Account, eine DMCA-Notice geht an GitHub – ein
Spaß-Element gegen das ganze Projekt ist ein schlechter Tausch.

**Die Regel für `src/music/` ist deshalb eine Zahl: Komponist vor 1956
gestorben ⇒ frei** (70 Jahre p. m. a., ab Jahresende; Stand 2026), oder eigene
Komposition. Sie steht als README IM Ordner, damit sie am Ort der
Entscheidung liegt. Ausgeliefert werden zwölf Titel: fünf Originale
(tiltr-Theme, Aufzugmusik, Wächter-Tango, Galopp, Fünfviertel) und sieben
gemeinfreie, alle an einer Quelle belegt (Bach – Toccata d-Moll, Mozart –
Kleine Nachtmusik, Beethoven – Für Elise und Ode an die Freude, Grieg – In der
Halle des Bergkönigs, Joplin – The Entertainer, Holst – Thaxted).

### Die Töne kommen aus einer QUELLE (Nachtrag v2.4.1)

Die erste Fassung war aus dem Gedächtnis geschrieben. Auf die Frage, ob es
dafür keine freien Datenbanken gebe, kam die unangenehme Antwort: Es gibt
sie, und drei von acht Klassikern hatten falsche Töne. Belegt am
**Mutopia Project** (LilyPond + MIDI, jedes Stück mit ausgewiesenem
Rechtestatus) und übersetzt mit dem neuen `tools/score2tiltr.py` (music21):

- **Bergkönig**: ab Takt 2 falsch. Echt ist `f cis f | e c e`
  (chromatischer Seitenschritt – daher das Unheimliche), nicht die
  Wiederholung von Takt 1; die zweite Hälfte steht eine QUINTE höher in fis
  mit erhöhter Sekunde ais, nicht in D. Tempo 138 statt 116 („Alla marcia
  molto marcato" der Quelle).
- **Kleine Nachtmusik**: Tonfolge stimmte, RHYTHMUS nicht – der Anfang ist
  punktiert (Viertel plus Achtel), in geraden Achteln klingt er wie eine
  Tonleiterübung. Und die Antwortphrase geht über D7 hinauf (c–a–c–a–c–a–fis–a),
  nicht hinunter.
- **Ode an die Freude**: war die vereinfachte Schulbuch-Form in C-Dur. Echt
  ist G-Dur mit `d–c–a–h` im vierten Takt und der Kadenz `a–fis–g` – genau
  die zwei Stellen, an denen man das Stück wiedererkennt.
- **Für Elise** und **The Entertainer**: Tonfolgen waren richtig, die
  Punktierungen und die Sechzehntel-Auftakte nicht. Jetzt aus der Quelle.
- **Wilhelm-Tell-Galopp**: keine freie maschinenlesbare Quelle auffindbar
  (Mutopia hat von Rossini nur „Eduardo e Cristina", IMSLP nur Scans). Das
  Stück heißt deshalb jetzt „Galopp" und ist als Original ausgewiesen – ein
  Werk unter dem Namen seines Komponisten auszuliefern und die Melodie dabei
  zu erfinden, ist keine Bearbeitung, sondern ein Fehler.
- **Toccata**: an der Quelle gegengeprüft, unverändert. Die Verzierung liegt
  im Quell-MIDI als Akkord auf EINEM Zeitpunkt, ließ sich also nicht
  automatisch übernehmen – die Tonfolge ist belegt, die Zeile von Hand.
- **Mars** (Holst): keine freie Quelle, und die Akkordstöße über dem Ostinato
  waren ohnehin erfunden. Heißt jetzt „Fünfviertel" und ist als Original
  ausgewiesen. Holst ist trotzdem im Ordner – mit **„Thaxted"** (1921, der
  Hymnensatz aus dem Mittelteil von „Jupiter"), belegt am Mutopia Project und
  mit seinen echten Tönen. Der ruhige Titel der Jukebox, und ein
  Nebengewinn: Wo alles andere treibt, atmet dieser breit.

Und weil die Lehre nicht in einem Kommentar versauern soll, prüft
`tests/music.test.ts` sie jetzt MECHANISCH: Jede Titeldatei muss entweder
„(Original)" im Kopf tragen oder eine QUELLE nennen, und zwar eine der
bekannten Datenbanken. Ein Werk unter dem Namen seines Komponisten
auszuliefern und die Melodie dabei zu erfinden, kann damit nicht mehr
unauffällig passieren. Der E2E-Lauf hängt außerdem nicht mehr an
Klassiker-Titeln (die dürfen sich durch eine Quelle ändern), sondern an
Originalen – und seine Zusicherung zur Abspielfolge prüft jetzt zusätzlich,
dass die Ziffern in Listenreihenfolge NICHT aufsteigen: Sonst wäre sie auch
erfüllt, wenn der Editor bloß durchnummeriert (im Sabotage-Lauf rot gesehen).

### Entscheidung 1: Die Songs sind DATEN, keine Audiodateien

Ein Titel ist eine Notenzeile (`src/music/<id>.ts`), die der bestehende
WebAudio-Graph mit 8-Bit-Stimmen spielt. Gründe:

- **Die PWA cacht ALLES vor** (Workbox precache). Ein Dutzend mp3-Titel wären
  Megabytes im Offline-Install; die elf Notenfolgen sind **10 KiB Quelltext**
  (mit Kopfkommentaren). Der Precache wuchs mit dem ganzen Feature von 626 auf
  662 KiB – Maschine, Element, Editor-Feld und Übersetzungen eingerechnet.
- Es IST 8-Bit-Musik – nicht die Aufnahme davon.
- Rein und deterministisch ⇒ testbar ohne Browser.

Notenschrift (`src/audio/chiptune.ts`): `e4:8 g4 a4 b4:4 r:2 c5:2.` – Ton plus
Notenwert-Nenner, Punkt verlängert. Die Länge ist **KLEBRIG**: Fehlt sie, gilt
die zuletzt genannte. So schreibt man Musik auf, und die Datenzeilen bleiben
kurz. Dazu `TrackDef.repeat`, weil eine Schlagwerk-Stimme sonst ihren Takt so
oft ausschreiben müsste, wie der Titel Takte hat (Textwand statt Datei).

Der LOOP wohnt in `notesAt(tune, von, bis)`, nicht im Scheduler: Die Funktion
liefert die Noten eines Fensters auf der UNENDLICHEN Zeitachse, mit absoluten
Startzeiten über die Titelgrenze hinweg. Der Aufrufer merkt sich nur, bis
wohin er geplant hat – ein Zustand, keine Fallunterscheidung.

### Entscheidung 2: Die Musik kommt AUS der Jukebox (räumlich)

Derselbe HRTF-Pfad wie Wächter, Portal und Strömung: Panning nach Richtung,
Lautstärke nach Entfernung (quadratisch, Deckel 0,5). Damit ist sie keine
Hintergrundmusik, sondern ein **akustisches Wahrzeichen** – man kann sich an
ihr orientieren. Und weil es EINEN Musik-Bus gibt, klingt immer nur der
NÄCHSTE Automat; zwei gleichzeitig wären Krach ohne Richtung. Dasselbe Muster
wie beim Loch-Grollen und beim Wächter: Es klingt, was zählt.

Geplant wird in der AUDIO-Uhr (`ctx.currentTime`), nicht in
`performance.now()` – die beiden driften, und nach Wanduhr gesetzte Noten
eiern hörbar. Lookahead: 250 ms (überbrückt jeden Frame-Ruckler, hält den
Titelwechsel aber straff, weil er das Eingeplante wegwirft).

### Entscheidung 3: Musik ist in DIESEM Spiel Störung – und genau das ist der Witz

tiltr navigiert über Klang. Musik verdeckt die Hinweise. Das ist kein Fehler,
sondern die Pointe: Der Jukebox-Raum ist schwer, WEIL man die Wände nicht
hört. Zwei Regler halten es fair:

- **Ducking (Sidechain):** Der Echo-Ping drückt den Musik-Bus auf 0,25
  (≈ -12 dB), hält 500 ms und lässt ihn über 400 ms zurückkommen. `musicDuck`
  und `musicVol` sind zwei GETRENNTE Gains – sonst überschrieben sich
  Ping-Rampe und nachgeführte Entfernung gegenseitig.
- **Entfernung:** Es ist ein lokales Problem, kein globales.

Und der Rempler bekommt eine zweite Bedeutung: Anrempeln ist, wie man mit dem
Krach umgeht.

### Entscheidung 4: Der Rempler fällt aus der bestehenden Physik heraus

Die Jukebox ist ein massiver Kasten aus dem vorhandenen Wand-Mechanismus
(`Wall.jukebox` = Index in `world.jukeboxes`). Kollision, Echo-Aufleuchten und
Treffer-Klang sind damit GRATIS; die Spielschleife liest `hit.wall.jukebox`
und schaltet weiter (entprellt, und erst ab Anschlagstärke 0,1 – ein
Streifschuss soll nicht durchschalten).

**Die Folge gehört ins Beweismodell, und zwar stärker als geplant.** Bei
CELL=100 und Ball-Durchmesser 44 bleiben neben dem Kasten (Einzug 12)
sieben Einheiten Luft – die Zelle ist DICHT. Das ist keine Gefahr, die man
umgehen könnte, sondern eine Wand. Deshalb gilt eine Jukebox-Zelle in JEDEM
Erreichbarkeits-Modell als gesperrt (nicht nur konservativ wie Glas und
Anker über `hazardsBlocked`) – auch im Zeitschloss-Beweis
(`directedDistances`). Ein Automat auf dem einzigen Weg macht damit
zwangsläufig das `goal`-Badge rot, wie es die Wahrheit ist.

Der zusätzliche `jukebox`-Check sagt, WARUM – fünf Klassen, die `goal` nicht
benennen könnte: steht auf Start oder Ziel · versiegelt den Pflichtweg (Ziel
ohne ihn erreichbar, mit ihm nicht; der Schuldige wird einzeln gesucht) · ist
von keiner erreichbaren Zelle anrempelbar (ein Automat, den man nicht treffen
kann, ist stumme Deko) · liegt auf einer Wächter-Patrouille (der Wächter liefe
durch das Möbel) · nennt einen Titel, den es nicht gibt. Es bleibt der ERSTE
Grund stehen, nicht der letzte: Ein Automat auf dem Ziel versiegelt
zwangsläufig auch den Pflichtweg – dann ist „Ziel" die Ursache und „im
Pflichtweg" nur die Folge.

### Entscheidung 5: Geschützte Titel gehören ins LEVEL, nicht ins Repo

Ein Playlist-Eintrag hat zwei Formen: eine Registry-ID aus `src/music/` ODER
ein im Level-Def EINGEBETTETER Titel. Ausgeliefert und vorgecacht wird nur
der sichere Satz; wer sein eigenes Thema will, trägt es in SEIN Level ein –
es reist im `#level=`-Token und landet nie in diesem Repo. Ein eingebetteter
Titel geht durch dasselbe zod-Schema, und dessen `refine` ruft den PARSER:
Ein Tippfehler im Ton knallt beim Laden, nicht als Stille im Level.

### Editor

Neuer Feldtyp „Mehrfachauswahl": Häkchenliste über die mitgelieferten Titel,
▶ pro Titel zum Vorhören (über denselben Musik-Bus wie im Spiel, eine Quelle:
`previewTune`), plus die im Level eingebetteten Titel als Zeilen mit dem
Vermerk „im Level". Die Ziffer vor dem Titel ist die ABSPIELFOLGE (Reihenfolge
des Anhakens), nicht die Listenposition – sonst wäre die Reihenfolge, die das
Format trägt, unsichtbar. Die Schema-Grenzen (min. 1, max. 8) fängt der Editor
ab, statt das Level bis zum Wiederanhaken unladbar zu machen.

### Tests

`tests/chiptune.test.ts` (24 Units) nagelt die Notenschrift und das
Scheduler-Fenster fest: klebrige Länge, punktierte Werte, Pausen verbrauchen
Zeit, `repeat`, Fensterränder (links inklusiv, rechts exklusiv), der
Loop-Übergang mit absoluten Zeiten, `loop:false`.
`tests/music.test.ts` (61) prüft den INHALT des Ordners – und die wichtigste
Invariante ist eine, die man in der Datei nicht sieht: **alle Stimmen eines
Titels müssen gleich lang sein**, sonst wird es hinten dünn oder es klafft ein
stummes Loch vor dem Loop (die Toccata hatte genau das: Pedal 29 Beats,
Melodie 26).
`tests/jukebox.test.ts` (16) deckt Geometrie und Beweismodell ab. Die
Gegenprobe zeigte, warum die Geometrie-Zusicherung die wichtigere ist: Mit
Einzug 46 blockiert der Kasten einen MITTIGEN Anlauf weiterhin – erst der
Sweep über sieben Versätze quer durch die Zelle findet den Schleichweg am
Rand. Drei Sabotagen einzeln rot gesehen (Einzug 46, Jukebox aus dem
`blocked`-Set, `directedDistances` ohne das Möbel).

E2E-Lauf 21 fährt den Automaten im Spiel: Er spielt von selbst, die
Lautstärke steigt mit der Nähe, der Ping duckt und lässt zurückkommen, ein
Rempler schaltet den Titel weiter (mit Plattenkratzer und Titelname im
Status), der zweite läuft im Kreis – und über den ganzen Rempel-Vorgang kommt
der Ball nie über die Kastenoberkante. Lauf 21b prüft den Editor: Badge rot
bei einem Möbel im Pflichtweg, Teilen gesperrt, die Playlist-Liste mit
Abspielfolge, ▶ und die Sperre gegen das Abwählen des letzten Titels.

### Nachtrag v2.5.0: Automaten in Zufalls- und Kampagnenleveln

Zwei Fragen nach dem Release: Kommen Automaten auch in Zufallslevel? (Nein –
noch nicht.) Und könnten nicht auch bestehende Level welche bekommen?

**Zufall (Schnelles Spiel, Tages-Challenge).** Ein Automat ist eine WAND und
braucht deshalb einen strengeren Filter als Anker und Glas: Was hinter ihm
liegt, liegt für immer dahinter. Geschützt sind darum nicht nur das Rückgrat
der Ebene, sondern die Wege zu ALLEM, was erreichbar bleiben muss – Gems,
Kristalle, Transporter und Wächter-Patrouillen. Im perfekten Maze ist das ein
vollständiger Beweis: Der Grundriss ist ein BAUM, eine gesperrte Zelle nimmt
genau ihren eigenen Ast, und in dem liegt dann nichts Gebrauchtes.
Vorkommen: Schnelles Spiel 0/1/1 (leicht bleibt pur), Daily an vier von
sieben Wochentagen. In 60 Seeds × 3 Presets = 180 Leveln kein einziger
Beweis rot.

**Höchstens EINER pro Ebene**, und das ist keine Sparsamkeit: Es gibt einen
Musik-Bus, es klingt immer nur der nächste Automat. Zwei auf einer Ebene sind
also nicht doppelt so viel Musik, sondern nur doppelt so viel Fehlerquelle –
was die Testsuite in drei Anläufen vorgeführt hat. Erst mauerte ein Automat
den Zugang zu einer WÄCHTER-PATROUILLE zu (die Patrouillenzellen selbst waren
gesperrt, ihr Zuweg nicht). Dann, nach „Zuweg schützen", landete der zweite
Automat IM Ast, den der erste abgeschnitten hatte. Dann, nach `floodMaze`,
stand der zweite auf der Zugangszelle des ersten. Jeder Anlauf war ein
Sonderfall mehr – die Regel „einer pro Ebene" beseitigt die ganze Klasse.
Nebenprodukt: `floodMaze` in core/maze.ts (Erreichbarkeit mit gesperrten
Zellen, rein und deterministisch).

**Kampagne: vier Level, thematisch ausgesucht.** Nicht per Zufall verstreut,
sondern dort, wo ein Musikautomat etwas BEDEUTET – und nie im Tutorial oder
in Welt 1 (die lehren einzelne Elemente, Musik verdeckt genau die Hinweise)
und nie in Welt 4 „Die Stille" (dort ist Zuhören das Thema; ein Krachmacher
kämpft gegen das Leveldesign, statt es zu ergänzen):

| Level | Warum | Playlist |
|---|---|---|
| w2-05 „Kathedrale" | eine Kathedrale mit Musikautomat | Toccata + Thaxted (Orgel und Hymne) |
| w2-06 „Die Weite" | im weiten Feld ist er ein WAHRZEICHEN – das beste Argument für das Element | Thaxted + Kleine Nachtmusik |
| w3-05 „Uhrwerk" | mechanischer geht Musik nicht | The Entertainer + Galopp |
| w3-06 „Taktstraße" | das Finale der Rhythmus-Welt bekommt einen, der selbst den Takt hält | Fünfviertel + Bergkönig |

Die Plätze sind nicht geraten: Ein Skript hat für jedes Kampagnen-Level ALLE
Zellen durchprobiert und mit `validateLevel` gefiltert (jedes Level hat
zwischen 7 und 165 gültige Plätze). Ausgewählt wurden Sackgassen mit Abstand
zu Start und Ziel. `tests/campaign.test.ts` fährt jetzt den GANZEN Prüfbericht
über jedes Kampagnen-Level – wer einen Automaten verschiebt, sieht sofort, ob
er einen Pflichtweg, eine Patrouille oder ein Gem zumauert (Gegenprobe rot
gesehen).

Eine Falle dabei: Die Elementlisten von w1-09 und w3-05 enden identisch, der
erste Einfüge-Anker traf also das falsche Level – und der Automat validierte
dort zufällig grün. Gefunden hat es die Zusicherung, dass GENAU diese vier
Level einen haben.

## Geplant: Coop-Ausbau M88–M91

Vier Milestones, in dieser Reihenfolge – jeder ein eigenes Release mit grüner
Suite. Reihenfolge nach Fundament: Solange der Partner akustisch nicht
existiert, ist jedes weitere Coop-Element eine Aufgabe, die man sich per
Sprachkanal zuruft, und nicht Teil des Spiels. ALLE VIER SIND GEBAUT
(v3.22.0/v3.23.0/v3.24.0/v3.25.0, eigene Abschnitte weiter unten).

AUSGANGSBEFUND (gemessen im Code, nicht erinnert): Das Protokoll kennt
`setup`, `ready`, `state` (Position, alle 80 ms), `plate`, `key`, `switch`,
`bell`, `boulder`, `finish`, `rematch`. In `src/audio/` gibt es KEINE Stimme
für den Partner – `setRival` (stetiges Rollen, gepannt, `muffled` für eine
andere Ebene) läuft nur im DUELL. Und Coop gewinnt, wenn beide IRGENDWANN
fertig sind (`mpCheckResult`: `localFinished && remote.finished`).

GEMEINSAMES FUNDAMENT für alle vier: Neue Felder in `state` sind additiv, eine
alte Gegenstelle ignoriert sie – das ist bei Klang und Ton harmlos, bei einer
SIEGBEDINGUNG nicht. Deshalb bekommt `setup` ein Feld `needs: string[]`
(Merkmalsschlüssel, nicht Versionsnummern): Der Gast prüft, ob er alle kennt,
und sagt sonst in der Lobby „Der Partner braucht eine neuere Version"
(`mp.needsUpdate`) statt still anders zu spielen. Ein unbekanntes ELEMENT
fängt schon heute `parseLevel` im `setup`-Empfang ab (→ `mp.badLevel`); die
Lücke sind nur die Regel-Flags.

### M90 „Gemeinsam ankommen" ✓ (v3.24.0) – gebaut, eigener Abschnitt unten

### M91 „Duett" ✓ (v3.25.0) – gebaut, eigener Abschnitt unten

DANACH (nicht Teil dieser vier): ein Coop-Kapitel als Bundle, das die vier
Bausteine lehrt – erst Hören (M88), dann Markieren (M89), dann Ankommen (M90),
dann das Duett (M91). Und die zurückgestellten Ideen mit ihrem Grund: „Fremde
Ohren" (Partner-Ping) wäre fast gratis, „Fracht" (Stein ins Frachtfeld)
braucht einen Zustands-BFS wie die Steine, „Schleuse" (nie beide Tore offen)
bricht die Monotonie des Fixpunkts (M68/M78/M82) und gehört damit ebenfalls in
BFS-Land. Ein Seil zwischen den Bällen bleibt draußen: jeder Spieler hat seine
EIGENE Welt, oft auf einer anderen Ebene, und Wände sind nicht synchronisiert
(M68) – eine gemeinsame Zwangskraft bräuchte eine Autorität und wäre bei 80 ms
Latenz gummiartig.

## M100 „Die Spur kachelt" ✓ (v3.35.0)

Gemeldet in einem Satz: „Der nachleuchtende Boden sieht noch nicht so gut aus.
Es sind jetzt eher nicht verbundene unscharfe Punkte." Stimmt, und der Grund
steckte in der Begründung von M94b: Ein gefülltes Rechteck sah nach BODENBELAG
aus, also wurde je Zelle ein auslaufender Fleck gemalt. Ein Verlauf fällt aber
zwischen zwei Zellmitten auf NULL – nebeneinander ergibt das eine Perlenkette,
keine Spur.

Zellen KACHELN dagegen lückenlos: Eine gefüllte Zelle grenzt exakt an die
nächste, und damit ist die Spur von selbst zusammenhängend – ohne dass irgendwo
ein Pfad, eine Punktliste oder eine zweite Datenquelle nötig wäre. Das MODELL
(die Ladung je Zelle, M94/M94b) bleibt vollständig unberührt; geändert hat sich
nur, WIE gezeichnet wird.

Zahlen und Kniffe: `FLOOR_GLOW_ALPHA` fällt von 0,16 auf 0,1 – die alte Zahl
war das SPITZEN-Alpha eines Verlaufs (im Mittel etwa 0,1), eine Fläche mit 0,16
wäre fast doppelt so präsent gewesen. Gebündelt wird wie bei den Wänden nach
Alpha-Stufe (1 %): EIN Pfad je Stufe statt eines Zeichenbefehls je Zelle, denn
die M94b-Lektion („Zeichenarbeit je Objekt und Bild ist in der CI teuer") gilt
weiter; das vorgezeichnete Fleck-Sprite entfällt damit ganz. Innerhalb einer
Stufe gibt es keine Nähte, und zwischen zwei Stufen tilgt ein halber
Gerätepixel Überstand die Haarlinie, die das Kantenglätten sonst stehen ließe.

Die Regel zum Mitnehmen: Was eine LINIE erzählen soll, darf zwischen seinen
Stützstellen nicht auf null gehen – entweder es überlappt, oder es kachelt.

## M99 „Ein Öffner, mehrere Türen" ✓ (v3.34.0)

Gefragt in einem Satz: „wäre es möglich, dass eine Platte mit mehreren Türen
verknüpft ist?" Zwei Türen mit DERSELBEN ID gingen schon immer (sie sind dann
eine Tür an zwei Stellen und schalten gemeinsam) – gewünscht war das andere:
unabhängige Türen, und deshalb `opens` als LISTE.

EINE FORM IM MODELL, ZWEI AN DER SCHNITTSTELLE: `opensField` nimmt eine ID oder
eine Liste und liefert nach dem Parsen IMMER eine Liste. Dadurch iterieren alle
Verbraucher (`collectOpeners`, `coopReachable`, `pairReachable`, `boulderProof`,
`links`, `timer`) über EINE Form, statt an zwanzig Stellen zwei Fälle zu kennen.
Als `preprocess`, nicht als `union`: Bei einer Union meldet zod für ein
fehlendes `opens` nur „Invalid input", und der Ladefehler-Text des Editors (M61)
wäre wieder Kauderwelsch.

KOMPATIBILITÄT LIEGT IN DER SCHREIBWEISE, nicht in einer Migration: Der Editor
schreibt weiter einen STRING, solange ein Öffner genau eine Tür nennt
(`setOpens`). Ein Level, das das neue Mittel nicht braucht, bleibt damit Byte
für Byte wie vorher – Teilen-Token, Exporte und Bundles bleiben mit älteren
Fassungen lesbar. Erst eine echte Liste verlangt 3.34; im Netz meldet das
Merkmals-Gate das (`needsFor(…, multiOpens)`), statt den Gast mit einem rohen
Ladefehler stehen zu lassen.

DIE SOLO-REGEL HÄNGT AN DER TÜR (M95/M96 im neuen Licht): Ob eine Platte zählt,
entscheidet „bleibt offen" – eine Eigenschaft der TÜR. Nennt eine Platte zwei
Türen, kann sie für die eine zählen und für die andere tot sein. Genau so
rechnet `coopReachable` jetzt, und die Gegenprobe steht in
tests/multiOpens.test.ts.

DER EIGENTLICHE FUND: EINE SCHLÜSSEL-TÜR FÄLLT NICHT HINTER DIR ZU. Der
Softlock-Beweis führte reine Schlüssel-Türen so, als stünden sie wieder zu –
dabei macht `doorState` sie `permanent`, und das Spiel verwandelt sie in
Schutt. Bemerkt hat es niemand, weil die gewöhnliche Progression (Schlüssel 1 →
Tür 1 → Schlüssel 2 → Tür 2) den Fall nie erzeugt: Der Schlüssel für die
nächste Tür liegt immer HINTER der vorigen. Erst ein Schlüssel, der eine
SPÄTERE Tür mit aufschließt, stellte die Frage „wie kommst du von hinter Tür a
an den Schlüssel für b?" – den man längst in der Hand hatte. `latchIds` führt
deshalb neben den latchenden auch die reinen Schlüssel-Türen; dieselbe Regel
wie M78, nur für Schutt. Ein Test, der die alte Modell-Lücke als Wahrheit
festhielt (tests/brittleTorch: „Tür tor2 fällt hinter dir zu" mit einem
Schlüssel), bekam dafür einen Zeitschalter – eine Tür, die wirklich zufällt.

Editor: Aus dem Auswahlfeld „Öffnet Tür" wird die Chip-Zeile „Öffnet Türen"
(`#edOpensRow`, umbrechend wie die Chip-Zeilen im Menü) – ein `select multiple`
ist auf dem Phone unbedienbar, und Chips zeigen den Zustand, ohne dass man
aufklappen muss. Das 🔗 ERSETZT weiterhin: „diese Tür" heißt diese Tür, ein Tap
der heimlich dazuhängt wäre eine zweite Geste am selben Knopf. Die letzte Tür
lässt sich nicht abwählen (ohne `opens` parst die Def nicht, M60). Beim Löschen
einer Tür fällt sie aus den Listen; verwaist ist nur, wer danach gar keine mehr
hat.

## M98 „Der Startblick" ✓ (v3.33.0)

Gemeldet in einem Satz: „Im First Person soll die Startrichtung nicht nach
Norden, sondern Richtung einer Öffnung sein. Es ist nicht so schön, wenn man
direkt gegen eine Wand fährt." Stimmt – `fpInitial()` setzte Heading 0, und
das war eine Weltrichtung, keine Aussage über den Raum.

`startHeading(walls, x, y)` in core/fp.ts ist die Antwort, rein und mit Units:
Unter den vier Himmelsrichtungen gewinnt die mit der meisten Luft, gemessen
über `freeAhead` (Abtastung mit 10 Einheiten – der Aufruf passiert EINMAL je
Levelstart, ein analytischer Schnitt wäre Aufwand ohne Gewinn).

DIE REICHWEITE IST DAS DESIGN: `FP_LOOK` = zwei Zellen, nicht mehr. Zwei
Zellen trennen „Wand im Gesicht" von „hier kann ich rollen"; alles darüber
würde etwas über das LABYRINTH verraten, und in einem Spiel, dessen Thema die
Blindheit ist, wäre das ein Verrat – erst recht eine Wahl „Richtung Ziel".
Gleichstand behält Norden (strikt größer gewinnt), ganz eingemauert fällt es
auf Norden zurück: Wo die alte Regel gut war, ändert sich nichts.

Gewählt wird in `launch`, und `audio.setHeading` bekommt denselben Wert – der
Hörer darf nicht eine Viertelsekunde lang woanders stehen als die Kamera. Beim
RESPAWN bleibt der Blick unverändert: Wer fällt, wird nicht neu ausgerichtet;
das wäre eine zweite Desorientierung obendrauf.

## M97 „Der Stimmton als Lehrlevel" ✓ (v3.32.0)

M96 gab dem Resonanzfeld einen Vorgabe-Ton, aber kein eingebautes Level nutzte
ihn – eine Mechanik, die nur im Editor existiert, hat kein Publikum. w5-08
„Der Stimmton" ist die Kette in Reinform: ein Feld mit Vorgabe (Oktave), eine
Tür mit „bleibt offen", ein Gem abseits, sonst nichts im Weg.

DIE FACKEL KOMMT MIT, und nicht aus Laune: Ein Resonanzfeld ist STUMM, bis man
daraufrollt – im Dunkeln also nicht zu finden. `bright` hätte das Level
verschenkt, `dusk` hilft nicht (es blendet 2 s nach der ersten Wandberührung
aus, und in einem Ein-Zellen-Gang berührt man sofort). Die Fackel (M66) ist
Licht und nur Licht, genau dort, wo das Feld liegt. Sie hatte bis 3.31 KEIN
eingebautes Level; jetzt erklären sich die beiden Merkmale gegenseitig, und
`firstAppearances` nennt für w5-08 genau diese zwei.

Reihenfolge: Das Level steht im Array VOR dem Finale w5-07 „Dämmerung" – die
Array-Ordnung ist die Spielreihenfolge, die ID ist ein Schlüssel (dieselbe
Regel wie im Coop-Kapitel, M93). Nach dem Finale zu lehren wäre sinnlos, und
eine ID umzunummerieren kostet Fortschritt.

ZWEI FALLEN BEIM BAUEN, beide festgeschrieben:
1. Der Stichgang zum Feld muss eine SACKGASSE sein. Ohne die vier `add`-Wände
   würfelt der Seed vom Gem hinab in Reihe 4 und von dort UNTER der Tür
   hindurch ans Ziel – die Tür wäre Zierde, alle Badges grün.
2. Wer eine Def für eine Gegenprobe umbaut, nimmt `mirror` MIT. Die
   Koordinaten sind schon gespiegelt, das Seed-RAUSCHEN spiegelt
   `buildFloorCells` erst anhand dieses Feldes. Die erste Fassung der Probe
   „ohne ‚bleibt offen‘ ist es unlösbar" war grün, weil sie ein ANDERES
   Labyrinth prüfte.

## M96 „Der Stimmton" ✓ (v3.31.0)

Gefragt in einem Satz: „Und was ist mit Resonanz? Hier könnte der Computer ja
eine Tonhöhe vorgeben, oder?" Genau das – und es passt auf die Regel von M95:
Ein Resonanzfeld (M91) ist allein nicht zu halten, weil der GEGENTON fehlt.
Gibt ihn das FELD vor, stimmt man dagegen, und ein Duett-Tor wird zum
Solo-Rätsel.

`plate.pitch` (Cent über dem Grundton, 0…1200 wie `pitchFromTilt`) ist das
ganze Feature. `duetFrame` nimmt ihn als `theirs`, wenn das Feld unter der
Kugel einen trägt – er GEWINNT gegen den Partner-Ton, denn wer eine Vorgabe
baut, meint sie. Sein Klang kommt aus dem Feld, auf dem ich STEHE (also
ungepannt): Es gibt keinen Partner, der ihn im Raum tragen könnte. Und die
Statuszeile bekommt eine fünfte Stufe (`st.tuneGiven`) – „warte auf den
Partner" wäre hier eine Lüge.

ZWEI SCHEMA-INVARIANTEN, beide aus derselben Regel („ein Level darf kein
Versprechen geben, das es nicht hält", wie die Tür für einen Spieler in M72):
`pitch` gibt es nur MIT `tune`, und bei einer QUINTE muss `pitch ± 702` in der
Skala liegen (also ≤ 498 oder ≥ 702) – sonst gäbe es keine Neigung, die das Tor
öffnet. Der Editor bietet deshalb drei GENANNTE Töne an (Grundton, Quinte,
Oktave), keine freie Zahl: Jeder davon geht mit beiden Intervallen auf.

Der BEWEIS erbt die M95-Regel, statt sie zu umgehen: Ein Feld mit Vorgabe ist
allein stimmbar, aber man steht dabei selbst darauf – also zählt es nur, wenn
die Tür „bleibt offen" hat. OHNE Vorgabe ist es auch dann tot (kein Gegenton),
und ein STEIN hilft nie, denn er kann nicht neigen (`stonePlates` lässt Felder
seit M91 aus). Drei Fälle, eine Zeile in `coopReachable`, Gegenproben in
tests/soloPlate.test.ts.

EINE REGEL MIT NUR EINER HÄLFTE (der eigentliche Fund dieses Milestones): Die
E2E zu M96 fiel an einer Stelle, die nichts mit M96 zu tun hatte – die Tür ging
nicht auf, obwohl das Duett stand. Grund: `pl.held` setzte bis 3.30 NUR der
Multiplayer (`mpFrame`/`mpTestFrame`). Im Solo stand man auf einer Platte, und
nichts geschah. M95 hatte also das MODELL geöffnet und das SPIEL vergessen; die
Units waren grün, weil sie den Beweis prüfen, nicht die Schleife.
`soloPlateFrame` ist die zweite Hälfte (dieselbe `heldIds`-Regel,
`updateDoors` nur bei einer ÄNDERUNG – es läuft über alle Wände aller Ebenen,
und je Bild kostet das ohne Not, Lektion aus M94b). Daraus die Regel: Wer eine
Modell-Regel LOCKERT, sucht die Stelle, die sie im Spiel ausführt – und
schreibt den E2E-Lauf, der beide Hälften zusammen fährt.

E2E Lauf 51 fährt genau das in EINEM Fixture: Feld mit Vorgabe-Ton (Oktave) auf
dem Start, Tür mit „bleibt offen" dahinter, und auf dem Weg noch eine
GEWÖHNLICHE Platte mit eigener latchender Tür – beide Hälften von M95/M96 in
einem Lauf, ohne einen zweiten zu kosten.

## M95 „Die Druckplatte darf allein" ✓ (v3.30.0)

Gemeldet in einem Satz: „Druckplatten kann es auch im Solo geben. Zusammen mit
Steinen ist das lösbar." Stimmt – und die Palette versteckte sie dort trotzdem,
mit einer Begründung, die nur halb wahr war (M57: „solo hielte sie niemand").
Niemand HÄLT sie, aber es gibt zwei Wege, sie trotzdem zu nutzen:

- ein ROLLSTEIN, den man daraufschiebt – er hält sie dauerhaft
  (`plate.boulder`, seit M47), und
- eine Tür mit „bleibt offen" (`door.latch`, M76) – sie rastet ein, sobald man
  einmal über die Platte rollt.

Was NICHT geht, ist selbst darauf stehen und gleichzeitig durch die Tür rollen.
Das ist dieselbe Regel wie M74 („wer hält die Platte"), nur ohne Partner – und
genau die fehlte im Modell: `coopReachable` zählte im Solo JEDE erreichbare
Platte als Öffner, ein Level mit Platte war also GRÜN und unspielbar. Deshalb
die Notbremse in der Palette; jetzt fällt die Notbremse weg und die Regel steht
im Beweis.

UNERFÜLLBAR, NICHT ABWESEND: Eine Solo-Platte ohne Stein und ohne „bleibt
offen" fällt nicht aus der Öffner-Liste, sie wird als unerfüllbar geführt.
Sonst hätte eine 'all'-Tür aus Schlüssel UND Platte plötzlich nur noch eine
Bedingung – und ginge mit dem Schlüssel allein auf. (Ein Test hält das fest.)

EINE REGEL FÜR ALLE SOLO-ABFRAGEN: `validateLevel` reicht sie über den Helfer
`soloReach` an goal, openers und die Softlock-Schleife durch. Zwei Checks
derselben Datei mit zwei Meinungen war schon einmal der Bug (der `openers`-Fall
in M41), also gibt es hier gar nicht erst zwei Wege. Dafür wandert die
Berechnung von `stonePlates` (aus dem Stein-Beweis) VOR den `goal`-Check.

EINGERASTET BLEIBT EINGERASTET – auch im Stein-Beweis: `boulderProof` kannte
„bleibt offen" nicht und hätte eine Platten-Tür weiter nur mit Stein geöffnet.
Der Zustand trägt jetzt eine Bitmaske `latched` über die latchenden
Platten-Türen (winzig: ein Bit je Tür, meist null), gesetzt, sobald der BALL
auf einer ihrer Platten stand. Das ist dieselbe Idee wie M78 im
Erreichbarkeits-Beweis und M68 bei den brüchigen Wänden.

Im Editor steht der Weg jetzt VOR dem roten Badge: Wer im Solo eine Platte
auswählt, liest `ed.plateSoloHint` („Rollstein daraufschieben – oder der Tür
„bleibt offen" geben"). Units in tests/soloPlate.test.ts (fünf Fälle, drei
davon einmal rot gesehen); die Fixtures mauern JEDE Kante ausdrücklich, denn
der Seed hatte im ersten Anlauf einen Umweg um die Tür gewürfelt.

## M94b „Der Boden glüht mit" ✓ (v3.29.0)

Nachtrag zu M94, und zugleich die Korrektur eines MISSVERSTÄNDNISSES: Der
Wunsch lautete „das Gleiche für die Bodenplatten", und ich habe daraus die
DRUCKPLATTE gemacht – die es nur in Zwei-Spieler-Leveln gibt, weshalb im
normalen Spiel nichts zu sehen war („Der Boden leuchtet nicht"). Gemeint war
der BODEN, über den die Kugel rollt.

Jetzt lädt die Zelle unter der Kugel nach derselben Kurve wie eine Wand:
durchrollen glimmt kurz (1,2 s), liegen bleiben glüht lange (bis 4,2 s).
Daraus entsteht beim Spielen eine SPUR – und die ist genau das, was M94 für
Wände begründet hat, nur dort, wo man sich wirklich bewegt: „hier war ich".

WO DER ZUSTAND WOHNT: Wände und Platten sind Objekte, an denen eine Ladung
hängen kann; der Boden ist keins. Also hält eine Karte je EBENE den Zustand
(`touchCell`/`pruneGlow` in core/afterglow.ts): Schlüssel „Spalte,Zeile", Wert
die Ladung plus die Zellmitte in Weltkoordinaten – so muss der Renderer nichts
zurückrechnen und kennt weder Zellgröße noch Gitter. `launch` leert die Karten
(die Spur gehört dem LAUF), und `pruneGlow` wirft verglühte Zellen weg: Ohne
das wüchse die Karte über einen langen Lauf mit jeder betretenen Zelle, und
der Renderer liefe über hunderte Einträge, von denen die meisten nichts mehr
zeichnen.

WIE SIE AUSSIEHT: gezeichnet ZUERST, unter den Wänden, als weicher
Radial-Fleck in der BALL-Farbe. Zwei Entscheidungen dabei:
- Die Farbe sagt, WEM die Spur gehört – dem Spieler, nicht der Welt (dieselbe
  Logik wie die Wegmarken in Kreide-Weiß, M89). Sie deckt auch nichts auf: Man
  sieht nur, wo man selbst schon war.
- Ein gefülltes Rechteck sah aus wie BODENBELAG, also wie Welt; ein
  auslaufender Fleck sieht aus wie eine Spur. `FLOOR_GLOW_ALPHA` 0,16 ist ein
  Fünftel des Ball-Kerns – sichtbar, aber nie ein Signal.

UND EINE LEKTION ÜBER DIE CI: Die erste Fassung baute den Verlauf je Zelle und
je Bild neu (`createRadialGradient`). Lokal war die Suite grün; in der CI fiel
Lauf 9 „Coop" – zwei volle Seiten auf zwei Kernen – mit sieben ✗ und einem
Klick-Timeout, also mit der Signatur des Last-Flakes, und der Deploy blieb aus
(3.29.0 war nie live, bis der Fix nachkam). Ein Verlauf hängt nur am RADIUS,
nicht an der Position: Er wird jetzt einmal in ein Offscreen-Canvas gemalt und
danach geblittet. Die Regel dahinter gilt für jedes künftige Bildwerk: Erst
fragen, ob sich das Ding vorzeichnen lässt, und dann messen – nicht lokal, wo
Kerne übrig sind.

Prüfbar: `__tiltrWorld.floorGlowMs` / `.floorGlowCells`; E2E Lauf 50 rollt
weiter, bis MEHR ALS EINE Zelle glüht (Warten auf den Zustand, nicht auf eine
Zeit – an der Wand gelehnt liegt die Kugel in einer einzigen Zelle, daran ist
die erste Fassung der Zusicherung gescheitert), und sieht die Karte danach
wieder leerlaufen. Units für Karte und Aufräumen in tests/afterglow.test.ts.

## M94 „Nachglühen lädt sich auf" ✓ (v3.28.0)

Rein visuell, und trotzdem eine Regel: Eine berührte Wand leuchtete bisher
IMMER GLEICH LANG nach – jeder Kontaktframe setzte `litUntil = now + 1200`.
Ein Streifschuss im Vorbeirollen und zwei Sekunden Anlehnen hinterließen
dasselbe Bild. Damit verschenkte die Darstellung die einzige Spur, die im
Dunkeln wirklich etwas über den Raum sagt: wo man sich AUFGEHALTEN hat.

Jetzt LÄDT die Berührung (`src/core/afterglow.ts`, rein, Units): Die
Kontaktdauer bestimmt die Nachglühdauer, von 1,2 s (Antippen) bis 4,2 s
(Sättigung nach 1,6 s Kontakt). Drei Entscheidungen stecken darin:

- DIE KURVE IST EINE WURZEL, keine Gerade. Der häufigste Fall ist der kurze
  Rempler; linear läge er kaum über dem allerkürzesten. Mit der Wurzel bringt
  schon ein Viertel der Ladezeit die halbe Ladung, und das lange Anlehnen
  läuft in die Sättigung, statt endlos zu wachsen.
- DAUER, NICHT HELLIGKEIT. Ausgeblendet wird weiter über dieselbe letzte
  Spanne (`GLOW_FADE_MS`, 1200 ms, jetzt EIN Name für Wand, Platte und alles
  Aufgedeckte); ein geladenes Glühen steht also einfach länger. Helligkeit
  bedeutet in dieser Welt NÄHE (Ping-Wellenfront, Fackel) – hätte die Ladung
  auch die Helligkeit gehoben, hieße dieselbe Farbe zwei Dinge.
- EIN PING LÄDT NICHT. Er deckt auf, er berührt nicht. Deshalb wohnt die
  Ladung in `glowUntil` (plus `glowFrom`/`glowAt` für die laufende Berührung)
  und nicht in `litUntil`, das auch die Wellenfront setzt. Umgekehrt DARF der
  Ping ein geladenes Glühen nicht abschneiden: `litUntil` nimmt das längere
  von beidem.

DIE DRUCKPLATTE GLÜHT MIT (der zweite Teil des Wunsches): Wer darauf steht,
lädt sie wie eine Wand, und sie klingt genauso aus – Füllung 0,22 gegen 0,35
im gehaltenen Zustand, die Spur ist schwächer als die Wirkung. Das schließt
nebenbei eine echte Lücke: Bisher zeigte das Bild „ich stehe drauf" nur, wenn
die TÜR daran hing (`held`); ein Resonanzfeld (M91), dessen Duett noch nicht
steht, blieb dunkel, obwohl die Kugel mitten darin lag.

KONTAKTLÜCKE (`GLOW_GAP_MS` 180 ms): Ein rollender Ball berührt eine Wand
nicht in jedem Bild. Ohne die Nachsicht begänne die Ladung beim Entlangschrammen
ständig von vorn, und genau dieser Fall – die Wand, an der man entlangfährt –
sollte am deutlichsten leuchten. Und ein Glühen wird NIE KÜRZER: Eine frische
Berührung an einer noch geladenen Wand beginnt zwar eine neue Ladung, schneidet
die alte Frist aber nicht ab (`Math.max`).

Prüfbar: `__tiltrWorld.glowMs` / `.plateGlowMs` (längstes verbliebenes Glühen
AUS BERÜHRUNG). E2E Lauf 50 lehnt sich an eine Wand, bis geladen IST (Warten
auf den Zustand, nicht auf eine Zeit – die erste Fassung hielt fest lange und
lag mit 2,4 s haarscharf über der Schwelle), pingt (nichts wird abgeschnitten)
und sieht es danach ausklingen; Lauf 48 prüft das Resonanzfeld, das glüht,
BEVOR das Tor aufgeht. Beide Zusicherungen einmal rot gesehen (GLOW_MAX_MS auf
den alten Festwert gesetzt).

## M93 „Das Coop-Kapitel" ✓ (v3.27.0) – Einklang zuerst, und drei Level, die unterrichten

Die Mittel für zwei Spieler waren fertig (M88 hören, M89 markieren, M90
gemeinsam ankommen, M91 stimmen, M92 ansagen) – ein KAPITEL waren sie nicht:
Wer die Lobby öffnete, fand sechs Platten-Level, dahinter zwei Einzelstücke und
für Marken, Partnerklang und halbhelles Licht überhaupt kein Level, das sie
lehrt. M93 macht aus dem Vorrat eine Reihe.

DIE REIHENFOLGE IM PANEL IST DIE LEHRREIHE, DIE ID IST EIN SCHLÜSSEL. Das
MP-Panel listet `COOP_LEVELS` in Array-Ordnung und nummeriert dabei; die ID
steht nirgends im Bild – sie identifiziert nur, der Gast holt das Level daraus
aus seinem Pool. Also stehen die neuen Level dort, wo sie unterrichten, und
nicht dort, wo ihre Nummer hinwiese: „Wegzeichen" (coop-09) VOR „Gleichschritt"
(coop-07). Eine ID umzunummerieren wäre das Gegenteil von harmlos – sie ist der
Schlüssel, über den beide Seiten dasselbe Level meinen.

EINKLANG ZUERST (coop-08 „Duett"). Das erste Duett verlangte die QUINTE, und
das war die falsche Reihenfolge: Zwei fast gleiche Töne SCHWEBEN, und die
Schwebung wird hörbar langsamer, bis sie steht – die Mechanik erklärt sich
selbst. Eine Quinte schwebt nicht; sie klingt bloß rein, und das beurteilt ein
ungeübtes Ohr kaum (deshalb gibt es seit v3.25.4 den Führungston). Also lehrt
coop-08 jetzt den Einklang, und die Quinte bekommt ihr eigenes Level dahinter –
mit weiter auseinanderliegenden Feldern, denn ohne Schwebung trägt die ORTUNG:
Sein Ton kommt von SEINEM Feld.

DIE DREI NEUEN LEVEL:

- **„Wegzeichen"** (coop-09, vor dem Rendezvous): Zwischen Halle und Zielkammer
  liegt ein OFFENES Feld mit zwei versetzten Lochreihen – in jeder Spalte ein
  Loch, also kein Durchmarsch. Ein Ping hilft dort kaum, denn er zeigt Wände,
  und es gibt keine. Beide müssen hindurch, und zwar nacheinander (einer hält
  die Platte in der Nische, der andere rollt ins Ziel und hält von dort) – wer
  den Weg zuerst findet, legt Marken, und die ticken für BEIDE. Das ist der
  Sinn von M89 in einem Satz. `marks: 4` statt der Vorgabe 3: Hier sind sie das
  Werkzeug des Levels.
- **„Reine Quinte"** (coop-10, nach dem Duett): dieselbe Bauform wie coop-08 –
  zwei Sackgassen-Nischen, versiegelte Zielkammer, Tür „alle Öffner" +
  „bleibt offen" (ohne `latch` hätte niemand mehr einen Fuß frei, M76/M77) –
  aber `tune: 'fifth'` und die Nischen an den ENDEN der Halle. Der Intro-Text
  sagt, was das Ohr erwartet: keine Schwebung, sondern den leisen Führungston.
- **„Ansage"** (coop-11, das Finale): `floor.brightPlayer: 1` – für Spieler 1
  ist die Ebene hell, für Spieler 2 stockdunkel. Der Blinde muss durch einen
  GESCHLOSSENEN Gang (genau ein Eingang, dahinter zwei atmende Löcher) zur
  Platte, die die Zielkammer des Sehenden öffnet; danach kehrt er zurück und
  wird von innen hereingehalten. Der Sehende sieht Labyrinth, Atemtakt und (M62)
  die Kugel des Partners – er sagt an, mit Worten oder Marken. Die Umkehrung des
  Gewohnten: Der Blinde tut die Arbeit, der Sehende trägt die Verantwortung.

WAS DIE TESTS FESTHALTEN: Die Beweise laufen wie für jedes Coop-Level
(Erreichbarkeit im Fixpunkt, JEDE Tür notwendig, Platte außen UND innen bei
Türen, die zufallen). Dazu drei Bauform-Prüfungen in tests/mpLevel.test.ts, die
zeigen, was ein Blick auf die Karte sagt: in JEDER Spalte des Lochfelds ein
Loch; Einklang hier, Quinte dort und die Quint-Felder weiter auseinander; der
Gang zur Platte hat GENAU EINEN Eingang (gerechnet aus `buildFloorCells`, deren
`.s`/`.e` WAND heißt, nicht offen – dieselbe Lesart wie im Karten-Drucker). Der
Drucker kann jetzt auch Coop- und Race-Level (`PRINT_IDS=coop-11`) samt
Start 2 / Ziel 2 – ohne Karte sind Nischen, Türkanten und Lochreihen Raterei.

EIN UNBEKANNTES EINGEBAUTES LEVEL IST EIN VERSIONS-UNTERSCHIED. Bei
eingebauten Leveln schickt der Host nur die ID. Kannte der Gast sie nicht (weil
sein Kapitel kürzer ist), stieg `mpOnMessage` still aus – und beide warteten in
der Lobby, ohne dass irgendetwas eine Ursache nannte. Jetzt steht dort derselbe
Satz wie beim Merkmals-Gate: „Der Partner braucht eine neuere Version." Das
Gate (M89) deckt neue SPIELMITTEL, nicht neue Level; ein wachsendes Kapitel
braucht seinen eigenen Satz.

## M92 „Ansage" ✓ (v3.26.0) – Licht je Spieler + Anweisung auf dem Feld

Zwei Nachträge aus dem Spieltest des Duetts, und beide machen aus einer
Mechanik ein Gespräch.

AUF DEM FELD SAGT DAS SPIEL, WAS ZU TUN IST. Das Resonanzfeld summte, und das
war alles - dass die NEIGUNGSRICHTUNG den Ton stimmt und ein kurzer Tipp
genügt, errät niemand. Die Statuszeile führt jetzt in vier Stufen: allein auf
dem Feld (kurz neigen stimmt den Ton, er bleibt stehen - allein geht das Tor
nicht auf), beide Töne da (gesucht: Quinte - oben tief, unten hoch), nah dran
(fast, die Schwebung wird langsamer - ganz kleine Neigungen jetzt) und im Ziel
(es steht). Der Zweig steht NACH `messageUntil`: Ein Flash ist Neuigkeit und
gewinnt kurz, danach steht die Anweisung wieder da.

LICHT JE SPIELER (`floor.brightPlayer` 1|2). Eine helle Ebene war bisher für
beide hell; jetzt kann sie für EINEN hell und für den anderen dunkel sein. Aus
dem Stilmittel wird damit ein Coop-Werkzeug: Einer sieht das Labyrinth und sagt
an, der andere hört und rollt - die Wegmarken (M89) sind die Sprache dafür, und
im Coop auf einer hellen Ebene ist der Partner ohnehin ein fester Ball (M62).
Entschieden wird es im LOADER, wo die Welt je Spieler entsteht (wie
`elementForPlayer`, M65), nicht als Sonderfall im Renderer: Licht ist eine
Eigenschaft dieser Ladung. Schema-Invariante: nur bei zwei Spielern und auf
einer hellen Ebene - ein `brightPlayer` ohne `bright` wäre eine stille Lüge.
Die Lösbarkeit hängt NICHT am Licht: kein Beweis ändert sich, und die Units
halten beides fest (hell/dunkel je Spieler UND grüne Badges in allen drei
Varianten).

E2E: Lauf 48 prüft die Anweisung (zwei Stufen), Lauf 49 Licht je Spieler zeigt
dieselbe Ebene für Spieler 1 hell und für Spieler 2 dunkel - im MP-Testmodus,
wo beide Welten vorliegen und der Wechsel zwischen ihnen umschaltet.

## M91 „Duett" ✓ (v3.25.0)

Das Flaggschiff des Coop-Ausbaus und die Idee, für die es dieses Spiel gibt:
Neigung ist gleichzeitig BEWEGUNG und STIMME. Ein Tor, das nur ein Duett
öffnet – zwei Resonanzfelder, eines je Spieler; wer auf einem steht, erzeugt
einen Ton, dessen Höhe aus der NEIGUNGSRICHTUNG kommt. Das Tor geht auf, wenn
die beiden Töne im Zielintervall stehen (Einklang oder Quinte, Toleranz
25 Cent) und dort einen Augenblick bleiben. Beide hören die Schwebung
langsamer werden, bis sie steht. Allein ist es nicht lösbar – und zwar nicht,
weil eine Regel es verbietet, sondern weil ein Ton kein Intervall hat.

DIE ENTSCHEIDENDE ABWEICHUNG VOM PLAN: Das Resonanzfeld ist KEIN eigenes
Element, sondern eine EIGENSCHAFT der Druckplatte (`plate.tune`:
'unison' | 'fifth'). Der Plan wollte `src/elements/resonance.ts` und begründete
im selben Atemzug, warum das nicht geht: „Für das Modell ist ein Resonanzfeld
eine Platte – `coopReachable`, `pairReachable`, `holdCheck` und der
`openers`-Bericht rechnen es damit GRATIS mit." Gratis ist es nur als
Eigenschaft: `el.type === 'plate'` steht an rund zwanzig Stellen in
validate.ts, boulders.ts, doors.ts und editor.ts, und ein neuer Typ hätte
jede davon gebraucht. Das ist dieselbe Regel wie bei der Wand-Variante (M38)
und bei „Setzt für" an ● und ◎ (M58): Wer ein Werkzeug braucht, macht es zur
Eigenschaft eines vorhandenen.

DIE SCHALE (`src/core/resonance.ts`, rein, Units): Zum Stimmen muss man
neigen, und Neigen würde einen vom Feld rollen. Deshalb baut die Platte mit
`tune` einen Sog-Anker mit (`RESONANCE_FORCE` 2400 < `accel` 2600, dieselbe
Invariante wie M32: eine Schale, nie eine Falle). Der Sog fällt mit dem
Abstand, also rechnet sich die Flucht bei VOLLER Neigung auf ~0,49 s bis zum
Plattenrand – die Haltezeit (`TUNE_HOLD_MS` 250 ms) liegt bewusst darunter:
Wer entschieden kippt, rollt hinaus; wer stimmen will, neigt sanft. Diese
Kopplung zweier Zahlen ist der Kern der Spielbarkeit und steht deshalb als
Rechnung im Modul, nicht als Gefühl im Kopf.

DIE TONHÖHE IST ÜBERALL STETIG: 0 Cent bei Neigung nach Norden, die Quinte
bei Süden, und der Weg dorthin geht über Ost ODER West (351 Cent). Ein Kreis,
der bei 702 auf 0 zurückspringt, hätte eine Naht, und an der wäre der Ton
sprunghaft – unspielbar. Zwei reine SINUS-Stimmen (`audio.setResonance`)
laufen in denselben Master, also entsteht die Schwebung AKUSTISCH wie bei
zwei echten Gabeln; der eigene Ton ist ungepannt (er kommt von mir), der des
Partners steht an SEINEM Feld, damit die Schwebung im Raum liegt und nicht im
Kopf. Ein Schimmer eine Oktave darüber wächst mit der Genauigkeit – man hört
das Ziel, EHE das Tor aufgeht.

BEIDE SEITEN RECHNEN DASSELBE: `state` trägt `tn` (Tonhöhe in Cent, null =
steht auf keinem Feld), jede Seite kennt beide Töne und entscheidet lokal –
keine Autorität, keine Nachricht „Tor auf". Und weil das Feld eine Platte ist,
macht die EINE Türregel (core/doors.ts) den Rest: Steht das Duett, gilt die
Platte als gehalten. Am Netz hängt das Ganze am Merkmals-Gate (M89):
`needs: ['duet']` – eine Gegenstelle von vor 3.25 schickt kein `tn`, das Tor
ginge nie auf, und ein solches Level startet deshalb gar nicht.

ZWEI AUSNAHMEN MUSSTEN IN DEN BEWEIS, sonst lügt er: Ein STEIN kann kein
Resonanzfeld halten (er hat keine Neigung) – `boulderProof` lässt tune-Platten
aus `stonePlates` heraus und zählt einen Stein darauf nicht als Öffner; der
PARTNER darf es halten, wenn `heldPlates` es sagt. Und eine 'all'-Tür mit zwei
Feldern hat ohne „bleibt offen" niemanden mehr frei, der durchrollt – genau
das meldet `holdDetail` von selbst („… – „bleibt offen" löst das"), der Beweis
erzieht also den Bauplan, und wir brauchen keine zweite Regel dafür.
Gegenproben in tests/coopPlates.test.ts.

Dazu das eingebaute Level coop-08 „Duett": zwei Felder in Sackgassen-Nischen
(beide AUSSEN, denn drinnen stimmt niemand mehr), die Zielkammer versiegelt,
die Tür mit „alle Öffner" + „bleibt offen". Dabei fiel eine alte Test-
Invariante: „jede Coop-Tür hat eine Platte außen UND innen (Selbstbefreiung)"
gilt nur für Türen, die WIEDER ZUFALLEN – eine latchende Tür kann niemanden
aussperren. Die Invariante prüft jetzt genau das.

NACHGESCHÄRFT (v3.25.1, aus dem Spieltest): DER TON IST ZUSTAND, kein Abbild
der Neigung (`tuneStep`). Die erste Fassung rechnete ihn in jedem Bild aus der
Neigung – damit fiel er in dem Moment auf den Grundton, in dem man die Hand
wegnimmt, und genau das ist der Moment des SPIELERWECHSELS im Testmodus (wer 👥
antippt, hält das Gerät fast flach). Jetzt gilt: Neigen dreht den Knopf,
Loslassen hält ihn, das Feld verlassen macht stumm, Betreten beginnt beim
Grundton. Der Spielerwechsel braucht dafür keine eigene Regel mehr, und im
echten Netz darf man das Gerät ruhig legen – das Stimmen wird deutlich
entspannter, was der erste Spieltest auch verlangt hat („zu schwierig").

UND NOCHMAL NACHGESCHÄRFT (v3.25.2, zweiter Spieltest: „in der Schale hört man
zu viele Störgeräusche"). Drei Ursachen, alle echt:
1. Die Schale war ein SOG-ANKER, und dessen Kraft ist im Zentrum am größten und
   fällt zum Rand auf null – das Gegenteil einer Mulde. Eine sanfte Neigung
   (die Stimm-Neigung!) hatte ihr Gleichgewicht bei 61 px, die Platte endet bei
   41: Die Kugel rutschte beim Stimmen heraus, der Ton riss ab, sie rasselte an
   den Wänden. `bowlPull` dreht das Profil um (Kraft wächst bis zur Lippe).
2. Die Schale BRUMMTE wie ein Anker – ein Element mit zwei Klängen, und das
   Brummen lag genau auf den Tönen. Der Anker-Klang lässt Resonanz-Schalen aus.
3. Der Rest der Welt spielte in voller Lautstärke weiter. Jetzt weicht der
   WELT-BUS um ~20 dB zurück, solange man im Feld steht (`worldDuck`); die
   beiden Resonanzstimmen hängen dahinter.
Dabei zwei Mess-Lektionen, die über die Zahlen entschieden haben: Die EINGABE
RAMPT (0,15 je Bild), also sammelt die Kugel keinen Schwung für die Lippe – wer
eine Kraft gegen die Neigung auslegt, simuliert mit der Rampe (eine Auslegung
„mit Schwung drüber" war im Unit-Test grün und im Spiel eine Falle). Und der
Ausstieg muss in JEDER Richtung gehen, auch aus einer Nische mit einer offenen
Seite – also unter 2600 · 0,7. Heraus kam: Kraft 1500, Feld-Radius 60 px, und
gestimmt wird mit einem TIPP (der Ton bleibt ja stehen), verlassen mit einer
gehaltenen Taste.

DIE SKALA WURDE WEITER (v3.25.3, gemeldet: „die Quinte liegt ziemlich am
Rand"): Die Tonhöhe lief von 0 bis 702 Cent über den halben Kreis, die Quinte
lag also GENAU am Ende – erreichbar nur bei Neigung exakt nach Süden. Damit
hatte ein Quint-Tor genau EINE Lösung (einer ganz oben, einer ganz unten), und
die 25 Cent Toleranz teilten sich beide Spieler. Jetzt trägt die Skala eine
OKTAVE (`PITCH_SPAN_CENTS` 1200): Die Quinte liegt bei 105° von Norden, mitten
im Bereich, und jedes Paar mit 702 Cent Abstand passt – eine 498 Cent breite
Familie. Die Toleranz wuchs mit (25 → 40 Cent): In Winkeln gerechnet sind das
wieder 6° Neigungsrichtung, also dieselbe Feinheit wie vorher; ein weiterer
Bereich bei gleicher Cent-Toleranz wäre eine Verschärfung gewesen. Der
Intro-Text von coop-08 nennt jetzt auch die Stimm-Bewegung (antippen) und
verspricht keine „Schwebung" mehr – die gibt es nur nahe am Einklang.

DREI NACHTRÄGE (v3.25.4), die aus dem Gespräch über die Schwierigkeit übrig
waren:
1. FÜHRUNGSTON (`guideCents`): Bei einer Quinte gibt es keine Schwebung – die
   versprochene Hilfe existiert nur nahe am Einklang. Jetzt spielt das Spiel
   leise den Ton mit, den ICH treffen müsste (die nähere der beiden
   Möglichkeiten um seinen Ton); der schwebt gegen meinen eigenen, und die
   Schwebung wird langsamer, bis sie steht. Beim Einklang entfällt er.
2. BADGE „ein Klang-Intervall" (hart): Alle Resonanzfelder eines Levels tragen
   dasselbe Intervall, denn jede Seite urteilt nach dem Feld, auf dem SIE
   steht. Mit Ort im Bericht und `ed.help.resonance` in allen vier Sprachen.
3. ORTUNG bei einem gemeinsamen Feld: „Sein Feld" ist das seiner Kugel
   nächste – auch wenn das meines ist (bei einer 'any'-Tür dürfen beide auf
   derselben Zelle stehen). Vorher wurde er am falschen Feld geortet;
   `hisDx/hisDy` im Haken macht es prüfbar (E2E).

Units: tests/resonance.test.ts (26) plus die Gegenproben; E2E Lauf 48 im
MP-Testmodus (Editor-Feld, allein klingt nur ein Ton, die Welt weicht im Feld
zurück, ein Tipp stimmt und der Ton bleibt stehen, der Spielerwechsel hält ihn
auch, zwei verschiedene Töne lassen das Tor zu, Einklang öffnet es, Verstimmen
schließt es, und entschieden kippen verlässt das Feld). Die Sabotage-Probe – `inTune` rechnet die
Quinte als Einklang – hat drei der sechs Zusicherungen rot gemacht,
darunter die eine, die vorher nur zufällig grün war: „bleibt zu" ist kein
Zustandswechsel, auf den man warten kann, also wartet sie als EINZIGE im Lauf
bewusst länger als die Haltezeit und liest DANACH.

## M90 „Gemeinsam ankommen" ✓ (v3.24.0)

Dritter Baustein des Coop-Ausbaus, und der einzige, der die SIEGBEDINGUNG
anfasst. Vorher gewann Coop, wenn beide IRGENDWANN durch waren – zwei
Einzelläufe, addiert. Mit dem Level-Flag `together` wird aus dem Ende eine
Verabredung: Gewonnen ist erst, wenn BEIDE gleichzeitig in ihren Zielzonen
liegen. Der Endspurt bekommt damit eine Choreografie, die es vorher nicht gab.

Das Modell ist winzig und rein (`src/core/together.ts`): `state` trägt neben
`fin` ein `g` („liege ich JETZT im Ziel"), die Gegenseite merkt sich den
Zeitpunkt, und `togetherWin(mine, at, now)` gilt, solange seine letzte Meldung
keine 700 ms alt ist. Die Nachsicht deckt AUSGEFALLENE Nachrichten, nicht das
Weiterrollen: Verlässt er das Ziel, sagt es die nächste Meldung sofort
(`goalAt` zurück auf 0). Und BEIDE Seiten schließen unabhängig ab – niemand ist
Schiedsrichter; ein Sieg, der auf die Bestätigung des anderen wartet, käme eine
Nachrichtenlaufzeit zu spät. Die Teamzeit ist deshalb der AUGENBLICK des
Rendezvous (`mp.rendezvousTime`), nicht das Maximum zweier Einzelzeiten: Beide
Uhren zeigen denselben Moment, „du 12,4 · Partner 12,4" wäre eine Genauigkeit,
die nichts bedeutet.

RÜCKMELDUNG IST HIER PFLICHT, sonst ist der Modus Frust – „nichts passiert,
obwohl ich im Ziel bin" sähe wie ein Fehler aus. Wer wartet, liest es in der
Statuszeile und sieht sein Ziel ruhig leuchten (`goalDone` gab es schon); der
Nachzügler bekommt die Pille „◎ Partner wartet" in Partnerfarbe und einen RUF
(`audio.waitCall`: zwei Töne aufwärts, ungepannt – er kommt vom Schirm wie das
Konfetti, mit Sperre alle 1,6 s). Kein Pulsieren: Puls ist in diesem Spiel der
Herzschlag und damit Gefahr; Warten ist keine Gefahr, sondern eine
Aufforderung.

Das Flag hängt am Schema mit einer INVARIANTE (`players: 2` und `mpMode`
coop/any) – im Rennen gibt es keinen gemeinsamen Sieg, also lehnt der Loader
ein solches Level ab, und der Editor räumt die Regel beim Wechsel auf „Rennen"
selbst weg (Feld „Coop-Sieg" neben dem Modus). Am Netz hängt es über das
Merkmals-Gate aus M89: `needs: ['together']` – eine Gegenstelle von vor 3.24
würde sonst nach der ALTEN Regel gewinnen, und das ist genau der Fall, für den
das Gate gebaut wurde. Der BEWEIS bleibt bewusst unberührt: Gleichzeitigkeit
ist Timing, kein Erreichbarkeitsproblem (wie das weiche `timer`-Badge). Wer es
aufnähme, müsste Wege LÄNGENgleich beweisen – das ist eine Schätzung, kein
Beweis.

Dazu ein eingebautes Coop-Level, das die Regel lehrt: „Gleichschritt"
(coop-07) – ein Ring mit zwei Zielen in den oberen Ecken, ohne eine einzige
Tür. Die Aufgabe IST die Gleichzeitigkeit; symmetrisch gebaut, damit niemand
die längere Strecke bekommt. Im MP-Testmodus funktioniert `together` von
allein, weil die abgegebene Kugel liegen bleibt – sie wartet also im Ziel,
während man die andere holt.

Units: tests/together.test.ts (5), Schema-Invariante und Lösbarkeit von
coop-07 in tests/mpLevel.test.ts, Gate in tests/features.test.ts. E2E Lauf 47
(Host + Gast, in der AFFINITY-Gruppe der Zwei-Seiten-Läufe): Editor-Schalter
samt Wegräumen im Rennen, „einer allein im Ziel gewinnt NICHT" (die
Zusicherung, die vorher rot war), Chip beim Nachzügler, Sieg auf BEIDEN Seiten,
Ergebniskarte mit dem Rendezvous-Augenblick.

DER FEHLER, DEN DER LAUF FAND – und die Lektion für jeden Frame-Zustand: Die
Rendezvous-Rechnung stand am ANFANG von `frame()`, also VOR `world.step()`.
Damit meldete „liege ich im Ziel?" die Lage des VORIGEN Bildes, und im ersten
Bild in der Zielzone gewann noch die alte Regel (`mpLocalFinish` rastete ein,
`fin: true` bei `together: true` – ohne die beiden Haken `mode`/`together` in
`__tiltrMp` wäre das von „das Flag kam nie an" nicht zu unterscheiden gewesen).
Wer einen Zustand einmal je Frame rechnet, rechnet ihn NACH dem Schritt und
deklariert ihn nur oben, damit auch das Zeichnen am Ende dieselbe Wahrheit
sieht.

UND DER ZWEITE, DEN ERST DIE LAST FAND (vier Arbeiter, lokal grün): WER
GEWINNT, VERSTUMMT. Ab dem Sieg läuft die Schleife nicht mehr im Spielzweig,
also geht keine `state`-Meldung mehr hinaus – und die letzte kann noch
`g: false` getragen haben (Takt 80 ms). Der Nachzügler feierte, der Wartende
blieb für immer „playing" mit `sees: false`. Seine `finish`-Meldung ist deshalb
der verlässliche Anlass: Sie kommt nur, wenn er MICH im Ziel gesehen hat –
dieselbe Beweislage, die auch meine Seite benutzt, also bleibt „beide
entscheiden unabhängig" wahr. Die Lektion für jede künftige Regel, die auf
einem STROM von Meldungen fußt: Am Ende des Laufs hört der Strom auf, also muss
der letzte Zustand in einer EINZELNEN Nachricht stehen. Gefunden hat es die
Zusicherung, die den Zustand BEIDER Seiten mit ausdruckt – ein nacktes „false"
hätte es als Last-Flake durchgehen lassen.

Und ein drittes Mal fiel dieselbe Klasse in der CI, diesmal in Lauf 46 (M89):
Die Statuszeile trägt immer die JÜNGSTE Meldung, und unter Last kam die
fremde („Der Partner hat eine Wegmarke gelegt") NACH dem eigenen Aufnehmen an
und überschrieb die Quittung. Der Lauf wartet jetzt, bis die Boje des Partners
angekommen IST, bevor er selbst tippt – wer eine Meldung prüft, muss die
Reihenfolge herstellen, nicht hoffen.

## M89 „Wegmarken" ✓ (v3.23.0)

Zweiter Baustein des Coop-Ausbaus und das erste Werkzeug, mit dem ein Spieler
dem anderen etwas ÜBER DIE WELT sagt, ohne zu reden: eine Klangboje, die BEIDE
hören. Der Sehende auf einer hellen Ebene markiert dem Blinden den Weg um die
Löcher; man kann sich an einer Marke verabreden („warte bei meiner zweiten").

DER VORRAT STEHT IM LEVEL (`marks`, Vorgabe 3, 0…9) – auf Wunsch des Autors im
Editor einstellbar, Feld nur bei zwei Spielern. Das ist keine Einstellung,
sondern eine Bau-Entscheidung: Drei Marken zwingen zur Sparsamkeit, null heißt
„dieses Level kennt sie nicht" (dann ist auch der HUD-Knopf weg). Und es hat
eine schöne Nebenwirkung für die Verträglichkeit – siehe unten.

Eine Boje sitzt in der ZELLMITTE (`markSpot`), nicht dort, wo die Kugel gerade
rollte: Sie ist ein Wegzeichen, kein Schnappschuss. Daraus folgt die Regel
fürs Aufnehmen – „liegt hier schon eine von MIR?" ist ein Vergleich von
Zellmitten, kein Abstand mit Toleranz: `toggleMark` legt ab oder nimmt zurück
(Vorrat steigt wieder), FREMDE Bojen bleiben liegen. Wer eine Marke setzt,
will sie wiederfinden und nicht vom Partner weggeräumt bekommen.

Klang ist der Hauptkanal: weicher Holz-Tick (`audio.markTick`, 430 → 300 Hz,
Takt schneller je näher), bewusst kein Glockenton (die Glocke lockt Horcher)
und kein Ping-Klang (der Ping ist ein Ereignis, die Boje ein Ort). Es tickt
immer nur die NÄCHSTE auf dieser Ebene – ein Bus, eine Richtung, wie beim
Automaten. Abschirmung und Nebel gelten wie für jede Quelle. Im Bild ein
Kreide-Ring (`WORLD.mark`, farblos gegen alles andere: die Boje gehört den
Spielern, nicht der Welt), eigene durchgezogen, fremde gestrichelt – dieselbe
Sprache wie die Landeplätze im Editor.

MERKMALS-GATE (`src/core/features.ts`, rein): Neue Felder in einer Nachricht
sind additiv, eine alte Gegenstelle ignoriert sie. Bei einem SPIELMITTEL ist
das nicht harmlos – ein Level mit Bojen, das nur EINE Seite legen kann, ist
ungleich, und ein Sieg nach halben Regeln ist keiner. Der Host hängt deshalb an
`setup`, was das LEVEL braucht, der Gast an `ready`, was er KANN; beide prüfen,
also fällt es auf, egal welche Seite die ältere ist („Der Partner braucht eine
neuere Version"). Das Gate hängt am LEVEL, nicht an der Versionsnummer: Ein
Level ohne Bojen spielt weiter mit jeder Fassung – genau die Nebenwirkung der
einstellbaren Anzahl.

Units: tests/marks.test.ts (12) und tests/features.test.ts (5). E2E Lauf 46
(Host + Gast, in der AFFINITY-Gruppe der Zwei-Seiten-Läufe): Editor-Feld nur
bei zwei Spielern, Knopf zeigt den Vorrat, Legen rastet auf die Zellmitte und
kommt beim Partner an, Aufnehmen nimmt es dort weg, fremde Boje bleibt liegen,
Vorrat ist endlich. Sabotage-Probe: „fremde mit wegräumen" fällt in Unit UND
E2E, „Nachricht nicht senden" nur im E2E – beide einmal rot gesehen.

DREI IRRWEGE BEIM LAUF, alle im Lauf dokumentiert: Der dritte Tap landete
erst auf DERSELBEN Zelle wie die zweite Boje (dort nimmt er sie korrekt auf,
statt „Vorrat leer" zu melden), die Statuszeile trug noch die Meldung des
zweiten Taps (der Frame räumt sie erst nach der Flash-Dauer), und die Kugel
PRALLTE von der Wand zurück (y 273 → wieder 153), weil ich die Taste im Flug
losließ und mir dafür einen eigenen Helfer gebaut hatte – die Lektion stand
längst in CLAUDE.md, und `holdUntil` (hält, bis die Bedingung gilt UND der
Ball ruht) konnte es die ganze Zeit.

## M88 „Der Partner klingt" ✓ (v3.22.0)

Erster Baustein des Coop-Ausbaus, und der Befund dahinter stand nicht im
Gedächtnis, sondern im Code: In `src/audio/` gab es KEINE Stimme für den
Partner. Man sah einen Schein (im Coop auf heller Ebene einen festen Ball,
M62), aber in einem Spiel, dessen Welt sich über Klang offenbart, war „wo bist
du?" nicht beantwortbar. `setRival` existierte – aber nur für den Geist im
DUELL.

ZWEI ANTEILE, weil die Frage „immer hörbar oder nur in Bewegung?" zwei richtige
Antworten hat: `buddySound(dist, speed, maxSpeed)` in `src/core/buddy.ts` (rein,
Units) liefert `closeness` für den GRUNDTON – ruhend findet man ihn – und
`moving` für den ROLLANTEIL: rollend verrät er sich. Stillstand ist damit
Tarnung, ohne dass der Partner je ganz verschwindet.

Klanglich ist er das Gegenteil des Rivalen: Der Rivale ist Rauschen (Bedrohung),
der Partner ist TONAL – ein warmer Quint-Grundton (D3 + A3), leiser als der
Rivale (0,3 gegen 0,42), dazu der Rollanteil aus braunem Rauschen. KEIN
Pulsieren: Puls ist in diesem Spiel der Herzschlag, also Gefahr.

Er gehorcht denselben Regeln wie jede andere Quelle – das war die Hauptarbeit
in app.ts, nicht die Stimme: HRTF aus seiner Richtung, `shield()` dämpft ihn
hinter einer Schallschutzwand, eine andere Ebene lässt nur ein fernes Grundeln
(`muffled`), der Nebel dämpft am Master von selbst (fogFilter).

NUR IM COOP (Entscheidung des Autors): Im Race bleibt er stumm – dort ist die
Blindheit das Rennen, wie dort auch Platten nicht zählen und Schlüssel lokal
wirken (M57/M59).

Die Geschwindigkeit kommt NICHT über das Netz: Sie folgt aus zwei
`state`-Meldungen (alle 80 ms) und wird geglättet (`smoothSpeed`, τ = 150 ms) –
ein Protokollfeld mehr hätte beide Seiten ohne Not auf dieselbe Version
festgelegt. Meldet der Partner gerade nichts (Funkloch, > 400 ms), gilt er als
ruhend statt als ewig rollend, und ein Ebenenwechsel wird nicht als Bewegung
gemessen (das ist ein Warp, kein Rollen). Im MP-Testmodus liegt die abgegebene
Kugel ohne Schwung – dort hört man also nur den Grundton, und das ist die
Wahrheit, kein Mangel des Tests.

Units in tests/buddy.test.ts, E2E Lauf 45: Testmodus (Coop hörbar aus seiner
Richtung, ruhende Kugel ⇒ Rollanteil 0; Race STUMM) und echtes Netz (Host +
Gast, Nähe 0,42 → 0,93 und Rollanteil bis 1,0, während der Gast heranrollt,
danach zurück auf 0,05). Beide neuen Regeln einmal rot gesehen – Coop-Gate
entfernt (Race klang) und Rollanteil verschluckt.

NACHTRAG aus der CI (derselbe Release, vor dem Deploy gefixt): Die Zusicherung
„Im Netz hört der Host den Gast" fiel dort mit `dx −50, Nähe 0,70` – das ist
`mp.remote = {0,0}`, also der URSPRUNG der Welt: gelesen, BEVOR die erste
`state`-Nachricht ankam (lokal war sie schneller da als der Lesezugriff). Kein
Test-Timing-Problem, sondern ein Fehler im Feature: Bis zur ersten Meldung
klang UND leuchtete der Partner in der Weltecke. Es gibt ihn jetzt erst mit
`remote.lastAt > 0` – Bild und Klang aus derselben Wahrheit. Der Renderer-Schein
trug den Fehler seit M22 stumm mit; erst der Klang machte ihn hörbar.

Beim Schreiben des Laufs zweimal gestolpert, beides jetzt im Lauf dokumentiert:
Die Lobby zeigt eine LISTE, erst der Tap auf `#mpCustomItem` eröffnet den Raum
(sonst wartet der Gast ewig auf „Verbinde …"), und BEIDE Seiten müssen das
Intro bestätigen (`#interPrimary`), das beim Host erst aufzieht, wenn der Gast
im Raum ist. Dazu eine eigene Zusicherung „Host und Gast spielen": Ein
misslungener Start soll das SAGEN und nicht die nächste Prüfung an `undefined`
zerschellen lassen.

## M87 „Das leere Feld" ✓ (v3.21.0)

Aus dem Levelbau: „Es gibt einen Knopf, um im Editor die aktuelle Ebene neu zu
würfeln. Genauso braucht es einen Knopf zum Löschen aller Wände." Stimmt – wer
von Hand baut, kämpft sonst gegen das gewürfelte Labyrinth an, Kante für Kante.

`clearWalls(maze, cols, rows, seedOpen)` in `src/ui/editor.ts` ist rein und
steht neben `toggleEdge`, dessen Philosophie es teilt: Der ZIELZUSTAND zählt,
nicht was der Seed gewürfelt hat. Jede INNERE Kante, die der nackte Seed als
Wand würfelt, kommt in `carve`; `add` und alle Wand-Varianten (brüchig samt
Seite, Schallschutz, Spiegel) fallen weg. Das Weglassen der Varianten ist keine
Kosmetik: Der Loader verlangt für sie eine EXISTIERENDE Wand und weigert sich
sonst („spiegelnde Wandkante (2,0,s) existiert nicht") – in der Sabotage-Probe
zu Lauf 44 stand genau dieser Satz im Ladefehler.

Gefragt wird der SEED, nicht der sichtbare Zustand: So bleibt `carve` minimal
(nur die gewürfelten Wände), statt jede Kante des Feldes in den Teilen-Link zu
schreiben – bei 20×24 wären das über 900. Die Rechnung dafür läuft EINMAL
(`seedOpenAll`), denn `edgeOpen` parst je Aufruf die komplette Def.

Der Außenrand bleibt unangetastet (er ist keine beschreibbare Kante), Elemente
bleiben stehen – Türen und Schiebewände verlangen ohnehin eine OFFENE Kante,
sie überleben das Abräumen also. Der Knopf ist ein ZWEI-TAP („⚠ Alle Wände
löschen?"), weil es kein Rückgängig gibt und ein Handbau von zwanzig Wänden
sonst mit einem Fehltipp weg wäre; die Meldung sagt hinterher, wie viele Wände
gefallen sind. Units in tests/editorWalls.test.ts (Zielzustand, minimale
Liste, Außenrand, Zählung, Idempotenz), E2E Lauf 44.

## M86b „Die Nachricht, die ankommt" ✓ (v3.20.0)

Gemessen auf dem Gerät: „Es ist nur das GIF da, nicht der Werbetext und der
Link." Damit ist M86 widerlegt – die Lektion aus 2.11.4 gilt AUCH für
Bild + Bildunterschrift: Hängt eine Datei dran, entscheidet die Ziel-App, und
sie nahm das Bild und ließ den Text liegen. Ein Promo ohne Link ist wertlos,
also gewinnt der Link: geteilt werden `title`, `text` und `url`, sonst nichts.

Damit die Animation trotzdem reist, trägt sie die Link-Vorschau (`og:image`).
Dafür brauchte das GIF eine Korrektur: Messenger zeigen nur das ERSTE Bild, und
das war der fast schwarze Splash-Anfang. `tools/promo.mjs` setzt jetzt das
HELLSTE Bild der Ping-Szene als Schaubild davor (900 ms) – die aufgedeckten
Wände, gemessen statt geraten (mittlere Helligkeit über eine Pixel-Stichprobe).
Es ist Teil der Schleife und wirkt wie eine Titelkarte.

Zweite Rückmeldung zum Video: „Im Video ist zwei mal ein Ping. Einer reicht."
Stimmt – zwei hintereinander sehen aus wie ein Fehler, und die Aufdeckung wirkt
nur beim ersten Mal wie eine Offenbarung. Jetzt einer, dafür länger stehend.

106 Bilder, 14,8 s, 677 KB. E2E Lauf 43 hält die Entscheidung fest: Auch wenn
die Plattform Dateien KÖNNTE, geht keine mit – sonst fällt der Link weg.

## M86 „Eine Nachricht" ✓ (v3.19.0)

Rückfrage: „Kann ‚spreading the word' und ‚share GIF' nicht in einer Message
sein?" Ja – und zwar besser als zwei Knöpfe, denn niemand teilt gern zweimal.
M85 hatte sie getrennt, aus Vorsicht vor der Lektion 2.11.4 (Signal nahm bei
einem Export den TEXT und ließ die Datei liegen). Die Lektion gilt aber für
`title`/`text`/`url` NEBEN einer Datei – nicht für „ein Bild mit
Bildunterschrift".

Jetzt gibt es EINEN Chip mit drei Stufen, jede mit Grund:

1. Kann die Plattform Dateien (`canShare({files, text})`)? Dann geht das GIF als
   BILD raus, Werbetext und Link stehen als Bildunterschrift im `text` – der
   Link IM Text, nicht als eigenes `url`-Feld, damit die Ziel-App ihn nicht
   einzeln weglassen kann.
2. Keine Dateien? Dann der Link mit `title`/`text`/`url`. Die Vorschau zeigt das
   GIF trotzdem – dafür ist `og:image` da.
3. Kein Web Share? Text und Link in die Zwischenablage, der Status sagt es.

Gefragt wird VOR dem Laden: `canShare` prüft nur die Typen, also genügt eine
LEERE Probe-Datei – wer keine Dateien teilen kann, lädt auch keine 700 KB GIF.
Damit fallen `promo.gif`/`promo.gifBad` und `shareBinaryFile` weg (der zweite
Knopf war ihre einzige Aufgabe). E2E Lauf 43 prüft alle drei Stufen einzeln,
dazu Sprachwechsel und Überlauf – die zwei neuen Zusicherungen gegen den alten
Stand rot gesehen.

## M85b „Der Schnitt des Promo-GIFs" ✓ (v3.18.0)

Rückmeldung zum ersten GIF: „Hörtest und Galerie brauchen nicht ins Video.
Kannst du Sequenzen aus meinem Level nehmen, das ich oben geschickt hatte?"
Beides berechtigt: Galerie und Hörtest sind Screens voller TEXT, und Text liest
sich in 195 px nicht – ein Promo verkauft sich über Bewegung. Das Coop-Level
des Autors dagegen zeigt in einem Bild, was man mit dem Editor wirklich baut.

Neuer Schnitt (`tools/promo.mjs`, `npm run promo`): Splash mit Einfahrt →
Dunkelheit plus Echo-Ping → Sieg mit Konfetti → dasselbe echte Level im EDITOR
(Live-Badges: Lädt, Verknüpfungen, Coop lösbar, Öffner vor Tür) → im
Zwei-Spieler-TESTMODUS: rollen, pingen, dann 👥 Seitenwechsel, wobei der
Ruhende als roter Partner im Bild bleibt (M62) und die Wächter weiterlaufen.
Das Level liegt als `tools/promo-level.json` daneben (aus dem Diagnose-Link
dekodiert, ID auf `promo-coop` gesetzt) – ein Zufallslevel wäre beliebig, dieses
ist gebaut.

Ergebnis: 108 Bilder, 14,2 s, 710 KB – dieselbe Größenordnung wie vorher,
obwohl zwei Szenen dazukamen (die Text-Screens waren teuer: viele Farben, wenig
Bewegung).

## M84b „Der Stein wirkte auf der falschen Ebene" ✓ (v3.17.1)

Meldung direkt nach M84: „Der Stein wirkt jetzt auf der falschen Ebene.
Plötzlich kann ich auf Ebene 1 nicht mehr auf ein Feld, das in Ebene 3 ein
Stein ist." Genau so war es, und der Grund ist eine Eigenschaft des Loaders,
die man kennen muss: Er baut EINE `Ball`-Instanz und gibt sie JEDER
Ebenen-Welt (`new World(walls, ball, goal)`) – die Kugel ist über alle Ebenen
dasselbe Objekt, nur die Welt drumherum wechselt.

M84 ließ die Steine auf allen NICHT geschritteten Ebenen weiterrollen
(`advanceIdleWorlds`), damit ein Stein, den der Partner drüben anstößt, auch
ankommt – eine Platte kann eine Tür über Ebenen öffnen. `updateBoulders`
rechnet aber auch die Ball-Kollision mit, und die traf die geteilte Kugel:
Der Kasten auf Ebene 3 stieß sie auf Ebene 1 aus der Zelle.

`advanceBoulders(dt, withBall = false)` lässt die Kollision jetzt aus – eine
Welt, auf der niemand steht, hat auch niemanden zu schieben. Nur die ruhende
Seite im MP-Testmodus bekommt `true`: Dort ist es ihre eigene Kugel auf ihrer
eigenen Ebene. Die Unit hält beides fest: dass der Loader die Kugel teilt (die
Annahme, die den Fehler möglich machte) und dass ein Stein zwei Ebenen tiefer
sie nicht mehr bewegt – ohne den Fix rutscht sie von 250 auf 192.

## M85 „Weitersagen" ✓ (v3.17.0)

Wunsch: „Ich hätte gerne einen Promo-Share-Link im Home-Screen. Zum Teilen der
App. Mit Promo-Text (in der aktuellen Sprache) und einem Promo-GIF. Produziere
das GIF als Screencast der App, geschnitten mit Impressionen, die den Charakter
des Spiels wiedergeben."

**Der Knopf.** Im Menü-Footer stehen zwei Chips: 📣 App weitersagen teilt
`{title, text, url}` über Web Share – Werbetext aus dem Wörterbuch der
AKTUELLEN Sprache, Adresse aus EINER Konstante (`APP_URL` in src/promo.ts,
rein und mit Units). Nicht `location.href`: Wer vom Dev-Server oder einer
Vorschau aus teilt, verschickte sonst einen Link, den niemand öffnen kann. Ohne
Web Share landet „Text + Link" in der Zwischenablage und der Status sagt es.
🎞 GIF teilen schickt die Datei – GETRENNT, weil iOS/Signal Datei UND Text
nicht zuverlässig zusammen nehmen (Lektion 2.11.4); dafür `shareBinaryFile` in
ui/download.ts mit ECHTEM Typ (`image/gif`, nicht octet-stream: als Bild soll
es ankommen, nicht als Anhang).

**Die Vorschau.** `og:image` zeigt absolut auf `promo.gif` – Vorschau-Bots
kennen keinen Kontext. Damit trägt schon der reine Link die Animation.

**Das GIF.** `tools/promo.mjs` (npm run promo) fährt die App wie
tools/screenshots.mjs (vite preview, vorinstalliertes Chromium) und nimmt sechs
Szenen auf: Splash mit Einfahrt, Dunkelheit + Echo-Ping, Sieg mit Konfetti,
Element-Galerie, Hörtest-Kompass, Editor mit Badges. Es gibt hier KEIN ffmpeg,
also entsteht das GIF in JS: PNG-Screenshots → Box-Filter auf ein Viertel
(195×422) → EINE 256er-Palette (gifenc, MIT) über eine Stichprobe aller Bilder.
Zwei Details, die den Unterschied machen: Die Bildzeiten sind GEMESSEN (ein
Screenshot dauert 30–80 ms, feste Delays liefen zu schnell), und verkleinert
wird ERST NACH der Aufnahme – mitten im Screencast halbierte das Dekodieren die
Bildrate, die Kugel ruckelte. Ergebnis: 105 Bilder, 13,7 s, ~700 KB.
Das GIF liegt in `public/` und ist damit NICHT im Precache der PWA
(`globPatterns` kennt kein gif) – offline soll die App klein bleiben.

E2E Lauf 43 prüft die Nachricht in zwei Sprachen, den Zwischenablage-Fallback,
das GIF als `image/gif` OHNE Text daneben, `og:image` und dass die Chip-Zeile
bei 400 px nicht aus dem Menü läuft.

## M84 „Zu zweit rollt der Stein für beide" ✓ (v3.16.0)

Direkt nach M83, dieselbe Klasse: „Wenn Blöcke (Steine) bewegt werden, soll das
bei beiden Spielern der Fall sein." Jeder Spieler hat eine eigene Welt, also
auch seinen eigenen Rollstein – der Stein, den der Partner schob, blieb hier
stehen. Schlimmer als beim Läuten: Eine Platte, die er drüben mit dem Stein
hielt, hielt HIER nichts, denn im echten Netz zählt für die Tür nur die eigene
Welt (`collectOpeners` sieht lokal nur eine). Ein Coop-Rätsel „du legst den
Stein auf die Platte, ich gehe durch" war damit unspielbar.

Übertragen wird der STOSS, nicht die Position: Nachricht `boulder`
({f, i, d} = Ebene, Stein-Index, Richtung), Empfang über
`World.pushBoulderAt(i, dir)` – dieselbe Regel („ist die Zielzelle frei?")
entscheidet auf beiden Seiten, und Loch füllen, Eis-Fortsetzung und Platte
folgen daraus wie beim eigenen Stoß. Eine ferngesteuerte POSITION wäre
verlockend, aber falsch: Wände sind im MP nicht synchronisiert (M68), also
könnte sie den Stein in eine Wand setzen, die nur einer gebrochen hat. Gesendet
wird nur der BALL-Stoß (`startBoulderMove(…, sync)` markiert ihn im Ereignis);
die Fortsetzung auf Eis macht die Physik drüben selbst, sonst rollte der Stein
dort zwei Zellen.

Dazu, wie bei der Glocke, das Weiterlaufen: `advanceBoulders(dt)` für Welten,
die die Schleife nicht schrittet (andere Ebene, ruhende Seite im MP-Testmodus –
eine Platte kann eine Tür ÜBER Ebenen öffnen), und ihre Klang-Ereignisse werden
dort verworfen (`advanceIdleWorlds`, aus `decayIdleBells` gewachsen): derselbe
Stein klingt schon in der eigenen Welt.

E2E Lauf 42 „Stein zu zweit": Stein und Platte in Spieler 1s Reihe, die Tür in
Spieler 2s Reihe – geprüft wird, dass der Stein in BEIDEN Welten auf (5,0)
liegt und beide Platten halten (einmal rot gesehen: nur die eigene Welt).
Fixture-Lektion aus Lauf 31 wiederholt: Die Platte gehört ans Korridor-ENDE,
sonst schiebt der rollende Ball den Stein über sie hinaus.

## M83 „Zu zweit läutet sie für beide" ✓ (v3.15.0)

Wunsch aus dem Levelbau: „Das Läuten der Glocke soll im Multiplayer auch beim
anderen Spieler wirken." Genau das fehlte, und zwar aus der Architektur heraus:
Jeder Spieler hat eine EIGENE Welt (`loadLevel(def, { player })`), also auch
eigene Horcher. Wer läutete, lockte nur seine – die Coop-Geste „ich läute, du
schleichst vorbei" gab es nicht.

Übertragen wird das wie Schlüssel und Zeitschalter (M59), mit einer neuen
Nachricht `bell` ({f, i} = Ebene + Index, wie 'key'/'switch'):
`World.ringBellAt(i)` schlägt die Glocke in der Welt des Empfängers an – ohne
Kanten-Trigger und ohne `rungNow`, denn seine Kugel steht nicht darauf und den
Klang bringt die Nachricht mit (`audio.bellRing` aus ihrer Richtung, plus die
Meldung „🔔 Partner läutet die Glocke"). Sie wirkt in COOP UND RACE: Ablenkung
ist keine Progression, sondern Teil der Welt – wie die Platten.

Zwei Nebenbaustellen, die dazugehören:
- `advanceBells(dt)` – die Spielschleife schrittet nur die Welt der AKTIVEN
  Ebene. Ohne dieses Herunterzählen bliebe ein Läuten auf einer anderen Ebene
  stehen und lockte beim Betreten die Horcher zu einem Klang von vor einer
  Minute (`decayIdleBells` in app.ts).
- `advanceListeners(dt)` – im MP-TESTMODUS läuft die ruhende Seite mit
  (`advanceGuards`/`advanceHoles` gab es schon): Sonst sieht der Bauende nicht,
  was sein Läuten beim Partner tut. Die Glocke wird dort direkt in der anderen
  Welt angeschlagen, wie die Platten.

E2E Lauf 41 „Glocke zu zweit": Glocke in Spieler 1s Reihe, Horcher in Spieler 2s
Reihe – geprüft wird, dass sie in BEIDEN Welten klingt und der Horcher der
ruhenden Seite zu ihr läuft (einmal rot gesehen: `ringing: [1,0]`).

## M82 „Der Partner ist mitgekommen" ✓ (v3.14.0)

Am GETEILTEN Level geprüft (das ist neu seit M80 möglich – Diagnose-Link, dann
`validateLevel` direkt darauf): Ein Coop-Level über vier Ebenen, Badges bis auf
den Softlock grün, gemeldet war „Ebene 2, Zelle 0/0 · Spieler 1: Tür tor2 fällt
hinter dir zu". Die Karte erklärt es: Auf Ebene 1 stehen ZWEI Zeitschalter
gekreuzt – Spieler 1s Schalter öffnet Spieler 2s Tür und umgekehrt –, dann zieht
jeder über seinen eigenen Transporter weiter, und auf Ebene 3 braucht Spieler 1
eine Tür, deren vier Platten nur zu zweit (plus zwei Steine) zu halten sind.

Der Softlock-Beweis setzt für jede Zelle den einen Spieler DORTHIN und den
Partner an seinen START. Genau das ist in so einem Level ein Zustand, den das
Level nie einnimmt: Spieler 1 kann Ebene 2 gar nicht erreicht haben, ohne dass
Spieler 2 seinen Schalter gedrückt hat und selbst weitergerollt ist (die Tür
davor hält nur, wer zu zweit auf zwei Platten steht). Am Start festgenagelt
kommt der Partner nirgendwohin – sein Schalter liegt ja beim anderen –, also
öffnet die Platten-Tür nie, und der Beweis meldet einen Riegel.

Die Regel dagegen ist dieselbe wie „gebrochen bleibt gebrochen" (M68) und
„eingerastet bleibt eingerastet" (M78), nur für die POSITION des Partners:
FORTSCHRITT IST MONOTON. `pairReachable` nimmt dafür eine Saat
(`reachSeed`), die Softlock-Schleife gibt dem Partner seine Reichweite aus dem
VOLLEN Lauf mit – er steht also irgendwo auf seinem Weg, nicht wieder am
Anfang. Was er nie erreicht, hält er weiterhin nicht (M74 bleibt: die Platte,
auf der man selbst stehen müsste, öffnet einem die Tür nicht), und eine echte
Einbahn bleibt eine Falle (Gegenproben als Units: Platte auf der eigenen Seite
⇒ `coop` rot; Tasche hinter einer Strömung ⇒ `softlock` rot).

Das gemeldete Level ist damit grün und teilbar; übrig bleibt das WEICHE
`timer`-Badge („torA: 8s" bzw. im Original „tor3: 2s") – ein knapper Sprint ist
Schwierigkeit, kein Fehler.

## M81 „Die Bruchseite zeigt in die falsche Richtung" ✓ (v3.13.0)

Rückmeldung zum M79-Bericht: „Nach Tor 2 gibt es eine Wand (halb brüchig), mit
der man zurückkommt." Der Beweis KANN das – nachgebaut als Unit: eine Tasche,
hinein nur durch die Tür, hinaus durch eine einseitig brüchige Wand, deren
Bruchseite in die Tasche zeigt: alles grün. Dreht man die Seite nach außen, ist
es ein echter Softlock, denn dann führt die gerichtete Kante HINEIN statt
hinaus.

Genau das war die Lücke im Bericht: Er nannte die TÜR („Tür tor2 fällt hinter
dir zu") – wahr, aber der Bauende schaut auf die Wand, die er gerade als
Rückweg gesetzt hat, und sieht keinen Widerspruch. Also fragt `nameCause` jetzt
zusätzlich: Würde diese Wand, GEDREHT, den Rückweg öffnen? Wenn ja, steht das
im Satz: „Tür tor2 fällt hinter dir zu; die brüchige Wand bei Ebene 1, Zelle
1/1 bricht nur von der anderen Seite." Eine Probe je einseitig brüchiger Wand,
nur für die EINE gemeldete Zelle – der Beweis wird nicht teurer. Ohne solche
Wand bleibt der Satz kurz (Gegenprobe als Unit), und der alte M68-Fall
(Tasche auch per Strömung erreichbar) sagt jetzt dasselbe genauer.

Dazu die Vorbeugung im Editor: Unter „Bricht von" steht, sobald eine Seite
gewählt ist, WELCHE gemeint ist – die Seite, auf der der BALL steht (der Keil
zeigt sie), als Rückweg also die Seite, auf der man eingeschlossen ist. Ein
Feld mit vier Himmelsrichtungen ohne Bezugspunkt ist eine Münze, die man wirft.

## M80 „Ein rotes Level kommt aus dem Gerät heraus" ✓ (v3.12.0)

Aus dem Levelbau, direkt nach M79: „Zur Analyse wäre es gut, wenn man Level mit
Fehlern (nach Rückfrage) exportieren kann. Dann könnte ich es dir zur Analyse
geben." Genau der Fall war verbaut: Teilen (🔗) verlangte grüne Pflicht-Badges –
und das ROTE Level ist ja das, über das man reden will. Die Export-Datei ging
zwar immer, trug aber nur die Def, also ohne den Befund, um den es geht.

Drei Änderungen, eine Idee (der Beweis darf niemandem den Mund verbieten):

1. **Teilen nach Rückfrage.** Rote Badges blockieren den Link nicht mehr, sie
   stellen eine Frage: Der erste Tap bewaffnet (🔗 → ⚠, die Frage in die
   STATUSZEILE – im Knopf stünde ein Satz und sprengte die Kopfzeile, Regel aus
   v3.0.2), der zweite teilt und nennt das Ergebnis „Diagnose-Link: 1 rot, 0
   Warnung". Dasselbe in der Werkstattliste (Icon-Knopf: ⚠ im Text, Frage im
   Tip – dafür nimmt `twoTap` jetzt einen eigenen `armedTip`). Was NICHT lädt,
   hat weiterhin keinen Link (`ed.shareLoadBad`): Ein Token, das der Empfänger
   nicht dekodieren kann, hilft niemandem – dafür ist die Datei da.
2. **Der Export trägt die Befunde.** `src/levels/diagnosis.ts` (rein) leitet
   aus dem Bericht die nicht-grünen Checks ab (`findings`: Schlüssel,
   hart/weich, Detail, Ort 1-basiert wie im Editor);
   `exportPayload(def, report)` hängt sie plus App-Version an die Hülle. Der
   Import liest nur `def` und stört sich nicht daran, ein sauberes Level
   exportiert weiter schlank.
3. **Der Empfänger wird gewarnt.** `offerSharedLevel` prüft selbst und schreibt
   „⚠ Diagnose-Link: … vielleicht nicht lösbar. Zum Anschauen gedacht, nicht zum
   Spielen." ins Angebot – sonst wäre „Ausprobieren" ein Versprechen, das das
   Level nicht hält. Ein grünes Level wird ohne diesen Satz angeboten
   (Gegenprobe im E2E).

`twoTap`/`disarm` wohnen jetzt in `src/ui/twoTap.ts` – Werkstatt UND Editor
brauchen sie, und eine Kopie wäre die zweite Wahrheit.

## M79 „Der Softlock sagt, WER ihn verursacht" ✓ (v3.11.0)

Meldung aus dem Levelbau: „Weiterer Softlock: er denkt, ein Horcher ist im Weg,
der aber vom anderen Spieler weggelockt werden kann." Der Beweis denkt das
nicht – HORCHER KOMMEN IN IHM GAR NICHT VOR (`patrolLines` sammelt nur
`guard`, und der Softlock-Beweis rechnet nicht einmal mit Wächtern). Aber der
Bericht nannte nur den ORT: „Ebene 1, Zelle 3/5 · Spieler 1". Wer dort einen
Horcher stehen sieht, hält den für den Riegel – der Bericht hat ihn dazu
verleitet.

Jetzt nennt er den Übeltäter. `nameCause(k, ziel, latched, reach)` fragt in
dieser Reihenfolge: Bestünde mit ALLEN Türen offen ein Rückweg? Dann sagt eine
Einzelprobe je Tür, WELCHE es ist („Tür tor1 fällt hinter dir zu"). Sonst: Liegt
das Ziel auf einer anderen Ebene? Dann „von Ebene 3 führt kein Weg zurück
(Transporter?)". Sonst bleibt „kein Rückweg (Einbahn-Strömung oder brüchige
Wand)". Die Probe läuft NUR für die eine gemeldete Zelle – der Beweis selbst
wird nicht teurer. Beide Pfade nutzen sie (zwei Spieler über `pairReachable`,
Einzelspieler über `coopReachable`); die force-open-Saat ist dieselbe wie bei
den eingerasteten Türen aus M78.

Dazu die Erklär-Tafel (`ed.help.softlock`, alle vier Sprachen): Sie sagt jetzt,
WAS der Beweis rechnet – Wände, Türen, Strömungen, Transporter – und dass
Horcher und Wächter hier NIE der Grund sind (Wächter haben ihr eigenes Badge).
Ein Bericht, der zur falschen Ursache verleitet, ist so teuer wie ein falscher
Bericht.

NACHTRAG v3.11.1: Der Grund kam auf dem Gerät zwar an, aber mit einem Fransen.
`checkDetailText` im Editor streicht den Zellschlüssel aus dem technischen
Detail – der Ort steht ja darüber in Klartext –, und übrig blieb der
Gedankenstrich, der ihn vom Grund trennte: „Ebene 2, Zelle 0/0 · – von Ebene 2
führt kein Weg zurück". Bei zwei Spielern kam die Rolle mit doppeltem
Trennzeichen dazu („Spieler 1: – kein Rückweg"). Jetzt räumt die Funktion beides
auf, und E2E Lauf 37 prüft die GANZE Zeile (Anfang bis Ende) statt nur den Ort –
ein Fransen ist genau der Fehler, den eine Teil-Zusicherung durchlässt.

## M78 „Eingerastet bleibt eingerastet" ✓ (v3.10.1)

Meldung direkt nach M77: „Jetzt ist nur noch ein Softlock da, der nicht
stimmt. Die Tür bleibt offen." Genau daran lag es. Der Softlock-Beweis setzt
für JEDE erreichbare Zelle neu an und fragt: Ist das Ziel von hier noch
erreichbar? Dabei leitete er die Türzustände jedes Mal frisch ab – und bei
einer Tür mit „bleibt offen" ist das die falsche Frage. Wer hinter ihr steht,
hat sie eingerastet; sie kann nicht wieder zufallen. Das Modell fragte
trotzdem „kannst du sie von DORT aus öffnen?", fand die Platte auf der
falschen Seite und meldete einen Riegel, den es nicht gibt.

Die Regel dafür stand schon in M68 („gebrochen bleibt gebrochen") und heißt
jetzt auch für Türen: Wer eine Zelle NUR durch die latchende Tür erreicht, hat
sie eingerastet – ab dieser Zelle gilt sie als offen, und zwar für BEIDE
Spieler (die Tür ist physisch offen). Eine Zelle, die man auch ohne sie
erreicht, zählt ohne sie: dort ist die Tür vielleicht noch zu, und wenn nur
sie hinausführt, ist das ein echter Softlock. Technisch: `pairReachable` und
`coopReachable` nehmen die eingerasteten Türen als Saat (`latched` /
`opts.latched`), und `latchedAt(k, …)` leitet je Zelle ab, welche das sind –
aus der Reichweite mit GENAU DIESER Tür gebannt.

Units in tests/coopPlates.test.ts: der Rückweg durch die eingerastete Tür ist
kein Softlock (rot gesehen, indem die Saat entfernt wurde); ohne „bleibt
offen" geht dieselbe Tür nie auf, dann steckt auch niemand dahinter (rot ist
der Öffner-Check, nicht der Softlock); und ein Transporter in eine Ebene ohne
Rückweg bleibt neben einer latchenden Tür rot – die Annahme gilt für die Tür,
nicht als Gummistempel.

## M77 „Seitenwechsel" ✓ (v3.10.0) – wer halten kann, entscheidet die Tür

Meldung mit Bild, direkt nach M76: „Hier müssen P1 und P2 die Seite wechseln.
Die Schalter liegen daher auf beiden Seiten der Tür – es wird angezeigt: Fehler
Öffner vor Tür." Der Bericht hatte recht und war zugleich unbrauchbar: Er sagte
„tor1: 2 Platten gleichzeitig, 3 Halter" – als wären die Halter das Problem,
obwohl drei da waren.

Die Wahrheit hängt an der TÜR, nicht an der Zahl der Körper:

- Eine Tür, die WIEDER ZUFÄLLT, muss offen sein, WÄHREND jemand durchrollt –
  und wer durchrollt, hält keine Platte. Für zwei Platten bleibt genau EIN
  freier Spieler (der Partner) plus die Steine. Die Anordnung „Schalter links
  und rechts" ist damit unlösbar: Stehen beide, geht niemand; geht einer, fällt
  die Tür zu.
- Eine Tür, die OFFEN BLEIBT (`latch`, M76), muss beim Öffnen niemanden
  durchlassen. BEIDE Spieler dürfen gleichzeitig auf Platten stehen, die Tür
  rastet ein, und danach tauschen sie in Ruhe die Seiten. Genau die Idee aus
  der Meldung.

Deshalb rechnet `holdCheck` jetzt mit einer Kapazität, die die Tür vorgibt
(`feetFree` = 2 bei latch, sonst 1), und `pairReachable` zählt bei einer
latchenden Tür auch die EIGENE Platte als Öffner – M74 („die eigene Platte
öffnet mir nichts") gilt nur, solange die Tür wieder zufällt. Der Bericht sagt
jetzt, was fehlt, und nennt den Ausweg: „2 Platten nur für Füße, 1 Spieler frei
(wer durchrollt, hält nichts) – „bleibt offen" löst das" (`holdDetail`).

Units in tests/coopPlates.test.ts halten die Anordnung aus der Meldung fest:
mit „bleibt offen" ist sie grün und teilbar (beide erreichen ihr Ziel auf der
anderen Seite), ohne sie rot mit dem Hinweis – und die eigene Platte öffnet
eine latchende Tür auch allein.

## M76 „Eine Platte ist eine Platte" ✓ (v3.9.0) – Türregel und Halter

Zwei Fragen aus dem Levelbau, und hinter der zweiten ein echter Fehler.

**„Bleibt die Tür offen, wenn die Schalter sie geöffnet haben?"** Nein: Ein
SCHLÜSSEL öffnet dauerhaft (die Tür wird zu Schutt), eine PLATTE hält nur,
solange jemand darauf steht, ein ZEITSCHALTER nur, solange sein Timer läuft.
Das ist die Halte-Choreografie zu zweit – aber es soll eine Entscheidung des
Bauenden sein. Neu: `door.latch` („Nach dem Öffnen: bleibt offen") – sobald die
Bedingung EINMAL erfüllt war, bleibt die Tür offen. Die Regel wohnt in
`doorState(openers, require, latched)`, den Zustand führt `Wall.door.latched`;
im MP kommen beide Seiten aus denselben synchronisierten Öffnern zum selben
Schluss. Der `timer`-Check überspringt latchende Türen: Wo die Tür offen
BLEIBT, gibt es keinen Sprint, für den die Zeit reichen müsste.

**„Im Testmodus waren alle anderen Platten automatisch gedrückt."** Genau so
war es, und nicht nur dort: Der Halte-Zustand lief über die TÜR-ID
(`plate.opens`) – im Testmodus wie in der Netz-Nachricht `plate`. Zwei Platten
derselben Tür waren damit EIN Schalter: Wer auf einer stand, hielt die andere
mit, und ein `require: 'all'` ging mit einer Kugel auf. Jetzt trägt jede Platte
ihre eigene Kennung (`Plate.id` = „Ebene:Spalte,Zeile", gesetzt im Element aus
`ctx.floorIndex`), der Halte-Zustand wird je PLATTE geführt und je Platte
verschickt. Protokoll-Hinweis: Beide Seiten müssen dieselbe Version fahren –
die Nachricht trägt jetzt die Platten- statt der Tür-Kennung.

**Der Partner ist EIN Körper.** Aus dem ersten Fix folgt eine Modell-Lücke, die
vorher hinter dem Bug lag: Eine `all`-Tür mit zwei Platten braucht zwei HALTER
– der Partner ist einer, jeder Rollstein einer. `holdable()` in validate.ts
zählt das wie bei Hall (Platten, die nur Füße halten können, gegen den einen
Partner; Platten, die nur ein Stein erreicht, gegen die Steinzahl; nie mehr
Platten als Halter) und speist beides: `pairReachable` (die Tür geht im Modell
nicht auf) und den `openers`-Bericht, der es beim Namen nennt
(„2 Platten gleichzeitig, 1 Halter"). Die Prüfung steht VOR dem Ausstieg für
reine Platten-Türen – sonst bliebe der häufigste Fall stumm. Ohne sie wäre ein
Level mit zwei Platten und keinem Stein grün und unspielbar; das gemeldete
Level (Stein + Gast) bleibt grün, denn zwei Halter für zwei Platten genügen.

E2E Lauf 40 fährt die ganze Kette im Testmodus: eine Platte allein öffnet die
`all`-Tür NICHT, mit beiden geht sie auf und BLEIBT offen (Platte los, Tür
offen), und die Tür ohne Latch fällt hinter dem Gast wieder zu.

Nebenbefund aus dem neuen Feld: Lauf 14 fiel plötzlich mit einem Klick-Timeout
aus, und die Ursache lag nicht am Feld, sondern im Panel. `#edProps` ist eine
Flex-Spalte; ist ihr Inhalt höher als der Kasten, SCHRUMPFEN die Kinder – und
ein Kind mit eigenem `min-height` (`.menu-meta`: 1.2em) fällt auf eine Zeile
zusammen, während sein Text sichtbar darüber hinausläuft. Der überlaufende
Text nahm dann die Klicks des Knopfes darunter an (`elementFromPoint` traf den
Hinweistext statt „⌫ Element löschen"). Jetzt schrumpft dort kein Kind mehr
(`#edProps > * { flex-shrink: 0 }`), der Kasten scrollt – und der Hinweis
steht wie beim Nachbarfeld nur da, wenn die Einstellung ihn braucht.

## v3.8.1 – Element-Sheet verdeckte seinen eigenen Öffner

Meldung mit Bild: „Die Element-Auswahl ist zu hoch und überlappt mit dem
Element-Knopf. Damit kann die Auswahl nicht mehr geschlossen werden." Genau
so war es: Das Sheet war eine bodennahe Karte (`max-height: 60vh`), und auf
einem kurzen Gerät reichte sie bis über die Werkzeugleiste – über den Knopf,
der sie wieder zuklappt. Wer nichts setzen wollte, saß fest.

Jetzt ist es ein MODAL nach dem Muster der Beweis-Tafel (M73): Schirm über dem
Editor, darin eine opake Karte mit Kopf („Elemente" + Schließen) und dem
scrollenden 3-Spalten-Grid. Zwei Wege heraus, beide ohne Auswahl: der Knopf im
Kopf und ein Tap NEBEN die Karte. Der Schirm lässt über der Karte immer eine
Fingerbreite frei – das prüft E2E Lauf 12 mit, sonst wäre „daneben" wieder nur
eine Behauptung.

Beim Nachmessen fiel ein zweiter, älterer Fehler auf: Ein `<button>` als
Grid-Kind meldet seine Inhaltshöhe NICHT an die Grid-Zeile. Die Zeile blieb
bei `min-height` (44 px), und zweizeilige Namen („Zeitschloss-Schalter")
ragten 25 px in die Kachel darunter. Heilmittel sind BEIDE zusammen:
`min-height: max-content` an der Kachel und `grid-auto-rows: max-content` am
Grid – nur eines von beiden macht es schlimmer (die Kachel wächst, die Zeile
nicht, und dann überlappt sie die nächste Zeile ganz). Der Lauf prüft die
Folge, nicht die Regel: kein Name außerhalb seiner Kachel, keine Kachel über
der nächsten Zeile.

## M75 „Ein Weiterleiter" ✓ (v3.8.0) – Join scheitert im Mobilfunk

Meldung mit Bild aus der Lobby-Diagnose (M70), und diesmal sagte sie genau,
was los ist: Vermittler 7/8 offen, Partner gefunden, dann
`16,1 s Fehler: could not connect to peer … after exchanging SDP; configure
TURN servers`. Der Handshake lief also – die STRECKE fehlte. Das Phone hing im
5G-Netz, und dort sitzt es hinter Carrier-NAT (CGNAT, meist symmetrisch): Beide
Seiten kennen über STUN ihre öffentliche Adresse, aber jedes Paket dorthin
fällt auf den Boden. Dagegen hilft kein Code, nur ein WEITERLEITER (TURN), der
die Daten durchreicht.

Einen verlässlichen kostenlosen gibt es nicht – nachgemessen in Chromium: Die
alten offenen Relays (openrelay.metered.ca, auch staticauth, 80/443/turns)
liefern KEINEN Relay-Kandidaten mehr. Deshalb wird TURN nicht mitgeliefert,
sondern EINGETRAGEN, und zwar auf dem Gerät (`tiltr.turn.v1` im
localStorage) – Zugangsdaten gehören niemandem sonst, schon gar nicht dem Repo.

Drei Teile:

1. **Der Weg dahin.** `turnConfig` an trystero (es KONKATENIERT die Liste auf
   seine eingebauten STUN-Server, ersetzt sie also nicht). `src/net/ice.ts` ist
   der reine Teil: `parseIceServers` nimmt die Zeilenform
   `turn:wirt:3478|nutzer|passwort` UND das JSON einer Anbieter-Konsole (auch
   mit `urls`-Liste), `formatIceServers` schreibt zurück, `iceHosts` zeigt nur
   Wirte – das Passwort steht nie im Bild.
2. **Der Selbsttest.** `src/net/iceProbe.ts` sammelt an einer Wegwerf-
   Verbindung die eigenen Kandidaten; ihre Typen sind die ganze Auskunft
   ('srflx' = STUN antwortet, 'relay' = TURN antwortet). `iceVerdict`
   unterscheidet ok / turnDead / noTurn / blind. Ohne diese Messung ist
   „findet sich nicht" nicht von „Zugangsdaten abgelaufen" zu trennen.
3. **Der Klartext.** `lobbyHint` kennt 'blocked' – das Signal kommt aus dem
   Transport (`TransportInfo.iceFailed`, gesetzt, wenn trystero den
   SDP-Fehler meldet) und STICHT jede Zeitregel: „warte auf Partner" wäre
   gelogen, wenn der Partner schon da war. Die Lobby sagt stattdessen, woran
   es liegt und was hilft (gleiches WLAN – oder TURN eintragen), und zeigt
   genau dann den Eingabekasten.

Nicht gebaut: ein Datenweg über die Nostr-Relays als TURN-Ersatz. Ein
Coop-Level schickt ~20 Positionen je Sekunde, dafür sind die Relays nicht
gedacht (Rate-Limits, hundert Millisekunden Latenz) – es wäre kein
Multiplayer, nur eine langsamere Enttäuschung.

## M74 „Wer hält die Platte?" ✓ (v3.7.0) – Softlock, der keiner war

Meldung mit Bild: „Hier gibt es einen Softlock, der keiner ist. Die Tür zum
Schlüssel wird über zwei Platten geöffnet, eine mit Stein und eine mit dem
zweiten Spieler." Zwei Lücken im Modell, beide an derselben Frage – WER hält
die Platte, während der andere durch die Tür rollt?

**1. Eine Platte, auf der man selbst steht, ist kein Öffner.** `pairReachable`
zählte im Coop JEDEN erreichbaren Öffner für beide (M59) – auch eine Platte,
die der Spieler selbst besetzen müsste. Damit spazierte das Modell durch die
Tür und meldete danach brav einen Softlock in einem Raum, den man in
Wirklichkeit nie betritt. Jetzt gilt eine Platte für Spieler P nur, wenn der
ANDERE sie erreicht (oder ein Stein sie hält, siehe 2); Schlüssel und
Zeitschalter bleiben geteilt, denn die wirken weiter, wenn man weitergerollt
ist. Das ist strenger als vorher und findet echte Fehler: eine Tür, deren
einziger Öffner im eigenen Gang liegt, ist für den Spieler zu.

**2. Ein Stein auf einer Platte war unsichtbar.** Der Rollstein-Beweis
(`boulderProof`) verlangte Steine auf ALLEN Platten einer reinen Platten-Tür
und wusste nichts vom Partner; der Paar-Beweis wusste nichts von Steinen.
Beide Seiten reden jetzt: `BoulderProof.stonePlates` sagt, auf welchen Platten
in einem erreichbaren Zustand ein Stein liegen kann, `boulderProof(def, start,
heldPlates)` nimmt umgekehrt die Platten, die der Partner halten kann.
`validateLevel` rechnet das EINMAL – je Spieler die erreichbaren Platten
(`heldBy`), daraus die Stein-Platten aus beiden Startpunkten – und reicht
`stonePlates` an jeden `pairReachable`-Aufruf und an den `openers`-Check
durch. Ein Zwei-Spieler-Level mit Stein wird deshalb aus BEIDEN Starts
durchgerechnet: Im gemeldeten Level erreicht nur Spieler 2 den Stein.

Der Bericht des gemeldeten Levels geht damit von „ROT softlock / ROT boulder"
auf grün; `tests/coopPlates.test.ts` hält beides fest – die gemeldete
Anordnung als teilbares Level UND die Gegenprobe, dass die eigene Platte
weiterhin nicht zählt (ohne sie wäre die neue Regel ein Gummistempel).

## M73 „Eine Karte, nicht zwei Schichten" ✓ (v3.6.1) – Erklär-Tafel als Modal

Meldung mit Bild: Die Erklär-Tafel aus M71 lag DURCHSICHTIG über dem
Eigenschaften-Griff des Phone-Editors – zwei Ebenen Text übereinander, beides
unlesbar. Ursache: Die Tafel war eine bodennahe Karte (`inset: auto … bottom`)
mit `.panel` (rgba 0.04) und landete genau auf dem Drawer (z 2).

Jetzt ist sie ein MODAL nach dem Muster von `#interstitial`: Schirm über allem
im Editor, darin eine opake Karte (`--bg-panel`) unten in Daumennähe, Tap
daneben schließt. Der Titel trägt den Zustandston (✓ Teal, ⚠/✗ Bernstein), das
Detail steht in Bernstein, „👁 Zeigen" ist ein eigener Knopf. Kein `menu-meta`
mehr für den Erklärtext – dessen 55 % Deckkraft war der zweite Teil des
Problems.

## M72 „Meine Tür, meine Runde" ✓ (v3.6.0) – Tür je Spieler, Bahn mit Pausen

Zwei Wünsche aus dem Levelbau.

**Tür nur für einen Spieler** (`door.player`, wie `transporter.player` in M65):
Für den anderen ist sie eine WAND – und zwar überall gleich. Im Spiel baut das
Tür-Element für ihn eine Wand OHNE `door`-Eigenschaft (`ctx.player`, neu im
BuildContext), damit `updateDoors` sie nie anfasst; im Beweis mauert
`buildFloorCells` die Kante in JEDEM Modell zu, auch mit `doorsOpen`. Sie
klingt und leuchtet damit wie eine Wand: Eine Tür, die für mich nie aufgeht,
ist keine Tür, sondern das Ende des Gangs – alles andere wäre ein Versprechen,
das das Level nicht hält. Editor: Feld „Tür für" (beide / Spieler 1 / 2, nur
bei zwei Spielern) plus der Hinweis, was es für den anderen bedeutet.

**Wächter-Bahn mit beliebig vielen Wegpunkten und Pausen** (`guard.pause`,
parallele Liste zu `patrol` – so lädt jede bestehende Def unverändert): Am
Wegpunkt hält der Wächter für seine Pause an, dann läuft er weiter
(`Guard.waitLeft`, abgezogen VOR der Bewegung; der Rest des Schritts verfällt,
er hält an und rutscht nicht). Ein Schläfer wartet nicht, er schläft. Der
Riegel-Beweis bleibt unberührt: `guardsProof` nimmt ohnehin an, der Wächter
könne überall auf seiner Bahn stehen – eine Pause ändert nur das Timing.
Editor: Liste der Wegpunkte mit Pausenfeld je Punkt, „＋ Wegpunkt" (nächster
Tap, achsenparallel wie beim Setzen – diagonal liefe durch Wände),
„− letzter" (zwei bleiben), und im Overlay Nummern, Verbindungslinie und ⏸ am
wartenden Punkt.

Units: Pause-Physik in tests/physics.test.ts (ohne/mit Pause, Schläfer),
Tür je Spieler in tests/mpLevel.test.ts (Loader baut Wand statt Tür, Beweis
lässt den anderen nicht durch, Coop-Badge rot). E2E Lauf 38 fährt beides im
Editor und im Testmodus (Spieler 1 sieht die Tür, Spieler 2 eine Wand).

## M71 „Warum rot?" ✓ (v3.5.0) – Beweise erklären sich und zeigen die Stelle

Meldung aus dem Levelbau: „Wir haben einen Softlock. Warum?" – und genau das
sagte der Editor nicht. Ein rotes Badge war eine Sackgasse: ein Wort, ein
Kreuz, und im `title`-Attribut ein technisches Detail, das auf dem Phone
niemand sieht.

Jetzt ist jedes Badge ein KNOPF. Tippen öffnet eine Tafel mit drei Dingen:
was der Beweis prüft und was ein Rot bedeutet (`ed.help.<key>`, ×4 Sprachen,
je Check ein Satzpaar – beim Softlock zum Beispiel die drei üblichen
Ursachen: Transporter in eine Ebene ohne Rückweg, Einbahn-Strömung, Tür, die
wieder zufällt), das Detail in KLARTEXT („Ebene 2, Zelle 0/0" statt „1:0,0"),
und – wo der Beweis den Ort kennt – „👁 Zeigen": Ebenenwechsel, Zelle
hervorgehoben (bernsteinfarbener Rahmen, bis man das Feld anfasst), Ansicht
mittig darauf.

Dafür trägt der Prüfbericht den Ort im Modell, nicht im Text: `CheckResult.at`
(`Place` = Ebene + Zelle in Def-Koordinaten, also genau die, die der Editor
zeichnet) wird von softlock, openers, timer, links, items, jukebox, guards,
boulder und coop/race gefüllt. `guardsProof` und `boulderProof` liefern ihn
mit; der technische Detailtext bleibt daneben stehen, aber Zellschlüssel
werden herausgefiltert – sie stehen ja schon als Klartext da.

Nebenbei bestätigt: Die Türen im MP-Testmodus folgen seit M69 den echten
Öffnern (der Phantom-Partner, der ALLE Platten hielt, ist weg). E2E Lauf 35
hält das jetzt fest, indem es beide Zustände AKTIV herstellt: auf die Platte
rollen öffnet die Tür, wegrollen schließt sie. Die Momentaufnahme direkt nach
dem Wechsel wäre ein Flake gewesen – die Neigung schwingt aus, die Kugel
rollt noch ein paar Pixel weiter (deshalb legt `__tiltrTilt` die Neigung offen:
„warum rollt sie von allein?" war ohne diesen Wert Raten).

E2E Lauf 37: Ein Level mit einem Transporter in eine Ebene ohne Rückweg ist
rot, die Tafel erklärt und nennt „Ebene 2, Zelle 0/0", „Zeigen" springt hin;
ein grünes Badge erklärt sich ohne Ort.

## M70 „Wer vermittelt hier?" ✓ (v3.4.0) – Lobby-Diagnose, Wake Lock, Neuverbinden

Meldung: „Multiplayer joinen geht manchmal nicht, gleiches WLAN, ging schon."
Nachgesehen und die Frage „nutzen beide dieselben Handshake-Server?" geklärt:
JA. `getRelays` in trystero nimmt eine gesetzte `relayConfig.urls`-Liste
UNVERÄNDERT – beide Seiten sprechen alle acht Nostr-Relays an, keine
gewürfelte Teilmenge (ohne die Liste würfelt trystero je Gerät eine, und dann
finden sich zwei Spieler nur bei Überschneidung; das war hier nie der Fall).
Also lagen die Ursachen anderswo, und die eigentliche Lücke war: MAN SAH
NICHTS. `connect()` liefert ein Raum-Objekt, ohne dass ein einziger Relay
antwortet – die Lobby sagte trotzdem „warte auf Partner".

Drei Dinge, in der Reihenfolge ihrer Wahrscheinlichkeit:

1. **Wake Lock in der Lobby.** Gewartet wurde mit ungesperrtem Bildschirm nur
   im Spiel (`wake.want()` beim Levelstart), in der Lobby nicht. Sperrt das
   Phone, friert iOS die Seite ein: Die WebSockets zu den Vermittlern sterben,
   der Host steht in einem Raum, in dem er selbst nicht mehr ist. Jetzt hält
   `mpShowLobby()` den Bildschirm wach.
2. **Neuaufbau statt Warten.** Kommt die Seite aus dem Hintergrund zurück
   (oder das Netz wieder), baut trystero die Sockets erst nach bis zu einer
   Minute Backoff neu auf. `mpReconnect()` macht es sofort – automatisch nach
   >3 s im Hintergrund ohne Partner und bei `online`, und von Hand über
   „🔄 Neu verbinden" (die ganze Wartezeit sichtbar). WICHTIG: mit DEMSELBEN
   Raumcode (`mpHost(level, custom, keepCode)`) – ein neuer Code hätte den
   schon gescannten QR entwertet.
3. **Diagnose.** `Transport.info()` (Art, eigene Peer-ID, Relay-Zustände,
   Peers, Ereignis-Protokoll) plus `src/net/health.ts` (rein, mit Units):
   `relayHealth` zählt, `lobbyHint` entscheidet zwischen „verbinde",
   „offline" (kein Relay offen, obwohl Zeit war → Netz/VPN/Firewall),
   „warte" und „hängt" (Relays stehen, nach 35 s niemand da → Code prüfen
   oder neu verbinden). Die kurze Warnzeile erscheint nur in diesen Fällen;
   `?netdebug` (oder der Debug-Modus) zeigt die volle Liste: welcher Relay
   offen ist, wer im Raum ist, und was passiert ist. Ins Protokoll geht auch
   ein IGNORIERTER dritter Peer – ein Zombie aus einer alten Sitzung erklärt
   genau die Sorte Fehler, die nicht am Netz liegt.

Was damit NICHT behoben ist (und im Protokoll sichtbar wird): WLANs mit
Client-Isolation (Gastnetz) verbieten die direkte P2P-Strecke, und ohne
eigenen TURN-Server gibt es keinen Umweg – dann stehen die Vermittler auf ✓,
der Partner erscheint aber nie. E2E Lauf 36 prüft Diagnose, Wake Lock und das
Neuverbinden mit gleichbleibendem Raumcode.

## M69 „Beide Kugeln, abwechselnd" ✓ (v3.3.0) – MP-Testmodus im Editor

Wunsch aus dem Levelbau: Ein Zwei-Spieler-Level allein testen können, mit
Spielerwechsel. Bis jetzt lief die Vorschau als EIN Spieler, und der Partner
war ein Phantom, das ALLE Druckplatten hielt (M57) – bequem, aber unwahr: Es
sagte nichts darüber, ob der Partner die Platte überhaupt erreicht, und schon
gar nicht, ob er sie halten kann, während er selbst weiterkommen muss.

Jetzt lädt die Vorschau eines Zwei-Spieler-Entwurfs BEIDE Welten
(`loadLevel(def, { player })` je Seite – Start, Ziel und die eigenen
Transporter, wie im echten Spiel). Eine Seite ist am Zug, die andere liegt
still, wo man sie gelassen hat: die Kugel ohne Schwung (sonst rollte sie beim
Zurückwechseln weiter), ihre WELT aber läuft mit (`advanceGuards`,
`advanceHoles` – sonst zeigte dieselbe Patrouille beiden Spielern zwei
Stellen). Gewechselt wird per 👥-Kachel im HUD oder Taste „p"; die Kachel sagt,
wer am Zug ist (Spieler 2 in Partner-Koralle). Der ruhende Spieler ist der
PARTNER im Bild – dieselbe Darstellung wie im Multiplayer (Schein im Dunkeln,
roter Ball im hellen Coop), damit die Vorschau nicht anders aussieht als das
Spiel.

Öffner folgen genau dem echten Spiel, nicht einer zweiten Regel: Eine Platte
hält, wer WIRKLICH darauf steht – beide Kugeln zählen, in Coop wie Race (die
Nachricht 'plate' kennt keinen Modus); Schlüssel und Zeitschalter teilt nur
der Coop (M59). Dafür ist `collectOpeners` (core/doors.ts) aus app.ts
herausgezogen: die EINE Sammelstelle, die jetzt über mehrere Welten läuft.
`updateDoors` trennt seither Quellen und Ziele (`applyDoors`) – im Coop
entscheiden beide Welten gemeinsam, im Race jede für sich.

Ebene, Respawn und Ping-Budget gehören der SEITE, nicht dem Lauf – wie zwei
Geräte, nur abwechselnd. Im Ziel ist eine Seite durch (ihre Uhr steht, die
Kugel rollt weiter und kann dem Partner die Platte halten); der Coop gewinnt
erst, wenn BEIDE drin sind, das Race mit dem ersten. Kein Geist in diesem
Modus: eine Spur, die zwischen zwei Kugeln springt, wäre keine Bestzeit.
Nebenbei aufgeräumt: `silenceWorld()` und `winRun()` – die stetigen
Weltklänge und der Sieg-Ablauf standen dreimal im Code, im Solo-Sieg fehlten
Schnarchen und Stimmgabel.

Units: `collectOpeners` in tests/doors.test.ts. E2E Lauf 35 fährt die ganze
Kette allein durch: Partner auf der Platte öffnet die Tür von Spieler 1,
dessen Schlüssel öffnet im Coop die Tür von Spieler 2, „p" friert Spieler 1
an seiner Stelle ein, Sieg erst mit beiden im Ziel.

## M68 „Gebrochen bleibt gebrochen" ✓ (v3.2.2) – Softlock-Beweis kennt den Wandzustand

Meldung aus dem Levelbau: Eine Tasche, die man nur durch eine einseitig
brüchige Wand betritt, stand als Softlock rot – obwohl die Wand, wenn man
drinnen steht, gebrochen und in beide Richtungen offen ist. Das M66-Modell
kannte nur „steht, gerichtete Kante von der Bruchseite"; von jeder Zelle aus
galt die Wand als intakt. Konservativ, aber falsch: Ein Badge, das ein
spielbares Level unteilbar macht, ist ein Fehler (dritte Lektion nach M32
Anker und M39 Glas).

Modell jetzt mit ZUSTAND, ohne Zustands-BFS: `CellConfig.brokenBrittle`
(Wand offen wie beidseitig) und `sealedBrittle` (Wand ohne Kante,
unzerbrechlich), Schlüssel `brittleKey(fl, edge)`. Der Softlock-Beweis
fragt pro einseitiger Wand W einmal „was erreicht man OHNE W zu brechen?"
(sealed) – jede Zelle, die dort fehlt, erreicht man nur durch W, also ist W
dort gebrochen. Von so einer Zelle rechnet der Beweis mit `brokenBrittle`.
Eine Zelle, die man auch anders erreicht (Strömung, Transporter), kann man
mit intakter Wand betreten – dort bleibt die Wand zu, und führt nur sie
hinaus, ist das ein ECHTER Softlock (Unit: Tasche mit zweitem Eingang per
Strömung bleibt rot). Zwei Spieler: Wände sind nicht synchronisiert, jeder
bricht in seiner Welt – `pairReachable` nimmt den Zustand je Spieler.
`buildFloorCells` bekommt die Ebene als vierten Parameter (nur für die
Schlüssel; alle alten Aufrufer bleiben). Units in tests/brittleTorch.test.ts.

## M67 „Im Nebel unhörbar" ✓ (v3.2.1) – Horcher hören niemanden im Nebel

Wunsch aus dem Levelbau: Wer im Nebel rollt, soll für Horcher unhörbar sein.
Bis jetzt nahm der Nebel nur DIR die Ohren (Lowpass auf dem Master); die
Horcher hörten dein Rollen ungedämpft. Jetzt ist die Nebelzone vollständige
Deckung: `World.updateListeners` setzt die gehörte Geschwindigkeit auf 0,
solange `inFog()` gilt (neue Methode, app.ts nutzt sie auch für den Klang –
eine Stelle für „steht der Ball im Nebel"). Gleiche Klasse wie die
Schallschutzwand (M43), nur ganz statt gedämpft. Galerie-Text der Nebelzone
sagt es (×4), Units in tests/listenerCover.test.ts. Beweis unberührt:
Horcher sind kein Riegel.

## M66 „Von dieser Seite" ✓ (v3.2.0) – einseitig brüchig, weicher Timer, Fackel

Drei Wünsche aus dem Levelbau. **Einseitig brüchig:** `maze.brittleSide`
listet Kanten aus `brittle` mit der Seite, von der sie brechen ('w'/'e' bei
senkrechten, 'n'/'s' bei waagerechten Wänden; Default ohne Eintrag =
beidseitig). Loader setzt `Wall.hpSide`, app.ts fragt `brittleBreakable`
(core/brittle.ts, rein): von der falschen Seite ist sie eine gewöhnliche
Wand. Der Beweis lässt sie im offenen Modell ZU und ergänzt eine GERICHTETE
Kante von der Bruchseite (`brittlePassage`) – wer drüben ankommt, hatte die
Bruchseite schon. Renderer zeichnet einen Keil auf der Bruchseite, sobald die
Wand sichtbar ist (im Editor immer); das Panel der Wand bekommt „Bricht von"
(beide / links / rechts bzw. oben / unten), Variante wechseln oder Wand
entfernen nimmt die Seite mit. **Timer weich:** 'timer' steht in
`SOFT_CHECKS` – die 2,5×-Ideallinie ist eine Schätzung, ein knapper Timer
ist Schwierigkeit; weiche Badges zeigen ⚠ und gestrichelten Rand statt ✗.
**Fackel:** Element `torch` (Zelle, Radius) – das einzige Element OHNE Klang,
mit Absicht: Licht ist die Information. Renderer: `torchGain(x, y)` hebt
Wände, Löcher, Checkpoints und alle aufdeckbaren Objekte im Radius linear
ins Licht, Flamme und Lichtkreis sind immer sichtbar. Kein Physik-Einfluss,
kein Beweis-Einfluss. Units (Seitenlogik, Loader, Beweis, Editor-Helfer,
Spiegelung), E2E Lauf 34.

## M65 „Deine Tür, mein Pad" ✓ (v3.1.8) – Transporter nur für einen Spieler

Wunsch: In Zwei-Spieler-Leveln soll ein Transporter wahlweise nur einem
Spieler gehören. `transporter.player: 1 | 2` (fehlt = beide): Der Loader
baut das Pad nur in die Welt dieses Spielers (`elementForPlayer`) – für den
anderen gibt es weder Klang noch Warp; der Editor lädt mit
`allTransporters` und zeigt alles, mit „P1"/„P2" am Pad und dem Feld
„Transporter für" (beide / nur Spieler 1 / nur Spieler 2). Beweise: `reachable`
kennt `player`, `pairReachable` rechnet je Spieler nur seine Sprünge,
`guardsProof` verlangt ein Pad nur im Baum seines Spielers, `fair` misst je
Spieler mit seinen Pads. Zurück auf einen Spieler räumt die Zuordnung weg.
Units (Loader, Beweis, Spiegelung), Lauf 33: Pad nur für den Gast, Host-Welt
ohne Transporter, Feld im Editor.

## M64 „Zeig es" ✓ (v3.1.7) – README gestrafft, Screenshots reproduzierbar

Beide READMEs neu geschnitten: Roadmap raus (das Bautagebuch ist PLAN.md),
Spielmodi auf je einen Absatz, Elemente-Tabelle auf den Stand 3.1.6
(Sanduhr, Glocke, Hallraum, Wanderloch, Rollstein, Schläfer, Echo-Spiegel,
Stimmgabel, helle Ebene, Partner-Ball, Einladung, Zwei-Spieler-Level). Die
Screenshots kommen nicht mehr von Hand: `tools/screenshots.mjs` fährt die App
gegen `vite preview` und schießt 15 Bilder (Splash, Menü de/en, Ping,
Kampagne, Ergebnis, Werkstatt, Editor Phone/Tablet, Lobby, Coop dunkel/hell,
Zwei-Spieler-Intro, Tutorial, Hörtest, Galerie) – reproduzierbar, also beim
nächsten Umbau ein Befehl statt einer Nachmittagsarbeit. Nebenbei auf einem
der Bilder gefunden: Der Kampagnen-Untertitel im Menü sagte noch „4 Welten,
28 Level" – eine feste Zahl im Wörterbuch. Jetzt zählt `refreshMenu` aus
`WORLDS`/`CAMPAIGN_LEVELS` in Platzhalter (`{worlds} Welten, {levels}
Level`), ein Unit-Test verlangt die Platzhalter, Lauf 33 liest den Text.

## M63 „Komm rein" ✓ (v3.1.6) – Einladung aus der Host-Lobby teilen

Die Lobby hatte QR-Code und Raumcode – wer nicht im selben Raum sitzt,
musste den Code abtippen. Jetzt gibt es „📨 Einladung teilen": Web Share mit
Nachricht (Levelname, Raumcode, „Link antippen und beitreten") und dem
`#join=`-Link – derselbe Link wie im QR-Code, also derselbe Kaltstart-Pfad,
den Lauf 33 seit 3.1.0 fährt. Text und URL werden GETRENNT übergeben (Android
setzt beides zusammen, iOS zeigt beides – die Datei-Lektion aus M41f gilt
hier nicht, es gibt keine Datei, die vom Text verdrängt werden könnte). Ohne
Web Share landet „Nachricht Link" in der Zwischenablage, der Knopf sagt es
kurz („✓ Einladung kopiert", Kurztext-Regel). Nur der Host sieht den Knopf;
`window.__tiltrInvite` legt Nachricht und Link für E2E offen.

## M62 „Im Hellen ein Körper" ✓ (v3.1.5) – Partner als roter Ball auf hellen Coop-Ebenen

Wunsch: Im Coop soll der Partner auf hellen Ebenen als fester roter Ball zu
sehen sein. Die M22-Regel „der eigene Ball ist der einzige Körper im Bild"
gilt für die DUNKLE Welt, in der Licht eine Information ist; auf einer hellen
Ebene sieht man ohnehin alles, und der Schein wäre nur vage. Renderer:
`buddy.solid` → `drawPartnerBall` (Partner-Rot `255, 96, 110`, Ballgröße,
weicher Glow, im Ziel ein ruhiger Ring in Zielfarbe), sonst wie bisher der
Schein; `renderer.buddySolid` für E2E. app.ts setzt `solid` nur im Coop und
nur bei Licht (`bright()`), also auch in der Dämmerung, solange sie brennt;
im Race bleibt der Rivale ein Schein – dort ist Hören die Disziplin. E2E:
Lauf 33 (helle Ebene) sieht den festen Ball, Lauf 9 (dunkel) den Schein.

## M61 „Was fehlt, steht da" ✓ (v3.1.4) – lesbare Ladefehler im Editor

Der Screenshot zur unsichtbaren Platte zeigte die Statuszeile: rohes zod-JSON
(`[{ "expected": "string", "path": ["floors", 0, "elements", 1, "opens"] … }]`)
– auf dem Phone ein Textblock, aus dem niemand „der Platte fehlt die Tür"
liest. `describeLoadError` (rein, editor.ts) übersetzt zod-Issues in
„E1 · Druckplatte 2: opens fehlt (expected string, received undefined)";
andere Fehler gehen unverändert durch. E2E Lauf 33 legt zusätzlich einen
Entwurf aus der Zeit vor 3.1.3 (zwei Platten ohne Tür) in den Speicher und
prüft, dass er über „Weiter an …" lädt und „Verknüpfungen" rot wird.

## M60 „Die unsichtbare Platte" ✓ (v3.1.3) – Druckplatte im Editor verknüpfbar

Rückmeldung: „Druckplatten sieht man im Editor nicht." Ursache war keine
Zeichenfrage: `placeAt` gab nur Schlüssel und Zeitschaltern beim Setzen die
nächste Tür (`opens`); eine Platte ohne `opens` parst nicht, `rebuild()` ließ
das letzte gültige Bild stehen – die Platte war da, aber unsichtbar, und der
Status nannte den zod-Fehler. Jetzt bekommt die Platte wie der Schlüssel die
nächstgelegene Tür (ebenenübergreifend) und in den Eigenschaften das Feld
„Öffnet Tür" plus 🔗 „Tür antippen"; `normalizeDraft` füllt alte Entwürfe
mit `tor1` auf, damit sie laden (das Badge „Verknüpfungen" sagt dann, was
fehlt). E2E Lauf 33 platziert eine Platte und prüft Verknüpfung, Ladezustand
und Feld – rot gegen den alten Build.

## M59 „Dein Schlüssel, meine Tür" ✓ (v3.1.2) – Coop-Öffner gelten für beide

Erstes echtes Coop-Level aus der Werkstatt: Spieler 1 holt den Schlüssel für
die Tür auf der Seite von Spieler 2 und umgekehrt – und das Badge sagte
„Coop nicht lösbar". Zu Recht nach dem Modell von 3.1.0, das Schlüssel und
Zeitschalter als LOKAL rechnete (so war das Spiel: jeder Client eine Welt,
nur Druckplatten wurden über das Netz geteilt). Aber genau dieses Level ist
die Coop-Idee. Jetzt gilt im Coop JEDER Öffner für beide: `key`/`switch`-
Nachrichten setzen den Zustand in der Partner-Welt (Schlüssel eingesammelt,
Schalter mit derselben Dauer, gehaltener Schalter alle 500 ms aufgefrischt),
`updateDoors` liest ihn wie jeden lokalen Öffner. `pairReachable(def, true)`
rechnet dasselbe: ein Öffner zählt, wenn EINER ihn erreicht. Im Race bleibt
alles lokal, Platten zählen gar nicht. Units: Schlüssel über Kreuz ist im Coop
grün und im Race rot; E2E Lauf 33: der Host holt unterwegs den Schlüssel für
die Gast-Tür, beim Gast ist er eingesammelt (`__tiltrWorld.keysCollected`).

## M58 „Sechs Kacheln" ✓ (v3.1.1) – Spieler 2 als Eigenschaft von ● und ◎

3.1.0 hängte für Zwei-Spieler-Level zwei Kacheln an die Werkzeugleiste
(●², ◎²) – acht statt sechs, und auf dem Phone waren die letzten nicht mehr
erreichbar (Rückmeldung nach dem Release). Jetzt setzen ● und ◎ „für
Spieler 1 oder 2": ein Feld „Setzt für" im Eigenschaften-Panel, solange das
Werkzeug aktiv ist (`#edToolPlayer`, `toolPlayer` im Editor-Zustand), und
die AKTIVE Kachel nochmal antippen wechselt den Spieler – die Kachel zeigt
dann ●²/◎², der Tip sagt es an. Die Leiste bleibt bei sechs Kacheln, auf
jedem Gerät. Tap-Semantik unverändert: Start 2 nur Ebene 1, Tap auf dieselbe
Zelle hebt auf. E2E Lauf 33 zählt die Kacheln und fährt beide Wechselwege.

## M57 „Zu zweit gebaut" ✓ (v3.1.0) – Multiplayer-Level im Editor

Bis 3.0.7 kannte der Multiplayer nur die eingebauten Coop-/Race-Level und den
🎲-Generator; die Werkstatt baute ausschließlich Solo-Level (die Druckplatte
fehlte in der Palette). Jetzt trägt ein Level `players: 1 | 2` und – bei zwei
Spielern – `mpMode: 'coop' | 'race' | 'any'`; Ebene 1 darf einen zweiten
Start (`start2`) haben, eine beliebige Ebene ein zweites Ziel (`goal2`).
Fehlen sie, gelten Start und Ziel für beide.

**Rollen sind fest:** Host = Spieler 1 (●/◎), Gast = Spieler 2 (●²/◎²).
`loadLevel(def, { player })` baut die Welt FÜR EINEN Spieler: Kugel an seinem
Start, Zielzone = sein Ziel, das andere Ziel existiert für ihn nicht (weder
Beacon noch Zone). Default `player: 1` – jeder bestehende Aufruf ist
unverändert.

**Beweise** (validate.ts, `pairReachable`): Das Spiel gibt jedem eine eigene
Welt – Schlüssel und Zeitschlösser wirken lokal, Druckplatten für beide
(`mpFrame`: held = lokal ODER fern). Genau das rechnet der Fixpunkt: pro
Spieler vom eigenen Start, Platten zählen im **Coop**, wenn IRGENDEINER sie
erreicht; im **Race** zählen sie gar nicht (der eigene Ball kann nicht auf
der Platte stehen UND durch die Tür). Badges: `coop`/`race` (je nach
Modus, bei 'any' beide – die Lobby darf wählen, also muss beides bewiesen
sein) ERSETZEN `goal`; `openers` und `softlock` rechnen mit dem Paar-Modell,
`guards` prüft Ziel 2 von Start 2 aus; `fair` („Wege ähnlich lang", 3 Zellen
oder 30 %) ist WEICH wie `items` (`SOFT_CHECKS`). Der Solo-Beweis wäre für
den Gast weder notwendig noch hinreichend gewesen – deshalb Ersatz, nicht
Ergänzung.

**Editor:** Feld „Spieler" (1/2) in den Level-Eigenschaften; bei 2:
Modus-Feld, Werkzeuge ●²/◎² (Start 2 nur Ebene 1, Tap auf dieselbe Zelle
hebt auf), die Druckplatte in der Palette (solo bleibt sie draußen: niemand
hielte sie, und `coopReachable` zählte sie trotzdem – grün und unlösbar),
gestrichelte „2"-Ringe im Overlay. Zurück auf 1 räumt start2/goal2/mpMode
weg. Vorschau: „Vorschau als" Spieler 1/2 und „Partner hält alle Platten"
(letzteres ist mit M69 durch den echten, wechselbaren Partner ersetzt)
(sonst bliebe jede Coop-Tür solo zu) – `TestRun` statt nacktem ⚑-Start.
`removeFloor` rettet auch goal2 in eine freie Zelle.

**Werkstatt/Lobby:** Zwei-Spieler-Level zeigen „👥 Zu zweit" statt „▶
Spielen" – das öffnet die Lobby mit dem Level als erster Karte
(`#mpCustomItem`), fester Modus sperrt den anderen Chip. In Bundles zählen
sie als übersprungen (`bundleProgress.skipped`): nie „weiter bei", nie
gesperrt, im Kampagnen-Screen ein Tap in die Lobby. Der Host hängt die
komplette Def an `setup` (alte Clients ignorieren das Feld); der Gast prüft
Schema UND Pflicht-Badges – dieselbe Schranke wie beim Teilen – und sagt
sonst „Level des Hosts ungültig". Das Intro nennt die Rolle; die
Ergebniskarte des Gasts bietet „💾 In Werkstatt speichern" (`importRaw`,
kollidierende ID wird frisch).

E2E Lauf 33 fährt den ganzen Weg: Import → Badges → Zu zweit → Lobby →
Gast startet auf der Platte an Start 2 und hält damit die Tür des Hosts →
beide in ihrem Ziel → Gast speichert → Spieler-Schalter. Lektion aus dem
ersten Lauf: BroadcastChannel überbrückt keine getrennten Playwright-
Kontexte – Host und Gast teilen den Kontext wie in Lauf 9.

**Nebenbei gefunden, weil der Gast über den echten Link beitritt:** Ein
`#join=`-Link beim KALTSTART (jeder gescannte QR-Code in einem frischen Tab)
warf seit dem Hash-Listener (M34) „Cannot access … before initialization" –
`checkChallengeHash()` lief als Modul-Code VOR dem Multiplayer-Block und
griff auf `mpPanel`/`mpCodeInput` in der TDZ zu; die App blieb schwarz. Der
Aufruf steht jetzt hinter dem letzten Panel, Lauf 33 fährt den Link und
zählt Seitenfehler des Gasts. Ein Tap auf den Link in der schon offenen
App (hashchange) war nie betroffen – deshalb fiel es nicht auf.

## M56 „Rubin" ✓ (v3.0.7) – Türen in eigener Farbe

Rückmeldung vom Gerät: Türen und brüchige Wände sind visuell nicht zu
unterscheiden. Beides sind Wandsegmente, gezeichnet im Echo-Alpha 0,55 auf
fast schwarzem Grund – Schlüssel-Gold (Hue 45°) und Brüchig-Bernstein (30°)
fallen dort zusammen. Türen sind jetzt **Rubin** (`232, 84, 128`, Hue 343°):
„verschlossen", klar getrennt vom Bernstein, rosiger und dunkler als das
Wächter-Rot, satter als das Jukebox-Pink. Der Schlüssel bleibt Gold – Form
und Farbe unterscheiden Schlüssel und Tür jetzt doppelt. Galerie-Rahmen von
Druckplatte und Zeitschalter folgen dem Spiel (`WORLD.plate`, Gold) statt der
Tür; das Editor-Overlay für Tür-Verknüpfungen färbt sich automatisch mit.

## M55 „Wem gehört das" ✓ (v3.0.6) – Lizenz

Bis 3.0.5 hatte das Repo keine Lizenz: keine LICENSE-Datei, kein Feld in
package.json – rechtlich „alle Rechte vorbehalten", also auch kein privates
Forken erlaubt. Ziel: nicht-kommerzielle Nutzung frei, kommerzielle nur mit
Zustimmung. Entscheidung: **PolyForm Noncommercial License 1.0.0** für den
Code (dafür geschrieben, definiert „nicht-kommerziell" klar: persönlich,
Bildung, Forschung, Non-Profit, Behörden) und **CC BY-NC-SA 4.0** für
Level-Inhalte, Notenschrift und Doku (Creative Commons rät von CC für
Software ab, für Inhalte ist es die Norm). Beide Texte liegen VOLLSTÄNDIG im
Repo (PolyForm aus dem SPDX-Textkorpus, CC Legal Code von creativecommons.org)
– mit zweisprachigem Kopf, Required Notice und Kontaktweg (GitHub-Issues).
`tests/license.test.ts` prüft Vorhandensein, Vollständigkeit (Text endet
nicht abgeschnitten) und die Verweise aus package.json und beiden READMEs.
Abhängigkeiten (MIT) sind damit verträglich; ein späterer Lizenzwechsel
braucht die Zustimmung aller Beitragenden – derzeit eine Person.

Nebenbei der vierte Last-Flake: Lauf 10 „Splash" las die Kugelposition 200 ms
nach `goto` plus drei Text-Checks – unter Last war die Einfahrt da schon
vorbei (dy 0–10 statt 200). Jetzt misst er den GRÖSSTEN Versatz während der
Einfahrt (Schleife ab goto, Abbruch wenn er wieder fällt) und wartet für
Akt 2 auf den eingeblendeten Titel statt 1600 ms.

## M54 „Zurück auf Anfang, mit Beweis" ✓ (v3.0.5) – 3.0.3 war falsch

Die Messung (M53, iPhone standalone, landscape-primary 90°, natural:portrait):
obere Bildkante gesenkt → γ −7 → +22, acc.x −1,0 → +3,7; rechte Bildkante
gesenkt → β −1 → +26, acc.y 0,2 → −4,5. Alles spec-konform – und das
3.0.3-Mapping lieferte für die gesenkte OBERE Bildkante tilt.y = +1 (nach
unten). Der Fehler der Herleitung in M52: „Bildschirm-unten = rechte
Gerätekante". Falsch. Bei einem gegen den Uhrzeigersinn gedrehten Gerät
(Oberkante links) wandert die rechte Gerätekante nach OBEN, die linke nach
unten. Damit ist y_S = −x_D, nicht +x_D, und das alte Schnipsel (90°: (gy,
−gx), 270°: (−gy, gx)) war seit M1 richtig. 3.0.5 stellt es wieder her –
jetzt mit korrekter Kantenzuordnung im Kommentar, Units, die die Messung
nachstellen (γ +22 ⇒ tilt.y < 0), und E2E Lauf 2 mit gedrehtem Bildschirm
in der richtigen Richtung. Die Diagnose zeigt zusätzlich `raw→`, das Mapping
ohne die (im Menü oft alte) Kalibrier-Referenz – `tilt` stand deshalb in
allen Screenshots auf 1,00.

**Das Tablet (iPad, standalone, Querformat):** `landscape-secondary` mit
`screen.orientation.angle` **180°**, Sensor aber im Hochformat-Rahmen: rechte
Bildkante gesenkt → β −30 (Geräte-Oberkante liegt rechts, acc.y +4,9), obere
Bildkante gesenkt → γ −24 (linke Gerätekante liegt oben, acc.x −2,9). Physisch
ist das 270° (Oberkante rechts) – iPadOS zählt `angle` von der QUERlage, der
Sensor vom Hochformat. Mit 180° drehten wir um 90° falsch: „oben/unten und
rechts/links vertauscht", in jeder Querlage, mit oder ohne Rotation Lock. Das
war die ursprüngliche Tablet-Meldung. Fix: `physicalAngle()` in tilt.ts –
auf Apple-Geräten (iPhone, iPad; iPadOS gibt sich als MacIntel mit Touch aus)
den Winkel aus `screen.orientation.type` über die Spec-Tabelle für
Hochformat-Geräte (`angleFromType`: portrait-primary 0, landscape-primary 90,
portrait-secondary 180, landscape-secondary 270 – auf iPhone UND iPad physisch
bestätigt), sonst `angle`. Die Diagnose zeigt `angle`, `win`
(window.orientation) und `phys` nebeneinander.

Lektion: Eine Herleitung ohne Messung ist eine Vermutung mit Formeln – und
ein Sensorwert ist erst dann einer, wenn man weiß, gegen welchen Rahmen er
zählt.

## M53 „Erst messen" ✓ (v3.0.4) – Sensor-Diagnose für die Achsenfrage

Nach 3.0.3 die Rückmeldung: „Auf dem Tablet sind in JEDER Ausrichtung
oben/unten und rechts/links vertauscht, auf dem Handy im Hochformat
oben/unten." Das Hochformat-Mapping ist seit M1 unverändert (x = gamma,
y = beta) und folgt der Spec-Rotationsmatrix (Gefälle im Geräterahmen
(sinγ·cosβ, −sinβ)) – wenn es auf einem Gerät falsch ist, weicht das Gerät
von der Spec ab (beta-Vorzeichen, screen.orientation-Winkel oder bereits
bildschirmgedrehte Sensorwerte, alles auf Tablets dokumentiert). Solche
Fälle lassen sich nicht herleiten, nur messen.

Deshalb zuerst eine DIAGNOSE statt einer weiteren Korrektur: Im Debug-Modus
(5× Version oder `?debug` in der URL) zeigt die Menü-Zeile `#diag` neben der
Viewport-Wahrheit jetzt die Sensor-Wahrheit: `screen.orientation.type` und
`-angle`, die natürliche Lage (aus Winkel und Seitenverhältnis), rohe β/γ/α,
`accelerationIncludingGravity` (zweite, unabhängige Sicht auf die Schwerkraft)
und das berechnete tilt (x, y). Der 5. Tap ist eine Geste, also startet dort
der Sensor (iOS-Permission). Im Spiel trägt der Debug-Status dieselbe Zeile.
Protokoll für den Nutzer: Gerät flach, dann OBERE Bildkante senken, dann
RECHTE Bildkante senken – je Ausrichtung ein Screenshot. Erwartung nach
Spec: β wächst, wenn die Geräte-Oberkante steigt; tilt.y < 0, wenn die obere
BILDkante sinkt; acc.z ≈ +9,8 (Android) bzw. −9,8 (iOS) in Ruhe.

## M52 „Die Kugel rollt bergab" ✓ (v3.0.3) – Neigungsachsen im Querformat

**Der Fehler.** „Beim Drehen der App (Tablet) oder mit Rotation Lock passen
die Achsen der Neigung nicht zur Darstellung." Der Sensor meldet beta/gamma
immer im natürlichen Geräterahmen; tilt.ts drehte den Gefällevektor nach
`screen.orientation.angle` – mit falschem y-Vorzeichen bei 90° und 270° (ein
weit kopiertes Schnipsel). Im Querformat rollte die Kugel bei „rechte Kante
unten" nach OBEN; x stimmte, deshalb wirkte es wie „eine Achse falsch".
Rotation Lock ändert nichts am Modell: `screen.orientation` meldet die
DARGESTELLTE Ausrichtung, genau die, in die gedreht werden muss.

**Die Herleitung** steht in `core/orientation.ts` (`screenTilt`, rein):
Geräterahmen x rechts, y zur Oberkante; gamma > 0 = rechte Kante unten,
beta > 0 = Unterkante unten → Gefälle (gx, −gy). Bildschirm y zeigt nach
unten. 90° (Oberkante links): x_S = −y_D, y_S = x_D → (gy, gx). 270°: (−gy,
−gx). 180°: (−gx, −gy). Probe: Bei 90° liegt die Unterkante am rechten
Bildrand – Unterkante unten muss nach rechts rollen (x = gy > 0), die rechte
Kante liegt unten – rechte Kante unten muss nach unten rollen (y = gx > 0).

**Tests.** `tests/orientation.test.ts` in der Sprache der Kanten („welche
Kante liegt unten, wohin rollt es") plus die Zusicherung, dass 90° und 270°
sich in BEIDEN Vorzeichen unterscheiden (vorher nur in x). E2E Lauf 2 dreht
den Bildschirm synthetisch (`screen.orientation.angle` → 90 per
defineProperty) und feuert Sensor-Events: Unterkante unten → rechts, rechte
Kante unten → unten – mit dem alten Mapping rot (rollte nach oben).

## M51 „Kein Knopf sprengt die Zeile" ✓ (v3.0.2) – vier Rückmeldungen in Flex-Zeilen

Nach dem Bundle-Löschknopf (M50) die Frage: Gibt es noch mehr solche Stellen?
Inventur aller Knöpfe, die vorübergehend einen längeren Text tragen: Debug-
Import „In Werkstatt importieren" (Weltzeile der Kampagne), Backup
„Wiederherstellen" (Chip-Zeile im Menü), ✏️ Bearbeiten mit Draft
(Aktionszeile der Level-Karte), Duell-Teilen („Link kopiert", Ergebnis-Karte –
volle Breite, unproblematisch). Die E2E-Zusicherungen kamen ZUERST und waren
mit 3.0.1 rot: Weltzeile 72 px hoch und 130 px Überlauf, Menü 5 px Überlauf.

**Drei Ursachen, drei Fixes.** (1) Die Rückmeldung „„Welt 1 – …" liegt jetzt in
der Werkstatt." ist zu lang für eine Flex-Zeile neben dem Welttitel → kurz
(„✓ In der Werkstatt"), Knopf `nowrap` und schrumpfbar. (2) `#campaignList`
war ein Grid mit implizitem `auto`-Track: der wächst auf die min-content-Breite
des breitesten Kinds – der Debug-Knopf dehnte ALLE Level-Karten auf 486 px →
`grid-template-columns: minmax(0, 1fr)` (auch Galerie). (3) Die 5 px im Menü
kamen nicht vom Backup-Chip, sondern vom dritten Steuerungs-Chip „💡 Tutorial
hell" aus M43: `#controlsRow` und `#backupRow` dürfen jetzt umbrechen. Dazu
die kurze Draft-Frage „⚠ Entwurf verwerfen?" auf nackten Knöpfen (der volle
Satz bleibt der Modus-Karte). Gemessen wird der SICHTBARE Überlauf (rechteste
Kind-Kante gegen den Container) – `scrollWidth` zählt 8 px unsichtbare
Pseudo-Ausdehnung mit und hätte grundlos rot gehalten.

## M50 „Ruhe im Test" ✓ (v3.0.1) – Bundle-Löschen ohne Layoutbruch, E2E ohne Last-Flakes

**Bundle löschen.** Der Zwei-Tap-Knopf in der Bundle-Leiste zeigte als Frage
„Bundle mit 2 Leveln wirklich löschen?" – auf dem Phone 156 px Überlauf, die
Zeile brach. Und nach dem zweiten Tap blieb der Knopf mit dem langen Text
stehen: `twoTap` stellte Text und Tip nur im Ablauf-Pfad zurück, die
Level-Knöpfe rettete der Neuaufbau der Karten, den statischen Bundle-Knopf
niemand. Jetzt: `disarm()` in beiden Pfaden (Rest-Text/Tip im dataset), die
Zeile trägt `.confirming` (übrige Aktionen weichen, der bewaffnete Knopf darf
schrumpfen), und die Frage ist kurz („2 Level löschen?", ×4 Sprachen). Lauf 28
misst bei 400 px Überlauf, Zeilenhöhe und den Knopf danach – mit dem alten
Code rot gesehen (Überlauf 156 px, Text bleibt).

**Last-Flakes.** Drei Läufe waren allein grün und unter vier Arbeitern etwa
jeden zehnten Volllauf rot, weil sie nach Bewegungen und Klicks feste Zeiten
warteten und unter Last den Zustand von VOR dem Ereignis lasen. Neue Helfer
in smoke.mjs: `until(fn, {timeout})`, `settled(page)`, `holdUntil(page, key,
pred)`. Der Umbau förderte eine zweite Wahrheit zutage: Nur „bis x > 500"
polling und dann loslassen ließ den Ball von der Wand ZURÜCKPRALLEN – A stand
danach in Spalte 4 statt 5, B rollte aus der Platten-Nische und ließ die
Platte los; die festen 2,6 s hatten ihn bis dahin angepinnt. Deshalb hält
`holdUntil` die Taste, bis die Bedingung gilt UND der Ball ruht. Lauf 17
wartet auf den neuen `__tiltrPing` (mit Fallback bei gleicher Richtung
zweimal), Lauf 21 auf eingeplante Noten, Ducking-Wegdrücken/-Rückkehr und den
Titel im Status. Kontrolle: 9/17/21 dreimal seriell grün, Vollsuite parallel
zweimal grün.

## M49 „3.0.0" ✓ (Phase 6) – Release: sieben Phasen, ein Push

Der Kampagnen-Umbau nach dem Review – Spielregeln (M43), Welten 1–4 (M44),
vier kleine (M45) und drei mittlere Elemente (M46), der Rollstein (M47) und
Welt 5 (M48) – ging als EIN Release live. Arbeits-Branch `claude/v3-trugbild`
ohne Deploy, je Phase ein Commit mit grüner Suite, am Ende Fast-Forward auf
den Default-Branch. Version 3.0.0 (Startscreen, Update-Toast,
`versionNumber` 30000 für die Bundle-Version der Builtin-Importe).

**Stand.** 36 Kampagnen-Level in fünf Welten, 24 Elemente in der Registry
plus acht Galerie-Extras (32 Einträge), acht neue Klang-Signaturen. E2E:
Lauf 29 (Spielregeln), 30 (vier kleine + drei mittlere Elemente), 31
(Rollstein), 32 (Editor-Regression: Import → Editor, alle Badges grün inkl.
„Stein lösbar", Vorschau, Rücksprung); Läufe 4/5 zählen 36 Level in
5 Welten, der Debug-Import kennt `builtin-w5` automatisch über WORLDS.

**Migration.** Keine Level-ID wurde umbenannt oder entfernt; Umsortierung
(Welt 2) und Einfügungen (w4-03k, Welt 5) hängen an der ID des Vorgängers.
Sterne, Bestzeiten, Blind-Sterne, `bundleAt` und Geist-Spuren alter Profile
bleiben gültig; `profile.tutorialBright` ist ein neues Flag mit Default
false, `plate.boulder` ein Laufzeit-Feld. Werkstatt-Level ohne die neuen
Listen (`maze.mirrors`) laden über die zod-Defaults; der Editor füllt sie in
`normalizeDraft` auf.

## M48 „Trugbild" ✓ (Phase 5 von 3.0.0) – Welt 5: sieben Level aus den ungenutzten Bausteinen

Welt 4 hat dem Spieler das Hören genommen (Nebel). Welt 5 gibt ihm etwas,
das er noch nie hatte – Licht – und nimmt ihm dafür das Vertrauen ins Echo.
Gebaut wie Welt 1: ein Element pro Level, dann Kombination, dann Finale.
Ping-Budget 4, Par im Band, ein Checkpoint je Ebene.

| Level | Neu | Bau |
|---|---|---|
| w5-01 „Lichtung" | helle Ebene | 5×7 hell, Wächter in einer Seitengasse, Loch, Gem – Sehen ersetzt nicht Hören |
| w5-02 „Spiegelsaal" | Echo-Spiegel | 6×7, fünf bestehende Wände spiegeln (Spine-Spalte, untere Zeile) |
| w5-03 „Taubes Ohr" | Schallschutz-Ring + Kristall + Hallraum | 6×8, zweiter Zielkammer-Eingang zugemauert und gedämmt, Hallraum im Vorraum, Kristall am Eingang, Sanduhr |
| w5-04 „Lockruf" | Lockglocke | 7×9, zwei Horcher, zwei Glocken, Dämmwände als Deckung neben den Posten |
| w5-05 „Zwei Uhren" | Tür 'all' über Ebenen, Glas, Stimmgabel | E1 dunkel 6×8 (Tür, Zeitschloss 8 s, Stimmgabel), E2 HELL 5×5 (Zeitschloss 12 s, Glas auf dem Weg hin, Transporter zurück vor die Tür) |
| w5-06 „Mühlstein" | Rollstein | 7×9, Stein 1 durch einen versiegelten Kanal auf die Platte (Tür auf der Spine), Stein 2 die Spine hinab ins Loch |
| w5-07 „Dämmerung" | alles + Schläfer | hell – dunkel – hell; Schläfer bewacht den Gang zum Gem (Weckradius reicht bis zur Spine), Sanduhren, fünf Gems, Jukebox auf der letzten Ebene: die Kampagne endet mit Musik |

**Karten vor Elementen.** Wand-Varianten (Spiegel, Dämmstoff) und Türen
brauchen EXISTIERENDE bzw. OFFENE Kanten – ohne Karte ist das Raterei. Ablauf:
Level mit leeren Listen anlegen, `tests/mazeprint.test.ts` drucken
(gespiegelt, wie der Loader sieht), Kanten rückrechnen, eintragen, Tests.
Zwei Funde dabei: Die Mühlstein-Tür lag zuerst auf einer geschlossenen Kante
(Loader: „Kante ist im Maze nicht offen") und seitlich neben dem Ziel – jetzt
auf der Spine mit versiegelter Nachbarkante. Und der Steinkanal hatte einen
Seiteneingang: Von dort schiebt man den Stein zurück in die Startecke, wo er
für immer liegt – der Zustands-Beweis blieb trotzdem grün, weil Stein 2
theoretisch ebenfalls auf die Platte kann und das Loch im Modell passierbar
ist. Der Kanal ist jetzt zu ([0,2] Wand, [1,2] neu angebunden): Was der
Beweis „lösbar" nennt, muss auch spielbar bleiben.

**Tests.** campaign.test: 36 Level in fünf Welten, Budget 3/4/4/3/4, zwei
Ebenen-Sprünge im Timer-Beweis (Uhrwerk, Zwei Uhren), fünf Automaten
(w5-07 dazu), Pflicht-Türen, Par-Band, Gems-oder-Gefahr, alle Beweise
inklusive `boulder`. mirror.test: Ecken weiter verteilt. i18n: `world.w5`
und vierzehn `lv.w5-*`-Einträge ×4. E2E: Läufe 4 und 5 zählen 36 Level in
5 Welten.

## M47 „Der Stein" ✓ (Phase 4 von 3.0.0) – Rollstein: zweiter Körper, zellweise, mit Zustands-Beweis

Das größte Paket des Umbaus und das einzige mit echtem Risiko – deshalb
zuletzt vor Welt 5, und mit den drei Abgrenzungen aus dem Plan: kein
Stein-Stein-Schieben, kein Stein durch Transporter, kein Stein auf
Schiebewand-Zellen. Sie halten Physik UND Beweis klein.

**Physik** (`World.updateBoulders`): Der Stein ist ein Kasten von 0,72 Zellen
(`elements/boulder.ts` `BOULDER_SIZE`; die Physik rechnet die Zellgröße daraus
zurück, weil `World` das Raster nicht kennt). Der Ball kollidiert mit ihm wie
mit einer Wand (`collideCircleRect`). Trifft er mit mindestens `pushSpeed`
(170 px/s) auf, rollt der Stein GENAU eine Zelle in Stoßrichtung (Normale auf
die Achse gerundet) – wenn die Zielzelle frei ist: keine Wand im Zielkasten
(offene Türen ausgenommen, Schiebewände immer Wand), kein anderer Stein,
kein Transporter, keine Glocke (`boulderCellFree`). Das Rollen dauert 350 ms
(`move`), der Kasten fährt interpoliert mit. Ankunft: ein stehendes, nicht
atmendes Loch unter der Mitte wird GEFÜLLT (Loch und Stein verschwinden,
`sunk`); auf Eis rollt er in derselben Richtung weiter, solange frei; sonst
Schlag. Eine Druckplatte unter einem ruhenden Stein bekommt `plate.boulder`
– `updateDoors` zählt sie als gehalten (`held || boulder`), womit die Platte
zum Einzelspieler-Öffner wird, `doorState` unverändert. Ereignisse (roll,
stop, sink, plate) sammelt `consumeBoulderEvents()` für den Klang: Mahlen
(braunes Rauschen, Tiefpass 420→260 Hz), Schlag (Sinus 140→55 Hz), Versinken
(Dreieck 220→40 Hz plus Rauschfahne), Platte (`audio.plate`).

**Beweis** (`levels/boulders.ts` `boulderProof`, Badge `boulder`): Ein Stein
ist ein zweiter Körper, also braucht das Modell ZUSTAND – (Ebene, Ballzelle,
Steinzellen, gefüllte Löcher). BFS über den Zustandsraum mit denselben Regeln
wie die Physik, nur ohne Zeit: der Ball betritt keine Steinzelle; steht er
neben einem Stein und ist die Zelle dahinter frei, rollt der Stein (auf Eis
weiter, ins Loch hinein und weg). Türen sind offen wie im offenen Modell –
AUSSER Türen, deren Öffner ausschließlich Druckplatten sind: die öffnen per
`doorState` (any/all), wenn Steine auf den Platten liegen. Schlüssel und
Zeitschlösser prüfen die anderen Badges; hier zählt nur, was der Stein
bewegt. Zwei Fragen: Ziel erreichbar? Und: gibt es einen erreichbaren
Zustand, aus dem kein Ziel-Zustand mehr erreichbar ist (Softlock – der Stein
in der Sackgasse hinter der Platte)? Die zweite beantwortet eine
Rückwärtssuche über den aufgezeichneten Zustandsgraphen. Kappe bei 60 000
Zuständen („Zustandsraum zu groß" = rot). Ohne Stein trivial grün; das Badge
ist Pflicht fürs Teilen (`isShareable`: alles außer `items`).

**Tests** (`tests/boulder.test.ts`): Physik – sanfter Stoß rollt nicht,
kräftiger genau eine Zelle, Wand stoppt, Loch füllt, Platte hält und die Tür
öffnet über `doorState`. Beweis – trivial ohne Stein, Ziel hinter Platten-Tür
erreichbar, Stein-in-Sackgasse ist Softlock (rot mit Zelle im Detail), Stein
im Loch. E2E Lauf 31: importierter Korridor, der Ball schiebt den Stein bis
auf die Platte, `plateHeld` wird 1 (Sabotage: `pushSpeed` unerreichbar → rot).

## M46 „Glocke, Halle, Wanderer" ✓ (Phase 3 von 3.0.0) – Lockglocke, Hallraum, Wanderloch

Drei Elemente, die etwas BEWEGEN: die Horcher (Glocke), den Klang (Halle),
das Loch (Wanderer). Danach der Einbau in bestehende Level.

**Lockglocke** (`bell`): Überrollen schlägt sie an (Kanten-Trigger in
`updateBells`, `consumeRings()` liefert die neu angeschlagenen für den Klang).
Solange eine Glocke klingt (`ringLeft`), ist SIE das Ziel der Horcher –
`updateListeners` läuft zur nächsten klingenden Glocke statt zum Ball. Die
erste aktive Schleich-Mechanik: Ablenken statt Vermeiden. Klang: vier nicht-
harmonische Partialtöne (Metall) mit breitbandigem Klöppel-Anschlag, 4 s,
gepannt. Palette Messing.

**Hallraum** (`reverbZone`, Zone wie Nebel): Ein Feedback-Delay am Master
(0,17 s, Rückkopplung 0,62, Tiefpass 3,2 kHz – kein Convolver, keine
Impulsantwort-Datei in der PWA), Send normal zu, in der Zone offen
(`setReverb`). Nicht leiser, sondern LÄNGER: Wände weit hörbar, Richtung
verschmiert. `World.inReverb()` ist die eine Frage. Kein Physik-Einfluss,
frei im Beweis.

**Wanderloch** (`roamingHole`, `patrol` + `speed`): ein offenes Loch, das
seine Wegpunkte im Ping-Pong abläuft (`advanceHoles`, dt-basiert wie die
Wächter, auch in der Editor-Play-Vorschau). Es liegt in `world.holes` mit
`roam` – Sturz, Sog, Grollen und Ping-Antwort sind gratis, und das Grollen
ZIEHT durch den Raum. Modell: passierbar wie ein atmendes Loch (Löcher sind im
Erreichbarkeits-Modell nie Riegel); Patrouille achsenparallel durch offene
Zellen (Kampagnen-Test erweitert). Editor: derselbe Zwei-Tap-Fluss wie beim
Wächter.

**Einbau.** Kathedrale: vier Hallraum-Zellen im Kirchenschiff (Spalte 0 auf
dem Weg zum Schacht) – der Raum erzählt seine Größe. „Atemnot": das mittlere
Loch wandert (Patrouille [0,5]–[0,6]). Sanduhren in „Die Weite" (2),
„Taktstraße" (2), „Das Ohr" (je eine auf Ebene 1 und 3) – die faire Antwort
auf „drei Sterne = zwei Läufe".

**Tests.** `bell` (Kanten-Trigger, Horcher folgt der Glocke, verklungen wieder
dem Ball), `roamingHole` (Ping-Pong, Sturz, Spiegelung, Beweis grün),
`reverbZone` (Loader, inReverb, Badges); E2E Lauf 30 prüft die drei im
importierten Level und dass das Loch wandert (Sabotage rot gesehen).

## M45 „Vier kleine Stimmen" ✓ (Phase 2 von 3.0.0) – Sanduhr, Schläfer, Echo-Spiegel, Stimmgabel

Vier Elemente nach dem Bauplan (Schema → Modell → Loader/Physik → Audio →
Renderer/Palette → Registry/Galerie → Editor → i18n ×4 → Tests). Alle vier
sind Varianten oder Sammler – kein neuer Körper, kein neuer Beweis.

**Sanduhr** (`hourglass`, eigener Typ): Sammler, der die Par um `bonusS`
(10 s) verlängert – die zweite Routen-Entscheidung neben den Gems: Zeit holen
oder Gems holen. Die Sterne-Rechnung ist dafür aus app.ts in `core/stars.ts`
gezogen (`starsFor`, `effectivePar`, Units): EINE Stelle, an der der Bonus
zählt; die Ergebnis-Karte zeigt „Par 85 s, mit ⏳ +10". Signatur: Rieseln als
Doppel-Blip (1480 Hz), Tick beim Einsammeln. Palette Sand (`232, 196, 140`).

**Schläfer** (`guard.sleeper`): Wächter-Variante. Schläft auf Wegpunkt 0
(schnarcht: Sägezahn 68 Hz im 0,45-Hz-Atem, eigener Bus `setSnore` – langsam,
unverwechselbar gegen das 6-Hz-Tremolo des Brummens). Ein Echo-Ping in
`wakeRadius` weckt ihn (`World.wakeSleepers`, Zischen `sleeperWake`): `awakeS`
Sekunden Patrouille, dann heim und schlafen (`advanceGuards`, dt-basiert,
deterministisch). Der Ping wird zum Risiko. Beweis: wie Wächter (konservativ,
Patrouille als Riegel). Editor: Auswahl „Schläfer ja/nein" + Weckradius +
Wachzeit; Galerie-Extra-Eintrag `sleeper` mit eigener Demo; Erst-Vorkommen
als eigenes Merkmal. `World.asleep(g)` ist die eine Frage, die Renderer
(gedämpft, atmender Schein) und Spielschleife (Schnarchen statt Brummen)
stellen.

**Echo-Spiegel** (`maze.mirrors`, Wand-Variante wie `absorb`): Der Ping
meldet die Wand am GESPIEGELTEN Punkt – `mirrorReflection` in occlusion.ts:
doppelte Distanz, dieselbe Richtung, metallisch (1800 Hz). Eine Wand, die
nicht da ist. Kollision, Rempler, Beweis: normale Wand. Loader verlangt die
Existenz, `mirrorLevel` spiegelt die Liste, der Editor führt sie als vierte
Variante (`edgeState`/`setEdgeVariant`/`toggleEdge`, `#edWallVariant`),
Galerie-Extra `wallMirror`. Palette Silber (`200, 215, 235`).

**Stimmgabel** (`key.voice: 'fork'`): Ein Schlüssel, der nicht klimpert,
sondern TÖNT – ungepannt, zwei Sinus direkt auf den Master. `core/fork.ts`
(`forkTone`, Units): Schwebung 0,4–9 Hz aus dem Winkel zwischen
Neigungsvektor und Richtung zur Gabel; auf sie zu steht der Ton fast still,
weg flattert er; ohne Neigung schwebt er mittel („sie ist da, such"). Ortung
über Tonhöhe statt Panning – die zweite Ohr-Fähigkeit. Renderer zeichnet ein
goldenes Y, der Ping antwortet mit reinem 880 statt 1650. Editor: Auswahl
„Klang" am Schlüssel; Galerie-Extra `fork`.

**Tests.** 458 Units grün: `fork` (Monotonie, Totzone, Betragsunabhängigkeit),
`stars` (Bonus macht den Stern, ohne Par keiner), `sleeper` (steht, weckt in
Weckweite, patrouilliert, schläft nach awakeS wieder ein und kehrt heim,
Doppel-Ping meldet nichts Neues), `mirrorWall` (Reflexionspunkt, Loader,
Spiegelung, Editor-Variante). Alle vier Merkmale sind Aufleuchten-fähig
(Renderer-Typen `hourglass`, `wallMirror`; `sleeper`/`fork` über die
Galerie-Extras).

## M44 „Vier Welten, ein Ohr" ✓ (Phase 1 von 3.0.0) – Welten 1–4 nach dem Review

Alle Level-Umbauten aus dem Kampagnen-Review, mit vorhandenen Elementen.
Level-IDs bleiben stabil (Fortschritt hängt an der ID des Vorgängers) – auch
beim Umsortieren und Einfügen.

**Zwei Türen waren freiwillig.** Der neue Test „Schlüssel-Türen sind PFLICHT"
(Ziel ohne Öffner unerreichbar) fand beim ersten Lauf, dass „Schlüsseldienst"
(w1-04) über eine Nische neben dem Ziel OHNE Schlüssel ging und die Schleuse
in „Schleusenwerk" (w3-04) über die unterste Zeile umgehbar war. Beide
Zielkammern sind jetzt versiegelt (`maze.add`). Der Test hat `tests/
mazeprint.test.ts` als Werkzeug bekommen: druckt Level als ASCII-Karte,
gespiegelt wie der Loader sie sieht – ohne Karte sind Loch-, Wand- und
Anker-Plätze Raterei. „Schlussstein" (w1-10) fehlt im Test absichtlich: zwei
Wege ans Ziel sind dort das Design („wähle weise").

**Welt 1.** „Aufbruch" bekommt ein Gem im Umweg über die obere Zeile,
„Schlüsseldienst" ein Loch in der Sackgasse neben dem Schlüsselgang – der Test
„Gems oder Sturzgefahr" hält fest, dass der dritte Stern nie geschenkt ist.
„Zugluft" ist 5×10 statt des dritten 6×8 in Folge (Par 85). „Atemnot" trägt
das erste Glas der Kampagne: eine Einmal-Brücke auf dem Nebenweg zum oberen
Gem.

**Welt 2.** Neue Reihenfolge Unterführung → Zwillingstore → Doppelter Boden →
Fahrstuhl → Die Weite → Kathedrale (Par 75/90/100/110/255/270, Test
„monoton"). „Die Weite" hat eine Unterwelt: eine 4×4-Ebene mit zwei Schächten,
die Rand-Regionen des großen Feldes verbinden – damit trägt das Level das
Welt-Thema, und dank Landeplatz = Respawn (M43) sind die Rückwege sicher. Die
„Kathedrale" ist das Finale: Krypta-Tür mit `require: 'all'`, ein Schlüssel im
Zwischengeschoss, einer drei Ebenen tief; das Kirchenschiff ist HELL
(„Fenster") – die erste helle Ebene der Kampagne, als Atempause vor dem
Abstieg. Der Test „Multi-Ebenen ohne Transporter unlösbar" lässt Level mit
Ziel auf Ebene 1 aus (Unterwelt und Maschinenraum sind kein Pflichtweg).

**Welt 3.** „Schleusenwerk": Schleuse braucht Schlüssel UND Zeitschloss
(`'all'`) – erst der Takt, dann der Schlüssel hinter den Schiebewänden, dann
der Sprint. „Uhrwerk" hat einen Maschinenraum: der 6-s-Schalter liegt unten,
die Tür oben, der Schacht steht, wo der Schalter war. Dafür rechnet der
`timer`-Beweis jetzt über GENAU EINEN Transporter (`switchDoorSteps`,
`timerSeconds` in validate.ts: Weg zum Schacht + Landeweg + 0,7 s Warp-Pause,
weiter 2,5×-Faktor) – dieselbe Funktion in Badge und Test; der Test zählt den
einen Sprung. „Taktstraße": zwei Sog-Anker in den Nischen neben der Straße
(erstes Vorkommen), vierter Checkpoint, Par 240.

**Welt 4.** „Nebelbank" und „Schleichfahrt" tragen Schallschutzwände – am
Nebelrand zum Vergleich der Dämpfungen, neben dem Horcher-Posten als DECKUNG
(M43). Neu: „Kristallgang" (`w4-03k`, 6×8, drei Echo-Kristalle am Weg, ein
Horcher am Rand, Spiegel 'y') zwischen Spiegeleis und Schleichfahrt – der
Kristall hatte kein Kampagnen-Level, obwohl die Generatoren ihn längst setzen.
Welt 4 hat sieben Level, die Kampagne 29. „Das Ohr": Checkpoint auf Ebene 2
hinter dem Horcher-Revier, Echo-Kristall am Nebelrand; Intro nennt den
Blind-Stern (wie „Horchposten").

**Tests.** 441 Units grün: Par-Band, Budgets, monotone W2, Gems-oder-Gefahr,
Pflicht-Türen, Timer mit Sprung, Erst-Vorkommen (Gem jetzt in w1-01, Glas
w1-09, Anker w3-06, Kristall w4-03k, Schallschutz w4-02, Jukebox w2-06); i18n
×4 für neun geänderte Intros und das neue Level. E2E: Lauf 5 zählt 29 Level.

## M43 „Spielregeln" ✓ (Phase 0 von 3.0.0) – Landeplatz = Respawn, Tutorial mit Licht, Aufleuchten

Erste Phase des Kampagnen-Umbaus „Trugbild" (Review-Artefakt + Plan, sieben
Phasen, EIN Release 3.0.0 vom Arbeits-Branch `claude/v3-trugbild`). Phase 0
fasst kein Level an und verbessert trotzdem alle: Spielregeln.

**Landeplatz = Respawn.** `respawnPoint` wurde nur an zwei Stellen gesetzt –
Start und Checkpoint. In „Fahrstuhl" (3 Ebenen, 1 Checkpoint), „Kathedrale"
und „Das Ohr" (3 Ebenen, 3 Horcher, EIN Checkpoint auf Ebene 3) schickte
jeder Sturz auf der tiefen Ebene zurück auf Ebene 1 samt Transporterfahrt –
Wiederholung, keine Schwierigkeit. Jetzt setzt die Transporter-Ankunft in
`startWarp` den Respawn auf den Landeplatz. Eine Zeile, gilt auch für
Werkstatt-Level; E2E Lauf 29 prüft `__tiltrWorld.respawnFloor` nach dem Warp
(Sabotage rot gesehen).

**Tutorial mit Licht.** Die ersten zwei Minuten eines Neigungsspiels handeln
von der Steuerung – wer sie im Dunkeln lernt, weiß nicht, ob er sich verirrt
hat oder das Handy falsch hält. tut-1 ist HELL (`bright`, 4×3, Seed 7, obere
Zeile offen: „Roll nach rechts" bleibt), tut-2 ist DERSELBE Raum mit
`floor.dusk`: hell, bis der Ball die erste Wand berührt, dann blendet das
Licht in 2 s aus („Du kennst diesen Raum. Jetzt hör ihn."). Dafür hat der
Renderer `revealGain` (0–1 auf alles, was nur wegen `revealAll` sichtbar ist,
Ziel-Schein eingeschlossen; Debug ignoriert ihn) und app.ts EINE Stelle
`lightGain(now)`/`lightOpts(now)` für beide draw()-Aufrufe. Die Kampagne
bleibt dunkel. Zugänglichkeit: Profil-Flag `tutorialBright` (Chip „💡
Tutorial hell" im Menü-Footer) hält das Licht auf ALLEN Tutorial-Ebenen an –
nur dort.

**Aufleuchten neuer Elemente.** Zehn Elemente hatten kein Tutorial und wurden
nur im Intro-TEXT eingeführt – in einem Spiel, dessen Leitmedium der Klang
ist. `levels/firstAppearances.ts` (rein) leitet aus der Lehr-Reihenfolge
(Tutorial, dann Kampagne) ab, welches Merkmal – Element-Typ oder Wand-Variante
brüchig/Schallschutz – in welchem Level ZUERST vorkommt; kein Level-Feld
nötig. Beim Start eines solchen Levels leuchten diese Elemente 4 s pulsierend
in ihrer Weltfarbe (Renderer `spotlight`, unabhängig von Ping und Licht, auch
Türen, Schiebewände, Zonen) und die Galerie-Signatur des ersten spielt einmal;
der Intro-Screen zeigt je Merkmal einen Chip „Neu: Wächter 🔊" (Tap
wiederholt die Signatur – dieselbe `demoSound` wie Galerie und Editor). Der
Spieler sieht EINMAL, was er ab dann nur noch hört.

**Sterne-Vorschau.** Der Intro-Screen der Kampagne sagt vorab, was der zweite
und dritte Stern verlangen („★ Ziel · ★★ unter 75 s · ★★★ sturzfrei" bzw.
„alle 3 Gems") – die zwei Regeln für den dritten Stern waren vorher erst auf
der Ergebnis-Karte zu erfahren.

**Par-Band und Ping-Budgets.** `tests/campaign.test.ts` verlangt 1,2 bis 2,6 s
Par je Zelle: „Die Weite" hatte 0,77 („Taktstraße" 1,13) – Par nach dem
Rückgrat geschätzt, obwohl man sich auf großen Feldern proportional zur
FLÄCHE verirrt. Vorläufig 260/240 s, Phase 1 baut die Level um. Ping-Budget je
Welt konstant (3/4/4/3, Test): Knappheit ist der Schwierigkeits-Dial, nicht
die Levelgröße; die Finale bekommen in Phase 1 dafür Checkpoints.

**Horcher-Deckung.** `updateListeners` skaliert das gehörte Rollen mit
`ABSORB_GAIN`, wenn eine Schallschutzwand zwischen Ball und Horcher liegt –
dieselbe Regel wie für jede andere Klangquelle, nur in Gegenrichtung
(`tests/listenerCover.test.ts`: leises Rollen hinter der Wand ungehört, lautes
dringt durch, ohne Schallschutz hört er durch jede Wand wie bisher). Deckung
wird damit zur Schleich-Mechanik für Welt 4 (Phase 1).

## M42 „Rätsel im Licht" ✓ (v2.12.0) – Generatoren: Ebenen, helle Ebenen, Tür-Rätsel

**Die Frage:** Können Zufallsspiel und Tages-Challenge mehrere Ebenen haben,
helle Ebenen, und die Mehrfach-Öffner-Türen aus M41 – „gerade bei hellen
Ebenen eine zusätzliche Schwierigkeit"? Stand vorher: Daily 2–3 Ebenen, Quick
eine; Türen, Schlüssel, Zeitschlösser und helle Ebenen setzte kein Generator.

**Der Planer.** `levels/puzzle.ts` (`planDoorPuzzle`, rein, nur der übergebene
Rng): EINE Tür auf dem Pflichtweg Ankunft → Ausgang einer Ebene (mittleres
Drittel), davor die Öffner – Schlüssel und optional ein Zeitschloss, bei mehr
als einem `require: 'all'`. Warum das BEWEISBAR bleibt: Der Grundriss ist ein
perfektes Maze, also ein Baum. Die Tür teilt ihn in genau zwei Teile; alle
Öffner liegen im Ankunfts-Teil (BFS ohne die Türkante), bevorzugt in
Sackgassen abseits des Rückgrats. Damit sind sie ohne die Tür erreichbar
(`openers`), die Tür öffnet im Fixpunkt (`goal`), wer durch ist, braucht sie
nicht mehr (`softlock`), und das Zeitschloss steht höchstens 6 Zellen vor der
Tür – 8 s reichen mit dem 2,5×-Faktor des `timer`-Beweises bequem. Die Wege
zu den Öffnern kommen als Pflichtwege zurück, damit Anker, Glas und Automat
sie nicht verstellen (derselbe Schutz wie für Kristalle und Gems). Der Planer
läuft VOR den anderen Zutaten: Seine Öffner brauchen freie Zellen.

**Quick.** Presets tragen `floors`, `brightChance`, `puzzle`. Leicht bleibt
pur (eine Ebene, dunkel, keine Tür). Mittel: eine Ebene, zu 30 % hell, Tür
mit zwei Schlüsseln. Schwer: ZWEI Ebenen à 8×11 mit Transporter-Kette (statt
einer 11×15), eine davon hell, dort die Tür mit zwei Schlüsseln plus
Zeitschloss – alle drei gleichzeitig. Der Generator hat dafür die
Ebenen-Schleife der Tages-Challenge übernommen (Landepunkte vorab, Ankunft =
Checkpoint, Zutaten per `deal` verteilt, Automat auf genau einer Ebene). Nie
sind alle Ebenen hell; das Rätsel liegt auf der ersten hellen, sonst auf der
letzten Ebene.

**Daily.** Wochentage tragen `bright` und `puzzle`: Montag/Dienstag dunkel
und ohne Tür (sanfter Einstieg bleibt), Mittwoch/Donnerstag zwei Schlüssel,
Freitag Schlüssel + Zeitschloss, Samstag/Sonntag zwei Schlüssel + Zeitschloss
– jeweils auf der einen hellen Ebene. Der Wächter-Beweis am Ende läuft wie
bisher über das fertige Level, Türen eingeschlossen.

**Tests.** `tests/puzzle.test.ts`: Planer auf einem echten Maze (Tür im
mittleren Drittel auf offener Kante, Öffner im Ankunfts-Teil, Schalter nahe
der Tür, 'all' nur bei mehr als einem Öffner, belegte Zellen gemieden, kurzer
Weg → kein Rätsel); Quick über zwölf Seeds × drei Presets und Daily über 21
Tage durch den KOMPLETTEN Prüfbericht; Struktur je Preset/Wochentag; „die Tür
ist Pflicht" (ohne sie bleibt das Ziel unerreichbar). Die alten Quick-Tests
zählen Zutaten jetzt über alle Ebenen. Alles auf Anhieb grün – der Baum-
Beweis trägt.

**Ehrlich zur Grenze:** Hell heißt sichtbar, nicht leicht – aber die
Schwierigkeit eines Rätsels mit drei Öffnern auf einer hellen Ebene ist eine
Spielgefühl-Frage, die nur das Gerät beantwortet. Die Zahlen (30 %, 8 s, sechs
Zellen) sind Startwerte.

## M41 „Alle oder einer" ✓ (v2.11.0) – Türen mit mehreren Öffnern, helle Ebenen

**Zwei Editor-Wünsche.** (1) Mehrere Schlüssel und Zeitschloss-Schalter
(auch gemischt) an EINER Tür – und einstellbar, ob EINER genügt oder ALLE
nötig sind. (2) Pro Ebene: dunkel (Standard) oder hell.

**Türregel an einer Stelle.** Bisher gab es drei Stellen, die Türen
schalteten: der Schlüssel entfernte die Wand sofort, der Zeitschloss-Block
setzte `open` nach eigenen Regeln, der MP-Frame dasselbe für Platten – drei
Meinungen über eine Tür. Jetzt gibt es `core/doors.ts` (`doorState`, rein):
Öffner-Zustände (Schlüssel eingesammelt, Schalter läuft, Platte gehalten) und
`require: 'any' | 'all'` ergeben `{ open, permanent }`. `permanent` nur, wenn
die erfüllte Bedingung allein aus Schlüsseln besteht – dann wird die Tür zu
Schutt wie bisher; sonst gleitet sie auf und wieder zu (auch bei 'all' aus
Schlüssel + Schalter: offen nur im Überlapp). `updateDoors(now)` in app.ts
sammelt die Öffner über ALLE Ebenen, wertet jede Tür aus und macht Übergänge
auf der aktuellen Ebene hörbar. Schlüssel, Schalter-Block und MP-Frame rufen
nur noch diese eine Funktion. Der Schlüssel-Flash sagt jetzt „Tür geöffnet"
nur, wenn die Tür wirklich aufging, sonst „die Tür braucht noch mehr".

**Beweis rechnet dasselbe.** `coopReachable` öffnet eine 'all'-Tür erst, wenn
ALLE Öffner erreichbar sind; der `openers`-Check verlangt bei 'all', dass
jeder Öffner ohne diese Tür erreichbar ist (bei 'any' weiter: einer). Beide
Checks bleiben einig – der Korridor mit einem Schlüssel hinter der Tür ist
bei 'all' in `goal` UND `openers` rot, bei 'any' grün. Was der Beweis NICHT
prüft: Timing bei 'all' mit zwei Zeitschlössern (`timer` prüft weiter je
Schalter den Weg zur Tür; ob beide gleichzeitig laufen können, ist Sache des
Bauers – der Testlauf sagt es). Mehrere Öffner je Tür waren im Format schon
immer möglich (jeder Öffner trägt `opens`); neu ist nur die Regel.

**Helle Ebene.** `floor.bright` (Default false) läuft durch Schema, Loader
(`LoadedFloor.bright`), Spiegelung und Renderer: Die Ebene wird mit
`revealAll` gezeichnet – Labyrinth, Elemente, Ziel sichtbar wie in der
Debug-Ansicht, der Klang bleibt. Editor: Feld „Licht" im Ebenen-Abschnitt.
`__tiltrWorld.bright` legt es für E2E offen.

Units: `tests/doors.test.ts` (Regel), `tests/requireAll.test.ts` (Schema,
Beweis any/all einig, coopReachable, Loader trägt require, bright durch
Loader und Spiegel). E2E Lauf 14: Tür-Feld schreibt require und räumt den
Default, Ebenen-Feld schreibt bright, die ⚑-Vorschau auf der hellen E2 meldet
`bright`.

**2.11.1 – Layout-Nachtrag (Screenshot vom iPhone):** Ein langer Bundle-Titel
(„Welt 1 – Die Tiefe erwacht (10)") zog Bundle-Leiste UND Level-Karten über
den rechten Rand. Ursache: Grid-Kinder haben `min-width: auto`, also die
Intrinsic-Breite ihres Inhalts – und die eines `<select>` ist die längste
Option. Die Spalte wurde breiter als der Viewport, alle Karten folgten. Fix:
`min-width: 0` auf den Grid-Kindern von `#workshopContent`/`#workshopList`
und der Leiste, Select mit `flex: 1 1 0` + Ellipse, Beschreibung und Meta
mit `overflow-wrap: anywhere`, der ▶-Knopf mit Ellipse. E2E (Lauf 28) setzt
einen überlangen Titel samt Beschreibung, schaltet auf 390 px und verlangt:
kein horizontaler Scroll, Leiste und Knöpfe innerhalb des Viewports, Select
schmaler als 260 px – rot gesehen ohne die Regeln.

**2.11.2 – Teilen-Nachtrag:** Bundle per Signal verschickt, beim Empfänger
kam nur der DATEINAME an. Web Share lief mit `application/json`; iOS reicht
die Datei an Signal offenbar nicht weiter und teilt dann nur den Titel.
`saveTextFile` teilt jetzt IMMER als `text/plain` (`SHARE_MIME`), auch für
`.json` – unsere Importe lesen den Inhalt, nie den Typ; das Backup lief so
von Anfang an. Der Datei-Import nimmt zusätzlich `.txt`/`text/plain` an.
E2E (Lauf 28) stubbt `navigator.share`, klickt Export und verlangt genau
eine Datei mit `text/plain` und `.json`-Namen – rot gesehen mit
`application/json`. Was ich nicht prüfen kann: Signal selbst.
Nachzügler 2.11.3: Der ⇩-Knopf IM EDITOR baute noch selbst einen
`application/json`-Blob am Download-Link – jetzt derselbe `saveTextFile`-Weg
(E2E Lauf 14 mit Share-Stub, rot gesehen).
2.11.4, Bericht vom Gerät: Mit `text/plain` fügt Signal den INHALT als
Nachricht ein (kein Anhang), `application/json` gab nur den Dateinamen. Als
Anhang landet, was iOS als generische Datei sieht: `application/octet-stream`
mit eigener Endung `.tiltr` (public.data statt public.plain-text). Deshalb
zwei Sorten in `saveTextFile`: 'text' für das Backup (.txt, „In Dateien
sichern" funktioniert damit), 'file' für Level- und Bundle-Exporte. Der
Import nimmt `.tiltr` zusätzlich zu `.json`/`.txt` – gelesen wird der Inhalt.
E2E: Share-Stubs verlangen jetzt octet-stream und `.tiltr`. Signal selbst
bleibt Gerätetest.
2.11.5, nächster Bericht: Aus „Dateien" heraus nimmt Signal die `.tiltr`
als Anhang, direkt aus dem Teilen-Dialog kommt weiter nur der Name. Also
liegt es nicht am Typ, sondern am ZWEITEN Element: Safari reicht `title`
als eigenen Text mit, und Signals Share-Extension greift den Text statt der
Datei. `saveTextFile` teilt jetzt NUR die Datei (`share({ files })`, kein
title). E2E (Lauf 28) verlangt `title === undefined` im Share-Stub.
2.11.6: Das ⇩-Symbol log – der Weg ist Teilen, nicht Herunterladen. Jetzt 📤
an allen drei Stellen (Bundle-Leiste, Level-Karte, Editor) und die Tooltips
sagen „Als Datei teilen".
2.11.7: Das Backup geht denselben Weg – `tiltr-backup-….tiltr`, octet-stream,
nur die Datei. Wiederherstellen nimmt `.tiltr` und alte `.txt`-Sicherungen.

## M40 „Level-Bundles" ✓ (v2.10.0) – Kampagnen aus der Werkstatt

**Der Wunsch:** Was in der Werkstatt bearbeitet wird, soll ein Level-BUNDLE
sein – Titel, Beschreibung, sortierbare Level, spielbar Level für Level wie
die eingebauten Kampagnen, mit gespeichertem Stand („weiter, wo ich
aufgehört habe"), als Ganzes exportier- und importierbar, mit ID und Version,
damit ein neuer Import eine alte Kopie ersetzt. Dazu für den Autor: die
eingebauten Kampagnen im Debug-Modus in die Werkstatt holen, überarbeiten,
als Datei zurückgeben.

**Modell.** `tiltr.workshop.v2 = { bundles: Bundle[] }`, Bundle = `{ id,
version, title, description, levels: CustomLevel[] (GEORDNET), createdAt,
updatedAt }`. Bestehende v1-Level werden beim ersten Laden EIN Bundle „Meine
Level", älteste zuerst (so wird aus der Bibliothek eine spielbare Reihe); der
v1-Schlüssel bleibt liegen – ein Backup einer älteren App-Version liest ihn
noch. Bestzeiten bleiben im Profil an den Level-IDs, dazu `bundleAt[bundleId]`
= zuletzt GESTARTETER Index. `bundleProgress` (rein) liefert „weiter bei"
(erster Level ohne Bestzeit, alles geschafft → 0) und die Freischaltung (der
Vorgänger hat eine Bestzeit); `?unlock` gilt weiter.

**Werkstatt = ein Bundle.** Oben die Bundle-Leiste: Umschalter (`<select>`),
＋ neues Bundle, ✎ Titel/Beschreibung inline, ⇩ Export, 🗑 Zwei-Tap, ▶ „Weiter
bei n: Name" mit „done/total geschafft · vN". Darunter die Level in
Spielreihenfolge, nummeriert, mit ▲▼ zum Sortieren (Drag & Drop ist auf
Touch unsichtbar und unzuverlässig) und den bekannten Aktionen. Der Editor
speichert ins Bundle, das das Level schon enthält, sonst ins aktuelle
(`workshop.save`), und legt „Meine Level" an, wenn es gar keins gibt. Die
bestehenden Selektoren (`#wsNewBtn`, `#workshopList`, `.ws-item`) blieben
absichtlich, damit 14 E2E-Läufe ohne Umbau weiterlaufen.

**Import fragt IMMER nach dem Ziel** (Entscheidung des Autors): Das Import-
Feld hat ein Ziel-Bundle-Select (aktuelles vorbelegt, „＋ Neues Bundle" als
Option), gilt für Text, 📋 und Datei. Der Teilen-Link aus dem Hash („In die
Werkstatt") öffnet dasselbe Feld mit vorbelegter Def – ein Tap mehr, aber
kein stilles Einsortieren. Bundle-DATEIEN (`format: tiltr-bundle`) laufen
über dasselbe Feld: jedes Level muss parsen (sonst nichts), gleiche ID +
höhere Version ersetzt sofort, gleiche/ältere Version fragt per Zwei-Tap.
Level-IDs bleiben (Fortschritt bleibt), nur IDs, die in einem ANDEREN Bundle
stecken, werden frisch. `exportFile` zählt die Version HOCH und speichert:
Jede weitergegebene Datei ist eindeutig neuer als ihre Vorgängerin
(Entscheidung: automatisch statt manuell).

**Spielen.** Modus `bundle` (`{ bundleId, index }`): Intro-Titel „Bundle ·
Level n · Name", Ergebnis mit „Weiter" bis zum letzten („Bundle geschafft!"),
Geist und Duell wie bei eigenen Leveln. Erreichbar über ▶ in der Werkstatt
UND als eigene Abschnitte unter den Welten im Kampagnen-Screen (Entscheidung:
beides), gesperrte Level mit 🔒.

**Debug-Import der Welten** (Entscheidung: ein Bundle pro Welt): 5× Version
blendet je Welt „⇪ In Werkstatt importieren" ein; `bundles.importBuiltin`
legt `builtin-w<n>` mit der App-Version als Bundle-Version an (2.10.0 →
21000), ein erneuter Import ersetzt die Kopie. Dabei fiel auf: Die Kampagnen-
Defs sind GESPIEGELT (`mirror`), und der Editor rechnete `buildFloorCells`
ohne `def.mirror` – ein importiertes Welt-Level hätte im Editor ein anderes
Labyrinth gezeigt als im Spiel. Beide Stellen (`edgeOpen`, `pickOpenDir`)
übergeben jetzt den Spiegel wie der Loader. Der Rückweg (Bundle-Datei →
`campaign.ts`) ist Handarbeit für mich: Datei geben, ich baue sie ein.

**Ein stiller Fehler beim Bauen.** Die Migration lief im Unit-Test zu einem
LEEREN Store, obwohl v1 gesetzt war: `newBundleId()` griff auf ein `let idSeq`
zu, das im Modul UNTER `const data = load()` stand – Temporal Dead Zone,
ReferenceError, verschluckt vom try/catch in `load()`. Die ID-Helfer stehen
jetzt vor `load()`, mit Kommentar. Lektion: ein try/catch um den Modulstart
ist richtig (kaputter Storage darf die App nicht töten), aber es frisst auch
Programmierfehler – der Test war der einzige Zeuge.

28 Units (Migration rein und im Store, CRUD, Reihenfolge, aktuelles Bundle,
Fortschritt, Export/Version, parseFile/applyFile, fremde Level-IDs,
importBuiltin, Einzel-Import, Draft). E2E Lauf 28: Migration → neues Bundle
→ Import mit Ziel → ▼ → Spielen (Profil-Stand) → Kampagnen-Screen (Abschnitte,
🔒, Debug-Knopf versteckt) → 5× Version → Welt 1 importiert → Export (…-v2.json)
→ Re-Import gleich/neuer → Löschen → Editor speichert ins aktuelle Bundle.

**2.10.1 – Design-Nachtrag (Screenshot vom iPhone):** Der native `<select>`
des Bundle-Umschalters kam weiß mit schwarzer Schrift – iOS zeichnet ihn
selbst, die Panel-Tokens greifen nicht. Jetzt `appearance: none`, Panel-
Grund, starke Kante, eigener Chevron (Data-URI), dieselbe Sprache für das
Ziel-Bundle-Select und die Titel-/Beschreibungsfelder. Zweiter Befund im
selben Bild: ▲▼ dehnten sich auf dem Phone zur eigenen Zeile, weil die
Container-Query der Aktionszeile alle `.ws-icon` streckt – die Sortierknöpfe
stehen jetzt kompakt rechts im Kartenkopf (`.ws-top`), außerhalb dieser
Regel. E2E (Lauf 12, Phone) prüft beides: Select-Grund ist nicht weiß und
hat `appearance: none`, ▲▼ liegen auf der Zeile des Namens.

## M39 „Glas ist Schwierigkeit" ✓ (v2.9.0) – Badge weg, Test ab hier

**Die Meldung:** „Glasboden im kritischen Pfad ist doch nicht schlimm. Der
wird danach ja durch ein Loch ersetzt, da kommt man mit Feingefühl am Rand
auch entlang." Das kippt die Begründung des „Glas abseits"-Badges (M32 hatte
den Anker herausgenommen und Glas bewusst drin gelassen: „ein Pflichtweg
zweimal darüber tötet"). Wenn der Rand des Lochs begehbar ist, ist der
zweite Weg nicht tot, nur schwer – und Schwierigkeit ist kein Beweisgegenstand.
Also ist das Badge WEG: `hazards` verlässt `CheckKey`, `validateLevel` und die
vier Wörterbücher. Ein Badge, das ein spielbares Level unteilbar macht, war
zum zweiten Mal die falsche Strenge. Die Flags `glassBlocked`/`anchorsBlocked`
bleiben als Qualitätsregel der Generatoren (dort gehört „Gefahr abseits des
Rückgrats" hin – der Zufall hat kein Feingefühl). tests/hazards.test.ts prüft
jetzt: kein `hazards`-Badge, Glas und Anker im Korridor teilbar, Flags wirken.

**Test ab hier (⚑).** „Im Vorschau-Modus wäre gut, wenn man an einer anderen
Position beginnen könnte – wenn man z. B. eine kritische Passage testen will."
Neues Werkzeug ⚑: Tap auf eine Zelle setzt den Teststart (jede Ebene), Tap auf
dieselbe Zelle hebt ihn auf; gestrichelter Rahmen plus Flagge im Overlay.
`#edTest` reicht ihn an `startCustom(def, true, from)`, `launch` wechselt nach
`activateFloor(0)` auf die gewünschte Ebene und setzt die EINE, geteilte Kugel
in die Zellmitte (v = 0), Respawn ebenfalls dort. Bewusst KEIN Teil der Def:
nicht gespeichert, nicht geteilt, nur Editor-Zustand – aber er überlebt den
✏️-Rücksprung, denn der Editor bleibt derselbe. Gelöschte Ebene: die Flagge
fällt still zurück auf den Level-Start (`floor < floors.length`).
E2E Lauf 14: Flagge auf E2 (1,3) → Vorschau: HUD sagt „⬍ E2", Ball bei
(150, 350) → ✏️ → Flagge noch da, Tap hebt auf.

**Nebenbefund: der rote Deploy von 2.8.0.** Lokal 396 grün, in der CI fiel
`tests/workshop.test.ts` („speichert, listet … neueste zuerst"): erwartet
`['Beta', 'Alpha']`, bekommen `['Beta']`. Kein Fehler im Editor-Code –
`newCustomId()` bestand aus der Millisekunde plus ZWEI Zufallszeichen (1296
Werte). Der CI-Läufer speicherte beide Level in EINER Millisekunde, die
Zufallszeichen fielen gleich (1:1296), der Upsert schluckte Alpha. Dazu eine
zweite Falle im selben Test: `list()` sortierte nach `updatedAt`, und bei
gleichem Zeitstempel war die Reihenfolge undefiniert. Beides behoben: eine
laufende Nummer je Sitzung in der ID (eindeutig auch bei eingefrorener Uhr,
500 IDs in einer Millisekunde bleiben 500) und ein Tie-Break nach
Einfügereihenfolge. Die zwei Units frieren `Date.now` ein, statt auf einen
schnellen Rechner zu hoffen. Lektion: Ein Test, der lokal 20-mal grün war, ist
nicht deterministisch, wenn er von der Uhr abhängt – 2.8.0 ist deshalb NIE
live gegangen, 2.9.0 trägt beides.

## M38 „Wand an, Wand aus" ✓ (v2.8.0) – Wand-Schalter, Wand-Variante, Schallschutzwand

**Drei Editor-Wünsche, eine Wurzel.** Erst hieß es „der Zyklus soll immer
leer → Wand → brüchig → leer sein", dann: „doch anders – Wand oder keine Wand,
und brüchig als EINSTELLUNG der Wand. Dazu eine Schallschutzwand." Die Wurzel:
Das Wand-Werkzeug lief über die LISTEN (Seed → carve → add → brüchig → Seed),
und der Seed entscheidet pro Kante, wo dieser Kreis anfängt. Auf einer offenen
Seed-Kante war der erste Tap unsichtbar (carve auf schon offen), auf einer
Seed-Wand der zweite (add auf schon Wand). „Manchmal passiert nichts."

**Der Weg.** `toggleEdge` (rein, exportiert) liest den SICHTBAREN Zustand und
setzt die Listen so, dass das Gegenteil herauskommt: Wand braucht add nur bei
offenem Seed, offen braucht carve nur bei Seed-Wand; eine entfernte Wand nimmt
ihre Variante mit. Die Variante ist eine EIGENSCHAFT: Auswählen-Werkzeug auf
eine Wandkante ohne Element wählt die Wand (`selEdge`, Rahmen wie bei einer
Tür), die Eigenschaften zeigen Kopf (Miniatur „Wand & Echo", Hören) und ein
Feld „Variante": massiv / brüchig / Schallschutz (`setEdgeVariant`, genau eine
Liste führt die Kante). Die Zwischenfassung mit Dreier-Zyklus war komplett
grün (250 ✓) und ist nie gepusht worden – ein Werkzeug, das drei Zustände
durchklickt, war die falsche Antwort auf die richtige Beobachtung.

**Schallschutzwand** – neue Wand-Variante, `maze.absorb` neben `brittle`
(Schema, Spiegelung, Loader mit EINEM Kanten-Sucher für beide Listen, Wand
mit `absorb`, Palette Filz-Khaki). Drei Wirkungen, alle im Klang: (1) Der
Echo-Ping deckt sie auf (Licht), aber sie ANTWORTET NICHT – ein stilles Stück
Richtung ist ihr Signal. (2) Was hinter ihr liegt, ist abgeschirmt:
`core/occlusion.ts` prüft pro Frame den Strahl vom Ball zur Quelle gegen die
absorbierenden Wand-Rechtecke (Slab-Test); Wächter, Horcher, Portal, Anker,
Wind, Strömung, Loch-Grollen und Musik skalieren ihre Nähe mit `ABSORB_GAIN`
(0,35), der Ziel-Beacon nimmt seinen „muffled"-Zweig, der Schlüssel klingt
entsprechend weiter weg. (3) Anrempeln ist weich (`audio.hit(…, soft)`:
tiefer, leiser, kürzer). Ehrlich zur Grenze: Das ist ein Strahl, keine
Akustik – keine Beugung um die Kante, kein Filter auf den Stetigkeits-Quellen
(nur leiser); der Filter wohnt beim Beacon. Für die Lösbarkeit ist sie eine
Wand wie jede andere, `buildFloorCells` kennt sie nicht. Galerie-Eintrag
„Schallschutzwand" (Extra-Eintrag wie „Wand & Echo", i18n ×4) mit weichem
Rempler und gedämpftem Beacon als Klang-Demo; `extraEntries` ist jetzt
exportiert, damit der Editor dieselbe Miniatur und denselben Klang zeigt.

**Landeplätze** (aus der Zwischenfassung übernommen): Das Transporter-Ziel
war nur zu sehen, wenn der Transporter auf derselben Ebene stand. `landingsOn`
sammelt die Zielzellen ALLER Ebenen, die auf der sichtbaren liegen; der Editor
zeichnet einen gestrichelten Ring in Portal-Farbe und „←E1", wenn man von
woanders kommt. Bewusst KEIN Element: Die Zelle bleibt bebaubar, ein Tap
darauf wählt nicht den Transporter.

Units: 9 (toggle/Variante/Landeplätze), 10 (Slab-Test, shielded, Loader
`absorb`, Spiegelung). E2E Lauf 14: Schalter zweimal (zurück am Anfang),
Auswahl wählt die Wand, Variante brüchig → Schallschutz mit genau einer
Liste und ohne Ladefehler, Entfernen nimmt Variante und Auswahl mit;
Landeplatz und bebaubare Zielzelle. Lauf 12 prüft nach einem Tap „genau ein
Eintrag in carve ODER add, keine Variante".

## M37 „Alles in einer Datei" ✓ (v2.7.0) – Backup & Restore

**Die Meldung:** „Wenn die PWA neu installiert wird, ist mein Fortschritt und
alle meine Levels aus der Werkstatt weg." – Richtig: Alles lebt im
localStorage, und der gehört der Installation. Eine Neuinstallation (wegen
M36 gerade nötig), „Website-Daten löschen" oder ein Gerätewechsel: weg.

**Der Weg.** `src/backup.ts` sammelt ALLE `tiltr.*`-Schlüssel – durchgezählt,
nicht als Liste: Geister liegen unter `tiltr.ghost.<levelId>`, das sind
beliebig viele. Der Codec ist derselbe wie bei Teilen-Links
(`encodePayload`): deflate-raw + base64url, die Datei IST das Token. Eine
Sicherung mit einer Handvoll Leveln und Geistern liegt bei ein paar KB.

Sichern geht über `src/ui/download.ts`: Web Share mit DATEI, wenn der Browser
das kann – auf iOS ist das der native Weg („In Dateien sichern", AirDrop,
Mail); sonst der klassische Download. Der Level-Export läuft jetzt über
denselben Helfer. Wiederherstellen: Datei wählen → Zusammenfassung („Backup
vom 2.9.2026: 5 Level, 12 Bestzeiten, 3 Geister – ersetzt den aktuellen
Stand") → ZWEITER Tap auf den bernsteinfarbenen Knopf → alle `tiltr.*` raus,
Datei rein → Reload. Der Reload ist Pflicht, nicht Komfort: `profile.ts` und
`workshop.ts` halten ihre Daten im Speicher, der nächste Save hätte das
Backup wieder überschrieben. ERSETZEN statt Mischen, weil Mischen bei
Bestzeiten und Streak nicht definierbar ist.

Abgewiesen wird mit Grund: fremdes Format (ein Level-Token ist kein Backup),
unbekannte Version, Schlüssel außerhalb `tiltr.*`, Nicht-Text-Werte – und
eine abgewiesene Datei fasst den Speicher nicht an. Codec-Fehler werden auf
„Datei nicht lesbar" gemappt: Der erste E2E-Lauf zeigte in der Statuszeile
Chromiums Innerei „Failed to fetch" – das klingt nach Netz und ist keins.

8 Units (`tests/backup.test.ts`; Sabotage „Aufräumen vergessen" kippt genau
den ERSETZT-Test). E2E-Lauf 27 ist ein ECHTER Datei-Roundtrip: Level per
Import, Geist, Name → 💾 (Playwright fängt den Download) → `localStorage.clear()`
→ Müll-Datei abgewiesen, Knopf unbewaffnet → echte Datei, Zusammenfassung,
bewaffneter Knopf → zweiter Tap, Reload → dieselbe Schlüsselmenge wie vorher,
Name/Geist/Level da.

**Was ich nicht prüfen kann:** den iOS-Teilen-Dialog – Chromium hat kein Web
Share mit Dateien, der E2E-Lauf nimmt den Download-Zweig. Ob „In Dateien
sichern" auf deinem iPhone erscheint, ist dein Bericht.

**Nebenbefund E2E: der stille Absturz.** Der erste volle Parallel-Lauf endete
mit 207 ✓ statt 247 und einem einzigen ✗ in Lauf 9 (Coop) – `page.click` auf
den Zwischenscreen lief in den 30-s-Timeout, der Wurf war unbehandelt, und
Arbeiter 1 starb. Die vier Läufe hinter ihm (10, 14, 20, 25) fehlten, ohne
dass irgendetwas rot wurde: Der Dispatcher zählte nur ✓/✗-Zeilen. Zwei
Reparaturen: (1) `parallel.mjs` vergleicht zugeteilte Läufe mit den
gedruckten `# Lauf X`-Markern und meldet jeden fehlenden als `NICHT gelaufen`
(exit ≠ 0). (2) Alle 36 Top-Level-Blöcke in `smoke.mjs` stehen in einem
`try/catch`, das einen Absturz als EINEN roten Check ausweist und den nächsten
Lauf fahren lässt. Sabotage: `throw new Error("boom")` am Anfang von Lauf 2 →
genau ein ✗ „Lauf 2 läuft ohne Absturz durch (Error: boom)", Lauf 3 lief mit
11 ✓ weiter. Lauf 9 selbst war allein zweimal grün: ein Last-Flake unter vier
Arbeitern (er schläft 34 s fest statt auf Zustand zu warten). Das ist der
aufgeschobene dritte Hebel aus M35 – Sleeps gegen Zustands-Warten tauschen,
Lauf 9 zuerst.

## M36 „Der weiße Moment" ✓ (v2.6.2) – iOS-Startbildschirm

**Die Meldung:** „Wenn ich nach einer Weile unter iOS die gespeicherte PWA
öffne, ist zuerst die Seite kurz weiß."

**Zwei Weiße, zwei Ursachen.** Erst der SYSTEM-Startbildschirm: iOS zeigt ihn,
bevor die Seite überhaupt lädt, und nimmt dafür ausschließlich
`apple-touch-startup-image` – das Manifest-`background_color` ignoriert es.
Ohne passendes Bild: weiß. Und „passend" heißt PIXELGENAU; ein Bild in der
falschen Größe wird still verworfen. Dann die Leinwand von WebKit zwischen
Start der Web-View und erstem Paint: ohne `color-scheme` hell.

**Der Weg.** `tools/startup.mjs` hält EINE Geräteliste (18 Hochkant-Maße,
iPhone SE bis iPad Pro 13"); ein Vite-Plugin erzeugt daraus beim Build die
PNGs (`emitFile`) und die `<link>`-Tags (`transformIndexHtml`). Nichts wird
eingecheckt, die Liste ist die einzige Wahrheit. Die Bilder sind einfarbig im
Spielfeld-Ton `--bg-deep` – kein Logo-Splash, die Welt offenbart sich über
sparsames Licht. Einfarbig heißt 1-Bit-Palette: ein 1290×2796-Bild hat
**536 Byte**, alle 18 zusammen liegen unter 10 KB Precache. Dazu
`<meta name="color-scheme" content="dark">` und `color-scheme: dark` auf
`:root` für den zweiten Teil.

E2E-Lauf 26 (7 Checks) liest die Tags aus dem gebauten Head, lädt jedes Bild
und prüft: Status 200, IHDR-Größe = Media-Query × Pixeldichte, PLTE-Farbe =
gerendertes `--bg-deep`, unter 2 KB, Hochkant. Sabotage – und hier eine Lektion: Meine erste
Sabotage (eine Pixeldichte in DEVICES falsch) kippte NICHTS, und das ist
richtig so. Tag und Bild kommen aus EINEM Datensatz; ein Fehler in der Quelle
macht beide konsistent falsch, und Konsistenz ist alles, was der Test prüfen
kann. Eine falsche Gerätetabelle fängt kein Test – nur Apples Tabelle. Was
der Lauf fängt, sind PIPELINE-Fehler: Maße im Encoder vertauscht (Größen-Check
rot), falsche Farbe (Farb-Check rot), kein emitFile (Bilder fehlen). Genau die
sind rot gesehen. Und die PNGs sind im Precache (workbox globPatterns) – das
Default-Glob sah emittierte Assets außerhalb von public/ nicht. Nebenbefund
beim Nachrechnen der Precache-Größe (673 → 740 KiB, obwohl 18 Bilder nur
9 KB wiegen): Die beiden APP-ICONS (57 KB) waren bisher gar nicht im
Precache – `includeAssets` kopiert sie, das Default-Glob nahm keine PNGs.
Jetzt sind sie drin; die Differenz stimmt auf das Kilobyte.

**Ehrlich zur Wirkung:** Wie kurz der Moment auf dem Gerät jetzt wirklich ist,
kann ich nicht messen – die E2E beweist, dass iOS ein passendes Bild
VORFINDET, nicht, wie es sich anfühlt. Das bleibt dein Bericht.

## M35 „Die Suite schläft" ✓ (v2.6.1) – E2E-Filter und Parallelisierung

**Die Frage:** „Die Tests und die CI laufen mittlerweile sehr lange. Kann man
da was beschleunigen oder parallelisieren? Oder die Tests in Kategorien
einteilen?" – **Erst messen.** Der CI-Lauf für v2.6.0 (4 min 45 s):

| Schritt | Dauer |
|---|---|
| Checkout, Node, npm ci | 11 s |
| typecheck + lint + test + build | 19 s |
| Playwright installieren | 21 s |
| **E2E** | **223 s (78 %)** |
| Deploy | 8 s |

Die 369 Units brauchen 7 Sekunden. Kategorien hätten nichts gebracht – die
Zeit sitzt in der E2E, und dort in **205 Aufrufen von `waitForTimeout`,
zusammen 183 s: 82 % der E2E ist geplantes Schlafen.** Feste Pausen nach
Klicks, kein Warten auf einen Zustand. Ein Teil ist echte Zeit (Splash 4,2 s,
Konfetti, Atem-Uhr, ein Ball muss rollen); der größere Teil ist Polster.

**Zwei Hebel umgesetzt, der dritte als Regel:**

1. **`E2E_ONLY=23,24 npm run e2e:serial`** – nur diese Läufe. Jeder der 29
   Blöcke steckt jetzt in `if (want('id')) { … }`; die Liste `KNOWN_RUNS` ist
   aus den Köpfen erzeugt. Ein unbekannter Name ist **exit 2**, kein leerer
   Erfolg: Ein Tippfehler darf nicht grün durchgehen, weil null Checks liefen.
   Der Gewinn ist der größte für die tägliche Arbeit – an diesem einen Tag lief
   die volle E2E achtmal, fast immer wegen EINES neuen Laufs: rund 30 Minuten
   Warten für 6 Minuten Information. Ein Einzellauf braucht jetzt 19 s.
2. **`npm run e2e` ist parallel** (`e2e/parallel.mjs`): EIN Preview-Server,
   vier Arbeiter als eigene `smoke.mjs`-Prozesse mit `E2E_BASE` + `E2E_ONLY`.
   Verteilung greedy nach gemessenem Schlaf, damit Lauf 9 (34 s) und Lauf 16
   (20 s) nicht im selben Arbeiter landen. Ausgabe je Arbeiter gesammelt,
   nicht verschränkt – die ✓/✗-Zeilen bleiben greppbar. Bewusst KEIN Umbau auf
   den Playwright-Test-Runner: der wäre richtig, aber 2600 Zeilen; der
   Dispatcher hat 80 und ändert an den Läufen nichts. Voraussetzung, jetzt
   als Regel in CLAUDE.md: Läufe bleiben unabhängig (eigene Seiten, eigener
   localStorage je Kontext).
3. **Schlaf → Zustand**, Lauf für Lauf, nicht in einem Abend: Jeder Lauf,
   der künftig angefasst wird, verliert seine Pausen gegen `waitFor…`.

**Gemessen, gleiche Maschine, gleicher Build:** seriell 240 s, parallel
mit vier Arbeitern 77 s (Faktor 3,1; der langsamste Arbeiter trägt Lauf 9 mit seinen 34 s Schlaf – dort sitzt der nächste Hebel). Kontrollrechnung: 231 ✓ = 228 + 3, kein Server übrig.
**In der CI (Lauf für d86d66f, 4 vCPU):** E2E-Schritt 223 s → **63 s**, Gesamtlauf
4:45 → **2:00**. Der Rest sind jetzt Installation (Playwright 20 s, npm ci 5 s)
und die vier schnellen Schritte (19 s) – die E2E ist nicht mehr der Posten,
der alles diktiert.

**Vier Funde am Rand.** Erstens hießen ZWEI Läufe „Lauf 6" (der Safe-Area-Lauf
zwischen 7 und 9 war falsch nummeriert) – die Transformation hat es gemerkt,
weil sie auf eindeutige Namen bestand; er heißt jetzt 8. Zweitens hat
Prettier die erzeugte Lauf-Liste umbrochen und die Anführungszeichen
getauscht, und der erste Dispatcher starb daran sofort – sein Parser liest
jetzt beides und nennt den Fehler, statt an `null.map` zu sterben. Drittens
lebte ein `vite preview` von vor 36 Minuten noch: `smoke.mjs` startete Vite
über `npx` und schickte SIGTERM an npx – das Kind „vite" überlebte, hielt
Port 8765, und jeder spätere `--strictPort`-Start scheiterte STILL, während
die Warteschleife den fremden Server für den eigenen hielt. Vite wird jetzt
direkt gestartet (`node_modules/vite/bin/vite.js`), und der Dispatcher
bricht ab, wenn sein eigener Server stirbt, bevor er antwortet. (Der Fund
kostete eine halbe Stunde, weil ich zusätzlich mit `pgrep -f` auf einen
String gewartet habe, der in meiner eigenen Kommandozeile stand – die
Schleife wartete auf sich selbst. Nach PID killen, nicht nach Muster.)
Viertens – und das hätte ohne Zählen niemand gemerkt: Der parallele Lauf
meldete **300 ✓ statt 228 + 3**. Fünf Läufe (6, 7, 8, 10b, 12) bestehen aus
ZWEI nackten `{ … }`-Blöcken unter einem Kopf; eingehüllt hatte ich nur den
ersten. Der zweite lief in JEDEM Arbeiter – und bei `E2E_ONLY=1` gleich mit,
das „19 s für einen Lauf" war zu einem Drittel fremde Arbeit. Jetzt trägt
jeder Top-Level-Block den Namen seines letzten Kopfes (34 Blöcke, 29 Köpfe),
und die Kontrollrechnung ist Teil der Messung: parallel muss GENAU seriell
plus drei Konsolen-Checks ergeben, sonst läuft etwas doppelt.

## M34 „Der Link, der im falschen Fenster aufgeht" ✓ (v2.6.0)

**Das Problem ist die Plattform, nicht der Code:** Ein geteilter Link
(`https://…/tiltr/#level=…`) öffnet auf dem Handy immer den BROWSER – die
installierte PWA bekommt ihn nie zu sehen. Wer ein geschicktes Level in
seiner App haben will, hatte bisher keinen Weg außer „im Browser spielen".

**Der Weg:** Das Import-Feld der Werkstatt nimmt jetzt neben JSON auch den
Link – komplett, als nackter Hash oder als bloßes Token (das beginnt immer
mit der Codec-Version 0/1, JSON immer mit `{`, also ist die Reihenfolge
JSON → Link eindeutig). Duell-Links tragen ihr Level mit und werden ebenso
angenommen. Dazu ein 📋-Knopf: `navigator.clipboard.readText()` unter der
Nutzergeste – in der PWA ist Einfügen sonst Langdruck im Textfeld. Fehlt die
API oder wird sie verweigert, sagt es die Statuszeile und das Feld bleibt.

`importLevel` (JSON) und der neue Link-Pfad enden in EINEM `importRaw`:
validieren, fremde oder kollidierende IDs frisch vergeben, speichern – die
ID-Regel steht damit einmal, nicht zweimal.

9 Units in `tests/shareImport.test.ts` (Parser inklusive Negativfälle,
Roundtrip Level-Link und Duell-Link, kaputte Tokens werfen nicht). E2E-Lauf
25 baut den Link mit dem ECHTEN Codec im Browser, importiert ihn als Text und
per 📋 (Playwright gewährt `clipboard-read/-write`), weist einen kaputten
Link ab und prüft, dass JSON weiter über dasselbe Feld läuft.

## M33 „Wofür gilt dieses Feld?" ✓ (v2.5.6)

**Rückmeldung aus der Praxis:** „Beschreibung, Par-Zeit beziehen sich auf das
ganze Level, Spalten und Zeilen nur auf die jeweilige Ebene. Und der obere Teil
auf das selektierte Element. Das wird nicht ganz klar."

Das Eigenschaften-Panel mischt DREI Geltungsbereiche, und beschriftet war nur
einer davon: Über Intro/Par/Pings UND Spalten/Zeilen stand gemeinsam „Level" –
also sah „Spalten" wie eine Level-Eigenschaft aus, obwohl es das Stockwerk
meint. Wer es nicht wusste, musste es ausprobieren.

Jetzt sagt jeder Block selbst, wofür er gilt:

| Block | Kopf |
|---|---|
| Auswahl | `Auswahl: Loch · nur dieses Element` |
| Level | `Level · alle Ebenen` |
| Ebene | `Ebene 2 · nur hier` (Nummer wandert mit der aktiven Ebene) |

Dazu eine Trennlinie (`.ed-scope`, `--border-subtle`) – der TEXT nennt die
Grenze, die LINIE zeigt sie; eins von beidem allein reicht nicht. Am obersten
Kopf entfällt die Linie (`.first`), denn darüber steht nichts.

Der alte Schlüssel `ed.level` ist damit unbenutzt und ENTFERNT statt liegen
gelassen – ein toter i18n-Eintrag in vier Wörterbüchern ist genau die Art
Ballast, die beim nächsten Umbau Verwirrung stiftet.

E2E-Lauf 24 liest die Köpfe in der echten UI: ohne Auswahl zwei Bereiche, nach
„＋" nennt der Ebenen-Kopf die 2 (nicht mehr die 1), mit Auswahl sind alle drei
gleichzeitig da, und der erste Kopf hat messbar `border-top: 0px`. Sabotage
(Ebenen-Kopf weg) macht drei der fünf rot – die Nummer-Zusicherung ist die
wichtigste: ein fester Text „Ebene" hätte sie nicht bemerkt.

## M32 „Ein Anker ist kein Riegel" ✓ (v2.5.5) – hazards war zu streng

**Der zweite Bug-Report in Folge:** „Und Gefahren abseits ist auch rot. Was
aber auch nicht stimmt."

**Der Fehler.** Der `hazards`-Check sperrte Glas- UND Ankerzellen als Wände.
Für den Anker ist das nachweislich falsch, und der Beweis steht im eigenen
Code: `anchorDef.force` ist auf **2400** px/s² begrenzt („MUSS unter der
Neigungs-Beschleunigung bleiben: ein Anker ist zäh, nie eine Falle"), die
Neigung schiebt mit **2600** (`World.accel`). Man kommt immer wieder heraus –
ein Anker kostet Zeit, er versperrt nichts.

Die Folge war schlimmer als ein falsches Badge: `isShareable` verlangt alle
Badges außer `items`, also war ein Level mit einem Anker im Gang NICHT
TEILBAR – obwohl `goal` und `softlock` dasselbe Level grün stempelten. Wieder
derselbe Fehlertyp wie bei M31: Checks derselben Datei, die sich widersprechen.

**Der Fix.** `hazardsBlocked` ist in `glassBlocked` und `anchorsBlocked`
aufgeteilt – nicht aus Ordnungsliebe, sondern damit JEDE Aufrufstelle sagen
muss, was sie meint. `validateLevel` sperrt nur Glas; die Generator-Tests
(levels/daily) übergeben beide und behalten damit ihre strengere DESIGN-Regel
für unsere eigenen Level. Das Badge heißt jetzt ehrlich „Glas abseits" (i18n
×4) statt „Gefahren abseits".

**Glas bleibt gesperrt, und das ist eine Entscheidung, keine Notwendigkeit:**
Glas hält eine Überfahrt aus, ein Weg dorthin überquert es also genau einmal
und wäre lösbar. Aber ein Weg, der zweimal darüber muss, tötet – und dieses
Modell zählt Erreichbarkeit, nicht Wege. Solange es das nicht kann, bleibt
Glas ganz draußen (Abkürzung oder Köder, nie Pflichtweg).

**Folgenabschätzung, vorher gemacht:** Anker und Glas kommen in der Kampagne
NULL Mal vor – nur in den Generatoren. Das Lockern berührt also kein
handgebautes Level, und die Generator-Regel bleibt über die Testaufrufe
erhalten.

5 Units in `tests/hazards.test.ts`, darunter die Invariante selbst
(`anchorDef` lehnt `force: 2600` ab und der Default liegt unter `World.accel`)
– die Zahl steht damit nicht als Kommentar, sondern als Test. Zwei Sabotagen
einzeln rot gesehen: Anker wieder als Wand → der Anker-Fall fällt; Glas nicht
gesperrt → der Glas-Fall fällt.

## M31 „Zwei Checks, zwei Meinungen" ✓ (v2.5.4) – openers war falsch

**Der Fund kam als Bug-Report:** „Ich hab auf Ebene 3 einen Schlüssel vor der
Tür, der Transporter-Zielpunkt ist auf der Schlüsselseite. Trotzdem wird es als
Fehler angezeigt."

**Der Fehler.** Der `openers`-Check schloss ALLE Türen gleichzeitig
(`reachable(def, { doorsOpen: false })`) und verlangte, dass JEDER Schlüssel in
dieser Welt erreichbar ist. Damit galt die gewöhnlichste Progression überhaupt
als Fehler: Schlüssel 1 → Tür 1 → Schlüssel 2 → Tür 2. Schlüssel 2 liegt hinter
Tür 1 – die man an dieser Stelle längst geöffnet hat.

**Wie es auffiel.** Nicht am gemeldeten Level, sondern am WIDERSPRUCH IM
BERICHT: `goal` benutzt `coopReachable` (den Fixpunkt: eine Tür gilt als offen,
sobald ein Öffner erreichbar ist) und stempelte grün – `openers` rot. Zwei
Checks derselben Datei mit zwei Meinungen; einer musste falsch sein. Das ist
die verlässlichste Fehlersuche in diesem Modell: nicht das Level anstarren,
sondern die Checks gegeneinander lesen.

**Der Fix.** Die Frage gehört PRO TÜR gestellt: Ist mindestens einer ihrer
Öffner erreichbar, wenn genau diese Tür nie aufgeht? Das ist
`coopReachable(def, new Set([doorId]))` – die Funktion und ihr
`bannedDoors`-Parameter existierten längst, `openers` hat sie nur nicht
benutzt. Pro Tür statt pro Schlüssel, weil zwei Schlüssel dieselbe Tür öffnen
dürfen: Liegt einer dahinter, ist das kein Fehler, solange der andere davor
liegt. Ein Riegel ist nur eine Tür, deren SÄMTLICHE Öffner hinter ihr liegen.
Die Meldung nennt jetzt die TÜR (`tor1: key E1 (3,0)`), nicht bloß den
Schlüssel – die Tür ist die Ursache.

**Reine Lockerung, mit Absicht.** GEPRÜFT werden nur Türen mit
Schlüssel/Zeitschloss – genau der Umfang von vorher; ERFÜLLEN darf sie jeder
Öffner, Platte eingeschlossen (Schlüssel drinnen, Platte draußen geht im Coop
auf). Damit kann kein Level, das heute grün ist, durch diese Änderung rot
werden – wichtig, denn das Modell urteilt über JEDES geteilte Level. Der erste
Entwurf prüfte auch reine Platten-Türen und wäre damit eine Verschärfung
gewesen; das ist bewusst zurückgenommen.

Sieben Units in `tests/openers.test.ts`; mit dem alten Check werden fünf davon
rot (die zwei anderen waren in beiden Fassungen richtig – ein ehrliches
Ergebnis, keine Politur). Die 28 Kampagnen-Level und die Coop-Level bleiben
unberührt: Deren Türen haben je eine Platte außen und eine innen, die äußere
erfüllt den Beweis.

## M30 „Der Start gehört Ebene 1" ✓ (v2.5.3)

**Der Fund kam als Frage:** „Wenn ich neue Ebenen hinzufüge, warum haben die
einen Start Punkt?" – und die Antwort war unbefriedigend: weil das Format es
verlangt, obwohl es nichts tut.

`start` ist in `schema.ts` PRO EBENE Pflicht (anders als `goal`, das
`nullable()` ist), aber nur `floors[0].start` setzt die Kugel (`loader.ts`) und
nur von dort startet der Erreichbarkeits-Beweis (`validate.ts`). Auf tieferen
Ebenen kommt man über den TRANSPORTER an; der `start`-Eintrag ist dort ein
toter Pflichtwert. Drei Folgen hatte das, alle behoben:

1. **Eine Phantom-Kugel.** Es gibt EINE Kugel für alle Ebenen-Welten. Der
   Editor zeichnete sie auf jeder Ebene – auf E2 also an den Koordinaten von
   E1s Start. Genau das sah aus wie „die neue Ebene hat einen Startpunkt".
   Jetzt: `renderer.draw(..., { hideBall })`, plus `renderer.ballDrawn` als
   Haken (der Renderer sagt selbst, was im Bild steht – wie `goalLit`).
2. **Ein grundlos gesperrter Bauplatz.** `cellFree()` schützte den Start JEDER
   Ebene, also war (0,0) auf einer neuen Ebene für Elemente tabu. Und der
   `jukebox`-Check meldete einen Automaten dort als „Start E2 (0,0)" – ein
   Fehlalarm. Beide prüfen jetzt nur noch Ebene 1. Das ●-Werkzeug ist ab E2
   gedämpft und ERKLÄRT sich beim Tap, statt als toter Knopf dazustehen (kein
   `disabled`: das nimmt Hover UND Fokus, und damit die Tooltip-Blase).
3. **Die eigentliche Falle.** Ebene 1 löschen befördert E2 zu Ebene 1 – und
   ihr toter Start wird plötzlich echt. Bisher war das durch (2) abgefedert;
   nach der Freigabe hätte die Kugel in einem Loch aufwachen können. Der
   „−"-Knopf reparierte Transporter-Ziele und die Ein-Ziel-Invariante, aber
   nie den Start.

Für (3) ist die Ebenen-Löschung aus dem Klick-Handler in eine REINE Funktion
gezogen: `removeFloor(level, index)` in editor.ts, exportiert wie `pickTarget`.
Sie räumt Transporter auf, rückt den beförderten Start mit `freeCellFor()` aus
belegten Zellen heraus und setzt das gerettete Ziel ebenfalls in eine FREIE
Zelle – die Bildschirmecke, in die es vorher stur wanderte, kann längst ein
Element tragen. Das war der Nachbar-Fehler derselben Klasse und ist mitgefixt.
`freeCellFor` meidet auch WÄCHTER-WEGPUNKTE, nicht nur Element-Zellen: Auf
einer Patrouille wacht die Kugel nicht sicher auf.

13 neue Units in `tests/editorFloors.test.ts` (vier Sabotagen einzeln rot
gesehen, jede hat genau die gemeinte Zusicherung überführt), ein Unit im
Jukebox-Beweis, und E2E-Lauf 23 fährt den ganzen Ablauf durch die echte UI:
E1 mit Kugel und scharfem ●, E2 ohne Kugel mit gedämpftem ●, ein Loch auf E2s
totem Start, dann E1 löschen – und der beförderte Start liegt nicht im Loch.

## M29 „Sehen beim Bauen" ✓ (v2.5.2)

Die Debug-Ansicht (👁, deckt das Labyrinth auf) ist im Spiel versteckt – 5
Taps auf die Versionsnummer schalten sie frei. In der EDITOR-VORSCHAU ist sie
jetzt immer da: Dort testet man den eigenen Entwurf, und wer bauen will, muss
sehen dürfen, was er gebaut hat. Der Freischalt-Trick soll das Spiel schützen,
nicht das Werkzeug.

`updateDebugButton(editorPreview)` läuft bei JEDEM Levelstart – und nur dort,
denn nur dort kann es etwas bewirken. Verlässt man die Vorschau, geht der Knopf
weg UND die Ansicht aus: Sonst nähme man ein aufgedecktes Labyrinth in den
nächsten Lauf mit und hätte ohne Knopf keine Möglichkeit, es abzuschalten.

Der Sabotage-Lauf hat dabei einen Aufruf ENTLARVT statt bestätigt: Ein
zusätzliches `updateDebugButton(false)` in `showMenu()` stand zuerst da – seine
Entfernung fiel keiner Zusicherung auf, weil im Menü das HUD versteckt ist und
nichts mehr gezeichnet wird. Also ist es weg; der Grund steht als Kommentar
dort, wo man es sonst wieder hinschreibt.

E2E-Lauf 22 prüft die vier Zustände: normaler Lauf (versteckt), Vorschau
(sichtbar, ohne Freischalt-Taps), Knopf wirkt (Statuszeile schaltet auf
„Debug · …"), und der Rückweg lässt nichts zurück. Drei der vier Zusicherungen
einzeln rot gesehen – die vierte war die, die den überflüssigen Aufruf
aufgedeckt hat.

## M28 „Der Riegel" ✓ (v2.5.1) – Wächter-Fehler in der Tages-Challenge

**Der Fehler.** Der Daily-Generator würfelte regelmäßig eine
ZWEI-ZELLEN-PATROUILLE in einen ein Zelle breiten Gang auf dem einzigen Weg
zum Ziel. An einem Wächter kommt man dort nicht vorbei (Kollision ab 48
Einheiten, seitlich sind höchstens 23 möglich) und überholen kann man ihn
nie – der Gang ist DAUERHAFT versiegelt, der Tag unlösbar. Und zwar für alle,
denn das Level ist für alle dasselbe. Gemessen: **8 von 28 Tagen**. Die
Kampagne hat den Beweis seit M18, der Generator hatte ihn nie bekommen.

**Der Fix in zwei Schichten**, und die Unterscheidung ist wichtig:

1. **Korrektheit: generieren und BEWEISEN.** Am Ende jedes Tages läuft der
   echte Wächter-Beweis (`guardsProof`, dieselbe Funktion, die das
   Editor-Badge zeigt – aus `validateLevel` herausgezogen, ein Beweis, zwei
   Aufrufer). Ist er rot, wird der SCHULDIGE Wächter gesucht (bei zwei
   Wächtern versiegelt meist nur einer den Gang – der andere darf bleiben) und
   entfernt. Das endet garantiert: Jeder Durchlauf nimmt einen Wächter, und
   ohne Wächter ist der Beweis derselbe wie das offene Modell, in dem jeder
   Tag erreichbar ist. Ein Tag ohne einen seiner Wächter ist immer noch
   spielbar; ein Tag mit versiegeltem Gang ist es nicht.
2. **Qualität: die Ausweichbucht-Regel.** `patrolCrossable` lässt beim
   AUSWÄHLEN nur Patrouillen zu, an denen man im Beweismodell vorbeikommt:
   Zwei Zugänge müssen näher beieinander liegen als die Patrouille lang ist –
   praktisch braucht der Gang irgendwo eine Ausweichbucht.

Der Sabotage-Lauf hat die Rollen sauber getrennt: Ohne die Nachprüfung wird
die Testsuite ROT, ohne den Filter bleibt sie GRÜN. Der Filter ist also für
die Korrektheit entbehrlich – aber nicht für die Qualität: Mit ihm überleben
**76 %** der vorgesehenen Wächter, ohne ihn nur **60 %** (120 Tage gemessen).
Ein Tag soll so aussehen, wie er entworfen war, nicht nur lösbar sein. Das
steht als Warnung im Code, damit niemand den Filter als redundant wegräumt.

**Ergebnis:** 120 Tage geprüft, **0 rote Beweise** (vorher ~29 %). Im
Vergleich alt/neu über 14 Tage (1.–14. September 2026): **6 Tage waren rot,
jetzt keiner.**

**Was sich für Spieler ändert:** Der Filter verwirft Kandidaten und
verschiebt damit den Zufallsstrom – jeder Tag MIT Wächtern sieht anders aus
als vorher (9 von 14 Tagen im Vergleich), Montag und Dienstag haben keine
Wächter und bleiben identisch. Gespeicherte Tageswerte hängen am Datum, nicht
am Inhalt; ein bereits gespielter Tag behält also seinen Eintrag, auch wenn
das Level jetzt minimal anders aussieht. Anders geht es nicht: Ein unlösbarer
Tag muss sich ändern.

Tests: `tests/daily.test.ts` fordert das `guards`-Badge an jedem der 21
Prüftage grün (rot gesehen ohne Nachprüfung) und nagelt die
Ausweichbucht-Regel an vier Fällen fest – Zwei-Zellen-Gang ohne Zugang
(dicht), derselbe mit zwei Zugängen an EINER Zelle (passierbar),
Drei-Zellen-Gang mit Zugängen nur an den Enden (dicht, Spanne = Länge), und
mit zusätzlichem Zugang in der Mitte (passierbar). Die dritte und vierte
Klausel haben beim ersten Anlauf meine eigene Erwartung widerlegt: Ein Zugang
allein reicht nie, es braucht ZWEI verschiedene.

### Der Weg dorthin: gefunden beim Messen der Jukebox-Verteilung

Beim Messen fiel auf, dass 8 von 28 Tagen den `guards`-Beweis reißen – **ohne
Jukebox, also vorbestehend**. Zwei Fälle nachgesehen: beide Male eine
ZWEI-ZELLEN-Patrouille in einem ein Zelle breiten Gang (beide Zellen Grad 2,
keine Ausweichbucht) auf dem einzigen Weg zum Ziel. Das ist genau die Klasse,
die M18 für die Kampagne behoben hat: An einem Wächter kommt man dort nicht
vorbei (Kollision ab 48 Einheiten, seitlich sind höchstens 23 möglich), der
Gang ist dauerhaft versiegelt – der Tag ist mit hoher Wahrscheinlichkeit
UNLÖSBAR. Der Daily-Generator hat die M18-Invariante nie bekommen.

Behoben in M28 (siehe oben). Der Fund kam nicht aus einem Bug-Report, sondern
aus einer Vergleichsmessung: Beim Prüfen, ob die neuen Automaten Beweise
brechen, lief dieselbe Messung EINMAL OHNE sie – und die 8 roten Tage blieben.
Ohne diese Gegenprobe hätte ich den Fehler der Jukebox zugeschrieben und
„behoben", indem ich am falschen Ende gedreht hätte.

### Was beim Bauen auffiel

**Ein Schnappschuss-Haken lügt, ein Getter sagt die Wahrheit.** Zweimal
dieselbe Klasse: `__tiltrJukebox` hängt am Frame-Haken, und die Spielschleife
steigt im Menü früh aus – der Haken behielt also den letzten Spielstand, und
„schweigt der Automat im Menü?" war damit nicht prüfbar (er meldete vol 0,31,
obwohl der Bus zu war). Genauso stand `__tiltrEd.shareable` immer EINEN
Prüflauf hinterher, weil `validateLevel` entprellt (250 ms) NACH `paint()`
läuft. Beides jetzt als Getter (`__tiltrMusic` wie `__tiltrWake`,
`get shareable()`), die den echten Zustand lesen.

**Ein Ball, der am Kasten LIEGT, erzeugt keinen Anschlag.** Der erste
E2E-Rempler lief 3 Sekunden gegen den Automaten, ohne den Titel zu wechseln:
Die Physik meldet einen Treffer nur bei Annäherungsgeschwindigkeit. Der Lauf
holt jetzt erst Abstand (Nordost-Ecke der Zelle) und stößt dann zu – und er
wartet auf den Titelwechsel statt auf eine Zeit, weil Physik nicht taktfest
ist.

**Eine Zusicherung, die aus dem falschen Grund grün ist.** „Teilen ist
gesperrt, solange das Möbel im Weg steht" war auch ohne den `jukebox`-Check
erfüllt – im blockierten Level ist ohnehin `goal` rot. Der Sabotage-Lauf zeigte
es: Der Check ließ sich abschalten, ohne diese Klausel rot zu machen. Ersetzt
durch die GEGENPROBE, die nur der neue Check tragen kann: derselbe Automat in
einer Nische, Badge grün und teilbar.

**„Mehr Klangquellen als vorher" ist wertlos, wenn Musik läuft.** Der
Plattenkratzer war zuerst über den Quellenzähler geprüft – der wächst aber
laufend, weil jede Note eine Quelle ist. Jetzt zählt `musicState().scratches`
die Kratzer selbst.

**Der Rest waren Kleinigkeiten mit Lehrgeld:** Der Einfüge-Bereich der
Werkstatt ist ein UMSCHALTER (der zweite Klick klappt ihn zu), „Bearbeiten"
bestätigt per Zwei-Tap, solange ein Draft liegt (M15), und eine Nische muss
aus `maze.add` HERAUS und in `carve` HINEIN – `add` läuft nach `carve` und
mauert sonst wieder zu.

### Offen (bewusst)

Kein Kampagnen-Level mit Jukebox – das Element ist über Galerie und Werkstatt
erreichbar, ein eigenes Level wäre eine Design-Aufgabe für sich (und der
Automat wäre in einem Pflichtweg-Level nur Deko, weil er nie ein Riegel sein
darf).

Der Titelindex wird im Multiplayer NICHT synchronisiert: Jeder hört seinen
nächsten Automaten und seinen eigenen Titel. Das ist bewusst – die Jukebox ist
kein Teil des Rätsels (sie darf nie ein Riegel sein), und ein
Netzwerk-Roundtrip für „welches Lied läuft" wäre Aufwand ohne Spielwert. Die weiteren gemeinfreien Kandidaten aus der Recherche liegen bereit:
Offenbach (Can-Can), Prokofjew (Tanz der Ritter), Sousa, Ravel (Boléro als
Loop), Mussorgski, Dvořák, Tschaikowski.

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
