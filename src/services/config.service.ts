import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DEFAULT_PAIR, DEFAULT_SSM_PREFIX } from '../constants.ts';
import type { IConfigService, IEnv, ITelegramSecrets } from '../interfaces.ts';

/**
 * Runtime configuration: environment variables (validated once, up front) and
 * Telegram secrets from SSM Parameter Store (fetched lazily, cached per instance —
 * i.e. once per Lambda execution environment).
 */
export class ConfigService implements IConfigService {
  readonly env: IEnv;
  private readonly _ssm: SSMClient;
  private _telegramSecrets: ITelegramSecrets | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env, ssm: SSMClient = new SSMClient({})) {
    this.env = ConfigService.parseEnv(env);
    this._ssm = ssm;
  }

  /** Validates the environment. Throws if `TABLE_NAME` is missing; other values have defaults. */
  static parseEnv(env: NodeJS.ProcessEnv): IEnv {
    const tableName = env.TABLE_NAME;

    if (!tableName) {
      throw new Error('TABLE_NAME environment variable is required');
    }

    return {
      tableName,
      ssmPrefix: env.SSM_PREFIX ?? DEFAULT_SSM_PREFIX,
      pair: env.PAIR ?? DEFAULT_PAIR,
    };
  }

  /** `<ssmPrefix>/bot-token` and `<ssmPrefix>/chat-id`, decrypted. A failed lookup is not cached. */
  async getTelegramSecrets(): Promise<ITelegramSecrets> {
    return (this._telegramSecrets ??= await this._fetchTelegramSecrets());
  }

  private async _fetchTelegramSecrets(): Promise<ITelegramSecrets> {
    const tokenName = `${this.env.ssmPrefix}/bot-token`;
    const chatIdName = `${this.env.ssmPrefix}/chat-id`;

    const out = await this._ssm.send(
      new GetParametersCommand({ Names: [tokenName, chatIdName], WithDecryption: true }),
    );

    if (out.InvalidParameters?.length) {
      throw new Error(`Missing SSM parameters: ${out.InvalidParameters.join(', ')}`);
    }

    const value = (name: string): string => {
      const v = out.Parameters?.find((p) => p.Name === name)?.Value;
      if (!v) throw new Error(`SSM parameter ${name} is empty`);
      return v;
    };

    return { botToken: value(tokenName), chatId: value(chatIdName) };
  }
}
