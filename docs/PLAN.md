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
