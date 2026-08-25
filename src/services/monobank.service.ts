import { ISO_UAH, ISO_USD, MONOBANK_BASE_URL, MONOBANK_TIMEOUT_MS } from '../constants.ts';
import type {
  IMonobankApiService,
  IMonobankApiServiceOptions,
  IMonobankCurrencyRate,
  IRate,
} from '../interfaces.ts';
import type { MonobankCurrencyResponse } from '../types.ts';
import { errorMessage } from '../utils/errors.util.ts';

/**
 * Thin client for Monobank's public (unauthenticated) API.
 *
 * The `/bank/currency` feed is cached server-side and refreshes at most every
 * ~5 minutes; polling it faster than ~1 req/min yields HTTP 429. Methods return
 * `null` in that case — it simply means "nothing new this tick".
 */
export class MonobankApiService implements IMonobankApiService {
  private readonly _baseUrl: string;
  private readonly _fetchImpl: typeof fetch;
  private readonly _timeoutMs: number;

  constructor({
    baseUrl = MONOBANK_BASE_URL,
    fetchImpl = fetch,
    timeoutMs = MONOBANK_TIMEOUT_MS,
  }: IMonobankApiServiceOptions = {}) {
    this._baseUrl = baseUrl;
    this._fetchImpl = fetchImpl;
    this._timeoutMs = timeoutMs;
  }

  /** `GET /bank/currency` — every pair Monobank publishes, or `null` when rate-limited. */
  async getCurrencyRates(): Promise<MonobankCurrencyResponse | null> {
    let res: Response;
    try {
      res = await this._fetchImpl(`${this._baseUrl}/bank/currency`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this._timeoutMs),
      });
    } catch (err) {
      throw new Error(`Monobank request failed: ${errorMessage(err)}`, { cause: err });
    }

    if (res.status === 429) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`Monobank responded HTTP ${res.status}`);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new Error(`Monobank returned invalid JSON: ${errorMessage(err)}`, { cause: err });
    }

    return assertCurrencyResponse(body);
  }

  /** The USD/UAH buy/sell quote, or `null` when rate-limited. */
  async getUsdUah(): Promise<IRate | null> {
    const rates = await this.getCurrencyRates();
    return rates ? parseUsdUah(rates) : null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Narrows an untrusted body to the documented response shape (pair codes only; rates are validated per use). */
function assertCurrencyResponse(body: unknown): MonobankCurrencyResponse {
  if (!Array.isArray(body)) {
    throw new Error('Monobank payload is not an array');
  }

  const wellFormed = body.every(
    (item) =>
      isRecord(item) &&
      typeof item.currencyCodeA === 'number' &&
      typeof item.currencyCodeB === 'number',
  );

  if (!wellFormed) {
    throw new Error('Monobank payload entries are missing currency codes');
  }

  return body as MonobankCurrencyResponse;
}

/** Finds the entry for a currency pair (ISO 4217 numeric codes) in a Monobank response. */
function findPair(
  body: MonobankCurrencyResponse,
  codeA: number,
  codeB: number,
): IMonobankCurrencyRate | undefined {
  return body.find((item) => item.currencyCodeA === codeA && item.currencyCodeB === codeB);
}

/** Extracts and validates the USD/UAH entry from a Monobank payload. */
function parseUsdUah(body: unknown): IRate {
  const entry = findPair(assertCurrencyResponse(body), ISO_USD, ISO_UAH);

  if (!entry) {
    throw new Error('USD/UAH pair not present in Monobank payload');
  }

  const { rateBuy, rateSell, date } = entry as Record<keyof IMonobankCurrencyRate, unknown>;

  if (typeof rateBuy !== 'number' || !Number.isFinite(rateBuy)) {
    throw new Error('USD/UAH rateBuy is missing or not a number');
  }

  if (typeof rateSell !== 'number' || !Number.isFinite(rateSell)) {
    throw new Error('USD/UAH rateSell is missing or not a number');
  }

  if (typeof date !== 'number' || !Number.isFinite(date)) {
    throw new Error('USD/UAH date is missing or not a number');
  }

  return { rateBuy, rateSell, monoDate: date };
}
