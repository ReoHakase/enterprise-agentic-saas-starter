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
- GitHub OAuth emulator: `https://github.emulate.enterprise-agentic-saas.localhost`

上記はmain checkoutのURLです。linked worktreeではPortlessがworktree prefixを付け、APIの`dev` scriptも`portless get mailpit.enterprise-agentic-saas`で同じMailpit URLを解決します。別worktreeの受信箱へ誤配送しないため、固定URLをlocal envへ複製しません。

`.env*` と `.dev.vars` の実値はcommitしません。共有するkeyだけを `.env.example` / `.dev.vars.example` に置きます。

`EMAIL_FROM`はlocal/testでは省略でき、省略時は配送不能な`noreply@example.test`へ安全にfallbackします。productionではCloudflare Email Sendingで検証済みsenderを必須にし、未設定のまま起動しません。

developmentではproviderとsender addressを既定で補い、Mailpit URLはAPIの`dev` scriptがworktreeを考慮して注入するため、通常はemail用envを追加しなくてもapplicationから送ったメールをMailpitで確認できます。別のlocal instanceへ向けるときだけAPIのlocal envで`MAILPIT_URL`を上書きします。React Email previewはtemplate単体の確認用、Mailpitは実際の送信導線の確認用です。

```dotenv
EMAIL_PROVIDER=mailpit
EMAIL_FROM=noreply@example.test
```

## DB開発環境

通常は後述のroot `bun run dev`だけを実行します。このcommandがDB workspaceの`dev`も含み、`with` 関係によりlocal Tursoの起動と、保存済みmigrationの適用、seed、Drizzle Studioの起動をまとめて行います。API supervisorはDB bootstrapを待ちながらmanifestにあるpending fileをlocal R2へreconcileします。初回にapplicationを開く前に、DB taskのmigration/seedとfile reconcile完了logを待ちます。

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

この1commandでWeb、local Wrangler API Worker、永続化local R2、local Turso、migration/seed、R2 fixture reconcile、Drizzle Studio、Mailpit、React Email preview、GitHub OAuth emulatorを起動します。APIは`wrangler dev --local --persist-to apps/api/.wrangler/state`をPortless配下で実行し、productionと同じElysia Worker entrypoint、`FILES`、`IMAGES` bindingを使います。

既存のpre-file seed DBへmigrationだけを適用する場合はreset不要です。preview/download fixtureも追加する場合だけ、全dev serverを停止して次を実行します。

```sh
bun run dev:data:reset
bun run dev
```

`dev:data:reset`は確認文字列を要求し、local Turso state、`apps/api/.wrangler/state`、staleなseed token/sessionを一緒に削除します。remote Turso URLとproductionでは最初に拒否します。非対話環境で明示実行する場合だけ`CONFIRM_DEV_DATA_RESET=reset-local-development`を付けます。通常の`bun run dev`は既存dataをresetしません。

起動済みlocal Turso/APIへmigration、DB seed、R2 reconcileだけを再実行する場合:

```sh
bun run seed:local
```

R2 reconcileはloopback限定かつ起動ごとのtoken付きdev endpointを使います。endpointはOpenAPIへ掲載されず、remote/production bindingでは動きません。詳細は[認証付きfile storage](./file-storage-r2.md)を参照してください。

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

filtered Turbo commandはAPIに加えてlocal DB、migration/seed、local R2 reconcile、Mailpit、React Email preview、GitHub OAuth emulatorを起動します。`bun run --cwd apps/api dev`はWrangler/API processだけを起動するため、DB、Mailpit、GitHub OAuth emulatorがすでに動作している場合に限って使います。

## ローカルGitHub OAuth

rootの`bun run dev`では、APIがworktree-awareなemulator URLを受け取り、Better AuthのGitHub providerをlocal Generic OAuthへ切り替えます。sign-in画面のGitHub buttonから`oauth-alice`を選ぶと、実GitHubへ接続せずauthorize、callback、token、userinfo、session保存を確認できます。

このrepoの代表導線では、emulate標準userの並び順に依存せず、次の追加local fixtureを選びます。

- login: `oauth-alice`
- name: `OAuth Alice`
- email: `oauth-alice@example.test`

実GitHubのclient ID/secretは不要です。local `.env`に実credentialが残っていてもemulator modeでは読みません。別fixture credentialを試す場合だけ、`GITHUB_OAUTH_EMULATOR_CLIENT_ID`と`GITHUB_OAUTH_EMULATOR_CLIENT_SECRET`の両方を設定します。

Better Auth 1.6.9でemulatorへ登録するcallbackは`/auth/oauth2/callback/github`です。production built-in providerの`/auth/callback/github`とは異なります。emulatorのstateはmemoryだけにあり、完全にresetするときはroot devを停止して再起動します。production起動、remote URL、debug raw request logは起動時に拒否されます。

emulatorだけを調査するときは、callbackを解決できるAPI Portless aliasを先に用意してから次を実行します。

```sh
bun run --cwd apps/github-emulator dev
```

upstreamの`emulate --portless`は固定aliasをforce登録するため使いません。このrepoでは外側のPortlessがmain checkoutとlinked worktreeを分離します。

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
- GitHub OAuth user pickerが開かない: `portless get github.emulate.enterprise-agentic-saas`と`portless get api.enterprise-agentic-saas`を確認し、APIをpackage単体ではなくrootまたはfiltered Turboから起動する。callbackは`/auth/oauth2/callback/github`でなければならない。
- emulatorが起動を拒否する: `NODE_ENV=production`、remote URL、`DEBUG=1`、`EMULATE_DEBUG=1`をlocal shellへ残していないか確認する。実credentialをdebug logへ出す設定で回避しない。
- schema変更が見えない: `db:generate` 後のmigrationをcommitし、対象DBへ `db:migrate` を実行する。`push` で迂回しない。
- file fixtureが見えない: pre-file seed DBは非破壊seedの対象外なので、一度だけ`bun run dev:data:reset`を実行する。通常起動へresetを混ぜない。
- local upload/previewが再起動で消える: APIが`wrangler dev --local --persist-to apps/api/.wrangler/state`で起動しているか確認する。raw `wrangler dev`を別terminalで二重起動しない。
- R2 seedが拒否される: APIをPortless経由ではなくloopbackへ到達できるsupervisorから起動し、remote Turso、`NODE_ENV=production`、`wrangler --remote`を使っていないことを確認する。tokenやobject keyをlogへ出して回避しない。
- local previewとproductionの変換差: local Imagesは低忠実度なので、API contract testとは別の資格情報付きremote Images smokeで確認する。
- Spotlightにeventが出ない: `http://localhost:8969` が開けること、browser/server両方のSpotlight env、SDK initより前にerrorが起きていないことを確認する。
- `bun install`がsecurity scannerの5xxで止まる: scannerは意図的にfail-closed。恒久的に無効化せず、まず再試行する。localの一時回避条件とreleaseで禁止する理由は`developer-environment` skillを参照する。
