# @enterprise-agentic-saas/email

React Email template、render helper、provider adapterを持つworkspace。

## 役割

- web appと同じbrand hierarchyを持つ共有shellでmagic link、organization invitation、email verificationを定義する。
- `@react-email/render` でHTMLとplain textを生成する。
- Cloudflare Email Sending、console dev logger、noop test senderをprovider非依存interfaceへ揃える。

## 公開entrypoint

- `@enterprise-agentic-saas/email`: template、render helper、sender factory、型
- `@enterprise-agentic-saas/email/templates`: template componentとtemplate専用render helper
- `@enterprise-agentic-saas/email/runtime`: runtimeに応じたsender。Wranglerの`workerd` conditionではEmail binding、通常のBun/Nodeではconsole/noopを選ぶ

## 依存方向

- `apps/api` から参照される。
- `packages/auth` からrender helperとsender interfaceを参照する。
- `packages/email` から `apps/*`, `packages/auth`, `packages/db` へ依存しない。

## Env境界

transport本体はenvを直接読まない。呼び出し側は検証済みのprovider/runtime/fromを `createRuntimeEmailSender()` へ渡す。`workerd` entrypointだけがCloudflareの `EMAIL` bindingを解決するため、Bunのunit testやpackage import時にWorker globalへ依存しない。

すべての送信inputは固定の`template`識別子を持つ。Cloudflareへ渡すのは`to`、`from`、`subject`、`text`、`html`だけで、tokenを含み得る`renderProps`はtransport payloadや観測eventへ渡さない。accepted/failed eventもtemplate、recipient domain、provider code、retry可否、message IDに限定する。

console senderはlocal dev専用で、recipient domain、subject、本文長、template propのkey名だけをlogへ出す。`text`、`html`、recipient全文、`renderProps` の値はloggerへも渡さない。

`EMAIL_PROVIDER=console` とproductionの組合せは起動時に拒否する。Cloudflare Workerのproductionは`EMAIL_PROVIDER=cloudflare`と`EMAIL` bindingを必須にする。`noop` はtestまたは配送を意図的に無効化する検証環境だけで選ぶ。ローカルの`wrangler dev`ではCloudflareが送信を模擬し、実配送はremote runtimeで確認する。

## テスト

```sh
bun run test
```

template renderでは共有brand shell、CTA、fallback URL、HTML・plain text・`renderProps` を確認する。senderはCloudflareへ渡すfield allowlist、sanitized metadata、URL/token非出力、error codeのretry分類、production consoleのfail-closed、noopの副作用なしを検証し、実メール送信は行わない。

## 入れてはいけないもの

- Better Auth factory
- Turso/Drizzle access
- API route
- app固有env parse
- raw token、DB URL、内部errorを本文へ出す処理
