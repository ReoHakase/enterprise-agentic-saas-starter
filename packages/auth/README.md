# @enterprise-agentic-saas/auth

Better Auth による認証・認可パッケージ。

## Entrypoints

| import                                                | 内容                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `@enterprise-agentic-saas/auth`                       | singleton `auth` インスタンス（server-only）                                                 |
| `@enterprise-agentic-saas/auth/client`                | `authClient`（passkey、magic link、organization、multi-sessionを含むフロントエンド用client） |
| `@enterprise-agentic-saas/auth/mcp-oauth`             | MCP OAuth providerとaccess token検証（server-only）                                          |
| `@enterprise-agentic-saas/auth/mcp-oauth-credentials` | MCP OAuth credentialの一覧・revoke helper（server-only）                                     |

## Plugin 構成

- `magicLink` — マジックリンク認証
- `passkey` — WebAuthn/passkey 認証
- `organization` — マルチテナント組織管理
- `multiSession` — 同一browserで最大5 accountを保持し、再ログインなしで切り替える
- `openAPI` — auth OpenAPI schemaを`/auth/open-api/generate-schema`から生成する。既定reference pageは無効化し、`apps/api`のScalarから独立した仕様として参照する
- `oauthProvider` — MCP専用OAuth 2.1 Authorization Code + PKCE、dynamic public client登録、organization固定consent、opaque access token、refresh、即時revoke
- `socialProviders.github` — productionおよびemulator未使用時のGitHub OAuth sign-in / account linking
- `genericOAuth` — development/testで明示したlocal emulatorだけをGitHub providerとして登録

local emulator使用時も既存clientの `signIn.social({ provider: "github" })` と `linkSocial({ provider: "github" })` を維持する。Better Auth 1.6.9はgeneric providerをcore social providerへ注入するため、`genericOAuthClient` は追加しない。callbackだけがlocal emulator時は `/auth/oauth2/callback/github`、通常のbuilt-in GitHub providerでは従来どおり `/auth/callback/github` になる。built-in providerとgeneric providerは同時登録しない。

通常のsign-outは保持中のaccount sessionをすべてrevokeする。1つだけ外す場合はclientの `multiSession.revoke` を使う。organization所有権移管などの高リスク操作は15分以内に作成されたfresh sessionを要求する。

本番rate limitはTursoの `rateLimit` tableへ永続化し、Cloudflareが上書きする `cf-connecting-ip` のみをclient IPとして信頼する。magic link、account切替、organization招待はglobal limitより厳しい個別ruleを持つ。

PasskeyのRP IDは `TRUSTED_ORIGINS` 先頭のhostname、許可originは同配列全体から組み立てるため、local用hostnameをproductionへ持ち込まない。

Passkey登録は15分以内に作成されたfresh sessionを要求する。stale sessionはWebのstep-up導線で再認証し、`freshAge`や`registration.requireSession`を無効化しない。clientは`authenticatorAttachment`を固定せず、platform authenticatorと外付けsecurity keyの両方を許可する。

cross-subdomain cookieはproductionで `AUTH_COOKIE_DOMAIN` を必須とし、web/APIが共有する親domainを指定する。localの `.localhost` だけはweb hostnameへ自動fallbackする。cookieのSecure属性は `BETTER_AUTH_URL` のprotocolへ合わせ、productionはHTTPS以外を起動時に拒否する。これによりlocal HTTP E2EだけSecure属性を外せる。

Better Auth organization pluginは、招待送信者向けの`invite-member`と、招待受信者向けの
`get-invitation`、`list-user-invitations`、`accept-invitation`、`reject-invitation`を公開する。
招待は1回の送信につき1つのメールアドレスを受け取り、再送は標準の`resend`オプションを使う。期限内は同じIDを更新し、期限切れ後は古いrowを履歴として残して新しいIDを作る。
`organization`、`member`、`invitation`、`team`、`custom role`のほかの管理・参照エンドポイントは
`disabledPaths`で404にし、テナント境界、新しいセッション、確認入力、監査が必要な操作と招待の
一覧・取消は`apps/api`のルートへ集約する。

`auth.api.generateOpenAPISchema()`と標準`/auth/open-api/generate-schema`は、singletonの実plugin構成と
`disabledPaths`を正本にする。`apps/api`は生成結果を結合、変換、補正せず、Scalarから独立した情報源として
参照する。別の`/auth/reference`は404にする。

招待作成前とaccept直前のhookでroleを`admin | member`に限定し、移管専用の`owner`、legacy `super_admin`、null、未知roleを拒否する。membershipはDBのtenant/user複合一意制約でreplay・同時acceptによる重複を防ぐ。

新規sessionのactive organizationは、同じuserの最新かつ未失効でmembershipが有効なsession contextを継承する。履歴がなくmembershipが1件なら自動選択し、複数ならnullのままappの明示選択へ委ねる。

magic-link tokenとverification identifierはhashed保存する。Better Auth loggerはlibraryのmessage/error argsを記録せず固定metadataだけを出し、DB errorのSQL params、token、cookie、request bodyをlogへ流さない。

magic linkとemail verificationは共有React Email templateをrenderし、`@enterprise-agentic-saas/email/runtime`から送る。Cloudflare WorkerではBetter Authのbackground task handlerを`waitUntil`へ接続し、response完了後も配送promiseを生存させる。organization招待はBetter Authの`sendInvitationEmail`コールバックから同じemailパッケージを呼ぶ。配送失敗は固定内容だけを記録して招待作成を継続し、自動再試行や永続`outbox`は追加しない。

## 依存方向

- `packages/auth -> packages/db` — 許可
- `apps/api -> packages/auth` — 許可
- `apps/web -> packages/auth/client` — 許可
- `packages/db -> packages/auth` — **禁止**

## 環境変数

Better Auth が `process.env` から自動読み込みする。`apps/api/.env` に設定する。

| 変数                                  | 必須             | 説明                                                                                                                                          |
| ------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                  | Yes              | セッション署名用シークレット                                                                                                                  |
| `BETTER_AUTH_URL`                     | Yes              | Better Auth のベース URL                                                                                                                      |
| `AUTH_COOKIE_DOMAIN`                  | Production       | web/APIでsessionを共有する親domain                                                                                                            |
| `GITHUB_CLIENT_ID`                    | Emulator未使用時 | GitHub OAuth App の Client ID                                                                                                                 |
| `GITHUB_CLIENT_SECRET`                | Emulator未使用時 | GitHub OAuth App の Client Secret                                                                                                             |
| `GITHUB_OAUTH_EMULATOR_URL`           | No               | development/testだけで許可するemulatorのbase URL。認証情報を含まないloopback URLの`/emulate/github`だけを許可し、query、hash、末尾の`/`を拒否 |
| `GITHUB_OAUTH_EMULATOR_CLIENT_ID`     | No               | emulator専用Client ID override。Secretと必ず同時指定                                                                                          |
| `GITHUB_OAUTH_EMULATOR_CLIENT_SECRET` | No               | emulator専用Client Secret override。Client IDと必ず同時指定                                                                                   |
| `TRUSTED_ORIGINS`                     | Yes              | カンマ区切りの信頼するweb origin。先頭をmagic link・invitation callbackのweb originに使う                                                     |
| `EMAIL_PROVIDER`                      | No               | 未指定時はdevelopment=`mailpit`、test=`noop`、production=`cloudflare`                                                                         |
| `EMAIL_FROM`                          | Production       | local/testは`noreply@example.test`、本番はCloudflare Email Sendingで検証済みdomainのsender address                                            |
| `MAILPIT_URL`                         | No               | APIの`dev` scriptがPortlessのworktree-aware URLを注入。単体起動時はmain checkout URLへfallbackし、明示値もlocal HTTP(S)だけをsenderが許可     |

emulator URL指定時は通常の `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` を意図的に無視し、本番credentialをseedやlocal requestへ流さない。emulator専用overrideがなければpackage内部の固定値を使う。この値はlocal emulator識別用でありsecretではない。productionではemulator URLをfail-closedで拒否する。

emulator providerは `read:user` / `user:email`、PKCE、POST client authenticationを使用し、`/user` と `/user/emails` をValibotで検証する。primaryかつverifiedなemailを優先し、verified emailがなければsign-inを拒否する。token、provider response、raw errorはloggerへ渡さない。

## Auth Schema

core、passkey、organizationのschemaは`packages/db/src/schema/auth.generated.ts`にBetter Auth CLIで生成する（**手書き禁止**）。MCP OAuth Providerの4 tableは、CLIの全体再生成が既存のtenant固有複合・部分一意indexを除去するため、CLI出力と照合した`packages/db/src/schema/oauth-provider.ts`へ分離する。

plugin 構成を変更したら再生成する:

```sh
bunx @better-auth/cli generate \
  --config packages/auth/src/index.ts \
  --output /tmp/enterprise-agentic-saas-auth.generated.ts \
  --yes
rg -n '^export const oauth' \
  /tmp/enterprise-agentic-saas-auth.generated.ts \
  packages/db/src/schema/oauth-provider.ts
```

OAuth Providerのtable/field/index/FK差分だけを確認し、`auth.generated.ts`の既存tenant制約を上書きしない。schema変更後はappend-only migrationを生成し、fresh、upgrade、schema driftを検証する。

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
- organization招待用の独自`outbox`、自動再試行、配送処理ルート
- resource permission（app 側に寄せる）
- audit log（app 側に寄せる）
