import type { MonobankCurrencyResponse, Outcome } from './types.ts';

/** A USD→UAH quote as published by Monobank. */
export interface IRate {
  rateBuy: number;
  rateSell: number;
  /**
   * When Monobank last *set* this rate (epoch seconds) — copied from the API's `date` field.
   * It is not when we fetched it: Monobank's quote may stay the same for hours, and this
   * timestamp only moves when the bank publishes a new one. Our own fetch time is `updatedAt`.
   */
  monoDate: number;
}

/** A quote we have persisted, plus when we recorded it. */
export interface IStoredRate extends IRate {
  /** ISO-8601 timestamp of when this rate was recorded. */
  updatedAt: string;
}

/**
 * One element of the Monobank public rates feed,
 * `GET https://api.monobank.ua/bank/currency`.
 *
 * @example
 * { currencyCodeA: 840, currencyCodeB: 980, date: 1552392228, rateSell: 27, rateBuy: 27.2, rateCross: 27.1 }
 */
export interface IMonobankCurrencyRate {
  /** Base currency — ISO 4217 numeric code (840 = USD, 978 = EUR). */
  currencyCodeA: number;
  /** Quote currency — ISO 4217 numeric code (980 = UAH). */
  currencyCodeB: number;
  /**
   * When Monobank set this rate — Unix epoch seconds. Reflects the bank's publication time,
   * not the request time; the feed is cached and refreshed at most every ~5 minutes.
   */
  date: number;
  /** Rate at which the bank sells A for B. Absent for pairs quoted only via `rateCross`. */
  rateSell?: number;
  /** Rate at which the bank buys A for B. Absent for pairs quoted only via `rateCross`. */
  rateBuy?: number;
  /** Cross rate — present for pairs that have no separate buy/sell quotes. */
  rateCross?: number;
}

/** Client for Monobank's public API. Methods return `null` when rate-limited (HTTP 429). */
export interface IMonobankApiService {
  /** `GET /bank/currency` — every pair Monobank publishes. */
  getCurrencyRates(): Promise<MonobankCurrencyResponse | null>;
  /** The USD/UAH buy/sell quote. */
  getUsdUah(): Promise<IRate | null>;
}

/** Constructor options for `MonobankApiService`; everything is optional. */
export interface IMonobankApiServiceOptions {
  /** Defaults to `https://api.monobank.ua`. */
  baseUrl?: string;
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Request timeout; defaults to `MONOBANK_TIMEOUT_MS`. */
  timeoutMs?: number;
}

export interface IRateStoreService {
  /** The most recently recorded rate, or `null` on the very first run. */
  getLatest(): Promise<IStoredRate | null>;
  /** Atomically overwrites LATEST and appends a history row. */
  recordChange(prev: IStoredRate | null, next: IRate, now: Date): Promise<void>;
}

export interface INotifierService {
  send(text: string): Promise<void>;
}

export interface IEnv {
  tableName: string;
  ssmPrefix: string;
  pair: string;
}

export interface ITelegramSecrets {
  botToken: string;
  chatId: string;
}

/** Environment + secrets. Secrets are fetched lazily and cached for the lifetime of the instance. */
export interface IConfigService {
  readonly env: IEnv;
  getTelegramSecrets(): Promise<ITelegramSecrets>;
}

/** Orchestrates one polling tick over the injected services. */
export interface IRateWatcherService {
  tick(): Promise<Outcome>;
}
