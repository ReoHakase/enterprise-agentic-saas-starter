# ローカル開発

## 前提

- Nix + direnv、または同等のBun `1.3.13` / Turso CLI / `sqld` / dotenvx / Mailpit
- `nix develop` はrepo-local skillとMCP設定も同期する
- portlessのlocal CAを信頼できるブラウザ環境

```sh
direnv allow
# または
nix develop

bun install --frozen-lockfile
```

## 環境変数

```sh
cp apps/api/.env.example apps/api/.env.development
cp apps/api/.env.example apps/api/.env.local
cp apps/api/.env.test.example apps/api/.env.test
cp packages/db/.env.example packages/db/.env.development
```

APIとDBの `TURSO_DATABASE_URL` は同じ値にします。標準のhostは次の通りです。

- Web: `https://enterprise-agentic-saas.localhost`
- API: `https://api.enterprise-agentic-saas.localhost`
- DB: `https://db.enterprise-agentic-saas.localhost`
- Mailpit inbox: `https://mailpit.enterprise-agentic-saas.localhost`
- React Email preview: `https://email.enterprise-agentic-saas.localhost`

上記はmain checkoutのURLです。linked worktreeではPortlessがworktree prefixを付け、APIの`dev` scriptも`portless get mailpit.enterprise-agentic-saas`で同じMailpit URLを解決します。別worktreeの受信箱へ誤配送しないため、固定URLをlocal envへ複製しません。

`.env*` と `.dev.vars` の実値はcommitしません。共有するkeyだけを `.env.example` / `.dev.vars.example` に置きます。

`EMAIL_FROM`はlocal/testでは省略でき、省略時は配送不能な`noreply@example.test`へ安全にfallbackします。productionではCloudflare Email Sendingで検証済みsenderを必須にし、未設定のまま起動しません。

developmentではproviderとsender addressを既定で補い、Mailpit URLはAPIの`dev` scriptがworktreeを考慮して注入するため、通常はemail用envを追加しなくてもapplicationから送ったメールをMailpitで確認できます。別のlocal instanceへ向けるときだけAPIのlocal envで`MAILPIT_URL`を上書きします。React Email previewはtemplate単体の確認用、Mailpitは実際の送信導線の確認用です。

```dotenv
EMAIL_PROVIDER=mailpit
EMAIL_FROM=noreply@example.test
```

## DB開発環境

通常は後述のroot `bun run dev`だけを実行します。このcommandがDB workspaceの`dev`も含み、`with` 関係によりlocal Tursoの起動と、保存済みmigrationの適用、seed、Drizzle Studioの起動をまとめて行います。初回にapplicationを開く前に、DB taskのmigrationとseed完了logを待ちます。

DBだけを起動してschemaやdataを調査するときは、root `bun run dev`の代わりに次を実行します。

```sh
bunx turbo run dev --filter=@enterprise-agentic-saas/db
```

package directoryで `bun run dev` だけを実行するとTurboの `with` 関係が適用されず、local Tursoが起動しません。手動で分ける場合は、別terminalで `db:turso` を起動してから `db:bootstrap` を実行します。

DB-only taskとroot `bun run dev`は同時に起動しません。同じportとlocal DB processを二重に所有しようとして失敗します。

`db:bootstrap` は接続待機、`generate + migrate`、idempotent seedの順です。通常起動で既存データを削除しません。詳細は [Database lifecycle](./database-lifecycle.md) を参照してください。

## 開発サーバー

```sh
bun run dev
```

この1commandでWeb、API、local Turso、migration/seed、Drizzle Studio、Mailpit、React Email previewを起動します。

Mailpitの受信データはgit管理外の `packages/email/.local/mailpit.db` へ保存され、開発serverを再起動しても残ります。受信箱だけを手動resetするときは、先に `bun run dev` を停止してから次を実行します。

```sh
bun run --cwd packages/email mailpit:reset
```

起動中に全メールを消すだけならMailpit UIのDelete allを使用できます。

必要なpackageだけ起動する場合:

```sh
bunx turbo run dev --filter=@enterprise-agentic-saas/api...
bun run --cwd apps/web dev
bun run --cwd packages/ui storybook
```

filtered Turbo commandはAPIに加えてlocal DB、migration/seed、Mailpit、React Email previewを起動します。`bun run --cwd apps/api dev`はAPI processだけを起動するため、DBとMailpitがすでに動作している場合に限って使います。

## Sentry Spotlight

通常の`bun run dev`はSentryへlocal telemetryを送らない。error、trace、structured logをlocalだけで確認するときはSpotlight sidecarと全workspaceをまとめて起動する。

```sh
bun run dev:spotlight
```

Spotlight UIは `http://localhost:8969`。このscriptはbrowser用`NEXT_PUBLIC_SENTRY_SPOTLIGHT`とserver/API用`SENTRY_SPOTLIGHT`へlocal sidecar URLを注入し、localではerror/log/traceを100%収集する。production DSNがlocal envに残っていてもdevelopmentから外送しない。

別にsidecarを起動する場合は、`.dev.vars`へ次のどちらかを設定する。

```dotenv
SENTRY_SPOTLIGHT=1
NEXT_PUBLIC_SENTRY_SPOTLIGHT=1
# custom local endpointを使う場合だけ:
# SENTRY_SPOTLIGHT=http://localhost:8969/stream
# NEXT_PUBLIC_SENTRY_SPOTLIGHT=http://localhost:8969/stream
```

remote hostのSpotlight URLとproduction環境のSpotlight flagは無効化される。`nix develop`または`sync-agent-config`で生成する`Sentry Spotlight` MCPも同じlocal sidecarを読むため、agentへ調査を依頼する前にsidecarを起動する。詳細は [Observability](./observability.md) を参照する。

## 日常の品質確認

```sh
bun run check
bun run build
bun run build:storybook
bun run test:storybook
bun run test:e2e
bun run build:cloudflare
```

`bun run test` はVitestを実行します。`bun test` はBun自身のtest runnerなので、このrepoの品質ゲートには使いません。

## よくある失敗

- `turso dev` が起動しない: Turso CLIだけでなく `sqld` が `PATH` にあるか確認する。
- `.localhost` HTTPSで証明書エラー: `~/.portless/ca.pem` と `NODE_EXTRA_CA_CERTS` を確認する。
- envが読まれない: Bunはcommandのcwdにある `.env*` を読む。rootへsecretを集約しない。
- local起動で`EMAIL_FROM` validation errorになる: packageを最新化し、`NODE_ENV`が誤って`production`になっていないか確認する。local/testでは省略可能、本番では必須。
- Mailpitが起動しない: `mailpit` が `PATH` にあるか確認する。Nix利用時はdev shellへ入り直し、main checkoutでは `https://mailpit.enterprise-agentic-saas.localhost`、linked worktreeでは `portless get mailpit.enterprise-agentic-saas` の出力を開く。
- Mailpitにメールが届かない: `NODE_ENV=development`であること、APIのlocal envが既定値を`console`等で上書きしていないこと、`MAILPIT_URL`がlocal URLであることを確認する。React Email previewにはapplicationから送ったメールは保存されない。
- schema変更が見えない: `db:generate` 後のmigrationをcommitし、対象DBへ `db:migrate` を実行する。`push` で迂回しない。
- Spotlightにeventが出ない: `http://localhost:8969` が開けること、browser/server両方のSpotlight env、SDK initより前にerrorが起きていないことを確認する。
- `bun install`がsecurity scannerの5xxで止まる: scannerは意図的にfail-closed。恒久的に無効化せず、まず再試行する。localの一時回避条件とreleaseで禁止する理由は`developer-environment` skillを参照する。
