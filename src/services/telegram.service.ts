import { TELEGRAM_BASE_URL, TELEGRAM_TIMEOUT_MS } from '../constants.ts';
import type { INotifierService } from '../interfaces.ts';
import { errorMessage } from '../utils/errors.util.ts';

type FetchLike = typeof fetch;

/** Sends messages via the Telegram Bot API (`sendMessage`, HTML parse mode). */
export class TelegramNotifierService implements INotifierService {
  private readonly _token: string;
  private readonly _chatId: string;
  private readonly _fetchImpl: FetchLike;

  constructor(token: string, chatId: string, fetchImpl: FetchLike = fetch) {
    this._token = token;
    this._chatId = chatId;
    this._fetchImpl = fetchImpl;
  }

  async send(text: string): Promise<void> {
    let res: Response;
    try {
      res = await this._fetchImpl(`${TELEGRAM_BASE_URL}/bot${this._token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: this._chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      });
    } catch (err) {
      // The URL (which contains the bot token) is deliberately not included in the message.
      throw new Error(`Telegram request failed: ${errorMessage(err)}`, { cause: err });
    }

    if (!res.ok) {
      // Body carries Telegram's `description` (e.g. "chat not found").
      let body = '';
      try {
        body = await res.text();
      } catch {
        // unreadable body — the status code alone is still a useful error
      }

      throw new Error(`Telegram sendMessage failed: HTTP ${res.status} ${body}`.trim());
    }
  }
}
