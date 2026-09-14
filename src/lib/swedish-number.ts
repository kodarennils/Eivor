// Live-observed bug: the interview intentionally stores measurement
// answers verbatim as free text (see interview.ts), and Swedish decimal
// notation uses a comma ("6,5 meter till nock") - but JS's Number() only
// accepts a period, so Number("6,5") is NaN. That silently failed the
// "!heightMeters" check in /api/projekt/ritning and blocked drawing
// generation entirely for a completely normal Swedish answer. Use this
// instead of Number() wherever a stored answer string becomes a number.
export function parseSwedishNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  return Number(value.trim().replace(",", "."));
}
