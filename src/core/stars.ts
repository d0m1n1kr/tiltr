// Sterne (M45): EINE Rechnung für die Ergebnis-Karte – rein, damit die
// Sanduhr ihren Par-Bonus an genau einer Stelle einbringt.
//
// 1 = geschafft, 2 = unter Par (plus gesammelte Sanduhr-Sekunden),
// 3 = alle Gems (bzw. sturzfrei in Leveln ohne Gems).

export interface StarInput {
  seconds: number;
  /** Par in Sekunden; undefined = kein zweiter Stern möglich */
  parS: number | undefined;
  /** Summe der eingesammelten Sanduhr-Sekunden */
  bonusS: number;
  gemsTotal: number;
  gemsGot: number;
  falls: number;
}

/** Wirksame Par: Par plus Sanduhr-Bonus (undefined bleibt undefined). */
export function effectivePar(parS: number | undefined, bonusS: number): number | undefined {
  return parS === undefined ? undefined : parS + bonusS;
}

export function starsFor(i: StarInput): 1 | 2 | 3 {
  const par = effectivePar(i.parS, i.bonusS);
  const second = par !== undefined && i.seconds <= par ? 1 : 0;
  const third = i.gemsTotal > 0 ? (i.gemsGot === i.gemsTotal ? 1 : 0) : i.falls === 0 ? 1 : 0;
  return (1 + second + third) as 1 | 2 | 3;
}
