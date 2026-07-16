# @enterprise-agentic-saas/auth

Better Auth による認証・認可パッケージ。

## Entrypoints

| import | 内容 |
|---|---|
| `@enterprise-agentic-saas/auth` | singleton `auth` インスタンス（server-only） |
| `@enterprise-agentic-saas/auth/client` | `authClient`（passkey、magic link、organization、multi-sessionを含むフロントエンド用client） |
| `@enterprise-agentic-saas/auth/github-oauth` | local GitHub OAuth emulatorとAPIが共有するbrowser-safeな固定client credential |
| `@enterprise-agentic-saas/auth/openapi` | 実plugin構成からauth OpenAPIを生成するserver-only境界 |

## Plugin 構成

- `magicLink` — マジックリンク認証
- `passkey` — WebAuthn/passkey 認証
- `organization` — マルチテナント組織管理
- `multiSession` — 同一browserで最大5 accountを保持し、再ログインなしで切り替える
- `openAPI` — auth OpenAPI schemaを生成する。既定reference pageは無効化し、`apps/api`の`/openapi`へ統合する
- `socialProviders.github` — productionおよびemulator未使用時のGitHub OAuth sign-in / account linking
- `genericOAuth` — development/testで明示したlocal emulatorだけをGitHub providerとして登録

local emulator使用時も既存clientの `signIn.social({ provider: "github" })` と `linkSocial({ provider: "github" })` を維持する。Better Auth 1.6.9はgeneric providerをcore social providerへ注入するため、`genericOAuthClient` は追加しない。callbackだけがlocal emulator時は `/auth/oauth2/callback/github`、通常のbuilt-in GitHub providerでは従来どおり `/auth/callback/github` になる。built-in providerとgeneric providerは同時登録しない。

通常のsign-outは保持中のaccount sessionをすべてrevokeする。1つだけ外す場合はclientの `multiSession.revoke` を使う。organization所有権移管などの高リスク操作は15分以内に作成されたfresh sessionを要求する。

本番rate limitはTursoの `rateLimit` tableへ永続化し、Cloudflareが上書きする `cf-connecting-ip` のみをclient IPとして信頼する。magic link、account切替、organization招待はglobal limitより厳しい個別ruleを持つ。

PasskeyのRP IDは `TRUSTED_ORIGINS` 先頭のhostname、許可originは同配列全体から組み立てるため、local用hostnameをproductionへ持ち込まない。

Passkey登録は15分以内に作成されたfresh sessionを要求する。stale sessionはWebのstep-up導線で再認証し、`freshAge`や`registration.requireSession`を無効化しない。clientは`authenticatorAttachment`を固定せず、platform authenticatorと外付けsecurity keyの両方を許可する。

cross-subdomain cookieはproductionで `AUTH_COOKIE_DOMAIN` を必須とし、web/APIが共有する親domainを指定する。localの `.localhost` だけはweb hostnameへ自動fallbackする。cookieのSecure属性は `BETTER_AUTH_URL` のprotocolへ合わせ、productionはHTTPS以外を起動時に拒否する。これによりlocal HTTP E2EだけSecure属性を外せる。

Better Auth organization pluginは招待recipient向けの `get-invitation`、`list-user-invitations`、`accept-invitation`、`reject-invitation` だけを公開する。organization/member/invitation/team/custom roleの管理・参照endpointは `disabledPaths` で404にし、tenant guard・fresh session・確認入力・auditを持つ `apps/api` のrouteへ集約する。

`@enterprise-agentic-saas/auth/openapi`の`generateAuthOpenApiSchema()`はsingletonの実plugin構成と`disabledPaths`を正本にする。`apps/api`は結果へ`/auth` prefixを付け、app routeと同じ`/openapi/json`へ統合する。別の`/auth/reference`は404にし、documentationのdriftとScalar設定の二重管理を防ぐ。

招待accept直前のhookでもroleを `admin | member` に限定し、legacy `owner`、`super_admin`、null、未知roleを拒否する。membershipはDBのtenant/user複合一意制約でreplay・同時acceptによる重複を防ぐ。

新規sessionのactive organizationは、同じuserの最新かつ未失効でmembershipが有効なsession contextを継承する。履歴がなくmembershipが1件なら自動選択し、複数ならnullのままappの明示選択へ委ねる。

magic-link tokenとverification identifierはhashed保存する。Better Auth loggerはlibraryのmessage/error argsを記録せず固定metadataだけを出し、DB errorのSQL params、token、cookie、request bodyをlogへ流さない。

magic linkとemail verificationは共有React Email templateをrenderし、`@enterprise-agentic-saas/email/runtime`から送る。Cloudflare WorkerではBetter Authのbackground task handlerを`waitUntil`へ接続し、response完了後も配送promiseを生存させる。organization招待の作成・送信はtenant guardとauditを持つ`apps/api`だけを正本とし、Better Auth側に別の招待senderを重ねない。

## 依存方向

- `packages/auth -> packages/db` — 許可
- `apps/api -> packages/auth` — 許可
- `apps/web -> packages/auth/client` — 許可
- `packages/db -> packages/auth` — **禁止**

## 環境変数

Better Auth が `process.env` から自動読み込みする。`apps/api/.env` に設定する。

| 変数 | 必須 | 説明 |
|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | セッション署名用シークレット |
| `BETTER_AUTH_URL` | Yes | Better Auth のベース URL |
| `AUTH_COOKIE_DOMAIN` | Production | web/APIでsessionを共有する親domain |
| `GITHUB_CLIENT_ID` | Emulator未使用時 | GitHub OAuth App の Client ID |
| `GITHUB_CLIENT_SECRET` | Emulator未使用時 | GitHub OAuth App の Client Secret |
| `GITHUB_OAUTH_EMULATOR_URL` | No | development/testだけで許可するemulatorのroot URL。`localhost`、`*.localhost`、IPv4/IPv6 loopback以外、userinfo/path/query/hash付きURLを拒否 |
| `GITHUB_OAUTH_EMULATOR_CLIENT_ID` | No | emulator専用Client ID override。Secretと必ず同時指定 |
| `GITHUB_OAUTH_EMULATOR_CLIENT_SECRET` | No | emulator専用Client Secret override。Client IDと必ず同時指定 |
| `TRUSTED_ORIGINS` | Yes | カンマ区切りの信頼するweb origin。先頭をmagic link・invitation callbackのweb originに使う |
| `EMAIL_PROVIDER` | No | 未指定時はdevelopment=`mailpit`、test=`noop`、production=`cloudflare` |
| `EMAIL_FROM` | Production | local/testは`noreply@example.test`、本番はCloudflare Email Sendingで検証済みdomainのsender address |
| `MAILPIT_URL` | No | APIの`dev` scriptがPortlessのworktree-aware URLを注入。単体起動時はmain checkout URLへfallbackし、明示値もlocal HTTP(S)だけをsenderが許可 |

emulator URL指定時は通常の `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` を意図的に無視し、本番credentialをseedやlocal requestへ流さない。emulator専用overrideがなければ `@enterprise-agentic-saas/auth/github-oauth` の公開固定値を使う。この値はlocal emulator識別用でありsecretではない。productionではemulator URLをfail-closedで拒否する。

emulator providerは `read:user` / `user:email`、PKCE、POST client authenticationを使用し、`/user` と `/user/emails` をValibotで検証する。primaryかつverifiedなemailを優先し、verified emailがなければsign-inを拒否する。token、provider response、raw errorはloggerへ渡さない。

## Auth Schema

`packages/db/src/schema/auth.generated.ts` に Better Auth CLI で生成する（**手書き禁止**）。

plugin 構成を変更したら再生成する:

```sh
bunx @better-auth/cli generate \
  --config packages/auth/src/index.ts \
  --output packages/db/src/schema/auth.generated.ts \
  --yes
```

## apps/api での mount

```ts
import { auth } from "@enterprise-agentic-saas/auth"
// Elysia で mount
app.mount(auth.handler)
```

## Test

```sh
bun run --cwd packages/auth typecheck
bun run --cwd packages/auth lint
bun run --cwd packages/auth test
```

unit testはemulator URL・credential境界・profile mapping・非漏洩を検証する。integration testはBetter Authのcore `signIn.social` / `linkSocial` がgeneric GitHub providerへ解決され、callbackが `/auth/oauth2/callback/github` になることを実際のhandlerで検証する。

## 入れないもの

- `createAuth()` ファクトリ — singleton で十分
- React Email / email sender の直接 import
- resource permission（app 側に寄せる）
- audit log（app 側に寄せる）
