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
| `--bg` | `#0b1020` | App-/Body-Hintergrund, Vollflächen-Screens |
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
Wind Hellblau, Herzschlag Rot (`255, 110, 130`).

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
| `.panel` | Karte/Fläche: subtiler Rand, Radius L |
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

## Bewegung

- `--t-tap` 120 ms (Button-Feedback), `--t-panel` 250 ms (Ein-/Ausblenden),
  immer `ease-out`. Spielfeld-Animationen (Echo 1200 ms, Reveal 4000 ms)
  sind Gameplay, nicht UI – sie bleiben im Renderer.
- Keine Dauerschleifen-Animationen in der UI (Puls, Shimmer) – pulsieren
  darf nur die Welt.

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
