/** ISO 4217 numeric currency codes, as used in Monobank's `currencyCodeA/B`. */
export const ISO_USD = 840;
export const ISO_UAH = 980;

/** Partition key value for the USD/UAH pair; also the default `PAIR` env value. */
export const DEFAULT_PAIR = 'USD_UAH';

/** Default SSM Parameter Store path holding `bot-token` and `chat-id`. */
export const DEFAULT_SSM_PREFIX = '/mono-currency/telegram';

/** Monobank public API. */
export const MONOBANK_BASE_URL = 'https://api.monobank.ua';
export const MONOBANK_TIMEOUT_MS = 10_000;

/** Telegram Bot API. */
export const TELEGRAM_BASE_URL = 'https://api.telegram.org';
export const TELEGRAM_TIMEOUT_MS = 10_000;

/** Monobank quotes never carry more than 4 decimals; deltas are rounded to this to hide float noise. */
export const RATE_DECIMAL_PLACES = 4;

/** DynamoDB sort keys: the single "current rate" pointer and the per-change history prefix. */
export const LATEST_SK = 'LATEST';
export const HISTORY_SK_PREFIX = 'RATE#';
