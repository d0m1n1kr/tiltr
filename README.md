# tiltr – das unsichtbare Labyrinth

Ein immersives Sensor-Spiel als PWA: Der Spieler steuert per Neigung des Handys
einen Ball durch eine unsichtbare Welt (Labyrinth). Die Welt offenbart sich
über **Klang** (Roll­geräusch, gepannte Wand-Impacts, Sonar-Ping des Ziels),
**Vibration** (Kollisionen) und **sparsames visuelles Feedback**
(Wand-„Echos" leuchten bei Berührung kurz auf).

**Live: https://d0m1n1kr.github.io/tiltr/** — jeder Push deployt automatisch
per GitHub Actions (Tests → Build → Pages).

## Entwicklung

TypeScript + Vite + Vitest + Playwright; PWA über `vite-plugin-pwa`.
Der Plan für den Ausbau steht in [`docs/PLAN.md`](docs/PLAN.md), der
ursprüngliche Prototyp (Phase 0, Vanilla JS ohne Build) liegt als Referenz
in [`prototype/`](prototype/).

```bash
npm install
npm run dev        # Dev-Server (Desktop: Pfeiltasten/WASD, Leertaste = Ping)
npm run typecheck  # tsc --noEmit
npm test           # Vitest-Units (Physik, Maze, RNG)
npm run build      # Produktions-Build nach dist/ (inkl. Service Worker)
npm run e2e        # Playwright-Smoke gegen vite preview (fester Seed)
```

Fürs Testen am Handy braucht es HTTPS: am einfachsten die Live-Seite, sonst
`npx vite --host` mit [`@vitejs/plugin-basic-ssl`](https://www.npmjs.com/package/@vitejs/plugin-basic-ssl)
oder ein Tunnel. `?seed=<zahl|text>` in der URL macht Läufe reproduzierbar.

### Spielelemente (Stand M7)

| Element | Signatur |
|---|---|
| Neigungssteuerung | `DeviceOrientationEvent`, Kalibrier-Countdown nach Start-Tap, Achsen-Remap nach Screen-Orientierung, Tastatur-Fallback |
| Spatial Audio | HRTF-`PannerNode`: alle Richtungsklänge räumlich (Kopfhörer!) |
| Wände | Echo: berührte Wände leuchten kurz auf; brüchige Innenwände (bernstein) knirschen und stürzen nach 3 Treffern ein |
| Löcher | atmen (öffnen/schließen zyklisch, versetzt); offen = Sog + dunkles Grollen + Herzschlag, zu = harmlos |
| Windzonen | konstante Windkraft, hörbar als Böen-Rauschen aus Richtung der Zone |
| Checkpoints | auf dem Lösungsweg (BFS); Respawn-Punkt, +1 Echo-Ping |
| Echo-Ping | Tap/Leertaste: Wellenfront deckt Umgebung auf, Reflexionen kommen entfernungs-verzögert & räumlich zurück; Durchgänge antworten hell & doppelt, Gems kristallklar, Türen dumpf; begrenzter Vorrat |
| Wächter | patrouilliert (Ping-Pong über Wegpunkte), pulsierendes Brummen aus seiner Richtung; Berührung = zurück zum Checkpoint |
| Schlüssel & Tür | Schlüssel klimpert in Hörweite, Einsammeln lässt die Tür hörbar aufgleiten |
| Gems | optionale Sammelkristalle mit eigener Ping-Antwort; alle gesammelt = dritter Stern |
| Transporter | trägt den Ball auf andere Ebenen (oder als Portal quer über die Map); schwebender Doppelton in der Nähe, Warp klingt abwärts fallend bzw. aufwärts steigend; Ziel-Beacon klingt auf fremden Ebenen gedämpft wie durch den Boden |
| Ziel-Beacon | Sonar-Ping: näher = schneller, lauter, höher |
| Druckplatte | Multiplayer-Element: gehalten öffnet sie die verknüpfte Tür des Partners, Loslassen schließt sie wieder; Klick beim Betreten, Tür gleitet hörbar auf/zu |
| Partner-Halo | pulsierender Lichtring an der Position des Mitspielers; außerhalb des Screens (oder auf anderer Ebene) an den Rand geklemmt, mit Ebenen-Label |
| Zeit | Rundenzeit im HUD, Bestzeit in `localStorage` |

Auf dem Handy: „Spiel starten" tippen (aktiviert Sensor-Permission und Audio),
Kopfhörer aufsetzen, Handy flach halten. Buttons oben rechts: `⌖` neu
kalibrieren, `👁` Debug-Ansicht (Labyrinth einblenden).

## Roadmap

Siehe [`docs/PLAN.md`](docs/PLAN.md): M1 Fundament ✓ → M2 Element-Registry + Levelformat ✓
→ M3 Tutorial & Schnelles Spiel ✓ → M4 Kampagne Welt 1 (Wächter, Schlüssel/Tür, Gems,
Sterne) ✓ → M5 Ebenen/Transporter + Welt 2 ✓ → M6 Tages-Challenge + Herausfordern ✓
→ M7 Multiplayer Coop & Race ✓.

**Multiplayer (2 Spieler):** P2P über WebRTC ([trystero](https://github.com/dmotz/trystero),
Handshake über eine feste Liste von 8 etablierten Nostr-Relays – kein eigener Server).
Beitritt per QR-Code (In-App-Scanner oder Kamera-App, der Code ist ein `#join=`-Link)
oder 6-stelligem Raumcode. **Coop:** Druckplatten öffnen Türen für den Partner –
jede Tür verschließt eine versiegelte Kammer mit einer Platte außen und einer innen
(wer im Ziel liegt, hält die Zielplatte für den Nachzügler); gewonnen ist erst, wenn
beide im Ziel sind. **Race:** identisches Level, wer zuerst ankommt, gewinnt. Der
Partner-Halo zeigt in beiden Modi, wo der andere steckt. Bei Verbindungsverlust
läuft ein 10-Sekunden-Countdown (Rejoin möglich), dann geht's zurück ins Menü.
Für E2E-Tests gibt es einen `BroadcastChannel`-Transport (Raumcodes mit `TEST`-Präfix).

**Tages-Challenge:** Seed = UTC-Datum → jeden Tag ein neues, für alle identisches
Multi-Ebenen-Level, komplett serverlos. Der erste Zieleinlauf zählt als Tageswert
(Rest ist Training), Serien 🔥 für tägliches Spielen. Teilen erzeugt einen Link
(`#daily=DATUM&t=ZEIT`), der beim Empfänger dieselbe Challenge mit „Schlag X!"-
Vorgabe startet – auch für vergangene Tage reproduzierbar.
