/** `true` for any non-null object (arrays included); narrows `unknown` so its properties can be inspected. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
