# @enterprise-agentic-saas/email

React Email template、render helper、provider adapterを持つworkspace。

## 役割

- web appと同じbrand hierarchyを持つ共有shellでmagic link、organization invitation、email verificationを定義する。
- `@react-email/render` でHTMLとplain textを生成する。
- Cloudflare Email Sending、Mailpit local inbox、console dev logger、noop test senderをprovider非依存interfaceへ揃える。

## 公開entrypoint

- `@enterprise-agentic-saas/email`: template、render helper、sender factory、型
- `@enterprise-agentic-saas/email/templates`: template componentとtemplate専用render helper
- `@enterprise-agentic-saas/email/runtime`: runtimeに応じたsender。Wranglerの`workerd` conditionではEmail binding、通常のBun/NodeではMailpit/console/noopを選ぶ
- `@enterprise-agentic-saas/email/development`: Mailpit wrapperとAPI supervisor間のlocal session読取helper。development processだけで使う

## 依存方向

- `apps/api` から参照される。
- `packages/auth` からrender helperとsender interfaceを参照する。
- `packages/email` から `apps/*`, `packages/auth`, `packages/db` へ依存しない。

## Env境界

transport本体はenvを直接読まない。呼び出し側は検証済みのprovider/runtime/fromを `createRuntimeEmailSender()` へ渡す。`workerd` entrypointだけがCloudflareの `EMAIL` bindingを解決するため、Bunのunit testやpackage import時にWorker globalへ依存しない。

未指定時のproviderは `resolveEmailProvider()` でdevelopment=`mailpit`、test=`noop`、production=`cloudflare`に解決する。Mailpit wrapperはPortlessから割り当てられた同じinstanceのdirect loopback HTTP URLをprivate sessionへ書き、API supervisorがreadiness確認後に`MAILPIT_URL`へ注入する。ブラウザUIは引き続きworktree-awareなPortless HTTPSを使う。`resolveMailpitUrl()` のmain checkout URLはpackage単体起動用fallbackであり、linked worktreeの固定URLとしてenvへ保存しない。明示値はtrimだけ行い、呼び出し側のValibot schemaで検証する。

すべての送信inputは固定の`template`識別子を持つ。Cloudflareへ渡すのは`to`、`from`、`subject`、`text`、`html`だけで、tokenを含み得る`renderProps`はtransport payloadや観測eventへ渡さない。accepted/failed eventもtemplate、recipient domain、provider code、retry可否、message IDに限定する。

Mailpit senderはdevelopment専用で、接続先をloopback（`127.0.0.0/8`、`::1`）または `localhost` / `*.localhost` のHTTP(S) URLへ限定する。`POST /api/v1/send` へ渡すfieldは `From`、`To`、`Subject`、`Text`、任意の`HTML`、template識別用`Tags`だけで、`renderProps`は渡さない。Workersで未対応の`redirect: "error"`は使わず`manual`にし、local URL guardの外へredirectを追従しない。response bodyとproviderのraw errorは読み取らず、安全なcode、retry可否、HTTP statusだけを持つerrorへ変換する。requestは5秒でtimeoutする。

console senderはlocal dev専用で、templateとrecipient domainだけをlogへ出す。`subject`、`text`、`html`、recipient全文、`renderProps` の値はloggerへも渡さない。

`EMAIL_PROVIDER=mailpit` はdevelopment以外で拒否し、`EMAIL_PROVIDER=console` とproductionの組合せも起動時に拒否する。Cloudflare Workerのproductionは`EMAIL_PROVIDER=cloudflare`と`EMAIL` bindingを必須にする。`noop` はtestまたは配送を意図的に無効化する検証環境だけで選ぶ。ローカルの`wrangler dev`ではCloudflareが送信を模擬し、実配送はremote runtimeで確認する。

## ローカルinbox

rootの `bun run dev` でMailpitも起動し、main checkoutでは `https://mailpit.enterprise-agentic-saas.localhost` から送信結果を確認できる。linked worktreeの実効URLは `bun run portless-topology resolve mailpit.enterprise-agentic-saas` で確認する。workerdはPortlessの開発CAを信頼しないため、application送信には起動ごとの `packages/email/.local/mailpit-session.json` が示すdirect loopback HTTPを使う。このsessionはmodeと十分長いtokenを持ち、directory/file permissionを制限し、終了時cleanupはtoken一致時だけ行う。保存先は `packages/email/.local/mailpit.db` で、Mailpit UIの削除操作またはpackageの `bun run mailpit:reset` で手動resetする。React Email template previewもlinked worktreeでは同じnamespaceを使う。

## テスト

```sh
bun run test
```

template renderでは共有brand shell、CTA、fallback URL、HTML・plain text・`renderProps` を確認する。senderはCloudflare/Mailpitへ渡すfield allowlist、Mailpitのlocal URL境界、sanitized error、URL/token非出力、error codeのretry分類、production consoleのfail-closed、noopの副作用なしを検証し、実メール送信は行わない。

## 入れてはいけないもの

- Better Auth factory
- Turso/Drizzle access
- API route
- app固有env parse
- raw token、DB URL、内部errorを本文へ出す処理
