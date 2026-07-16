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
- passkeyClient + magicLinkClient + multiSessionClient + organizationClient plugin

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
- auth schemaは `packages/db/src/schema/auth.generated.ts` に置き、Better Auth CLIで生成する（手書き禁止）。
- plugin構成を変えたら必ず再生成する:

```sh
bunx @better-auth/cli generate \
  --config packages/auth/src/index.ts \
  --output packages/db/src/schema/auth.generated.ts \
  --yes
```

- `packages/auth/client` はserver-onlyな `auth` とentrypointを分ける。
- auth migrationと主要auth flowはTurso環境で実検証する。
- API hostを `api.enterprise-agentic-saas.localhost`、web hostを `enterprise-agentic-saas.localhost` に分ける場合、Better Authは `basePath: "/auth"` としてElysiaに `/auth/*` でmountする。`/api` prefixは使わない。
- web/API subdomain間でSSRとbrowser fetchのsession cookieを共有するため、Better Authでは `advanced.crossSubDomainCookies.enabled = true`、`domain = "enterprise-agentic-saas.localhost"`、`useSecureCookies = true` を設定する。`trustedOrigins` はweb originを明示する。
- `better-auth-ui` / Better Auth client の `baseURL` はAPI originにするが、magic link・verification・OAuth の `callbackURL` はweb originで作る。client componentでは `window.location.origin` と `redirectTo` から絶対URL化し、`api.enterprise-agentic-saas.localhost` へ戻さない。server側invitation URLは必須 `TRUSTED_ORIGINS` の先頭web origin + `/invitations/:id` で作り、`BETTER_AUTH_URL`（API origin）へ向けない。
- magic link、email verification、organization invitationは `@enterprise-agentic-saas/email/runtime` の `createRuntimeEmailSender` で統一する。workerd exportはCloudflare `EMAIL` binding、default exportはMailpit/console/noopを使う。既定providerはdevelopment=`mailpit`、test=`noop`、production=`cloudflare`とし、productionのMailpit/consoleはfail-closedにする。API dev scriptがPortlessのworktree-aware `MAILPIT_URL`を注入するため、auth側で固定URLや別resolverを持たない。
- Better Authの`advanced.backgroundTasks.handler`はworkerdでだけ`waitUntil`へ接続する。console logへraw URL/tokenやrecipient全文を出さない。
- organization招待の作成・送信はtenant guard/auditを持つ`apps/api`だけを正本にする。Better Auth organization pluginへ別の`sendInvitationEmail`を設定して二重配送経路を作らない。
- email送信eventはtemplate/domain/message ID/error code/retryableだけを許可し、magic link、verification URL、招待URL、recipient全文、HTML/text、provider raw errorをauth loggerやSentryへ渡さない。
- 複数account切替はBetter Auth公式の `multiSession` / `multiSessionClient` をserver/clientの両方に入れる。同一browserでは最大5 accountとし、`listDeviceSessions` / `setActive` / `revoke` を使う。通常の `signOut` は保持中accountをすべてrevokeするため、個別削除と区別する。
- `better-auth-ui` の `useAuth().authClient` は通常objectに見えてもfunction/proxyになり得る。client capability検出を `typeof value === "object"` だけに限定せず、object/functionのproperty containerからmethodをbindする。`listDeviceSessions` のresponseはcastや手書きtype guardで通さず、`apps/web`ローカルのValibot schemaで検証してからaccount switcherへ渡す。
- Better Auth core/plugin endpointの仕様は`openAPI({ disableDefaultReference: true })`と`auth.api.generateOpenAPISchema()`を使う。`@enterprise-agentic-saas/auth/openapi`をserver-only exportにし、apps/apiが`/auth` prefixを付けて統合Scalar `/openapi`へ掲載する。`/auth/reference`は404にし、別のScalar設定やdocumentation正本を持たない。
- Better Auth client/provider errorはWeb-local Valibotでstable codeだけを抽出し、明示したcode allowlistを固定文言へ対応付ける。未知code、providerのraw `message`、nested causeはtoast/formへ出さず、sign-in・sign-out・passkey等の操作別fallbackを表示する。
- auth errorの表示ownerは操作componentかglobal ownerの一方に限定し、同じ失敗を二重toastしない。QueryClientのdefault handlerをmount後のeffectで差し替えてprovider errorを拾う設計にはしない。
- Cloudflare Workersではin-memory rate limitを使わず、Better Authの `rateLimit.storage = "database"` でTursoへ永続化する。本番のclient IPはCloudflareが上書きする `cf-connecting-ip` だけを信頼し、magic link・multi-session切替・招待には個別ruleを置く。rate limit導入後はauth schemaを再生成し、`rateLimit` tableのmigrationを保存する。
- Passkeyの `rpID` をlocal hostnameへhardcodeしない。必須 `TRUSTED_ORIGINS` 先頭のhostnameをRP ID、配列全体をpasskey verificationの許可originに使い、deploy先でも一致させる。
- Passkey登録の `generate-register-options` と `verify-registration` はBetter Authのfresh session境界を維持する。`SESSION_NOT_FRESH`では15分制限や`registration.requireSession`を緩めず、固定文言のstep-up dialogから新しいsign-in sessionを作り、同一tabの`sessionStorage`に保存したallowlist済みactionだけを1回consumeして登録を再開する。provider raw messageは保存・表示しない。
- `addPasskey`で`authenticatorAttachment: "platform"`を固定しない。platform biometric、PIN、外付けsecurity keyを同じ導線で許可し、実error code `ERROR_CEREMONY_ABORTED` / `ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED`だけをWeb-local Valibot allowlistで安全な文言へ対応付ける。
- GitHub OAuthのproductionはBetter Auth built-in providerを維持する。`GITHUB_OAUTH_EMULATOR_URL`が設定されたdevelopment/testだけ、同じ`providerId = "github"`の`genericOAuth`へ切り替え、built-inと同時登録しない。productionでemulator URLがあれば起動時に拒否する。
- emulator URLはlocalhost、loopback、`*.localhost`のoriginだけを許可し、credential、path、query、hashを拒否する。emulator modeでは`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`を読まず、公開して問題ない固定fixtureまたは専用`GITHUB_OAUTH_EMULATOR_CLIENT_ID` / `GITHUB_OAUTH_EMULATOR_CLIENT_SECRET`を使う。local `.env`の実GitHub secretをseedへ流さない。
- Better Auth 1.6.9のGeneric OAuth callbackは`/auth/oauth2/callback/github`、production built-in callbackは`/auth/callback/github`。Generic OAuthはemulatorのauthorize/token/user/email endpointだけへ向け、GitHub形式のprofileとverified primary emailをValibotでparseして`id/name/email/image/emailVerified`へ正規化する。raw profile、code、token、provider errorをlogしない。
- local Generic OAuthでも現行UIの`signIn.social({ provider: "github" })`と`linkSocial`が同じproviderへ到達することをintegration testで固定する。これはBetter Auth 1.6.9のprovider injectionに依存するため、library upgrade時はcallback pathとclient methodを同時に再確認する。
- cross-subdomain cookie domainもlocal hostnameへhardcodeしない。productionでは `AUTH_COOKIE_DOMAIN` にweb/API共通の親domainを必須指定する。`.localhost` 開発だけはweb hostnameへfallbackしてよい。
- `advanced.useSecureCookies`は`BETTER_AUTH_URL`のprotocolに合わせる。productionはHTTPS以外を起動時に拒否し、Portless HTTPSではSecureを維持する。isolated HTTP OAuth E2EだけはSecure=falseとなるが、HttpOnly、SameSite、共有domainの回帰確認を行う。
- organization所有権移管などの高リスク操作は `session.freshAge = 15分` とし、app側APIもsessionの `createdAt` を使って同じstep-up境界を強制する。UIの確認modalだけを認可境界にしない。
- app側の `step_up_required` は403とし、public contextに `action`, `maxAgeSeconds`, `reason` を返す。専用の疑似reauth tokenは作らず、passkey・magic link等で新しいBetter Auth sessionを作ってからmutationをretryする。
- 新規sessionの `activeOrganizationId` は、同じuserの未失効sessionで使われた最新のorganizationをmembership付きで再検証して継承する。該当contextがなくmembershipが1件だけなら自動選択し、複数ならnullのまま明示選択を要求する。`/me` は同じ規則でstale/null contextをtransaction内で永続修復し、表示だけのfallbackをactive扱いしない。
- member削除transactionでは、削除されたuserが当該organizationをactiveにしている全sessionも、残る最新valid context、単一membership、nullの順でreconcileする。membership削除後にsessionだけを旧tenantへ残さない。
- organization削除は専用guardとserviceの両方で`super_admin`・active organization・fresh sessionを検証し、bodyのslug完全一致、`confirmation = "DELETE"`、16〜128文字のopaqueな冪等性keyを必須にする。通常の汎用tenant guardへ削除後replayの例外を混ぜない。
- organization削除transactionは `(requested_by_user_id, idempotency_key)` の既存jobを最初に確認し、同じorganizationなら同じreceipt、別organizationなら409にする。新規削除ではactor membershipが`super_admin`であること、request sessionが未失効かつ対象organizationをactiveにしていること、organization/slug一致を同じtransaction内で再確認する。確認後にPIIを持たないdurable jobを保存し、対象organizationをactiveにする全sessionをnullへ戻してからorganizationをhard deleteする。tenant tableはDB cascadeでも消し、jobはorganizationへの外部keyを持たせずR2 cleanup完了まで残す。
- 削除後のretryだけはmembership 404時に専用guardが `(actor user id, organization id, idempotency key)` の完全一致jobを検証して許可する。fresh sessionは再度要求し、active organization検証だけをskipする。別key・別actor・別organizationは同じ404にし、疑似membershipは作らない。
- magic linkは `storeToken: "hashed"`、Better Auth全体のverification identifierもhashed保存にする。auth loggerはmessage、error args、SQL params、token、cookie、bodyを出さず固定metadataだけを出し、routerのunsafe fallback loggerへ非API errorを渡さずapp error boundaryへthrowする。DB障害を使ったdummy token非出力testを必須にする。

## 認可

- identity/session/org membershipはauth。
- todo/project/group/billingなどresource permissionは `apps/api/modules/authorization` などapp側。
- audit logを意識し、permission deniedはE2EとAPI integrationで確認する。
- このrepoのorganization roleはBetter Auth標準の `owner/admin/member` ではなく、`super_admin/admin/member` を使う。
- `packages/auth` のorganization pluginでは `creatorRole: "super_admin"` と custom `roles` を設定し、plugin構成を変えたら `packages/db/src/schema/auth.generated.ts` をBetter Auth CLIで再生成する。
- Better Auth CLIの上書きはrepo固有unique/partial indexを出力しない。生成後は`database` skillのoverlay一覧とdiffし、member/invitation/super admin制約の削除をschema変更として採用しない。Generic OAuth provider追加だけなら最終schemaはno-diffになる。
- `super_admin` はorganizationごとに必ず一人だけにする。Better Authのrole定義だけに任せず、`apps/api` 側のmember role更新で昇格時に旧 `super_admin` を `admin` へ落とし、最後の `super_admin` の降格・削除を拒否する。
- organization memberのrole変更はapp側で強制する。`admin` は招待や通常member管理はできるが、`member -> admin`、`admin -> member`、`super_admin` 関連変更はできない。role昇格/降格と `super_admin` 移譲は `super_admin` だけ許可する。
- `admin` が招待できるroleは `member` だけ。`super_admin` が招待で `admin` を付与する場合もfresh sessionを要求する。
- organization招待はBetter Authの`/organization/invite-member`ではなくapp所有のElysia batch routeだけを使う。Better Auth側に到達不能な招待用custom rate ruleや別送信callbackを残さず、app側でtenant guard、fresh session、recipient-count quota、atomic audit/outboxを一続きに強制する。
- 招待再送は同じinvitation IDと`createdAt`を保持して48時間延長する。pending/期限切れだけを許可し、member roleはadmin以上、admin roleはfreshなsuper adminだけにする。service検証後もtransaction内でactor membership/roleを再確認し、inviterを現在のactorへ更新して、退会済みinviterのためBetter Auth acceptanceが失敗する状態を残さない。
- organization招待メールの`inviterName`には認証済みuserの表示名を渡す。user idを人向け表示へ流用せず、名前が空の場合だけtemplate側の安全なfallbackを使う。
- `super_admin` 移管は通常role更新から分離し、target member emailのtyped confirmationとfresh sessionを要求する。移管、member削除、role変更とaudit insertは同一transactionにする。
- `member` はDBで `(organization_id, user_id)` unique、`role = 'super_admin'` はorganizationごとのpartial uniqueを持つ。所有権移管transactionは旧super_adminを先にadminへ降格してからtargetを昇格し、前後のcountを検証する。逆順はpartial uniqueに違反する。
- UI上の操作非表示は補助であり、`admin` が `super_admin` を触れないこと、`member` がmutationできないことはAPI integration testで確認する。
- organizationの管理・参照APIは `apps/api` が正本。Better Auth organization pluginはdeny-by-defaultとし、招待recipient本人に必要な `get-invitation` / `list-user-invitations` / `accept-invitation` / `reject-invitation` の4 endpointだけを残す。organization/member/invitation/team/custom roleの他endpointは、readもmutationもtop-level `disabledPaths` で404にしてtenant guardや監査境界を迂回させない。
- `disabledPaths` は `basePath` を除いた `/organization/...` のnormalized pathで指定する。各endpointの実methodでdirect `auth.handler` が404を返すこと、`generateAuthOpenApiSchema()`と統合`/openapi/json`のorganization pathが上記4つだけになること、`/auth/reference`が404であることを回帰testにする。Better Auth更新でendpointが増えた場合もtestをfailさせ、公開可否を明示判断する。
- 招待取消は`pending`かつ期限内だけを許可する。accepted/canceled/expiredを上書きせず409 `conflict` + `reason: invitation_not_pending` を返し、他tenantや不存在IDは同じ404にする。保存値がpendingでも期限切れなら一覧responseは`expired`として扱う。
- 招待取消transactionでは未送信・retry待ちのemail jobもterminalな`canceled`へ移す。送信中とのraceはlease fencingで後続のcompleted/failed更新を拒否するが、providerへ既に渡った配送そのものは取り消せないことを運用仕様として扱う。
- invitation acceptanceはBetter Authの `organizationHooks.beforeAcceptInvitation` でもroleを `admin | member` にallowlistする。`owner`、`super_admin`、null、未知roleはstable errorでfail-closedにし、migrationでも該当する既存pending invitationをexpiredへ変換する。
- invitation landingは未ログインuserを即sign-in redirectせず、招待URLを`redirectTo`へ保持したsign-up/sign-inを表示する。招待詳細はBetter Auth `get-invitation`がactive sessionのemail一致を確認した場合だけ表示し、403の別email sessionにはacceptを出さずmulti-session switch/add accountを促す。recipient emailをpublic context APIへ複製しない。
- Next App Routerのroot layoutに置いたBetter Auth UI providerが、client navigation後も初回URLから得た`redirectTo`を保持する前提にしない。auth route直下のscopeへsanitize済み`redirectTo`、`add_account`、`reauth`を渡し、Magic Link・OAuth・Passkeyの完了先とSign in/Create account間のlinkを同じ値から作る。`add_account`はview切替でも保持し、`reauth`はSign upへ持ち込まない。
- multi-sessionのactive account変更、Passkey sign-in、sign-outのようにdocument reloadなしでidentityが変わる前に、TanStack Queryの全queryをcancelしてQueryClient cacheをclearする。console queryだけのinvalidateではissue/comment等の別keyに前accountのtenant dataが残るため不十分。
- organizationの公開URLは`/organization/:slug/*`、公開招待URLは衝突しない`/invitations/:id`を使う。旧メールの`/organization/invitations/:id`はCloudflare/OpenNextが処理できるEdge `middleware.ts`で307 redirectし、`/organization/invitations/members|settings`は既存tenant slugとして通す。Next 16の`proxy.ts`はNode runtimeになるため、この互換redirectには使わない。
- Better Auth `get-invitation`のrecipient mismatchはaccount切替、明確なnot-found/terminal responseは再招待、5xx・network・schema不一致は詳細を露出しない再試行UIへ分類する。一時障害をexpired/canceledと断定しない。Server Componentでsessionを読んだ後の詳細取得、またはaccept/reject時に401・`SESSION_EXPIRED`となるTOCTOUは、招待IDを保持したsign-up/sign-in stateへ戻し、通常の再試行エラーに畳まない。

## package品質

- `packages/auth/.oxlintrc.json` はserver/client entrypoint分離を前提にserver TypeScript向けへ寄せる。React/Browser系pluginは入れない。
- READMEには役割、公開entrypoint、依存方向、env境界、test方法、入れないものを書く。

具体的な auth singleton やclient例が必要なときだけ `references/auth-email.md` を読む。React Email templateやsender例は `email` skillを読む。
