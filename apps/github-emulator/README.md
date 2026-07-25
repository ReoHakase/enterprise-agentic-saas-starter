# GitHub OAuth emulator

`vercel-labs/emulate` のprogrammatic APIでGitHub OAuthをローカル再現する、
開発・E2E専用の実行workspaceです。本番runtimeやCloudflare Workerには含めません。

## 境界

- `emulate --portless` は使いません。aliasの所有とworktree分離は外側の
  `portless run`へ任せます。
- advertised URLとOAuth callbackは、`localhost`、`*.localhost`、
  `127.0.0.1`、`::1`だけを許可します。remote URLは起動前に拒否します。
- `NODE_ENV=production`では起動しません。`DEBUG=1|true`または
  `EMULATE_DEBUG=1|true`も、OAuth token requestのbodyをlogさせないため
  fail-fastします。
- `oauth_apps`を必ずseedし、client ID、client secret、redirect URIを厳格に
  検証させます。validation errorへcredential値は出しません。
- userとOAuth appは毎回同じ値から作ります。状態はmemory内だけにあり、
  process再起動が手動resetです。

## 起動

通常の開発起動ではrootのTurbo taskから呼ばれます。単独起動する場合:

```sh
bun run --cwd apps/github-emulator dev
```

固定HTTP URLで起動するE2Eなど、Portlessを使わない場合:

```sh
bun run --cwd apps/github-emulator dev:http
```

`dev`は同じworktreeのAPI originを`portless get`で解決してcallbackを作ります。
emulatorのURLは
`https://github.emulate.enterprise-agentic-saas.localhost`です。Portless自体と
aliasはpackage scriptの外側で管理し、emulator SDKにはadvertised URLだけを
渡します。

`emulate@0.9.0`のprogrammatic APIはlisten完了を待たずに返るため、launcherは
loopbackの`/meta`をbounded pollしてから起動完了を表示します。SDKのlistenerは
hostを指定できず全interfaceへbindする可能性があります。local machine以外から
到達できないnetwork境界でだけ利用してください。

## 環境変数

| 変数                                  | 必須              | 用途                                                                       |
| ------------------------------------- | ----------------- | -------------------------------------------------------------------------- |
| `GITHUB_OAUTH_CALLBACK_URL`           | `dev:http`のみYes | `/auth/oauth2/callback/github`を持つlocal API URL。`dev`はPortlessから補う |
| `GITHUB_OAUTH_EMULATOR_CLIENT_ID`     | No                | 注入されたlocal既定値を上書きするclient ID                                 |
| `GITHUB_OAUTH_EMULATOR_CLIENT_SECRET` | No                | 注入されたlocal既定値を上書きするclient secret                             |
| `GITHUB_OAUTH_EMULATOR_URL`           | No                | advertised local origin。`PORTLESS_URL`より優先                            |
| `PORTLESS_URL`                        | No                | `portless run`が注入するadvertised local origin                            |
| `PORT`                                | No                | listen port。既定値は`4001`                                                |

本番用`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`は読みません。専用credentialを
上書きする場合はclient IDとclient secretの両方を設定します。実GitHub OAuth
Appのsecretをseedやsourceへ保存しないでください。

## 検証

```sh
bun run --cwd apps/github-emulator lint
bun run --cwd apps/github-emulator typecheck
bun run --cwd apps/github-emulator test
```

unit testはenv境界、seed、shutdownを検証します。integration testは実際に
emulatorを起動し、登録済みclientだけがauthorization pageへ到達できることを
確認します。
