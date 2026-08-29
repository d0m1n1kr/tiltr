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

### Weltfarben (Canvas, `src/render/palette.ts`)

RGB-Tripel als String (`'110, 168, 255'`), weil das Rendering eigene
Alpha-Werte interpoliert (Echo-Fade). Ball `#4be0c8`, Wand Blau, brüchige
Wand Bernstein, Loch-Füllung `#000` mit Violett-Ring, Ziel Grün, Ping Teal,
Wind Hellblau, Herzschlag Rot (`255, 110, 130`), Wächter Rot (`255, 92, 92`),
Schlüssel/Tür Gold (`255, 214, 90`), Gem Eisblau (`190, 240, 255`),
Transporter/Portal Magenta (`240, 130, 230`).

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
| `.chip` (+ `.active`) | Auswahl-Pill in einer Gruppe (Schwierigkeit, Sprache, MP-Modus); aktiv = Teal-Outline |
| `.mode-item` (+ `.suggest`) | Modus-Karte im Startmenü: Icon, Titel, Untertitel, Meta rechts; `.suggest` (Teal-Rand) hebt GENAU EINE Karte als Einstiegs-Empfehlung hervor |
| `.panel` | Karte/Fläche: subtiler Rand, Radius L |
| `.inter-card` | Interstitial-Karte (Level-Intro, Ergebnis, Kalibrierung) auf abgedunkeltem Grund |
| `.banner` | Toast/Hinweis unten: `--bg-panel`, Akzent-Rand, Schatten |
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
  darf nur die Welt. Einzige Ausnahme: der **Splash** beim Laden (Ball rollt
  ein, zwei Echo-Ringe, Logo/Credits blenden ein) – endlich, überspringbar
  per Tap, respektiert `prefers-reduced-motion`, `?nosplash` (E2E)
  unterdrückt ihn ganz.

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
  am eigenen Rect, nicht an `innerWidth/innerHeight`.
- **iOS-Standalone-Viewport-Bug (gemessen):** In der installierten PWA ist
  der Layout-Viewport um die Statusbar-Höhe (~55pt) zu KURZ und beginnt
  trotzdem am oberen Screenrand: `fixed inset:0` endet ~55pt über der
  Unterkante (sichtbarer Streifen), `env(safe-area-inset-top)` meldet 0
  (Inhalt unter der Dynamic Island), unten sind Statusbar+Home-Indicator
  aufaddiert (~89px – daher der 34px-Deckel). Gegenmittel
  (`src/ui/viewport.ts`): die Lücke wird als `screen.height − innerHeight`
  gemessen; daraus `--app-height` (Vollflächen-Screens und `#game` bekommen
  `height: var(--app-height, …)` und reichen bis zum echten Screenrand),
  `--vp-gap` (Korrektur für bottom-verankerte Elemente wie `#banners`) und
  `--safe-top-fallback` (fließt per `max()` in `--safe-top` ein).
  E2E-Lauf „Standalone-Fix" bildet den Bug mit gefälschtem
  `display-mode: standalone` + `screen.height` nach.
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
  navigate-existing`. Die Adresse (`/tiltr/`) ist praktisch
  unumkehrbar, sobald jemand installiert hat – nicht umziehen.

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
