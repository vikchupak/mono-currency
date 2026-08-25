/**
 * Rounds `num` to `decimalPlaces` decimals without the usual floating-point
 * mistakes of `Math.round(x * 10^n) / 10^n` (e.g. 1.005 → 1.01, not 1).
 *
 * Uses exponential notation so the scaling happens in decimal, not binary — the
 * approach lodash uses. See https://stackoverflow.com/a/11832950 ("Exponential notation").
 * `Number.EPSILON`-based variants do not cover all cases.
 */
export const roundToDecimalPlaces = (num: number, decimalPlaces: number = 3): number => {
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid number "${num}"`);
  }

  const rounded = Number(Math.round(Number(`${num}e${decimalPlaces}`)) + `e-${decimalPlaces}`);

  // convert -0 to 0
  return rounded + 0;
};
