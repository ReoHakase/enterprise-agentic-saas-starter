# Emulate

GitHub OAuthをローカル再現する、開発・E2E専用の小さなNext.js applicationです。
本番runtimeやCloudflare Workerには含めません。

## 実装境界

- `@emulators/adapter-next`の`createEmulateHandler`をNext.js Route Handlerからそのまま使います。
- 公開endpointは`/emulate/github/**`だけです。
- Route Handlerは`nodejs` runtimeで実行します。
- fixtureは`oauth-alice@example.test`と`oauth-bob@example.test`の2ユーザーです。
- 独自listener、service registry、config validator、shutdown処理、launcherは持ちません。
- aliasとworktree分離は外側の`portless-topology run`へ任せます。

## 起動

rootの通常起動は従来どおり`bun run dev`です。単独起動は次を使います。

```sh
bun run --cwd apps/emulate dev
```

Portlessを使わずloopbackで起動する場合は次を使います。

```sh
bun run --cwd apps/emulate dev:http
```

main checkoutのbrowser URLは
`https://github.emulate.enterprise-agentic-saas.localhost/emulate/github`です。
linked worktreeのoriginは`portless-topology resolve`で確認します。

## 検証

```sh
bun run --cwd apps/emulate lint
bun run --cwd apps/emulate typecheck
bun run --cwd apps/emulate test
bun run --cwd apps/emulate build
```

testはGitHub routeと、未登録serviceを公開しないことを検証します。
