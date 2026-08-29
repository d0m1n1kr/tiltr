# tiltr – das unsichtbare Labyrinth

Ein immersives Sensor-Spiel als PWA: Der Spieler steuert per Neigung des Handys
einen Ball durch eine unsichtbare Welt (Labyrinth). Die Welt offenbart sich
über **Klang** (Roll­geräusch, gepannte Wand-Impacts, Sonar-Ping des Ziels),
**Vibration** (Kollisionen) und **sparsames visuelles Feedback**
(Wand-„Echos" leuchten bei Berührung kurz auf).

## Prototyp (Phase 0) – dieses Repo

Bewusst **ohne Framework und ohne Build-Schritt**: reines HTML + ES-Module +
Web-Standards. Damit ist die Machbarkeit aller kritischen Bausteine isoliert
überprüfbar, bevor eine Architektur-Entscheidung fällt.

| Baustein | API | Datei |
|---|---|---|
| Neigungssteuerung | `DeviceOrientationEvent` (+ iOS-Permission, Kalibrierung, Tastatur-Fallback) | `js/sensors.js` |
| Klangwelt | Web Audio API (prozedural: Noise-Rollen, Impact-Thumps, Ziel-Beacon mit `StereoPannerNode`) | `js/audio.js` |
| Haptik | Vibration API (Android; iOS Safari unterstützt sie nicht → Audio kompensiert) | `js/haptics.js` |
| Physik | eigene 2D-Physik (Kreis vs. Rechteck, Substeps gegen Tunneln) | `js/physics.js` |
| Labyrinth | Recursive Backtracker | `js/maze.js` |
| Spatial Audio | HRTF-`PannerNode`: Ziel-Ping, Loch-Grollen, Wind & Impacts kommen räumlich aus der richtigen Richtung (Kopfhörer!) | `js/audio.js` |
| Gefahr: Löcher | unsichtbar, verraten durch dunkles Grollen + Warnvibration; Sturz = fallender Ton + Respawn am letzten Checkpoint | `js/physics.js`, `js/audio.js` |
| Windzonen | unsichtbare Zellen mit konstanter Windkraft, gegen die man anhalten muss; hörbar als Böen-Rauschen aus Richtung der Zone | `js/physics.js`, `js/audio.js` |
| Checkpoints | 2 Stück auf dem Lösungsweg (BFS), Doppelklang + Vibration, dienen als Respawn-Punkt | `js/main.js`, `js/maze.js` |
| Brüchige Wände | einige Innenwände knirschen bei harten Treffern und stürzen nach 3 Treffern ein (öffnet Abkürzungen) | `js/main.js`, `js/audio.js` |
| Zeit | laufende Rundenzeit im HUD, Bestzeit in `localStorage` | `js/main.js` |
| Visuelles „Echo" | Canvas 2D, dunkler Screen, berührte Wände verblassen | `js/render.js` |
| PWA | Web App Manifest + Service Worker (stale-while-revalidate) | `manifest.webmanifest`, `sw.js` |

### Ausprobieren

**Live: https://d0m1n1kr.github.io/tiltr/** — jeder Push deployt automatisch
per GitHub Actions (`.github/workflows/pages.yml`).

Sensoren, Vibration, Service Worker und iOS-Permissions erfordern **HTTPS**
(oder `localhost`). Alternativen zur Live-Seite:

1. lokal: `python3 -m http.server 8000` und am Desktop mit Pfeiltasten/WASD
   testen (`http://localhost:8000`), oder
2. lokal mit HTTPS fürs Handy im selben WLAN: z. B. `npx vite` + `--host`
   mit [`@vitejs/plugin-basic-ssl`](https://www.npmjs.com/package/@vitejs/plugin-basic-ssl)
   oder ein Tunnel (`npx ngrok http 8000`).

Auf dem Handy: „Spiel starten" tippen (aktiviert Sensor-Permission und Audio),
Kopfhörer aufsetzen, Handy flach halten. Buttons oben rechts: `⌖` neu
kalibrieren, `👁` Debug-Ansicht (Labyrinth einblenden).

### Was der Prototyp verifizieren soll

- [ ] Latenz & Auflösung von `deviceorientation` reichen für präzises Steuern
- [ ] iOS-Permission-Flow (`requestPermission` aus User-Geste) funktioniert
- [ ] Ist das Spiel **rein akustisch** lösbar? (Beacon-Panning + Wand-Echos)
- [ ] Vibrationsmuster sind auf Android fühlbar unterscheidbar
- [ ] PWA-Installation (Add to Homescreen) + Offline-Start
- [ ] Akku/Performance bei 60 fps Canvas + Web Audio

## Geplante Phasen

- **Phase 0 – Machbarkeit** (dieser Prototyp): Sensorik, Audio, Haptik, PWA.
- **Phase 1 – Spielbarkeit**: Level-Formate (JSON), mehrere Weltentypen
  (Gang, Labyrinth, offene Räume mit Löchern), Schwierigkeitsgrade,
  Audio-Mixing verfeinern (HRTF via `PannerNode` für echtes 3D-Gefühl),
  Onboarding/Tutorial, Persistenz (Fortschritt in `localStorage`/IndexedDB).
- **Phase 2 – Politur**: Sound-Design (Samples statt/neben Prozeduralem,
  z. B. mit Howler.js oder Tone.js), visuelle Modi (komplett blind,
  Echo-Modus, Assist-Modus), Accessibility (das Spiel ist von Natur aus
  für blinde Spieler interessant!).
- **Phase 3 – Multiplayer (WebRTC, lokales Netz)**: 2–4 Spieler in derselben
  Welt. Architektur: ein Gerät als Host (autoritative Physik), DataChannels
  (unreliable/unordered für Zustands-Sync, reliable für Events).
  Signaling-Optionen: kleiner WebSocket-Server im LAN, oder serverlos per
  QR-Code-Austausch der SDP-Offers, oder Bibliothek wie
  [Trystero](https://github.com/dmotz/trystero) / PeerJS.
  Spielideen: gemeinsames Labyrinth (Race), asymmetrisch („Seher" sieht die
  Karte und ruft Ansagen, „Läufer" rollt blind), Ball-Übergabe zwischen
  Geräten.

## Technologie-Entscheidungen (Vorschlag für Phase 1+)

- **Build/PWA**: Vite + TypeScript + `vite-plugin-pwa` (Workbox) – der
  handgeschriebene Service Worker wird dann generiert/versioniert.
- **Rendering**: Canvas 2D reicht; nur bei aufwendigen Effekten PixiJS (WebGL).
  Ein Voll-Engine-Framework (Phaser) lohnt erst, wenn viel klassische
  Spielmechanik dazukommt – der Kern dieses Spiels ist Audio, nicht Grafik.
- **Physik**: eigene Physik behalten (deterministisch, winzig); bei Bedarf
  planck.js/Rapier.
- **Audio**: Web Audio nativ als Fundament, `PannerNode` (HRTF) für 3D;
  Tone.js nur falls musikalische Strukturen gewünscht sind.
- **Multiplayer**: siehe Phase 3.
