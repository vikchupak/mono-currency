import type { Handler } from 'aws-lambda';
import { ConfigService } from './services/config.service.ts';
import { DynamoRateStoreService } from './services/dynamo-store.service.ts';
import { MonobankApiService } from './services/monobank.service.ts';
import { RateWatcherService } from './services/rate-watcher.service.ts';
import { TelegramNotifierService } from './services/telegram.service.ts';
import type { Outcome } from './types.ts';
import { errorMessage } from './utils/errors.util.ts';

/** Built once per Lambda execution environment and reused by every warm invocation. */
let watcher: RateWatcherService | undefined;

/** Lambda entry point (EventBridge Scheduler → no meaningful event payload). */
export const handler: Handler<unknown, { outcome: Outcome }> = async () => {
  try {
    watcher ??= await createWatcher();
    const outcome = await watcher.tick();
    return { outcome };
  } catch (err) {
    console.error(JSON.stringify({ event: 'error', message: errorMessage(err) }));
    throw err;
  }
};

async function createWatcher(): Promise<RateWatcherService> {
  const config = new ConfigService();
  const secrets = await config.getTelegramSecrets();

  return new RateWatcherService(
    new MonobankApiService(),
    DynamoRateStoreService.create(config.env.tableName, config.env.pair),
    new TelegramNotifierService(secrets.botToken, secrets.chatId),
  );
}
