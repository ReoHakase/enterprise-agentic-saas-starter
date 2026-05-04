---
name: auth-email
description: enterprise-agentic-saas-starterのBetter Auth、packages/auth、session、organization、role/permission、auth client、magic link/invitation callback、認証と認可境界、email packageとの接続境界を変更するときに使う。
---

# Auth And Email

このskillは認証、session、organization、auth callback、権限境界を変更するときに使う。React Email templateやResend adapterそのものは `email` skillを使う。

## 前提

- アプリ機能はtodoでも、設計対象はグループと権限設定を持つマルチテナントSaaS。
- Better Authはidentity/session/account linking/organizationの基盤。
- SaaS固有のresource permissionはapp側に寄せる。

## package境界

`packages/auth`:

- Better Auth factory
- session/account linking/passkey/magic link/OAuth
- organization membership
- coarse role/permission constants
- framework非依存のcallback type

`apps/api`:

- Elysia mount
- auth plugin
- email callback composition
- resource authorization
- audit log

## 依存方向

- `packages/auth -> packages/db` は許可。
- `apps/api -> packages/auth` は許可。
- `apps/web -> packages/auth/client` は許可。
- `packages/db -> packages/auth` は禁止。
- `packages/auth -> packages/email` は原則避ける。magic linkやinvitationの送信callbackをappから渡す。

## Better Auth

- singleton exportではなく `createAuth(options)` を優先する。
- Turso/libSQLなのでDrizzle adapterは `provider: "sqlite"`。
- auth migrationと主要auth flowはTurso環境で実検証する。
- `packages/auth/client` はserver-onlyな `createAuth()` とentrypointを分ける。
- magic linkやorganization invitationでは、`sendMagicLinkEmail` / `sendInvitationEmail` callbackを呼ぶだけにする。

## 認可

- identity/session/org membershipはauth。
- todo/project/group/billingなどresource permissionは `apps/api/modules/authorization` などapp側。
- audit logを意識し、permission deniedはE2EとAPI integrationで確認する。

具体的な `createAuth` やauth callback例が必要なときだけ `references/auth-email.md` を読む。React Email templateやsender例は `email` skillを読む。
