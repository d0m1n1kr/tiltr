# tiltr – das unsichtbare Labyrinth

🇬🇧 [English version](README.md)

**Ein immersives Sensor-Spiel als PWA.** Du steuerst einen Ball per Neigung
des Handys durch ein unsichtbares Labyrinth. Die Welt offenbart sich über
**räumlichen Klang** (Rollen, Wand-Echos, Sonar-Ping des Ziels),
**Vibration** und **sparsames Licht**: Wände leuchten nur dort auf, wo du
sie berührst oder dein Echo-Ping sie erreicht. Am besten mit Kopfhörern und
halb geschlossenen Augen.

**▶ Jetzt spielen: https://d0m1n1kr.github.io/tiltr/** – als App
installierbar, läuft offline. Jeder Push deployt automatisch (Tests → Build →
GitHub Pages). Der Startscreen hat einen Knopf **📣 App weitersagen**: Er teilt die
Animation unten samt kurzem Werbetext in der eingestellten Sprache und diesem
Link – in EINER Nachricht, wo die Plattform es erlaubt, sonst nur den Link
(dessen Vorschau die Animation ohnehin zeigt).

<p align="center"><img src="public/promo.gif" width="220" alt="Screencast: Splash, Echo-Ping im Dunkeln, Konfetti, ein echtes Werkstatt-Level im Editor und im Zwei-Spieler-Testmodus"></p>

| Splash | Menü | Echo-Ping | Kampagne |
|---|---|---|---|
| <img src="docs/screenshots/splash.png" width="150" alt="Animierter Splash-Screen"> | <img src="docs/screenshots/menu-de.png" width="150" alt="Startscreen mit Spielmodi"> | <img src="docs/screenshots/gameplay.png" width="150" alt="Echo-Ping deckt Wände, eine brüchige Wand und eine Tür auf"> | <img src="docs/screenshots/campaign.png" width="150" alt="Kampagne mit fünf Welten und Sternen"> |

| Level geschafft | Tutorial | Hörtest | Element-Galerie |
|---|---|---|---|
| <img src="docs/screenshots/result-confetti.png" width="150" alt="Ergebniskarte mit Konfetti"> | <img src="docs/screenshots/tutorial-intro.png" width="150" alt="Tutorial-Intro"> | <img src="docs/screenshots/hearing.png" width="150" alt="Hörtest mit Kompassrose"> | <img src="docs/screenshots/gallery.png" width="150" alt="Element-Galerie"> |

| Multiplayer-Lobby | Coop im Dunkeln | Coop im Hellen | Zwei-Spieler-Intro |
|---|---|---|---|
| <img src="docs/screenshots/mp-lobby-qr.png" width="150" alt="Lobby mit QR-Code, Raumcode und Einladungs-Knopf"> | <img src="docs/screenshots/mp-ingame-halo.png" width="150" alt="Coop: der Partner ist ein blasser Schein"> | <img src="docs/screenshots/mp-bright-partner.png" width="150" alt="Coop auf heller Ebene: der Partner ist ein roter Ball"> | <img src="docs/screenshots/mp-intro.png" width="150" alt="Intro eines Zwei-Spieler-Levels mit Rolle"> |

| Werkstatt | Editor (Phone) | Editor (Tablet) | Testmodus zu zweit |
|---|---|---|---|
| <img src="docs/screenshots/workshop.png" width="150" alt="Werkstatt mit einem Level-Bundle"> | <img src="docs/screenshots/editor-phone.png" width="150" alt="Level-Editor auf dem Phone"> | <img src="docs/screenshots/editor-tablet.png" width="150" alt="Level-Editor auf dem Tablet mit Beweis-Badges"> | <img src="docs/screenshots/editor-mptest.png" width="150" alt="MP-Testmodus: der ruhende Partner als roter Ball, Kachel 👥1"> |

## Spielmodi

- **⚡ Schnelles Spiel** – prozedural generiertes Labyrinth in drei
  Schwierigkeiten mit Bestzeiten je Stufe. Höhere Stufen bringen Ebenen,
  helle Ebenen, Tür-Rätsel (Schlüssel plus Zeitschloss), Echo-Kristalle,
  Sog-Anker und Glas – alles beweisbar abseits des Pflichtwegs.
- **📅 Tages-Challenge** – Seed = UTC-Datum: ein Level für alle, jeden Tag
  ein neues, serverlos und reproduzierbar. Der erste Zieleinlauf zählt als
  Tageswert, Serien 🔥 belohnen tägliches Spielen. `#daily=DATUM&t=ZEIT`-Links
  fordern Freunde heraus, auch für vergangene Tage.
- **🌍 Kampagne** – fünf handgebaute Welten, 36 Level. Welt 1 lehrt
  Wächter, Schlüssel und Türen, Gems, atmende Löcher, Wind und brüchige
  Wände; Welt 2 geht in die Tiefe mit Transportern und Weiten, über die die
  Kamera scrollt; Welt 3 „Das Räderwerk" ist Timing (Schiebewände,
  Zeitschlösser, Einbahn-Strömungen); Welt 4 „Die Stille" ist Schleichen
  (Horcher, Nebel, Eis); Welt 5 „Trugbild" dreht die Sinne um (helle Ebenen,
  Echo-Spiegel, Schallschutzwände, Lockglocken, ein Hallraum, eine
  Stimmgabel als Schlüssel, Rollsteine, ein Schläfer). Bis zu drei Sterne pro
  Level (geschafft, Par-Zeit – mit Sanduhren verlängerbar – und alle Gems)
  plus ein Blind-Stern 🌑 fürs Durchkommen ohne einen einzigen Ping. Die
  eigene Bestzeit rollt als blasser Geist mit. Das Tutorial beginnt im Licht:
  Der erste Raum ist hell, der zweite derselbe Raum im Dunkeln.
- **👥 Multiplayer** – zwei Spieler, Peer-to-Peer über WebRTC
  ([trystero](https://github.com/dmotz/trystero) über eine feste Liste von
  Nostr-Relays, kein eigener Server). Beitritt per QR-Code, 6-stelligem
  Raumcode oder der **📨 Einladung** des Hosts (Nachricht plus Link über das
  Share-Sheet). **Coop:** Druckplatten, Schlüssel und Schalter wirken für
  beide – du öffnest auch die Türen des Partners; gewonnen ist, wenn beide
  drin sind. **Race:** identisches Level, wer zuerst ankommt, gewinnt, mit
  Rematch. Je sechs handgebaute Level plus ein 🎲-Generator, und jedes
  **Zwei-Spieler-Level aus der Werkstatt** lässt sich direkt aus der
  Bibliothek hosten – der Gast bekommt es mit dem Raum. Der Partner ist im
  Dunkeln ein blasser Schein und auf hellen Ebenen ein fester roter Ball.
  Der Zieleinlauf stoppt die Uhr, nicht die Kugel – im Coop hält man so dem
  Nachzügler noch die Platten. Bei Verbindungsverlust gibt es ein
  10-Sekunden-Fenster; die Lobby hält den Bildschirm wach, sagt es, wenn kein
  Vermittler erreichbar ist, und baut die Verbindung auf Wunsch neu auf
  (**🔄 Neu verbinden**) – der Raumcode bleibt. Verbietet ein Netz direkte
  Verbindungen ganz – Mobilfunk hinter Carrier-NAT, Gastnetz mit
  Client-Isolation –, gelingt der Handshake und die Strecke nie; die Lobby
  sagt das statt weiterzuwarten und bietet ein Feld für einen
  **Weiterleiter (TURN)** an (`turn:wirt:3478|nutzer|passwort` oder das JSON
  des Anbieters). Der Eintrag bleibt auf dem Gerät, und ein Selbsttest sagt,
  ob dieser Weiterleiter wirklich antwortet.
- **🛠 Werkstatt** – ein Touch-Editor für eigene Level (auf Tablets als
  Dreispalter). Elemente aus der ganzen Registry setzen, Wände und
  Wand-Varianten schalten, mehrstöckige Karten mit Transportern bauen –
  während die Lösbarkeits-Beweise live als Badges mitlaufen: Ziel
  erreichbar, Öffner vor der Tür, Timer reicht, kein Softlock, Wächter
  passierbar, Stein lösbar. Ein Level auf **zwei Spieler** stellen bringt
  eigenen Start und eigenes Ziel für den Gast, Druckplatten und
  Coop-/Race-Beweise – und einen **Testmodus für einen**: Die Vorschau lädt
  beide Kugeln, 👥 wechselt den Spieler, der andere bleibt liegen, wo man ihn
  lässt (und hält dort weiter die Platte). Level liegen in **Bundles**, die wie eine Kampagne mit
  gespeichertem Stand spielbar und als eine Datei exportierbar sind. Entwürfe
  laufen in der echten Spielschleife; fertige Level teilt man als
  serverlosen Link (das Level reist komprimiert in der URL) oder als JSON.
  Ein Level mit roten Badges lässt sich nach Rückfrage ebenfalls teilen – als
  Diagnose-Link, der den Empfänger warnt; die Export-Datei trägt dann die
  Befunde mit, damit jemand anders nachsehen kann, was der Beweis bemängelt. **💾 Sichern** schreibt
  Fortschritt, Bestzeiten, Werkstatt und Geister in eine Datei, die **📂**
  wiederherstellt.
- **🏁 Geist-Duell** – aus einem gewonnenen Lauf wird ein Link mit Level,
  Spur und Zeit. Wer ihn öffnet, fährt gegen die echte Spur und *hört* den
  Rivalen neben sich rollen. Schneller? Revanche schicken.
- **🎧 Hörtest** – der Ping kommt aus einer von acht Richtungen, du tippst,
  woher. Die Auswertung trennt links/rechts (stark) von vorn/hinten (mit
  generischer HRTF schwach). Der Kopfhörer-Check vor dem ersten Lauf.
- **🎓 Tutorial** – acht Mikro-Level, die die Klangsprache lehren, ein
  Element nach dem anderen. Was zum ersten Mal vorkommt, leuchtet ein paar
  Sekunden auf und spielt seine Signatur.
- **🧩 Element-Galerie** – jedes Element mit Bild und Klang, per Tap
  anspielbar.

Jedes geschaffte Level wird gefeiert: Konfetti in der Weltpalette und ein
Knall aus Papier (`prefers-reduced-motion` lässt das Konfetti weg).
**Sprachen:** Deutsch, Englisch, Französisch und Spanisch – automatisch
erkannt, auf dem Startscreen umschaltbar.

## Spielen am Handy

Live-Seite öffnen, einen Modus antippen (schaltet Sensoren und Audio frei),
Kopfhörer auf und das Handy während des Kalibrier-Countdowns so halten, wie
er es ansagt. HUD-Knöpfe: `⌖` neu kalibrieren, `🏠` Menü; `👁` (Debug-Ansicht)
erscheint nach fünf Taps auf die Versionsnummer. Als App installieren über
den Hinweis oder das Browser-Menü.

Zwei Steuerungen, auf dem Startscreen umschaltbar: **🥣 Draufsicht** (Handy
flach wie ein Tablett) und **🧭 First Person** (Handy ~45° wie ein Lenkrad:
nach vorn kippen rollt, seitlich neigen dreht – Welt und räumlicher Klang
drehen sich um die Kugel). Geister, Duelle und Multiplayer bleiben kompatibel;
jeder wählt seine Steuerung. Während eines Laufs bleibt der Bildschirm wach,
wo der Browser Screen Wake Lock kann (Chromium; iOS nicht). Am Desktop:
Pfeiltasten/WASD rollen, Leertaste pingt.

## Spielelemente

| Element | Signatur |
|---|---|
| Neigungssteuerung | `DeviceOrientationEvent`, Kalibrierung nach dem Start-Tap, Achsen-Umsetzung nach Bildschirm-Ausrichtung (auf iPhone und iPad gemessen), Tastatur-Fallback |
| Räumlicher Klang | HRTF-`PannerNode`: jeder gerichtete Klang ist positioniert; jedes Echo hat einen breitbandigen Anschlag, damit das Ohr es orten kann |
| Wände | berührte Wände leuchten auf; brüchige (Bernstein) stürzen nach 3 Treffern ein; Schallschutzwände (Khaki) verschlucken den Ping und dämpfen alles dahinter; Echo-Spiegel antworten aus doppelter Entfernung |
| Löcher | atmen in versetzten Zyklen; offen = Sog, Grollen, Herzschlag; Wanderlöcher patrouillieren wie Wächter |
| Windzone / Strömung | Wind schiebt, hörbar als Böen; eine Strömung schiebt stärker, als du neigen kannst – eine Einbahnstraße |
| Checkpoint | Respawn-Punkt plus ein Echo-Ping; Transporter-Landeplätze sind ebenfalls Respawn |
| Echo-Ping | eine Wellenfront deckt die Umgebung auf; Reflexionen kommen verzögert und räumlich platziert zurück; begrenzt je Level, Echo-Kristalle füllen auf |
| Wächter / Schläfer | patrouilliert eine Bahn aus beliebig vielen Wegpunkten mit pulsierendem Summen und hält dort an, wo du eine Pause setzt; Berührung wirft zurück. Ein Schläfer schnarcht auf seinem Posten, bis dein Ping ihn weckt |
| Schlüssel & Tür | der Schlüssel klimpert in Hörweite; eine Stimmgabel summt ungepannt, man findet sie über die Tonhöhe. Türen brauchen einen oder alle Öffner, können auf einen Spieler beschränkt sein – für den anderen sind sie einfach eine Wand – und schließen nach der Platte wieder oder bleiben offen |
| Druckplatte | gehalten öffnet sie die verknüpfte Tür – durch dich, den Partner oder einen Rollstein |
| Zeitschloss-Schalter | öffnet seine Tür für einige Sekunden, das Ticken wird hektisch |
| Schiebewand | gleitet im Takt auf und zu, Warnticken vor dem Schließen |
| Gems & Sanduhr | Gems für den dritten Stern; Sanduhren verlängern die Par-Zeit |
| Transporter | trägt die Kugel auf andere Ebenen oder quer über die Karte; schwebender Doppelton, der Warp steigt oder fällt in der Tonhöhe |
| Horcher | jagt dich, solange du rollst, auch durch Wände; still stehen, und er zieht sich zurück. Lockglocken locken ihn weg, Schallschutzwände geben Deckung |
| Nebel / Hallraum | Nebel dämpft alles über einen Tiefpass; der Hallraum hängt jedem Klang eine lange Fahne an |
| Eis | du gleitest weiter, Bremsen wird schwammig; kristallines Sirren |
| Sog-Anker / Glas | der Anker zieht, hält aber nie fest; Glas knackt beim ersten Mal und bricht beim zweiten |
| Rollstein | ein zweiter Körper, zellweise geschoben: füllt Löcher, hält Platten, rollt auf Eis weiter |
| Jukebox | ein massiver Automat mit 8-Bit-Themen (gemeinfreie Klassiker aus Notenquellen plus eigene); Musik verdeckt die Echos, Anrempeln schaltet weiter |
| Helle Ebene / Dämmerung | eine Ebene, die man sieht; die Dämmerung bleibt hell bis zur ersten Wandberührung und blendet dann aus |
| Partner | atmender Schein im Dunkeln, roter Ball auf hellen Ebenen, am Bildrand geklemmt, wenn außer Sicht |
| Ziel-Beacon | Sonar-Ping: näher = schneller, lauter, höher |

## Entwicklung

TypeScript + Vite + Vitest + Playwright; PWA über `vite-plugin-pwa`. Das
Bautagebuch liegt in [`docs/PLAN.md`](docs/PLAN.md), die verbindliche
UI-Richtlinie in [`docs/DESIGN.md`](docs/DESIGN.md), Hinweise für Agenten in
[`CLAUDE.md`](CLAUDE.md); der Phase-0-Prototyp steht in
[`prototype/`](prototype/).

```bash
npm install
npm run dev          # Dev-Server (Desktop: Pfeile/WASD, Leertaste = Ping)
npm run typecheck    # tsc --noEmit
npm test             # Vitest-Units (Physik, Mazes, Level-Beweise, i18n)
npm run lint         # ESLint
npm run build        # Produktions-Build nach dist/ (inkl. Service Worker)
npm run e2e          # Playwright-Smoke, 4 Arbeiter gegen vite preview
npm run screenshots  # docs/screenshots/ aus dem gebauten Stand erzeugen
```

URL-Parameter: `?seed=…` macht Läufe reproduzierbar, `?unlock` öffnet alle
Kampagnen-Level, `?nosplash` überspringt den Splash, `?debug` schaltet
Debug-Ansicht und Sensor-Diagnose frei, `?netdebug` zeigt die
Vermittler-Diagnose der Multiplayer-Lobby, `?mpcode=TEST…` erzwingt einen
Raumcode auf dem lokalen `BroadcastChannel`-Transport (Multiplayer ohne Netz).

Test-Philosophie: Jedes Level kommt mit Lösbarkeits-Beweis (BFS über Ebenen,
gerichtete Transporter-Kanten, Tür-/Schlüssel-/Platten-Fixpunkte,
Wächter-Patrouillen, Rollstein-Zustände; Zwei-Spieler-Level beweisen, dass
beide ihr Ziel erreichen), dieselben Beweise speisen die Editor-Badges, die
vier Wörterbücher werden auf Vollständigkeit erzwungen, und ein
Safe-Area-Pflichtlauf spielt die Insets der installierten PWA nach, die im
Browser unsichtbar sind. Fürs Testen am Handy braucht es HTTPS: am einfachsten
die Live-Seite.

---

Ein Spiel von **Dominik Rössler, Jonas Meides & Claude**.

## Lizenz

Der **Quellcode** steht unter der
[PolyForm Noncommercial License 1.0.0](LICENSE): Nicht-kommerzielle Nutzung,
Änderung und Weitergabe sind erlaubt; **kommerzielle Nutzung braucht eine
gesonderte Vereinbarung** mit dem Rechteinhaber. **Level-Inhalte,
Notenschrift und Dokumentation** stehen unter
[CC BY-NC-SA 4.0](LICENSE-CONTENT). Kommerzielle Anfragen: ein Issue auf
GitHub.
