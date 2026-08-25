import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { HISTORY_SK_PREFIX, LATEST_SK, RATE_DECIMAL_PLACES } from '../constants.ts';
import { roundToDecimalPlaces } from '../utils/number.util.ts';
import type { IRate, IRateStoreService, IStoredRate } from '../interfaces.ts';

export class DynamoRateStoreService implements IRateStoreService {
  private readonly _doc: DynamoDBDocumentClient;
  private readonly _tableName: string;
  private readonly _pair: string;

  constructor(doc: DynamoDBDocumentClient, tableName: string, pair: string) {
    this._doc = doc;
    this._tableName = tableName;
    this._pair = pair;
  }

  static create(tableName: string, pair: string): DynamoRateStoreService {
    const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
    return new DynamoRateStoreService(doc, tableName, pair);
  }

  async getLatest(): Promise<IStoredRate | null> {
    const { Item } = await this._doc.send(
      new GetCommand({
        TableName: this._tableName,
        Key: { pk: this._pair, sk: LATEST_SK },
        ConsistentRead: true,
      }),
    );
    if (!Item) {
      return null;
    }
    return {
      rateBuy: Item.rateBuy as number,
      rateSell: Item.rateSell as number,
      monoDate: Item.monoDate as number,
      updatedAt: Item.updatedAt as string,
    };
  }

  async recordChange(prev: IStoredRate | null, next: IRate, now: Date): Promise<void> {
    const updatedAt = now.toISOString();
    const latestItem = { pk: this._pair, sk: LATEST_SK, ...next, updatedAt };
    const historyItem = {
      pk: this._pair,
      sk: `${HISTORY_SK_PREFIX}${updatedAt}`,
      ...next,
      updatedAt,
      prevBuy: prev?.rateBuy ?? null,
      prevSell: prev?.rateSell ?? null,
      deltaBuy: prev ? roundToDecimalPlaces(next.rateBuy - prev.rateBuy, RATE_DECIMAL_PLACES) : null,
      deltaSell: prev ? roundToDecimalPlaces(next.rateSell - prev.rateSell, RATE_DECIMAL_PLACES) : null,
    };

    await this._doc.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: this._tableName, Item: latestItem } },
          { Put: { TableName: this._tableName, Item: historyItem } },
        ],
      }),
    );
  }
}
