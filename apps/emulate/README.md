# Emulate

`vercel-labs/emulate` のプログラム用APIで外部サービスをローカル再現する、
開発・E2E専用の実行workspaceです。本番runtimeやCloudflare Workerには含めません。

対応サービスはGitHub、Google、Slack、Apple、Microsoft、Okta、Stripeです。
1つのprocessでは1サービスだけを起動します。

## 境界

- `emulate --portless` は使いません。aliasの所有とworktree分離は外側の
  `portless run`へ任せます。
- 公開用URLとGitHub OAuth callbackは、`localhost`、`*.localhost`、
  `127.0.0.1`、`::1`だけを許可します。remote URLは起動前に拒否します。
- `NODE_ENV=production`では起動しません。`DEBUG=1|true`または
  `EMULATE_DEBUG=1|true`も、認証requestのbodyをlogさせないため
  fail-fastします。
- GitHubは`oauth_apps`を必ずseedし、client ID、client secret、redirect URIを
  厳格に検証させます。validation errorへcredential値は出しません。
- Google、Slack、Apple、Microsoft、Okta、Stripeは、固定している
  `emulate@0.9.0`の既定fixtureを使います。
- 状態はmemory内だけにあり、process再起動またはプログラム用APIの`reset()`で
  初期状態へ戻ります。

## 起動

通常のroot開発起動では、既存のGitHub OAuth連携に必要なGitHubだけを起動します。
単独で同じ構成を起動する場合:

```sh
bun run --cwd apps/emulate dev
```

任意の対応サービスをPortless経由で起動する場合:

```sh
bun run --cwd apps/emulate dev:service google
```

固定HTTP URLで起動するE2Eなど、Portlessを使わない場合:

```sh
bun run --cwd apps/emulate dev:http github
bun run --cwd apps/emulate dev:http stripe
```

GitHubの`dev`と`dev:service`は、callbackが未指定なら同じworktreeのAPI originを
`portless get`で解決します。Portless URLは
`https://<service>.emulate.enterprise-agentic-saas.localhost`です。

`emulate@0.9.0`のプログラム用APIはlisten完了を待たずに返るため、launcherは
サービス固有のendpointをloopbackからbounded pollしてから起動完了を表示します。
SDKのlistenerはhostを指定できず全interfaceへbindする可能性があります。
local machine以外から到達できないnetwork境界でだけ利用してください。

## 環境変数

| 変数                                  | 必須          | 用途                                                                       |
| ------------------------------------- | ------------- | -------------------------------------------------------------------------- |
| `GITHUB_OAUTH_CALLBACK_URL`           | GitHubのみYes | `/auth/oauth2/callback/github`を持つlocal API URL。`dev`はPortlessから補う |
| `GITHUB_OAUTH_EMULATOR_CLIENT_ID`     | No            | 注入されたlocal既定値を上書きするclient ID                                 |
| `GITHUB_OAUTH_EMULATOR_CLIENT_SECRET` | No            | 注入されたlocal既定値を上書きするclient secret                             |
| `EMULATE_BASE_URL`                    | No            | 公開用local origin。`PORTLESS_URL`より優先                                 |
| `PORTLESS_URL`                        | No            | `portless run`が注入する公開用local origin                                 |
| `PORT`                                | No            | listen port。未指定時はサービス固有の既定port                              |

本番用`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`は読みません。専用credentialを
上書きする場合はclient IDとclient secretの両方を設定します。実GitHub OAuth
Appのsecretをseedやsourceへ保存しないでください。

## 検証

```sh
bun run --cwd apps/emulate lint
bun run --cwd apps/emulate typecheck
bun run --cwd apps/emulate test
```

unit testは環境変数境界、service registry、seed、shutdownを検証します。
integration testは7サービスを実際に起動し、GitHubについては登録済みclientだけが
authorization pageへ到達できることも確認します。
