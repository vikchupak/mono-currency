import { RATE_DECIMAL_PLACES } from '../constants.ts';
import type { IRate } from '../interfaces.ts';
import { roundToDecimalPlaces } from './number.util.ts';

const kyivFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Formats epoch seconds as `YYYY-MM-DD HH:mm` in Kyiv local time. */
export function formatKyivTime(epochSeconds: number): string {
  const parts: Record<string, string> = {};
  for (const { type, value } of kyivFormatter.formatToParts(new Date(epochSeconds * 1000))) {
    parts[type] = value;
  }

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatDelta(delta: number): string {
  const d = roundToDecimalPlaces(delta, RATE_DECIMAL_PLACES);
  if (d === 0) {
    return 'no change';
  }

  return d > 0 ? `▲ +${d}` : `▼ ${d}`;
}

function rateLine(label: string, prev: number, next: number): string {
  const delta = roundToDecimalPlaces(next - prev, RATE_DECIMAL_PLACES);

  return delta === 0
    ? `${label}: ${next} (no change)`
    : `${label}: ${prev} → ${next} (${formatDelta(delta)})`;
}

/** The bank's own publication time for this quote (not the time of our check). */
function timeLine(rate: IRate): string {
  return `🕒 Monobank: ${formatKyivTime(rate.monoDate)} (Kyiv)`;
}

export function buildChangeMessage(prev: IRate, next: IRate): string {
  return [
    '💵 <b>USD/UAH changed</b>',
    rateLine('Buy', prev.rateBuy, next.rateBuy),
    rateLine('Sell', prev.rateSell, next.rateSell),
    timeLine(next),
  ].join('\n');
}

export function buildStartedMessage(rate: IRate): string {
  return [
    '✅ <b>USD/UAH monitoring started</b>',
    `Buy: ${rate.rateBuy}`,
    `Sell: ${rate.rateSell}`,
    timeLine(rate),
  ].join('\n');
}
