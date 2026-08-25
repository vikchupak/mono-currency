import type {
  IMonobankApiService,
  INotifierService,
  IRateStoreService,
  IRateWatcherService,
} from '../interfaces.ts';
import type { Outcome } from '../types.ts';
import { buildChangeMessage, buildStartedMessage } from '../utils/format.util.ts';

/**
 * One polling tick: fetch the current USD/UAH quote, compare it with the last
 * recorded one, and on a change persist it and notify.
 */
export class RateWatcherService implements IRateWatcherService {
  private readonly _monobankService: IMonobankApiService;
  private readonly _storeService: IRateStoreService;
  private readonly _notifierService: INotifierService;

  constructor(
    monobankService: IMonobankApiService,
    storeService: IRateStoreService,
    notifierService: INotifierService,
  ) {
    this._monobankService = monobankService;
    this._storeService = storeService;
    this._notifierService = notifierService;
  }

  async tick(): Promise<Outcome> {
    const current = await this._monobankService.getUsdUah();

    if (!current) {
      return this._done('rate-limited');
    }

    const latest = await this._storeService.getLatest();

    if (!latest) {
      await this._storeService.recordChange(null, current, new Date());
      await this._notifierService.send(buildStartedMessage(current));
      return this._done('first-run', { current });
    }

    if (latest.rateBuy === current.rateBuy && latest.rateSell === current.rateSell) {
      return this._done('unchanged', {
        rateBuy: current.rateBuy,
        rateSell: current.rateSell,
      });
    }

    // DB first (source of truth), then notify. See README "Failure modes".
    await this._storeService.recordChange(latest, current, new Date());
    await this._notifierService.send(buildChangeMessage(latest, current));
    return this._done('changed', { latest, current });
  }

  private _done(outcome: Outcome, data: Record<string, unknown> = {}): Outcome {
    console.log(JSON.stringify({ event: outcome, ...data }));
    return outcome;
  }
}
