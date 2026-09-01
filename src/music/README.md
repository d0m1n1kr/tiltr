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

## Einen Titel hinzufügen

1. `src/music/<id>.ts` nach dem Muster der bestehenden Dateien anlegen
   (Kopfkommentar nennt Werk, Jahr und den Rechtestatus).
2. In `index.ts` importieren und in `MUSIC` einsortieren.
3. `npm test` – `tests/music.test.ts` prüft Parsierbarkeit, Tonumfang und
   dass alle Stimmen eines Titels gleich lang sind (kein stummer Schwanz vor
   dem Loop).
