/** Human-readable message for any thrown value (Errors, strings, objects). */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return typeof err === 'string' ? err : JSON.stringify(err);
}
