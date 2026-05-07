# @enterprise-agentic-saas/email

React Email template、render helper、provider adapterを持つworkspace。

## 役割

- magic link と organization invitation のメール本文をReact Emailで定義する。
- `@react-email/render` でHTMLとplain textを生成する。
- console dev logger と noop test senderをprovider非依存interfaceへ揃える。

## 公開entrypoint

- `@enterprise-agentic-saas/email`: template、render helper、sender factory、型
- `@enterprise-agentic-saas/email/templates`: template componentとtemplate専用render helper

## 依存方向

- `apps/api` から参照される。
- `packages/auth` からは参照しない。auth packageにはcallback typeだけを渡す。
- `packages/email` から `apps/*`, `packages/auth`, `packages/db` へ依存しない。

## Env境界

このpackageはenvを直接読まない。local devではapp側が `createConsoleSender()` を選び、メール本文をconsoleへlogする。

## テスト

```sh
bun run test
```

template renderではHTMLとplain textを確認する。senderはconsole loggerのpayload境界とnoopの副作用なしを検証し、実メール送信は行わない。

## 入れてはいけないもの

- Better Auth factory
- Turso/Drizzle access
- API route
- app固有env parse
- raw token、DB URL、内部errorを本文へ出す処理
