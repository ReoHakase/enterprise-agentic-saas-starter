# @enterprise-agentic-saas/auth

Better Auth による認証・認可パッケージ。

## Entrypoints

| import | 内容 |
|---|---|
| `@enterprise-agentic-saas/auth` | singleton `auth` インスタンス（server-only） |
| `@enterprise-agentic-saas/auth/client` | `authClient`（passkey、magic link、organization、multi-sessionを含むフロントエンド用client） |

## Plugin 構成

- `magicLink` — マジックリンク認証
- `passkey` — WebAuthn/passkey 認証
- `organization` — マルチテナント組織管理
- `multiSession` — 同一browserで最大5 accountを保持し、再ログインなしで切り替える
- `openAPI` — `/auth/reference` でauth endpointのScalar referenceを公開する
- `socialProviders.github` — GitHub OAuth sign-in / account linking

通常のsign-outは保持中のaccount sessionをすべてrevokeする。1つだけ外す場合はclientの `multiSession.revoke` を使う。organization所有権移管などの高リスク操作は15分以内に作成されたfresh sessionを要求する。

本番rate limitはTursoの `rateLimit` tableへ永続化し、Cloudflareが上書きする `cf-connecting-ip` のみをclient IPとして信頼する。magic link、account切替、organization招待はglobal limitより厳しい個別ruleを持つ。

PasskeyのRP IDは `TRUSTED_ORIGINS` 先頭のhostname、許可originは同配列全体から組み立てるため、local用hostnameをproductionへ持ち込まない。

cross-subdomain cookieはproductionで `AUTH_COOKIE_DOMAIN` を必須とし、web/APIが共有する親domainを指定する。localの `.localhost` だけはweb hostnameへ自動fallbackする。

Better Auth organization pluginは招待recipient向けの `get-invitation`、`list-user-invitations`、`accept-invitation`、`reject-invitation` だけを公開する。organization/member/invitation/team/custom roleの管理・参照endpointは `disabledPaths` で404にし、tenant guard・fresh session・確認入力・auditを持つ `apps/api` のrouteへ集約する。

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
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App の Client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth App の Client Secret |
| `TRUSTED_ORIGINS` | Yes | カンマ区切りの信頼するweb origin。先頭をmagic link・invitation callbackのweb originに使う |
| `EMAIL_PROVIDER` | Yes | localは`console`、testは`noop`、Cloudflare Worker本番は`cloudflare` |
| `EMAIL_FROM` | Production | local/testは`noreply@example.test`、本番はCloudflare Email Sendingで検証済みdomainのsender address |

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

## 入れないもの

- `createAuth()` ファクトリ — singleton で十分
- React Email / email sender の直接 import
- resource permission（app 側に寄せる）
- audit log（app 側に寄せる）
