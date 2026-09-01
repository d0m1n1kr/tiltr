#!/usr/bin/env python3
"""Noten aus einer Partitur in die tiltr-Notenschrift übersetzen.

WOZU: Die Titel in src/music/ sollen aus einer QUELLE kommen, nicht aus dem
Gedächtnis. Freie, maschinenlesbare Datenbanken für gemeinfreie Werke:

  * Mutopia Project  https://www.mutopiaproject.org  – LilyPond + MIDI,
    jedes Stück mit ausgewiesenem Rechtestatus ("Public Domain" im Kopf der
    .ly-Datei). Erste Wahl: die Sätze sind von Menschen gesetzt.
  * music21-Korpus   `pip install music21` – ~3200 Stücke OFFLINE
    (komplette Bach-Choräle, Palestrina, Beethoven-Quartette,
    Essener Volksliedsammlung, Ryan's Mammoth Collection).
  * KernScores       https://kern.humdrum.org – Humdrum/**kern, sehr gut
    parsierbar (war beim Bauen zeitweise nicht erreichbar).
  * IMSLP            https://imslp.org – riesig, aber meist Scans (PDF);
    maschinenlesbar nur dort, wo jemand MusicXML/MIDI hochgeladen hat.
  * abcnotation.com  – Volksmusik in ABC, Zehntausende Melodien.

ACHTUNG, zwei Rechte: Die KOMPOSITION muss gemeinfrei sein (Komponist vor
1956 gestorben) UND der SATZ, den man herunterlädt, frei verwendbar. Mutopia
weist beides aus; bei anderen Quellen selbst prüfen. Wir übernehmen ohnehin
nur die Töne und schreiben eine eigene 8-Bit-Fassung – aber die Quelle gehört
in den Kopfkommentar der erzeugten Datei.

BENUTZUNG
  pip install music21
  python3 tools/score2tiltr.py partitur.mid --part 0 --from 4 --to 36 --shift 24

  --part    Stimme (0 = meist die Oberstimme/rechte Hand)
  --from/-to  Fenster in Viertelnoten (offsets, wie music21 sie zählt)
  --shift   Transposition in Halbtönen (+24 = zwei Oktaven hoch – Bässe der
            Klavierfassungen liegen für 8-Bit-Stimmen zu tief)
  --low     statt der höchsten die TIEFSTE Note eines Akkords nehmen (Bass)

Ausgegeben wird die fertige Notenzeile plus eine Kontrollrechnung
(Beats gesamt, Tonumfang) – die Zeile wandert von Hand in src/music/<id>.ts,
damit man den Ausschnitt bewusst wählt und den Kopfkommentar dazuschreibt.
"""

import argparse
from fractions import Fraction

# Notenwerte, die unsere Schrift kennt: Nenner plus punktierte Varianten.
VALUES = []
for den in (1, 2, 4, 8, 16, 32):
    VALUES.append((Fraction(4, den), str(den)))
    VALUES.append((Fraction(4, den) * 3 / 2, f'{den}.'))
VALUES.sort()


def to_value(beats: Fraction) -> tuple[str, Fraction]:
    """Nächstgelegener darstellbarer Notenwert (Text + tatsächliche Länge)."""
    best = min(VALUES, key=lambda v: abs(v[0] - beats))
    return best[1], best[0]


def pitch_name(midi: int) -> str:
    # Kreuz-Schreibweise, weil der Parser sie versteht; c4 = MIDI 60.
    names = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
    return f'{names[midi % 12]}{midi // 12 - 1}'


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('score')
    ap.add_argument('--part', type=int, default=0)
    ap.add_argument('--from', dest='start', type=float, default=0.0)
    ap.add_argument('--to', dest='end', type=float, default=1e9)
    ap.add_argument('--shift', type=int, default=0)
    ap.add_argument('--low', action='store_true', help='tiefste statt höchster Note')
    args = ap.parse_args()

    from music21 import converter  # erst hier: Import kostet Sekunden

    score = converter.parse(args.score)
    part = score.parts[args.part] if score.parts else score
    # Ein Ton je Anschlagszeitpunkt – unsere Stimmen sind einstimmig.
    onsets: dict[Fraction, int] = {}
    for n in part.flatten().notes:
        off = Fraction(n.offset).limit_denominator(48)
        # Ein Anschlag JENSEITS des Fensters wird mitgesammelt: Nur so ist die
        # Länge der LETZTEN Note bekannt (sie reicht bis zum nächsten Ton).
        if not (args.start <= float(off) < args.end + 8):
            continue
        midis = [int(p.midi) for p in n.pitches]
        pick = min(midis) if args.low else max(midis)
        if off in onsets:
            onsets[off] = min(onsets[off], pick) if args.low else max(onsets[off], pick)
        else:
            onsets[off] = pick

    all_keys = sorted(onsets)
    keys = [k for k in all_keys if float(k) < args.end]
    if not keys:
        print('Kein Ton im Fenster.')
        return

    out: list[str] = []
    last_spec: str | None = None
    total = Fraction(0)
    lo, hi = 200, 0
    for i, off in enumerate(keys):
        # Länge = Abstand zum nächsten Anschlag: So bleibt die Linie
        # lückenlos, und unsere Artikulation (12 % Luft) trennt die Töne.
        after = [k for k in all_keys if k > off]
        nxt = after[0] if after else off + Fraction(1)
        spec, real = to_value(nxt - off)
        midi = onsets[off] + args.shift
        lo, hi = min(lo, midi), max(hi, midi)
        token = pitch_name(midi) + ('' if spec == last_spec else f':{spec}')
        last_spec = spec
        out.append(token)
        total += real

    print(' '.join(out))
    print(f'\n# {len(keys)} Noten, {float(total)} Beats '
          f'({float(total) / 4:.2f} Takte à 4/4), Umfang MIDI {lo}–{hi} '
          f'({pitch_name(lo)}–{pitch_name(hi)})')


if __name__ == '__main__':
    main()
