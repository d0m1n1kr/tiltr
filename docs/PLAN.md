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
