---
name: email
description: enterprise-agentic-saas-starterのpackages/email、React Email templates、@react-email/render、Resend/console/noop sender、SendEmail型、magic linkやinvitationのメール本文、email preview/test、auth packageとの依存境界を変更するときに使う。
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
      resend.ts
      console.ts
      noop.ts
    render.ts
    types.ts
    index.ts
```

## 依存境界

- `packages/email` はReact Emailとprovider SDKに依存してよい。
- `packages/auth -> packages/email` は原則避ける。
- `packages/auth` は `sendMagicLinkEmail` や `sendInvitationEmail` のcallback typeだけを受ける。
- `apps/api` が `packages/auth` と `packages/email` を組み合わせる。
- `packages/email` は `packages/auth` や `apps/api` に依存しない。

## 型

`SendEmail` はprovider非依存の最小interfaceにする。

```ts
export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendEmail = (input: SendEmailInput) => Promise<void>;
```

## React Email

- templateはReact Email componentとして `templates/` に置く。
- `@react-email/render` でhtmlとplain textの両方を生成する。
- magic link、organization invitation、verificationなど、Better Auth callbackから呼ばれるメールを最初に用意する。
- templateはproviderに依存させない。Resend固有処理はsender adapterへ置く。
- メール本文にsecret、raw token、内部error、DB情報を含めない。URLはアプリが発行した公開可能なlinkだけにする。

## sender adapter

- `senders/resend.ts`: production/staging用。
- `senders/console.ts`: local devで本文をconsoleへ出す。
- `senders/noop.ts`: testで送信副作用を避ける。
- app側でenvに応じてsenderを選ぶ。`packages/email` がenvを直接読まない。

## preview/test

- templateの見た目確認はReact Email previewまたはStorybook相当の軽い確認を検討する。
- render結果にsubject/text/htmlが揃うことをVitestで確認する。
- provider adapterはResend SDKをmockして、送信payloadだけを確認する。
- E2Eで実メール送信に依存しすぎない。magic linkはtest helperやmock inboxで扱う。

## 実装時の確認

- `packages/email` のpublic exportが `SendEmail`, `renderEmail`, templates, sender factoriesに整理されているか。
- `packages/auth` がtemplateやResendに直接依存していないか。
- `apps/api` がenvからsenderを構成し、auth callbackへ渡しているか。
- plain text fallbackがあるか。

具体的なtemplate、render helper、Resend sender例が必要なときだけ `references/email.md` を読む。
