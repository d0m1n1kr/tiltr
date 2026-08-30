# tiltr — the invisible maze

🇩🇪 [Deutsche Version](README.de.md)

**An immersive sensor game as a PWA.** You steer a ball through an invisible
maze by tilting your phone — the world reveals itself through **spatial
sound** (rolling, wall echoes, the goal's sonar ping), **vibration** and
**sparse light**: walls only flash where you touch them or where your echo
ping reaches. Best played with headphones, eyes half closed.

**▶ Play now: https://d0m1n1kr.github.io/tiltr/** — every push deploys
automatically via GitHub Actions (tests → build → pages).

| Splash | Menu | Echo ping | Multiplayer lobby | Co-op |
|---|---|---|---|---|
| <img src="docs/screenshots/splash.png" width="150" alt="Animated splash screen"> | <img src="docs/screenshots/menu-en.png" width="150" alt="Start screen with game modes"> | <img src="docs/screenshots/gameplay.png" width="150" alt="Echo ping reveals walls and holes"> | <img src="docs/screenshots/mp-lobby-qr.png" width="150" alt="Multiplayer lobby with QR code"> | <img src="docs/screenshots/mp-ingame-halo.png" width="150" alt="Co-op with pressure plate, door and partner halo"> |

## Game modes

- **⚡ Quick Game** — a procedurally generated maze in three difficulties,
  with best times per difficulty. Higher difficulties mix in echo crystals,
  pull anchors and glass floors — anchors and glass provably placed off the
  required path.
- **📅 Daily Challenge** — seed = UTC date: one level for everyone, a new
  one every day, fully serverless and reproducible. Your first finish is
  the daily score, streaks 🔥 reward playing daily. Share links
  (`#daily=DATE&t=TIME`) challenge friends to beat your time — for past
  days too.
- **🌍 Campaign** — four hand-built worlds (28 levels): guards, keys and
  doors, gems, breathing holes, wind, brittle walls, multi-floor maps
  connected by transporters, and multi-screen expanses the camera scrolls
  across. World 3 "The Clockwork" is all about timing: sliding walls,
  time-lock switches and one-way currents. World 4 "The Silence" is the
  stealth world: listeners that hunt you only while you roll, fog that
  muffles every sound, and sheet ice you glide across. Up to three stars
  per level (finish, par time, all gems), plus an optional blind star 🌑
  for finishing without a single echo ping — and your best run rolls along
  as a faint ghost halo on later attempts.
- **👥 Multiplayer** — two players, peer-to-peer over WebRTC
  ([trystero](https://github.com/dmotz/trystero); the handshake runs over a
  fixed list of 8 established Nostr relays, no server of our own). Join via
  QR code (in-app scanner or camera app — the code carries a `#join=` link)
  or a 6-letter room code. **Co-op:** pressure plates open your partner's
  doors; every door seals a chamber with a plate outside and one inside, and
  whoever rests in the goal holds the goal plate for the straggler — you
  only win once both of you are in. **Race:** identical level, first one
  in wins, with rematch. Besides the hand-built levels, a 🎲 random level
  generator creates fresh co-op and race maps on demand — the guest
  regenerates the exact same level from the room's level id. A pulsing halo shows your partner — clamped to
  the screen edge when they're out of view. Lost connections get a
  10-second reconnect window.
- **🛠 Workshop** — build your own levels in a touch-first editor
  (three-pane layout on tablets): place elements from the full registry,
  toggle walls, build multi-floor maps with transporters, tweak properties
  — while the test suite's solvability proofs run live as badges (goal
  reachable, no softlock, timer fits …). Test drafts in the real game loop
  and jump back with one tap; levels live locally in your library. Share
  finished levels via a serverless link (the level itself travels
  deflate-compressed in the URL hash — sharing unlocks only once all
  required proof badges are green, so shared levels are provably
  solvable), or exchange them as JSON files (export + import via file or
  paste).
- **🎓 Tutorial** — eight micro-levels that teach the sound language, one
  element at a time.
- **🧩 Element Gallery** — living documentation: every element with its
  visual and its sound signature, playable at the tap of a button.

**Languages:** English, German, French and Spanish — auto-detected from the
browser locale, switchable anytime from the start screen.

## Playing on your phone

Open the live page, tap a mode (this enables motion sensors and audio),
put on headphones and hold the phone flat like a tray during the
calibration countdown. HUD buttons: `⌖` recalibrate, `👁` debug view
(shows the maze), `🏠` back to the menu. Install it as an app (offline &
fullscreen) via the install hint or your browser menu.

On desktop there's a keyboard fallback: arrow keys/WASD to roll, Space to ping.

## Game elements

| Element | Signature |
|---|---|
| Tilt control | `DeviceOrientationEvent`, calibration countdown after the start tap, axis remap by screen orientation, keyboard fallback |
| Spatial audio | HRTF `PannerNode`: every directional sound is positional (headphones!) |
| Walls | echo: touched walls flash briefly; brittle walls (amber) crunch and collapse after 3 hits |
| Holes | breathe (open/close in offset cycles); open = pull + dark rumble + heartbeat, closed = harmless |
| Wind zones | constant push, audible as gusts from the zone's direction |
| Checkpoints | on the solution path (BFS); respawn point, +1 echo ping |
| Echo ping | tap/Space: a wavefront reveals the surroundings, reflections return delayed by distance and spatially placed; passages answer bright and doubled, gems crystal clear, doors muffled; limited supply |
| Guard | patrols (ping-pong over waypoints), pulsing hum from its direction; touch = back to the checkpoint |
| Key & door | the key jingles within earshot, collecting it audibly slides the door open |
| Gems | optional crystals with their own ping response; collect all for the third star |
| Transporter | carries the ball to other floors (or across the map as a portal); hovering double tone nearby, the warp falls or rises in pitch; the goal beacon sounds muffled through the floor on other levels |
| Sliding wall | slides open and shut to a beat — only fully open is it passable; rhythmic stone grinding plus an accelerating warning tick just before it closes |
| Time-lock switch | stepping on it opens the linked door for a few seconds; a tick-tock counts down and turns frantic as time runs out |
| Current | pushes harder than you can tilt — a one-way street; pulsing directional rush, deeper and more urgent than wind |
| Listener | hunts you while you roll — it hears you even through walls; stand still and it withdraws; sniffing that swells with your own speed |
| Fog zone | muffles ALL sounds (even the goal sonar) through one global lowpass; no physics effect — it just takes your ears |
| Ice patch | low-friction floor: you keep gliding, braking and steering turn mushy; crystalline whirring under the ball |
| Echo crystal | bottled ping: collecting it grants +1 echo ping, even beyond the round budget; bright single bell tone |
| Pull anchor | drags you within its radius — always escapable (its force stays below full tilt), but it costs time; electric hum swells with proximity |
| Glass floor | first roll-over cracks it as a warning, the second shatters it into an open hole; bright crack, then shattering |
| Blind star 🌑 | optional fourth star per campaign level: finish without a single echo ping |
| Ghost replay | your best time per level rolls along as a faint halo (quick game, daily and campaign); stored locally, beaten only by a faster run |
| Pressure plate | multiplayer element: held, it opens the linked partner door — release and it closes; click on entry, the door audibly slides |
| Partner halo | pulsing ring of light at your partner's position; clamped to the screen edge (with floor label) when out of view |
| Goal beacon | sonar ping: closer = faster, louder, higher |

## Development

TypeScript + Vite + Vitest + Playwright; PWA via `vite-plugin-pwa`. The
build plan lives in [`docs/PLAN.md`](docs/PLAN.md), the binding UI guideline
in [`docs/DESIGN.md`](docs/DESIGN.md); the original phase-0 prototype is
kept as reference in [`prototype/`](prototype/).

```bash
npm install
npm run dev        # dev server (desktop: arrows/WASD, Space = ping)
npm run typecheck  # tsc --noEmit
npm test           # Vitest units (physics, mazes, level solvability, i18n)
npm run lint       # ESLint
npm run build      # production build to dist/ (incl. service worker)
npm run e2e        # Playwright smoke against vite preview (fixed seed)
```

Useful URL parameters: `?seed=<number|text>` makes runs reproducible,
`?unlock` opens all campaign levels (playtesting), `?nosplash` skips the
splash (used by e2e), `?mpcode=TEST…` forces a room code onto the local
`BroadcastChannel` transport (multiplayer e2e without network).

Testing philosophy: every level ships with a solvability proof (BFS across
floors, directed transporter edges, door/key/plate fixpoints — the co-op
tests even prove every door is necessary and no one can get locked in), the
four language dictionaries are enforced to be complete, and a mandatory
safe-area e2e run replays installed-PWA insets that are invisible in the
browser. Phone testing needs HTTPS: easiest via the live page, otherwise
`npx vite --host` with a local-TLS plugin or a tunnel.

## Roadmap

M1 foundation ✓ → M2 element registry + level format ✓ → M3 tutorial &
quick game ✓ → M4 campaign world 1 ✓ → M5 floors/transporters + world 2 ✓
→ M6 daily challenge + share links ✓ → M7 multiplayer co-op & race ✓ →
M8 design polish, splash & i18n (EN/DE/FR/ES) ✓ → **1.0** 🎉 →
M9 world 3 "The Clockwork" (sliding walls, time locks, currents) + ghost
replay ✓ → M10 world 4 "The Silence" (listeners, fog, ice) + blind star ✓ →
M11 echo crystal, pull anchor, glass floor + generator integration ✓ →
M12a workshop: level editor with live solvability proofs, library &
in-game preview ✓ → M12b sharing: serverless level links, JSON
import/export, multi-floor editing ✓

---

A game by **Dominik Rössler & Claude**.
