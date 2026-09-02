# tiltr – Design-Guideline (UI & Weltfarben)

Verbindlich ab M3. Die Guideline lebt an zwei Stellen im Code – wer UI baut,
benutzt **Tokens und Komponenten-Klassen, keine Magic Values**:

| Quelle | Inhalt |
|---|---|
| `src/ui/theme.css` | Design-Tokens (CSS Custom Properties) + Komponenten-Klassen (`.btn`, `.panel`, `.banner` …) |
| `src/render/palette.ts` | Weltfarben des Canvas-Renderings (Ball, Wände, Löcher …) |

## Prinzipien

1. **Licht ist Information.** Im Spielfeld leuchtet nichts ohne Bedeutung –
   jede Farbe und jeder Glow codiert ein Spielelement. UI drumherum ist
   bewusst gedämpft (niedrige Opazität, dunkle Flächen), damit das Spielfeld
   die Bühne behält.
2. **Audio first.** UI bestätigt, was der Klang sagt – nie umgekehrt. Kein
   UI-Element konkurriert visuell mit Echo, Ping oder Ziel-Puls.
3. **Ein Theme: dunkel.** tiltr hat keine Light-Variante; die Welt ist
   Dunkelheit. Grundton ist Tiefblau, nie reines Schwarz für UI-Flächen
   (reines Schwarz `#000` ist reserviert für Löcher!).
4. **Daumen-tauglich.** Interaktives ist mind. 44 px hoch (`--touch-min`),
   Banner und Buttons liegen in der unteren Screenhälfte erreichbar.
5. **4er-Raster.** Abstände nur aus der Spacing-Skala (`--space-*`).

## Farben

### Grundflächen (UI)

| Token | Wert | Verwendung |
|---|---|---|
| `--bg-deep` | `#05070f` | Spielfeld-Hintergrund (Canvas) |
| `--bg` | `#0b1020` | Vollflächen-Screens (Panels, Menü-Verlauf) |
| Body-Grundton | `--bg-deep` | html/body und `#game`: Falls die Plattform (installierte PWA, Rotation) einen Streifen neben dem Canvas zeigt, ist er dunkel wie das Spielfeld |
| `--bg-raised` | `#101a33` | Verlaufsmitte des Start-Overlays |
| `--bg-panel` | `#16223f` | Banner/Toasts |
| Panels/Karten | `rgba(255,255,255,0.04)` + `--border-subtle` | `.panel` |

### Text

| Token | Wert | Verwendung |
|---|---|---|
| `--text` | `#cfd8ea` | Standardtext |
| `--text-on-accent` | `#06121c` | Text auf Akzent-Verläufen (Buttons) |
| gedämpft | `opacity: 0.75` / `0.55` / `0.4` | Beschreibung / Hinweis / Metadaten (Version) |

### Akzente (semantisch – identisch mit den Weltfarben)

| Token | Wert | Bedeutung |
|---|---|---|
| `--accent` | `#4be0c8` (Teal) | Ball, Positives, Primäraktionen, Checkpoints, Ping |
| `--accent-2` | `#6ea8ff` (Blau) | Wände, Information, Links |
| `--warning` | `#ffb060` (Bernstein) | Brüchiges, Vorsicht |
| `--danger` | `#965adc` (Violett) | Löcher, Gefahr |
| `--success` | `#4be08c` (Grün) | Ziel, Erfolg |
| `--grad-primary` | Teal→Blau, 90° | Primär-Buttons, Logo |

**Regel:** Eine Farbe = eine Bedeutung. Teal niemals für Gefahr, Violett
niemals dekorativ. Neue Bedeutung ⇒ neue Farbe (Token ergänzen, hier
dokumentieren, in der Element-Galerie zeigen).

### Formularfelder in Panels

`<select>`, `<input>` und `<textarea>` in Werkstatt und Editor tragen EINE
Formularsprache (`.ed-field …`, `#wsBundleSelect`, `.ws-target select`,
`#wsBundleForm …`): `--bg-panel`, `--border-strong`, `--text`, `--radius-m`,
`--touch-min`. Selects bekommen `appearance: none` und einen eigenen
Chevron als Data-URI – der native iOS-Select ist weiß und bricht das
Dark-Design (Screenshot 2.10.0). Sortierknöpfe ▲▼ (`.ws-order`) sind keine
Aktionszeile: kompakt rechts im Kartenkopf, sie dehnen sich nie zur Zeile.

### Weltfarben (Canvas, `src/render/palette.ts`)

RGB-Tripel als String (`'110, 168, 255'`), weil das Rendering eigene
Alpha-Werte interpoliert (Echo-Fade). Ball `#4be0c8`, Wand Blau, brüchige
Wand Bernstein, Schallschutzwand Filz-Khaki (`160, 165, 120` – stumpf, sie
nimmt Klang weg), Loch-Füllung `#000` mit Violett-Ring, Ziel Grün, Ping Teal,
Wind Hellblau, Herzschlag Rot (`255, 110, 130`), Wächter Rot (`255, 92, 92`),
Schlüssel/Tür Gold (`255, 214, 90`), Gem Eisblau (`190, 240, 255`),
Transporter/Portal Magenta (`240, 130, 230`), Partner-SCHEIN Silberblau
(`210, 225, 255` – auch der Geist der eigenen Bestzeit, nur blasser; zwei
weiche Lichtschichten OHNE gezeichneten Rand und stets unter
`BALL_CORE_ALPHA`: ein harter Ring liest sich als Körper, und der einzige
feste Körper im Bild ist der eigene Ball. Im Ziel wechselt der Schein in
die Zielfarbe),
Schiebewand Stein-Perlgrau (`235, 224, 200` – eine Wand, die sich bewegt),
Strömung Chartreuse (`168, 232, 84` – gerichteter, unüberwindbarer Fluss),
Horcher Orangerot (`255, 120, 50` – lauschender Jäger, wärmer als das
Wächter-Rot), Nebel entsättigtes Blaugrau (`160, 165, 185` – Klangdämpfung,
keine Gefahr), Eis kaltes Eisweiß (`185, 225, 240` – rutschiger Boden),
Sog-Anker helles Violett (`170, 110, 240` – Gefahr-Familie der Löcher).
Der Zeitschloss-Schalter gehört zur Tür-Mechanik und bleibt in der
Gold-Familie (`255, 214, 90`); der Echo-Kristall trägt bewusst das
Ping-Teal (`75, 224, 200` – er ist abgefüllter Ping), und der Glasboden
das Brüchig-Bernstein der brüchigen Wände (gleiche Bedeutung, als Boden).
Die Jukebox trägt warmes Magenta-Rosa (`236, 118, 178`) – nahe der
Portal-Familie (auch sie ist „Technik in der Wand"), aber wärmer: ein
Möbelstück, keine Gefahr. Ihr Kasten wird als WAND gezeichnet (er ist eine),
nur in dieser Farbe; darauf sitzen zwei „Lautsprecher"-Punkte, die im Takt
des laufenden Titels atmen (Ausschlag auf dem Schlag, Abklingen dazwischen –
kein Sinus, der wirkt wie Wabern statt Puls).

## Typografie

Systemfont-Stack (`--font`), kein Webfont – die PWA bleibt klein und lädt offline.

| Token | Größe | Verwendung |
|---|---|---|
| `--fs-display` | 42 px, bold, `letter-spacing: 3px`, Gradient-Text | Logo/Titel |
| `--fs-h2` | 20 px, 600 | Screen-Überschriften |
| `--fs-body` | 15 px, `line-height: 1.5` | Fließtext (Overlay) |
| `--fs-ui` | 14 px | Buttons, HUD |
| `--fs-body-s` | 13.5 px, `line-height: 1.4` | Banner |
| `--fs-small` | 12.5 px | Karten-Beschreibungen, kleine Buttons |
| `--fs-caption` | 11 px | Metadaten (Version) |

## Abstände, Radien, Effekte

- **Spacing:** `--space-1..6` = 4 / 8 / 12 / 16 / 24 / 32 px. Karten-Padding
  `--space-3`, Screen-Padding `--space-4`+, Abstände zwischen Karten `--space-3`.
- **Radien:** `--radius-s` 8 (Thumbnails), `--radius-m` 10 (Buttons),
  `--radius-l` 14 (Panels/Banner), `--radius-xl` 16 (Hero-CTA).
- **Ränder:** `--border-subtle` (weiß 8 %), `--border-strong` (weiß 15 %),
  `--border-accent` (Blau 40 %, für Banner mit Aufforderungscharakter).
- **Schatten/Glow:** `--shadow-raised` für Schwebendes (Banner);
  `--glow-accent` NUR für das eine primäre CTA pro Screen.

## Komponenten (`theme.css`)

| Klasse | Verwendung |
|---|---|
| `.btn` | Basis: min. 44 px hoch, Radius M, `:active` skaliert auf 0.97 |
| `.btn-primary` | Die EINE Hauptaktion (Gradient, dunkler Text). Max. eine pro Screen/Banner |
| `.btn-ghost` | Sekundär/neutral (dunkle Fläche, feiner Rand): HUD, Schließen, Dismiss |
| `.btn-soft` | Leise Inline-Aktion in Karten (Teal-Outline), z. B. „Anhören" |
| `.btn-lg` | Hero-Variante des Primary (größer, Glow) |
| `.chip` (+ `.active`) | Auswahl-Pill in einer Gruppe (Schwierigkeit, Sprache, MP-Modus, Steuerung 🥣/🧭 im Menü-Footer); aktiv = Teal-Outline. Der Footer wird ab 900px einzeilig (Regel NACH der Basisregel!), damit der Startscreen aufs Querformat-Tablet ohne Scrollen passt |
| `.mode-item` (+ `.suggest`, `.mode-sub.warn`) | Modus-Karte im Startmenü UND als Werkstatt-Aktion (Neu/Zufall/Import; „Weiter an …" = `.suggest`): Icon, Titel, Untertitel, Meta rechts; `.suggest` (Teal-Rand) hebt GENAU EINE Karte als Empfehlung hervor; `.mode-sub.warn` (Bernstein) trägt die Zwei-Tap-Bestätigung. Startmenü-Layout: Phone = eine Säule (360px), ab 900px (gleicher Breakpoint wie der Editor) verbreiterte Mitte (720px), Modus-Karten zweispaltig, Schnellstart als Querzeile – Querformat-Tablets zeigen den ganzen Screen ohne Scrollen |
| `.hud-chip` | Status-Pille im HUD (Timer, Ebene, Pings, Gems): Tabellenziffern (`tabular-nums`), leere Chips verschwinden (`:empty`); der Timer hat eine Mindestbreite, damit die laufende Zeit nichts verschiebt. Meldungen laufen NICHT im HUD mit, sondern in `#status` (eigene zentrierte Zeile darunter) |
| `.panel` | Karte/Fläche: subtiler Rand, Radius L |
| `.inter-card` | Interstitial-Karte (Level-Intro, Ergebnis, Kalibrierung) auf abgedunkeltem Grund |
| `.banner` | Toast/Hinweis unten: `--bg-panel`, Akzent-Rand, Schatten |
| `.ws-item` (+ `.ws-actions`, `.ws-icons`, `.ws-icon`) | Werkstatt-Bibliothek: Karte mit Name/Meta-Kopf und EINER Aktionszeile – zwei Text-Buttons links, vier Icon-Aktionen (mit `[data-tip]`) rechts. Die Icon-Gruppe bricht als Ganzes um; ob überhaupt, entscheidet eine Container Query über die KARTENBREITE (`container-type: inline-size`), nicht die Fensterbreite |
| `.hud-chip.done` | Zeit steht: Im Multiplayer bleibt die Uhr auf der erreichten Zielzeit stehen (grün, `--success`), während der Ball weiterrollen darf. Früher erzählte das der festhängende Ball – und sah wie ein Fehler aus |
| `.hear-cell` | Hörtest-Kompassrose: 3×3-Raster (`#hearGrid`, max. 320 px) quadratischer Ghost-Buttons – acht Richtungspfeile dort, wo die Richtung klingt (oben = vorn), Mitte (`#hearRepeat`, Akzent-Rand) wiederholt den Ping. Beschriftung als `[data-tip]`, nicht als Text: der Pfeil trägt die Richtung, die Blase den Namen |
| `.ed-tile` | Editor-Palette: Werkzeug/Element mit Galerie-Miniatur; `.active` = Teal-Outline (ein Modus aktiv), `.off` = hier nicht anwendbar (gedämpft, aber anklickbar – der Tap erklärt den Grund; kein `disabled`, das nähme Hover UND Fokus und damit die Tooltip-Blase) |
| `#edPlay` (+ `.active`) | Play/Pause der Editor-Vorschau im Canvas-Kopf: ▶ startet die Bewegung bewegter Elemente, ⏸ friert sie ein; aktiv trägt der Knopf die Akzentfarbe, damit am Kopf sichtbar ist, dass sich die Karte von selbst bewegt |
| `.ed-listen` |  „🔊 Anhören" im Auswahl-Kopf des Eigenschaften-Panels (`.btn-soft` wie in der Galerie): spielt die Klang-Signatur des gewählten Elements aus der Element-Registry |
| `#backupRow` + `.btn.warn` | Footer-Zeile „💾 Sichern / 📂 Wiederherstellen" wie `#controlsRow`; `#backupStatus` (`.menu-meta`, leer = ausgeblendet) trägt Ergebnis und Zusammenfassung. Wiederherstellen ist Zwei-Tap: bewaffnet wird der Knopf Bernstein (`.btn.warn`, `--warning`) mit ⚠-Text – dieselbe Sprache wie `.mode-sub.warn` beim Draft-Verwerfen |
| iOS-Startbildschirm | einfarbig `--bg-deep` (Spielfeld-Ton), erzeugt aus `tools/startup.mjs` – kein Logo-Splash: die Welt offenbart sich über sparsames Licht, ein heller Start wäre gegen das Spiel. `color-scheme: dark` hält auch die Browser-Leinwand vor dem ersten Paint dunkel |
| `.ed-scope` (+ `.first`) | Bereichs-Kopf im Eigenschaften-Panel: Das Panel mischt DREI Geltungsbereiche – Element, Level, Ebene. Jeder Block nennt seinen („Level · alle Ebenen", „Ebene 2 · nur hier"), eine Trennlinie (`--border-subtle`) macht die Grenze sichtbar; `.first` lässt die Linie am obersten Kopf weg. Ohne beides sah „Spalten" wie eine Level-Eigenschaft aus |
| `.ed-badge` | Live-Validierungs-Badge im Editor-Kopf: Teal = Beweis grün, `.fail` (Bernstein) = verletzt |
| `.ed-field` | Editor-Eigenschaften: Label + Input/Select/Textarea aus Tokens. Editor-Layout: Dreispalter ab 900px; darunter dominiert das Spielfeld – kompakte Werkzeugleiste (Icons + Element-Button `#edElementBtn`), Element-Auswahl als Grid-Sheet (`#edElements`, `#editor.sheet-open`), Eigenschaften als Bottom-Drawer (`#edDrawer.open`, Griff `#edDrawerHandle`, öffnet bei Element-Auswahl). Media Query in index.html |
| `[data-tip]` (+ `.tip-below`) | Tooltip-Blase für Icon-Buttons: Desktop beim Hover, Touch beim Fokus nach dem Tap (native `title` kann das nicht). Text via `data-tip` bzw. `data-i18n-tip`; Buttons, die sich beim Klick neu rendern, stellen den Fokus selbst wieder her. `.tip-below` öffnet nach unten (oberer Bildschirmrand) |
| `.hidden` | Einziges Sichtbarkeits-Utility (`display:none !important`) |

**Banner-Verhalten:** Alle Banner leben im `#banners`-Container (unten
zentriert, gestapelt, max. 440 px). Jeder Banner ist dismissbar oder löst
sich nach seiner Aktion auf. Nie mehr als zwei gleichzeitig.

## Ebenen (z-index)

| Token | Wert | Ebene |
|---|---|---|
| – | 0 | Canvas + HUD |
| `--z-overlay` | 10 | Vollflächen-Screens (Start, Ergebnis) |
| `--z-panel` | 20 | Galerie, künftige Menü-Panels |
| `--z-banner` | 30 | Banner/Toasts (liegen über allem) |
| `--z-splash` | 40 | Splash beim Laden (einmalig, entfernt sich selbst) |

## Bewegung

- `--t-tap` 120 ms (Button-Feedback), `--t-panel` 250 ms (Ein-/Ausblenden),
  immer `ease-out`. Spielfeld-Animationen (Echo 1200 ms, Reveal 4000 ms)
  sind Gameplay, nicht UI – sie bleiben im Renderer.
- Keine Dauerschleifen-Animationen in der UI (Puls, Shimmer) – pulsieren
  darf nur die Welt. Zwei endliche Ausnahmen. Erstens das
  **Sieges-Konfetti**: zwei Kanonen aus den unteren Bildecken, Farben aus der
  WELTPALETTE (Feiern ist kein Grund, die Farbsprache zu verlassen), eigene
  Canvas-Ebene ZWISCHEN Spielfeld und Panels (die Ergebnis-Karte zieht über
  das fallende Papier auf und bleibt lesbar), ~3 s lang; `GRAVITY / DRAG` ist
  die Endgeschwindigkeit, damit Papier TAUMELT statt zu stürzen;
  `prefers-reduced-motion` schaltet es ab, denn es ist Dekoration und kein
  Spielsignal. Zweitens der **Splash** beim Laden – endlich,
  überspringbar per Tap, respektiert `prefers-reduced-motion`, `?nosplash`
  (E2E) unterdrückt ihn ganz. Seine Choreografie hat drei Akte:
  1. **Einrollen** – die Kugel kommt von UNTEN in die Bühne (850 ms,
     ease-out) und dreht dabei 1,5 Umdrehungen; ein Glanzpunkt
     (`.splash-ball::after`) macht die Drehung überhaupt sichtbar, denn eine
     einfarbige Kugel dreht sich unsichtbar. Bei der Ankunft pingt der erste
     Echo-Ring.
  2. **Titel** – Logo, Credit und Version blenden gestaffelt ein (ab 850 ms)
     und stehen gut eine halbe Sekunde.
  3. **Abrollen** – die Schrift räumt ZUERST (160 ms), dann rollt die Kugel
     nach OBEN aus dem Bild (420 ms, bewusst `ease-in`: sie bremst nicht, sie
     rollt davon) und GLEICHZEITIG fährt der Startscreen von unten herein
     (640 ms, `cubic-bezier(0.38, 0.62, 0.2, 1)`). Die Reihenfolge ist
     Pflicht: Der Startscreen trägt selbst ein „tiltr" – überlappen beide
     Titel, sieht es wie eine Doppelbelichtung aus. Die Menü-Fahrt ist die
     EINE Stelle, an der die Regel „immer ease-out, 250 ms" nicht reicht: Sie
     zieht erst an (Spitze bei ~150 ms statt im ersten Frame) und bremst dann
     lang aus – die letzten 10 % des Weges brauchen ~320 ms. Die erste Fassung
     (460 ms, Spitze 8900 px/s sofort) schnappte herein statt einzufahren.
  Der Menü-Transform hängt an `body.splashing` / `body.splash-leaving`, nicht
  an `#overlay` selbst: Ohne diese Klassen hat der Startscreen keinen
  Transform, damit `?nosplash` und reduced-motion nichts von der
  Inszenierung sehen und ein abgebrochener Splash das Menü nicht unter dem
  Bildrand vergessen kann. Der Splash-Grund liegt als eigene `::before`-Ebene
  (ein Gradient lässt sich nicht auf `none` animieren, eine Opazität schon).
  Das Ende hängt am `animationend` der Menü-Fahrt statt an einer zweiten,
  parallel gepflegten Zahl (`ev.target === overlay`, weil das Event bubbelt).

## Sprache & Texte (i18n)

Alle nutzersichtbaren Texte leben in `src/i18n/` (de/en/fr/es; Deutsch ist
das Referenz-Wörterbuch und typisiert die Schlüsselmenge). **Kein neuer
UI-String ohne Schlüssel in allen vier Sprachen** – tests/i18n.test.ts
erzwingt identische Schlüsselmengen und übereinstimmende `{platzhalter}`.

- Statisches HTML: `data-i18n` (textContent), `data-i18n-html` (nur für
  Schlüssel mit Markup), `data-i18n-ph` (placeholder), `data-i18n-title`.
- Dynamische Strings: `t(key, vars)`; nach `setLang()` rendern Screens über
  `onLangChange`-Listener neu.
- Level-Namen/-Intros: Übersetzung per `lv.<id>.name/.intro`, die deutschen
  Texte in den Level-Definitionen bleiben Quelle der Wahrheit (Test prüft
  Übereinstimmung). Anzeige immer über `lvName(def)`/`lvIntro(def)`.
- Sprachwahl: gespeicherte Wahl > Browser-Locale > Englisch; Auswahl-Chips
  im Menü-Footer.

## Safe-Area & Viewport (installierte PWA)

Aus einem Vorgängerprojekt übernommene, dort teuer gemessene Regeln. Die
Fehler dieser Kategorie sind **im Browser unsichtbar** (alle Insets 0) –
kaputt ist es erst in der installierten PWA auf dem Gerät. Deshalb sichert
`e2e/smoke.mjs` (Lauf „Safe-Area-Pflichttest") jede Regel mit nachgebildeten
Insets (62/34) UND einer Gegenprobe ohne ab. Jede neue Zusicherung wird
einmal rot gesehen, bevor sie zählt.

- **Keine Höhenangaben für App-Flächen.** Alles Ganzflächige ist
  `position: fixed; inset: 0` – kein `100vh`, kein `100dvh`, kein
  `height: 100%` als Hüllenmaß (jede dieser Angaben geht in der
  installierten iOS-PWA auf eigene Art daneben). Das Canvas braucht
  zusätzlich `width/height: 100%`, weil replaced elements sich mit
  `inset: 0` allein nicht strecken; seine Pixelgröße misst der Renderer
  am eigenen Rect, nicht an `innerWidth/innerHeight`. **Das gilt für JEDE
  Canvas-Ebene:** Ohne explizite `width`/`height` nimmt ein Canvas sein
  Eigenverhältnis 300×150 an – die Konfetti-Ebene feuerte deshalb zuerst in
  einen 200 px hohen Streifen, das Konfetti war „nach 200 ms oben aus dem
  Bild" (M26).
- **iOS-Standalone-Container (per Geräte-Diagnose belegt):** Mit
  `apple-mobile-web-app-status-bar-style: black-translucent` bemisst iOS
  den PWA-Container „Screen minus Statusbar", verankert ihn aber oben AM
  Screenrand – unten fehlen exakt Statusbarhöhe (~55–62pt) als
  **unbemalbarer** schwarzer Balken (Diagnosewerte: `in 812 · lvh 874 ·
  env 62/34` bei 874er-Screen). Kein Web-Code kann außerhalb des
  Containers zeichnen; `--app-height`, `100lvh` und `height=device-height`
  bleiben wirkungslos. **Deshalb `black` statt `black-translucent`** –
  damit stimmen Größe und Position überein (Container von Statusbar bis
  Screen-Unterkante). Beide Meta-Werte werden wie `display` bei der
  Installation eingebrannt (Änderung = neu zum Home-Bildschirm).
  Für Alt-Installationen erkennt `src/ui/viewport.ts` den kaputten
  translucent-Zustand (Lücke `screen.height − innerHeight` UND
  Insel-Überlappung `env oben > 0`) und gleicht aus: `--app-height`
  (Vollflächen + `#game` bis zur Gerätehöhe), `--vp-gap` (bottom-verankerte
  Banner), `--safe-top-fallback` (per `max()` in `--safe-top`). Der
  E2E-Lauf „Standalone" bildet beide Zustände nach. Die Debug-Ansicht
  (5 Taps auf die Version) zeigt eine Diagnosezeile mit den echten Werten.
- **Insets nur über die Tokens** `--safe-top` und `--safe-bottom`
  (theme.css). Der untere ist auf 34 px **gedeckelt** (installierte
  iOS-PWAs melden teils ~89 px – alles darüber wäre ein toter Streifen)
  und wird **lokal** gesetzt (HUD, Banner, Panel-Padding), nie als
  globales Hüllen-Padding.
- **`touch-action: pan-x pan-y` auf html/body, niemals `none`** –
  touch-action wirkt über die ganze Vorfahrenkette; mit `none` ließe
  sich kein Panel mehr per Finger scrollen. Nur das Spielfeld (`#game`)
  setzt selbst `none`. Doppeltipp-/Pinch-Zoom bleiben trotzdem aus
  (plus `maximum-scale=1` im Viewport-Meta).
- **Zentrieren scrollfähiger Overlays über Auto-Margins**
  (`::before/::after { margin: auto }` bzw. `margin: auto` am Kind),
  nie `justify-content: center` + `overflow` – das schneidet bei
  Überlauf den Anfang ab (Querformat!).
- **Manifest:** `id`, `scope`, `start_url` explizit, `launch_handler:
  navigate-existing`, **`display: standalone` – niemals `fullscreen`**:
  iOS unterstützt fullscreen nicht und rendert solche PWAs mit verkürztem
  WebView-Container (schwarzer Balken unten in Statusbarhöhe, `env()`
  liefert oben 0 – exakt das Bild des Viewport-Bugs oben). Der Modus wird
  bei der Installation eingebrannt: eine Änderung wirkt erst nach Entfernen
  und Neu-Hinzufügen zum Home-Bildschirm. Die Adresse (`/tiltr/`) ist
  praktisch unumkehrbar, sobald jemand installiert hat – nicht umziehen.

## Don'ts

- Kein Inline-`style="…"` und keine Hex-Werte in Markup/TS – immer Token.
- Kein reines Schwarz für UI-Flächen (gehört den Löchern).
- Kein zweiter `.btn-primary` im selben Kontext.
- Keine neuen Grautöne/Opazitäten erfinden – Skala nutzen oder erweitern.
- Weltfarben nicht im UI zweckentfremden (Violett ist Gefahr, kein Deko).

## Erweitern

Neuer UI-Baustein → Klasse in `theme.css` aus Tokens komponieren, hier in
die Tabelle eintragen. Neues Spielelement → Farbe in `palette.ts` +
Galerie-Eintrag mit Visual und Klang-Signatur (`src/elements/*`).
