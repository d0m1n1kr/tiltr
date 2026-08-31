// Hörtest („Kannst du die Richtung hören?"): Der echte Spiel-Ping kommt aus
// einer zufälligen Richtung, man zeigt sie auf einer Kompass-Rose an.
//
// Warum getrennte Achsen in der Auswertung: Das Spatial Audio ist HRTF –
// links/rechts trägt starke Ohr-Differenzen (Zeit und Lautstärke) und wird
// zuverlässig erkannt, vorn/hinten hängt an feinen Klangfarben-Unterschieden
// einer FREMDEN Ohrform und ist deshalb schwach (Front-Back-Konfusion).
// Der Test macht das messbar statt es zu verschweigen – und erklärt damit,
// warum man im Spiel den Kopf ruhig hält und der Vor/Zurück-Achse weniger
// traut als der Seiten-Achse.

import type { GameAudio } from '../audio/audio';
import { mulberry32 } from '../core/rng';
import { t, applyI18n, type Dict } from '../i18n';

/** Kompass-Richtungen im Uhrzeigersinn ab Norden. */
export const HEAR_DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type HearDir = (typeof HEAR_DIRS)[number];

/** Richtung als Weltvektor: +x = rechts, +y = UNTEN (= hinter dem Hörer). */
export function dirVector(dir: HearDir): { dx: number; dy: number } {
  const q = Math.SQRT1_2;
  switch (dir) {
    case 'n': return { dx: 0, dy: -1 };
    case 'ne': return { dx: q, dy: -q };
    case 'e': return { dx: 1, dy: 0 };
    case 'se': return { dx: q, dy: q };
    case 's': return { dx: 0, dy: 1 };
    case 'sw': return { dx: -q, dy: q };
    case 'w': return { dx: -1, dy: 0 };
    case 'nw': return { dx: -q, dy: -q };
  }
}

export interface HearRound {
  asked: HearDir;
  answered: HearDir;
}

export interface HearScore {
  total: number;
  /** exakt dieselbe Richtung */
  exact: number;
  /** Nachbar-Treffer (45° daneben) zählen als „nah dran" */
  close: number;
  /** Seiten-Achse richtig (links/rechts bzw. beides mittig) */
  lateral: number;
  /** Tiefen-Achse richtig (vorn/hinten) */
  depth: number;
}

const sign = (v: number): number => (Math.abs(v) < 0.01 ? 0 : Math.sign(v));

/** Auswertung – reine Funktion, damit die Testsuite sie festnageln kann. */
export function scoreRounds(rounds: HearRound[]): HearScore {
  const score: HearScore = { total: rounds.length, exact: 0, close: 0, lateral: 0, depth: 0 };
  for (const r of rounds) {
    const a = dirVector(r.asked);
    const b = dirVector(r.answered);
    if (r.asked === r.answered) score.exact++;
    const steps = Math.abs(HEAR_DIRS.indexOf(r.asked) - HEAR_DIRS.indexOf(r.answered));
    const dist = Math.min(steps, HEAR_DIRS.length - steps);
    if (dist <= 1) score.close++;
    if (sign(a.dx) === sign(b.dx)) score.lateral++;
    if (sign(a.dy) === sign(b.dy)) score.depth++;
  }
  return score;
}

const ROUNDS = 8;
/** Kompass-Layout im 3×3-Raster; Mitte = Ping wiederholen. */
const GRID: Array<HearDir | null> = ['nw', 'n', 'ne', 'w', null, 'e', 'sw', 's', 'se'];
const ARROW: Record<HearDir, string> = {
  n: '↑', ne: '↗', e: '→', se: '↘', s: '↓', sw: '↙', w: '←', nw: '↖',
};

export interface HearingApi {
  open(): void;
}

export function setupHearingTest(opts: { audio: GameAudio; onClose: () => void }): HearingApi {
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const panel = $('hearing');
  const statusEl = $('hearStatus');
  const gridEl = $('hearGrid');
  const resultEl = $('hearResult');

  let rng = mulberry32(1);
  let rounds: HearRound[] = [];
  let asked: HearDir = 'n';
  /** Feedback-Phase: Die Antwort steht, die nächste Runde läuft noch nicht. */
  let locked = false;
  /** Durchgang ausgewertet (Ergebnis steht) – nicht identisch mit „8 Runden
   *  beantwortet": zwischen der letzten Antwort und der Auswertung liegt das
   *  Feedback. */
  let over = false;

  const playPing = (): void => {
    const { dx, dy } = dirVector(asked);
    // Der ECHTE Spiel-Ping – mit zwei Eingriffen, die der erste Testlauf
    // erzwungen hat („kommt immer aus derselben Richtung"):
    //  1. Der Emissions-Chirp läuft LEISE. Er ist ungepannt (er kommt vom
    //     Ball), war aber das lauteste Ereignis – man hörte also zuverlässig
    //     die Mitte statt die Reflexion.
    //  2. ZWEI Anschläge statt einem: Einem einzelnen kurzen Reiz traut das
    //     Ortungsgehör nicht, beim zweiten entscheidet es sich.
    // Die Frequenz ist die der Wand-Reflexion im Spiel (1300 Hz) – geprüft
    // wird, was man im Spiel hört.
    opts.audio.echoPing(
      [0.05, 0.45].map((delay) => ({ dx: dx * 300, dy: dy * 300, delay, gain: 0.6, freq: 1300 })),
      { chirpGain: 0.05 },
    );
  };

  const hook = (): void => {
    (window as unknown as { __tiltrHearing?: unknown }).__tiltrHearing = {
      round: rounds.length,
      total: ROUNDS,
      asked,
      done: rounds.length >= ROUNDS,
      locked,
      over,
      score: scoreRounds(rounds),
    };
  };

  function nextRound(): void {
    locked = false;
    over = false;
    resultEl.classList.add('hidden');
    asked = HEAR_DIRS[Math.floor(rng() * HEAR_DIRS.length)]!;
    statusEl.textContent = t('hear.round', { n: rounds.length + 1, total: ROUNDS });
    hook();
    setTimeout(playPing, 350);
  }

  function answer(dir: HearDir): void {
    if (locked) return;
    locked = true;
    rounds.push({ asked, answered: dir });
    const right = dir === asked;
    statusEl.textContent = right
      ? `✓ ${t('hear.right')}`
      : `✗ ${t('hear.wrong', { dir: ARROW[asked] })}`;
    hook();
    setTimeout(() => (rounds.length >= ROUNDS ? finish() : nextRound()), 1100);
  }

  function finish(): void {
    over = true;
    const s = scoreRounds(rounds);
    statusEl.textContent = t('hear.doneTitle', { hits: s.exact, total: s.total });
    resultEl.replaceChildren();
    const lines = [
      t('hear.exact', { n: s.exact, total: s.total }),
      t('hear.close', { n: s.close, total: s.total }),
      t('hear.lateral', { n: s.lateral, total: s.total }),
      t('hear.depth', { n: s.depth, total: s.total }),
      s.depth < s.lateral ? t('hear.hintDepth') : t('hear.hintGood'),
    ];
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      resultEl.append(p);
    }
    resultEl.classList.remove('hidden');
    hook();
  }

  function renderGrid(): void {
    gridEl.replaceChildren();
    for (const dir of GRID) {
      const b = document.createElement('button');
      if (dir === null) {
        b.id = 'hearRepeat';
        b.className = 'btn btn-ghost hear-cell';
        b.textContent = '🔊';
        b.dataset.tip = t('hear.repeat');
        b.addEventListener('click', playPing);
      } else {
        b.className = 'btn btn-ghost hear-cell';
        b.dataset.dir = dir;
        b.textContent = ARROW[dir];
        b.dataset.tip = t(`hear.dir.${dir}` as keyof Dict);
        b.addEventListener('click', () => answer(dir));
      }
      gridEl.append(b);
    }
  }

  $('hearClose').addEventListener('click', () => {
    panel.classList.add('hidden');
    opts.onClose();
  });
  $('hearRestart').addEventListener('click', () => {
    rounds = [];
    rng = mulberry32(Math.floor(Math.random() * 0x7fffffff));
    nextRound();
  });

  return {
    open(): void {
      rounds = [];
      rng = mulberry32(Math.floor(Math.random() * 0x7fffffff));
      panel.classList.remove('hidden');
      applyI18n(panel);
      renderGrid();
      void opts.audio.start().then(nextRound);
    },
  };
}
