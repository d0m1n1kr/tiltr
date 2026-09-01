# `src/music/` – die Titel des Automaten

Ein Titel ist eine **Notenfolge**, keine Audiodatei (siehe
`src/audio/chiptune.ts` für die Notenschrift). Grund: Die PWA cacht alles vor
– ein Dutzend Aufnahmen wären Megabytes im Offline-Install, ein Dutzend
Notenfolgen sind ein paar Kilobyte. Und es *ist* 8-Bit-Musik, nicht die
Aufnahme davon.

## Was hier hereindarf

Nur zwei Sorten:

1. **Gemeinfreie Kompositionen** – Regel: Komponist vor 1956 gestorben
   (70 Jahre nach dem Todesjahr, gerechnet ab Jahresende; Stand 2026). Dass
   eine moderne Notenedition eigenen Schutz haben kann, ist hier irrelevant:
   Die Notenfolgen sind selbst geschrieben.
2. **Eigene Kompositionen.** Ein Stück *im Stil* eines Genres ist erlaubt,
   solange keine geschützte Melodie erkennbar übernommen wird.

## Was hier NICHT hereindarf

Geschützte Werke – auch nicht als 8-Bit-Fassung. An einem Musikstück hängen
zwei getrennte Rechte: das der **Aufnahme** (Tonträgerhersteller, Interpret)
und das der **Komposition**. Eine Chiptune-Fassung löst nur das erste. Die
Bearbeitung selbst ist zusätzlich zustimmungspflichtig (§ 23 UrhG), und eine
GEMA-Lizenz deckt die Verbindung von Musik mit Bild (Spiel) in der Regel
nicht ab – dieses Recht liegt beim Verlag.

Wer trotzdem ein eigenes Thema in seiner Jukebox will, bettet es in **sein
Level** ein (`playlist`-Eintrag als Objekt statt als ID, siehe
`jukeboxDef` in `src/levels/schema.ts`). Es reist dann im `#level=`-Token,
landet nie in diesem Repo und nie im Precache – die Rechtsfrage liegt bei
dem, der es tut.

## Die Töne kommen aus einer QUELLE, nicht aus dem Gedächtnis

Das ist die wichtigste Regel dieses Ordners, und sie ist teuer gelernt: Die
erste Fassung war aus dem Kopf geschrieben, und drei von acht Klassikern
hatten falsche Töne (der Bergkönig ab Takt 2, die Nachtmusik in Rhythmus und
Antwortphrase, die Ode in der vereinfachten Schulbuch-Form statt Beethovens
Linie). Ein Werk unter dem Namen seines Komponisten auszuliefern und dabei
die Melodie zu erfinden, ist keine Bearbeitung – es ist ein Fehler.

Freie, maschinenlesbare Datenbanken für gemeinfreie Werke:

| Quelle | Format | Bemerkung |
|---|---|---|
| [Mutopia Project](https://www.mutopiaproject.org) | LilyPond + MIDI | **Erste Wahl.** Von Menschen gesetzt, jedes Stück mit ausgewiesenem Rechtestatus („Public Domain" im Kopf der `.ly`). Suche: `make-table.cgi?searchingfor=<wort>` |
| [music21](https://pypi.org/project/music21/)-Korpus | MusicXML/ABC | ~3200 Stücke OFFLINE nach `pip install music21`: komplette Bach-Choräle, Palestrina, Beethoven-Quartette, Essener Volksliedsammlung, Ryan's Mammoth Collection |
| [KernScores](https://kern.humdrum.org) | Humdrum `**kern` | sehr gut parsierbar |
| [IMSLP](https://imslp.org) | meist PDF-Scans | riesig, aber maschinenlesbar nur, wo jemand MusicXML/MIDI hochgeladen hat |
| [abcnotation.com](https://abcnotation.com) | ABC | Volksmusik, Zehntausende Melodien |

**Zwei Rechte prüfen:** Die KOMPOSITION muss gemeinfrei sein (Regel oben) UND
der SATZ, den man herunterlädt, frei verwendbar. Mutopia weist beides aus.

Nicht jedes Stück ist zu finden – Rossinis Wilhelm-Tell-Galopp zum Beispiel
nicht. Dann gibt es zwei ehrliche Wege: weglassen, oder als eigenes Stück
schreiben und auch so benennen (siehe `galopp.ts`).

## Einen Titel hinzufügen

1. Quelle suchen (Tabelle oben) und Melodie/Bass mit
   `tools/score2tiltr.py` in unsere Notenschrift übersetzen:
   ```bash
   pip install music21
   curl -O <mutopia-url>/stueck.mid
   python3 tools/score2tiltr.py stueck.mid --part 0 --from 0 --to 32 --shift 24
   python3 tools/score2tiltr.py stueck.mid --part 1 --low --from 0 --to 32
   ```
   Das Werkzeug gibt die fertige Zeile plus Kontrollrechnung aus (Beats,
   Tonumfang). `--shift` hebt tiefe Klavierfassungen in den Bereich, in dem
   eine Puls-Stimme klingt statt brummt.
2. `src/music/<id>.ts` nach dem Muster der bestehenden Dateien anlegen. Der
   Kopfkommentar nennt Werk, Jahr, Rechtestatus UND die Quelle samt
   Ausschnitt – wer später etwas ändert, muss wissen, woher die Töne kommen.
3. In `index.ts` importieren und in `MUSIC` einsortieren.
4. `npm test` – `tests/music.test.ts` prüft Parsierbarkeit, Tonumfang und
   dass alle Stimmen eines Titels gleich lang sind (kein stummer Schwanz vor
   dem Loop).
