/** `true` for any non-null object (arrays included); narrows `unknown` so its properties can be inspected. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** `true` only for real, finite numbers — rejects `NaN`, `±Infinity`, numeric strings and `null`. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
