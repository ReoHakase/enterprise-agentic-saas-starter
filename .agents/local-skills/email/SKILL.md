---
name: email
description: enterprise-agentic-saas-starterのpackages/email、React Email templates、@react-email/render、console/noop sender、SendEmail型、magic linkやinvitationのメール本文、email preview/test、auth packageとの依存境界を変更するときに使う。
---

# Email

このskillは `packages/email` とメール送信の実装を変更するときに使う。認証そのものは `auth-email`、メールtemplate/render/providerはこのskillの責務。

## package責務

`packages/email` はメールに関する実装を集約する。

```txt
packages/email/
  src/
    templates/
      magic-link.tsx
      organization-invitation.tsx
      verification.tsx
      index.ts
    senders/
      console.ts
      noop.ts
    render.ts
    types.ts
    index.ts
```

## 依存境界

- `packages/email` はReact Emailに依存してよい。初期導入では実メールprovider SDKは入れず、dev log用console senderとtest用noop senderだけを持つ。
- `packages/auth` と `apps/api` は `render*Email` と `SendEmail` を組み合わせてよい。`packages/email` は逆依存しない。

## 型

`SendEmail` はprovider非依存の最小interfaceにする。

```ts
export type RenderedEmail<P = unknown> = {
  subject: string;
  text: string;
  html: string;
  renderProps: P;
};

export type SendEmailInput = {
  to: string;
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
- `@react-email/render` でhtmlとplain textの両方を生成する。
- magic link、organization invitation、verificationなど、Better Auth callbackから呼ばれるメールを最初に用意する。
- templateはproviderに依存させない。
- メール本文にsecret、raw token、内部error、DB情報を含めない。URLはアプリが発行した公開可能なlinkだけにする。

## sender adapter

- `senders/console.ts`: local dev用。デフォルトは `text`/`html` 全文を出さず、`to`・`subject`・長さ・`renderProps` を出す（デバッグ向け、`renderProps` にtokenが含まれ得る）。注入 `logger` にはフルの `SendEmailInput` が渡る。
- `senders/noop.ts`: testで送信副作用を避ける。
- app/auth側でenvに応じてsenderを選ぶ。`packages/email` がenvを直接読まない。

## preview/test

- templateの見た目確認はReact Email previewまたはStorybook相当の軽い確認を検討する。
- render結果にsubject/text/htmlが揃うことをVitestで確認する。
- console senderはloggerを差し替えてpayload境界を確認する。
- E2Eで実メール送信に依存しすぎない。magic linkはtest helperやmock inboxで扱う。

## 実装時の確認

- `packages/email` のpublic exportが `SendEmail`, `renderEmail`, templates, sender factoriesに整理されているか。
- `render*Email` が `renderProps` を返し、送信側が `sendEmail({ to, ...rendered })` で揃っているか。
- `apps/api` / `packages/auth` がenvからsenderを選んでいるか。
- plain text fallbackがあるか。
- `packages/email/.oxlintrc.json` はReact Email template用に `react` / `react-perf` を使うが、Next/Tailwind/browser/jsx-a11y前提にしない。
- READMEには役割、公開entrypoint、依存方向、env境界、test方法、入れないものを書く。
- template renderとsender adapterのVitestを必ず置く。

具体的なtemplate、render helper、console sender例が必要なときだけ `references/email.md` を読む。
