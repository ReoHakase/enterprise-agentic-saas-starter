---
name: email
description: enterprise-agentic-saas-starterのpackages/email、React Email templates、Cloudflare Email Sending、Mailpit、console/noop sender、SendEmail型、magic linkやinvitationのメール本文、email preview/test、auth packageとの依存境界を変更するときに使う。
---

# Email

このskillは `packages/email` とメール送信の実装を変更するときに使う。認証そのものは `auth-email`、メールtemplate/render/providerはこのskillの責務。

## package責務

`packages/email` はメールに関する実装を集約する。

```txt
packages/email/
  src/
    components/
      app-email.tsx    # web app準拠のbrand shell、CTA、fallback URL、security note
    templates/
      magic-link.tsx
      organization-invitation.tsx
      verification.tsx
      index.ts
    senders/
      cloudflare.ts
      console.ts
      mailpit.ts
      noop.ts
    runtime/
      default.ts       # Bun/Node: Mailpit/console/noop
      workerd.ts       # Cloudflare EMAIL binding + waitUntil
    render.ts
    types.ts
    index.ts
```

## 依存境界

- `packages/email` はReact Emailに依存してよい。Cloudflare Emailはprovider SDKを追加せず、Workers structured Email bindingの最小structural typeへ依存する。
- `packages/auth` と `apps/api` は `render*Email`、`SendEmail`、`@enterprise-agentic-saas/email/runtime` を組み合わせてよい。`packages/email` は逆依存しない。
- package exportの`workerd` conditionだけが`cloudflare:workers`をimportする。Bun/Nodeのtypecheck/testからWorker globalを参照しない。

## 型

`SendEmail` はprovider非依存の最小interfaceにする。

```ts
export type RenderedEmail<P = unknown> = {
  template: EmailTemplate;
  subject: string;
  text: string;
  html: string;
  renderProps: P;
};

export type SendEmailInput = {
  to: string;
  template: EmailTemplate;
  subject: string;
  text: string;
  html?: string;
  renderProps?: unknown;
};

export type SendEmail = (input: SendEmailInput) => Promise<void>;
```

- 各 `render*Email` は入力propsを `renderProps` として返す。送信は `sendEmail({ to, ...rendered })` でよい。

## React Email

- templateはReact Email componentとして `templates/` に置く。
- transactional emailは `components/app-email.tsx` の共有shellを使い、brand、heading hierarchy、CTA、copy可能なfallback URL、security note、footerを揃える。各templateで独自の見た目を作らない。
- `@react-email/render` でhtmlとplain textの両方を生成する。
- magic link、organization invitation、verificationなど、Better Auth callbackから呼ばれるメールを最初に用意する。
- templateはproviderに依存させない。
- メール本文にsecret、raw token、内部error、DB情報を含めない。URLはアプリが発行した公開可能なlinkだけにする。

## sender adapter

- `senders/console.ts`: local dev専用。`text` / `html` / subject / recipient全文 / `renderProps` / 本文長 / prop keyを一切logへ出さず、templateとrecipient domainだけを渡す。subjectにはorganization名等が入るため、localでもtelemetry metadataに含めない。注入loggerにもsanitized eventしか渡さない。
- `senders/mailpit.ts`: local development専用。接続先はloopbackまたは`localhost` / `*.localhost`のHTTP(S)だけを許可し、`POST /api/v1/send`へ`From`、`To`、`Subject`、`Text`、任意`HTML`、template `Tags`だけを渡す。`renderProps`、raw response、provider raw errorを保持せず、timeoutとsanitized error codeを持つ。
- `senders/noop.ts`: testで送信副作用を避ける。
- `senders/cloudflare.ts`: `EMAIL.send()`へ`to/from/subject/text/html`だけを渡す。`renderProps`はtransportへ渡さず、errorはCloudflare codeと明示retry allowlistを持つsanitized `EmailDeliveryError`へ変換する。
- `createRuntimeEmailSender`: app/auth側から検証済みのprovider/runtime/from/Mailpit URLを受け取る。workerd productionでは`EMAIL_PROVIDER=cloudflare`と`EMAIL` bindingを必須にし、productionのMailpit/consoleをfail-closedにする。
- `@enterprise-agentic-saas/email/config`のresolverは未指定providerをdevelopment=`mailpit`、test=`noop`、production=`cloudflare`へ揃える。API dev scriptは`portless get`でworktree-awareなMailpit URLを注入し、resolverの固定URLはPortlessを介さない単体起動用fallbackに限定する。`resolveEmailFrom`はlocal/testで未設定のときだけ配送不能な`noreply@example.test`を返し、本番は`undefined`を返してenv validationを失敗させる。`apps/api`と`packages/auth`で独自fallbackを二重実装せず、envだけのimportでtemplate runtimeを読み込まない。
- Better Authのbackground taskはworkerd entrypointが公開する`waitUntil` handlerへ接続する。organization invitationはapp APIのtransaction/audit境界を維持するためAPI側senderを正本にする。
- app/auth側でenvに応じてsenderを選ぶ。`packages/email` がenvを直接読まない。

## preview/test

- templateの見た目確認はReact Email previewまたはStorybook相当の軽い確認を検討する。
- render結果にsubject/text/htmlが揃うことをVitestで確認する。
- console senderはloggerを差し替え、URL/token/recipient全文がeventへ入らないことを確認する。
- Mailpit senderはpayload field allowlist、local URL/credential/runtime拒否、timeout、response body/raw error非保持、retry分類を確認する。
- Cloudflare senderはbinding payloadのfield allowlist、provider raw message非出力、retry分類、不正addressの送信前拒否を確認する。
- `wrangler dev`のEmail bindingは既定でlocal simulationする。`remote: true`は実配送なので共有設定へ安易に入れない。
- E2Eで実メール送信に依存しすぎない。magic linkはtest helperやmock inboxで扱う。

## 実装時の確認

- `packages/email` のpublic exportが `SendEmail`, `renderEmail`, templates, sender factoriesに整理されているか。
- `render*Email` が `renderProps` を返し、送信側が `sendEmail({ to, ...rendered })` で揃っているか。
- `apps/api` / `packages/auth` がenvからsenderを選んでいるか。
- productionでMailpit/console senderが選択されるとfail-closedになるか。
- plain text fallbackがあるか。
- `packages/email/.oxlintrc.json` はReact Email template用に `react` / `react-perf` を使うが、Next/Tailwind/browser/jsx-a11y前提にしない。
- READMEには役割、公開entrypoint、依存方向、env境界、test方法、入れないものを書く。
- template renderとsender adapterのVitestを必ず置く。

具体的なtemplate、render helper、console sender例が必要なときだけ `references/email.md` を読む。
