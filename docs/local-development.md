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

上記はmain checkoutのbrowser URLです。linked worktreeではPortlessがworktree prefixを付けます。API supervisorは同じworktreeで起動したMailpit wrapperのprivate sessionを読み、workerdにはそのinstanceのdirect loopback HTTP URLを渡します。別worktreeの固定URLをlocal envへ複製しません。

`.env*` と `.dev.vars` の実値はcommitしません。共有するkeyだけを `.env.example` / `.dev.vars.example` に置きます。

`EMAIL_FROM`はlocal/testでは省略でき、省略時は配送不能な`noreply@example.test`へ安全にfallbackします。productionではCloudflare Email Sendingで検証済みsenderを必須にし、未設定のまま起動しません。

developmentではproviderとsender addressを既定で補い、Mailpit wrapperとAPI supervisorがlocal sessionで接続先を引き渡すため、通常はemail用envを追加しなくてもapplicationから送ったメールをMailpitで確認できます。別のlocal instanceへ向けるときだけAPIのlocal envで`MAILPIT_URL`を上書きします。React Email previewはtemplate単体の確認用、Mailpitは実際の送信導線の確認用です。

```dotenv
EMAIL_PROVIDER=mailpit
EMAIL_FROM=noreply@example.test
```

## 開発コマンド

日常の公開導線は次の4つです。production用seed commandは作りません。

| command | 用途 |
| --- | --- |
| `bun run dev` | Web、API、DB、R2、Mailpit等を起動し、migrationまで適用する |
| `bun run dev:db` | local Turso、migration、Drizzle Studioだけを起動する |
| `bun run dev:db:reset` | 停止中にlocal Tursoと対応するWrangler/R2 stateを削除する |
| `bun run dev:db:seed` | full devの有無にかかわらず任意のDB/R2 fixtureを投入する |

初回は `bun run dev` だけでmigration済みの空DBから通常のsignupとorganization作成を開始できます。固定のサンプルtenant、Issue、file fixtureを最初から使う場合は、先に`bun run dev:db:seed`、続けて`bun run dev`を実行します。seedはアプリ起動の前提ではありません。

`dev:db:*`はlocal application dataの準備・破棄をまとめる公開command群です。`bun run dev:db:seed`はDB rowだけでなく、metadataと対応するR2 objectも同時にreconcileします。rootの`seed` aliasやproduction用seed commandは作りません。

`bun run dev:db:seed`はhealthyなAPI dev sessionがあればそのWorkerを再利用します。full devが停止中ならlocal Tursoが停止中の場合だけ一時起動し、migrationを適用した後、`apps/api/.wrangler/state`を使うloopback限定Wranglerを一時起動します。DB seedとR2 reconcileの完了後はcommand自身が起動したprocessだけを停止し、既存processや永続化したDB/R2 stateには触れません。production、remote Turso、remote Workerは処理開始前に拒否します。

## DB開発環境

通常は後述のroot `bun run dev`だけを実行します。このcommandがDB workspaceの`dev`も含み、`with` 関係によりlocal Tursoの起動、保存済みmigrationの適用、Drizzle Studioの起動をまとめて行います。日常の起動にDB seed、R2 fixture reconcile、testは含めません。初回にapplicationを開く前に、DB taskのmigration完了logだけを待ちます。

DBだけを起動してschemaやdataを調査するときは、root `bun run dev`の代わりに次を実行します。

```sh
bun run dev:db
```

package directoryで `bun run dev` だけを実行するとTurboの `with` 関係が適用されず、local Tursoが起動しません。手動で分ける場合は、別terminalで `db:turso` を起動してから `db:bootstrap` を実行します。

DB-only taskとroot `bun run dev`は同時に起動しません。同じportとlocal DB processを二重に所有しようとして失敗します。

`db:bootstrap` はlocal URL確認、接続待機、`generate + migrate`までです。seedは実行しません。通常起動で既存データを追加・削除しない責務境界にしています。詳細は [Database lifecycle](./database-lifecycle.md) を参照してください。

## 開発サーバー

```sh
bun run dev
```

この1commandでWeb、local Wrangler API Worker、永続化local R2、local Turso、migration、Drizzle Studio、Mailpit、React Email preview、GitHub OAuth emulatorを起動します。DB seed、R2 fixture reconcile、testは実行しません。

Webは`next dev --turbopack`をそのまま起動するため、Next.jsのFast RefreshとTurbopackによる再buildを利用できます。APIは`wrangler.jsonc`のmainである`src/worker.ts`を`wrangler dev --local --persist-to apps/api/.wrangler/state`で直接watchし、source変更時にWranglerがrebundleしてWorker isolateを再起動します。Bunの状態保持型HMRではないためprocess内memoryは引き継ぎませんが、local Turso、R2、Mailpitはdiskへ永続化され、API reload後もdataを維持します。`src/dev.ts` supervisorや起動時envを変更した場合だけ`bun run dev`を再起動します。Next/OpenNextやWorkerのbuild済みJSを実行する構成ではありません。

Wranglerを既定経路にすることで、Elysia routeを編集しながら`FILES` R2、`IMAGES`、Workers Cache、`EMAIL` bindingを同じWorker runtimeで利用できます。通常のapplication emailはdevelopment providerのMailpitへ送り、magic link、verification、invitationを受信箱で確認します。workerdはPortlessの開発CAを信頼しないため、browserはPortless HTTPS、WorkerからMailpitへの送信だけはprivate sessionで渡すdirect loopback HTTPに分けます。API supervisorはsessionを読み、Mailpit `/api/v1/info` のreadinessを確認してからWranglerを起動します。`EMAIL_PROVIDER=cloudflare`を明示した場合だけlocal `EMAIL` binding simulationを通り、実配送はしません。共有設定に`remote: true`は置きません。

既存DBへmigrationだけを適用する場合はreset不要です。local dataとR2 stateを作り直す場合だけ、全dev serverを停止して次を実行します。

```sh
bun run dev:db:reset
# fixtureが必要な場合だけ:
bun run dev:db:seed
bun run dev
```

`dev:db:reset`は確認文字列を要求し、DB metadataとR2 objectの対応を壊さないようlocal Turso state、`apps/api/.wrangler/state`、staleなseed token/sessionを一緒に削除します。remote Turso URLとproductionでは最初に拒否します。非対話環境で明示実行する場合だけ`CONFIRM_DEV_DATA_RESET=reset-local-development`を付けます。seedは任意です。省略して`bun run dev`を起動するとmigration済みの空DBになり、`bun run dev`自身はseedやfixture reconcileを行いません。

既存dataへfixtureを追加するときも、次を明示実行します。full devは停止中でも起動中でも構いません。

```sh
bun run dev:db:seed
```

このcommandはlocal fixtureを作る明示的なprovisioning commandであり、test commandではありません。起動中のhealthyなWorkerがあれば再利用し、なければ必要なlocal TursoとWranglerだけを一時起動します。一時Wranglerも通常devと同じ永続R2 stateを使います。R2 reconcileはloopback限定かつ起動ごとのtoken付きdev endpointを使い、HTTP失敗は同じfixture位置で最大3回までretryし、前のfixtureから無限にやり直しません。endpointはOpenAPIへ掲載されず、remote/production bindingでは動きません。詳細は[認証付きfile storage](./file-storage-r2.md)を参照してください。

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

filtered Turbo commandはAPIに加えてlocal DB、migration、Mailpit、React Email preview、GitHub OAuth emulatorを起動します。seedとlocal R2 reconcileは行いません。`bun run --cwd apps/api dev`はWrangler/API processだけを起動するため、DB、Mailpit、GitHub OAuth emulatorがすでに動作している場合に限って使います。

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
- Mailpitが起動しない: `mailpit` が `PATH` にあるか確認する。Nix利用時はdev shellへ入り直し、main checkoutでは `https://mailpit.enterprise-agentic-saas.localhost`、linked worktreeでは `portless get mailpit.enterprise-agentic-saas` の出力を開く。APIだけをpackage単体で起動するときは、Mailpit dependencyを先に起動するか明示的なlocal `MAILPIT_URL`を渡す。
- Mailpitにメールが届かない: `NODE_ENV=development`であること、APIのlocal envが既定値を`console`等で上書きしていないことを確認する。通常のroot/filtered Turbo起動では `packages/email/.local/mailpit-session.json` が存在し、API起動時にdirect loopback endpointのreadinessが通る。React Email previewにはapplicationから送ったメールは保存されない。
- GitHub OAuth user pickerが開かない: `portless get github.emulate.enterprise-agentic-saas`と`portless get api.enterprise-agentic-saas`を確認し、APIをpackage単体ではなくrootまたはfiltered Turboから起動する。callbackは`/auth/oauth2/callback/github`でなければならない。
- emulatorが起動を拒否する: `NODE_ENV=production`、remote URL、`DEBUG=1`、`EMULATE_DEBUG=1`をlocal shellへ残していないか確認する。実credentialをdebug logへ出す設定で回避しない。
- schema変更が見えない: `db:generate` 後のmigrationをcommitし、対象DBへ `db:migrate` を実行する。`push` で迂回しない。
- file fixtureが見えない: `bun run dev`はfixtureを作らない。`bun run dev:db:seed`を実行する。完全に作り直す必要がある場合だけ、dev停止後に`bun run dev:db:reset` → 任意の`bun run dev:db:seed` → `bun run dev`の順にする。
- local upload/previewが再起動で消える: APIが`wrangler dev --local --persist-to apps/api/.wrangler/state`で起動しているか確認する。raw `wrangler dev`を別terminalで二重起動しない。
- seed後に一時processが残る: `bun run dev:db:seed`は自身が起動したTurso/Wranglerだけを停止する。別terminalの既存dev processは停止しないため、残っているprocessのownerと起動commandを確認する。永続化したDB/R2 stateが残るのは正常。
- R2 seedが拒否される: remote Turso、`NODE_ENV=production`、`wrangler --remote`を使っていないことを確認する。HTTP 5xxは同じfixtureで最大3回だけretryして終了するため、固定errorの原因を直して`bun run dev:db:seed`を明示再実行する。tokenやobject keyをlogへ出して回避しない。
- local previewとproductionの変換差: local Imagesは低忠実度なので、API contract testとは別の資格情報付きremote Images smokeで確認する。
- Spotlightにeventが出ない: `http://localhost:8969` が開けること、browser/server両方のSpotlight env、SDK initより前にerrorが起きていないことを確認する。
- `bun install`がsecurity scannerの5xxで止まる: scannerは意図的にfail-closed。恒久的に無効化せず、まず再試行する。localの一時回避条件とreleaseで禁止する理由は`developer-environment` skillを参照する。
