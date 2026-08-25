# mono-currency

An AWS Lambda that polls [Monobank's public currency API](https://api.monobank.ua/bank/currency)
every two minutes for the **USD → UAH** rate. Whenever the buy **or** sell rate differs from the last
recorded value it writes the new rate to DynamoDB and sends a Telegram message:

```
💵 USD/UAH changed
Buy: 44.43 → 44.45 (▲ +0.02)
Sell: 44.831 → 44.85 (▲ +0.019)
🕒 Monobank: 2026-08-25 18:41 (Kyiv)
```

## How it works

```
EventBridge Scheduler  rate(2 minutes)
   └─> Lambda  mono-currency-poller  (Node.js 22, arm64, TypeScript bundled by esbuild)
          ├─ GET https://api.monobank.ua/bank/currency
          ├─ SSM Parameter Store  /mono-currency/telegram/{bot-token,chat-id}   (read once per cold start)
          ├─ DynamoDB  mono-currency-rates   (LATEST pointer + one history row per change)
          └─ POST https://api.telegram.org/bot<token>/sendMessage
```

Each tick (`RateWatcherService.tick()`):

| Monobank returns        | LATEST in DynamoDB | Outcome                                                        |
| ----------------------- | ------------------ | -------------------------------------------------------------- |
| HTTP 429 (rate-limited) | —                  | `rate-limited` — nothing written, nothing sent                 |
| rate                    | missing            | `first-run` — store baseline, send "✅ monitoring started"      |
| rate                    | identical buy+sell | `unchanged` — nothing written, nothing sent                    |
| rate                    | differs            | `changed` — write LATEST + history row, send Telegram message  |

The Lambda is stateless; DynamoDB's `LATEST` item is the source of truth for "what was the rate last time".

### DynamoDB layout (`pk` / `sk`)

| Item                 | `pk`      | `sk`                        | Attributes                                                                            |
| -------------------- | --------- | --------------------------- | ------------------------------------------------------------------------------------- |
| Latest pointer       | `USD_UAH` | `LATEST`                    | `rateBuy`, `rateSell`, `monoDate`, `updatedAt`                                        |
| History (per change) | `USD_UAH` | `RATE#<ISO-8601 updatedAt>` | same + `prevBuy`, `prevSell`, `deltaBuy`, `deltaSell` (`null` on the very first run)  |

`monoDate` is when **Monobank** set the rate (its `date` field, epoch seconds) — it only moves when the bank
publishes a new quote, and it's the time shown in the Telegram message. `updatedAt` is when **we** recorded it.
History rows are never overwritten — the sort key keeps them in chronological order.

### Code layout

```
src/
├── handler.ts                       Lambda entry point: builds the services once per container, runs a tick
├── services/
│   ├── rate-watcher.service.ts      one polling tick (fetch → compare → record → notify)
│   ├── monobank.service.ts          Monobank API client
│   ├── telegram.service.ts          Telegram Bot API notifier
│   ├── dynamo-store.service.ts      DynamoDB LATEST + history
│   └── config.service.ts            env vars + SSM secrets
├── utils/                           formatting, rounding, error helpers
├── interfaces.ts · types.ts · constants.ts
template.yaml                        SAM: Lambda, schedule, table, log group, IAM
samconfig.toml                       SAM CLI defaults (stack name, region, profile) — no secrets
```

## Setup (one-time)

### 1. Tooling

```bash
brew install awscli
aws --version

brew install aws-sam-cli
sam --version
```

### 2. AWS credentials

Create an access key for the deploy account (IAM → Users → your user → Security credentials →
*Create access key*), then create the `mono` profile:

```bash
aws configure --profile mono
#   AWS Access Key ID:     <key id>
#   AWS Secret Access Key: <secret>
#   Default region name:   eu-central-1     (Frankfurt — closest region to Ukraine)
#   Default output format: json
```

Verify:

```bash
cat ~/.aws/config                            # [profile mono] region = eu-central-1
cat ~/.aws/credentials                       # shows the secret in plaintext — don't paste it anywhere
aws sts get-caller-identity --profile mono   # account id + user of the deploy account
```

The profile name `mono` and region `eu-central-1` are what `samconfig.toml` expects; edit that file
to use a different profile or region. SSM parameters, the stack and the table are all region-scoped,
so everything below must use the same region.

### 3. Telegram bot

1. In Telegram, open **@BotFather** → `/newbot`. Pick a display name, then a username
   (letters, digits, `_` only; must end in `bot`, e.g. `mono_currency_bot`). Copy the token
   (`123456789:AAF...`).
2. Open the bot from the link BotFather gives you and tap **Start** (or send any message).
   The bot won't reply — that's expected.
3. Get your chat id:

   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | python3 -c \
     'import json,sys; print(json.load(sys.stdin)["result"][-1]["message"]["chat"]["id"])'
   ```

   If it fails with `IndexError`, the update list is empty — send the bot another message and retry.
   (For a group chat, add the bot to the group first; group ids are negative.)

### 4. Store the secrets in SSM Parameter Store

Same account **and region** as the stack — SSM parameters are regional.

```bash
aws ssm put-parameter --profile mono \
  --name /mono-currency/telegram/bot-token --type SecureString --value '<TOKEN>'
aws ssm put-parameter --profile mono \
  --name /mono-currency/telegram/chat-id --type SecureString --value '<CHAT_ID>'
```

The Lambda reads them with `ssm:GetParameters` (decrypted via the default `aws/ssm` KMS key, so no
extra KMS policy is needed). Nothing secret ever goes into the template or git.

## Deploy

```bash
npm ci
npm run typecheck
sam build
sam deploy --profile mono
```

`sam deploy` reads stack name, region and profile from `samconfig.toml`, shows the changeset and
asks for confirmation. Re-run the same four commands for every update.

Stack parameters (override with `--parameter-overrides Key=Value`): `SsmPrefix`
(default `mono-currency/telegram`), `ScheduleExpression` (default `rate(2 minutes)`),
`LogRetentionDays` (default `14`).

## Verify

Within two minutes of the first deploy you should receive **"✅ USD/UAH monitoring started"** in Telegram.

```bash
# Follow the logs — first tick logs {"event":"first-run"}, later ones {"event":"unchanged"}
sam logs --stack-name mono-currency --profile mono --tail

# Trigger a tick by hand instead of waiting for the schedule
aws lambda invoke --profile mono --function-name mono-currency-poller --no-cli-pager /dev/stdout

# Force the "changed" path: corrupt LATEST, then wait ≤ 2 minutes for a "USD/UAH changed" message
aws dynamodb update-item --profile mono --table-name mono-currency-rates \
  --key '{"pk":{"S":"USD_UAH"},"sk":{"S":"LATEST"}}' \
  --update-expression 'SET rateBuy = :one' --expression-attribute-values '{":one":{"N":"1"}}'

# Rate history, newest first
aws dynamodb query --profile mono --table-name mono-currency-rates --no-scan-index-forward --max-items 20 \
  --key-condition-expression 'pk = :p AND begins_with(sk, :h)' \
  --expression-attribute-values '{":p":{"S":"USD_UAH"},":h":{"S":"RATE#"}}' --no-cli-pager
```

### Common problems

| Log message                                    | Cause / fix                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Missing SSM parameters: /mono-currency/...`   | Parameters are in a different region than the stack. Check `region` in `samconfig.toml` vs where you ran `put-parameter`. |
| `Telegram sendMessage failed: HTTP 400 ... chat not found` | Wrong chat id, or you never sent the bot a message. Redo step 3.                             |
| `Telegram sendMessage failed: HTTP 401`        | Wrong bot token.                                                                                         |
| `Cannot find esbuild` during `sam build`       | esbuild must be in `dependencies` (it is) and `npm ci` must have run.                                    |

## Versions and rollback

Every `sam deploy` publishes an immutable **Lambda version** (`1`, `2`, `3`, …) and moves the `live`
alias to it (`AutoPublishAlias: live` in `template.yaml`). The schedule invokes the alias, never
`$LATEST`.

- **See them:** Lambda console → `mono-currency-poller` → **Versions** tab (code + config snapshots)
  and **Aliases** tab (`live` → current version). Or:

  ```bash
  aws lambda list-versions-by-function --profile mono --function-name mono-currency-poller \
    --query 'Versions[].{Version:Version,Modified:LastModified,Description:Description}' --output table
  aws lambda get-alias --profile mono --function-name mono-currency-poller --name live
  ```

- **Roll back instantly** (no build, no deploy) by pointing the alias at an older version:

  ```bash
  aws lambda update-alias --profile mono --function-name mono-currency-poller --name live --function-version 2
  ```

  The next tick runs version 2. The next `sam deploy` publishes a new version and moves the alias
  forward again, so a rollback is a temporary measure — fix the code and deploy to make it permanent.

- **Deploy history** (which template/changeset was applied when): CloudFormation console → Stacks →
  `mono-currency` → **Events** and **Change sets** tabs.

## Remove

```bash
sam delete --stack-name mono-currency --profile mono --no-prompts
aws dynamodb delete-table --profile mono --table-name mono-currency-rates   # table is retained on stack delete
aws ssm delete-parameters --profile mono \
  --names /mono-currency/telegram/bot-token /mono-currency/telegram/chat-id
```

## Notes

- **Monobank rate limit.** The feed refreshes at most every ~5 minutes and returns HTTP 429 when
  polled faster than ~1 request/minute. A 429 is treated as "nothing new", not an error. Any other
  non-2xx response or a malformed payload throws and shows up as a Lambda error in CloudWatch.
- **DB before Telegram.** The rate is written to DynamoDB first, then the message is sent. If Telegram
  fails, the invocation errors (visible in CloudWatch) but the change is **not** re-notified on the next
  tick, because LATEST already holds the new rate. Preferable to the reverse (duplicate messages).
- **No scheduler retries.** `MaximumRetryAttempts: 0` — the next tick is the retry.
- **Cost.** ~22k invocations/month: Lambda, DynamoDB on-demand, EventBridge Scheduler and SSM all stay
  within their free tiers; DynamoDB usage is under one cent/month even without it. Logs are kept 14 days.
- **esbuild is a regular `dependency`.** `sam build` installs packages with `npm install --omit=dev`
  before bundling, so a devDependency esbuild would never be found. It doesn't ship to Lambda — the
  artifact is a single bundled `handler.mjs`.
- **esbuild `MainFields: module,main` is load-bearing.** With SAM's default (`main,module`) esbuild
  bundles the CommonJS builds of `@aws-sdk/*`, whose `require("node:https")` becomes a throwing shim
  under `Format: esm` and crashes the function on its first SDK call.
- **Adding pairs.** Monobank exposes EUR/UAH as `currencyCodeA: 978, currencyCodeB: 980` with the same
  shape; `src/services/monobank.service.ts` and the `PAIR` env var are the places to generalise.
