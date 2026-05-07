---
name: auth-email
description: enterprise-agentic-saas-starterのBetter Auth、packages/auth、session、organization、role/permission、auth client、magic link/invitation callback、認証と認可境界、email packageとの接続境界を変更するときに使う。
---

# Auth And Email

このskillは認証、session、organization、auth callback、権限境界を変更するときに使う。React Email templateやsender adapterそのものは `email` skillを使う。

## 前提

- アプリ機能はtodoでも、設計対象はグループと権限設定を持つマルチテナントSaaS。
- Better Authはidentity/session/account linking/organizationの基盤。
- SaaS固有のresource permissionはapp側に寄せる。

## package境界

`packages/auth`:

- Better Auth singleton（`export const auth`）
- session/account linking/magic link/OAuth
- organization membership
- env変数は `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS` を `process.env` から直接読む

`packages/auth/client`:

- `export const authClient` — フロントエンド用 Better Auth client
- magicLinkClient + organizationClient plugin

`apps/api`:

- Elysia mount（`auth.handler`）
- resource authorization
- audit log

## 依存方向

- `packages/auth -> packages/db` は許可。
- `apps/api -> packages/auth` は許可。
- `apps/web -> packages/auth/client` は許可。
- `packages/db -> packages/auth` は禁止。

## Better Auth

- singleton exportする。ファクトリは作らない。
- Turso/libSQLなのでDrizzle adapterは `provider: "sqlite"`。
- auth schemaは `packages/db/src/schema/auth.ts` に置き、Better Auth CLIで生成する（手書き禁止）。
- plugin構成を変えたら必ず再生成する:

```sh
bunx @better-auth/cli generate \
  --config packages/auth/src/index.ts \
  --output packages/db/src/schema/auth.ts \
  --yes
```

- `packages/auth/client` はserver-onlyな `auth` とentrypointを分ける。
- auth migrationと主要auth flowはTurso環境で実検証する。
- API hostを `api.enterprise-agentic-saas.localhost`、web hostを `enterprise-agentic-saas.localhost` に分ける場合、Better Authは `basePath: "/auth"` としてElysiaに `/auth/*` でmountする。`/api` prefixは使わない。
- web/API subdomain間でSSRとbrowser fetchのsession cookieを共有するため、Better Authでは `advanced.crossSubDomainCookies.enabled = true`、`domain = "enterprise-agentic-saas.localhost"`、`useSecureCookies = true` を設定する。`trustedOrigins` はweb originを明示する。
- `better-auth-ui` / Better Auth client の `baseURL` はAPI originにするが、magic link・verification・OAuth の `callbackURL` はweb originで作る。client componentでは `window.location.origin` と `redirectTo` から絶対URL化し、`api.enterprise-agentic-saas.localhost` へ戻さない。

## 認可

- identity/session/org membershipはauth。
- todo/project/group/billingなどresource permissionは `apps/api/modules/authorization` などapp側。
- audit logを意識し、permission deniedはE2EとAPI integrationで確認する。

## package品質

- `packages/auth/.oxlintrc.json` はserver/client entrypoint分離を前提にserver TypeScript向けへ寄せる。React/Browser系pluginは入れない。
- READMEには役割、公開entrypoint、依存方向、env境界、test方法、入れないものを書く。

具体的な auth singleton やclient例が必要なときだけ `references/auth-email.md` を読む。React Email templateやsender例は `email` skillを読む。
