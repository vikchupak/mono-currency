import type { IMonobankCurrencyRate } from './interfaces.ts';

/** Full response body of `GET /bank/currency`: one entry per currency pair. */
export type MonobankCurrencyResponse = IMonobankCurrencyRate[];

/** Result of one polling tick. */
export type Outcome = 'rate-limited' | 'first-run' | 'unchanged' | 'changed';
