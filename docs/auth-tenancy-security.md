# 認証・認可・マルチテナント

## 認証と認可を分離する

Better Auth sessionが有効でも、任意のorganizationを操作できるわけではありません。protected routeでは次の順でfail closedします。

1. session cookieを検証する。
2. requestのorganization IDを決定する。
3. membershipをDBから検証する。
4. roleを既知の `super_admin | admin | member` に正規化する。未知roleは許可しない。
5. actionごとのpermissionをguard/macroで検証する。
6. service/repositoryへ検証済みuser/organizationを渡す。
7. 成功した重要mutationをtenant auditへ、拒否をrequest ID付きoperational logへ記録する。

Client UIの非表示やredirectはUXであり、認可境界ではありません。API guardとtenant-scoped queryを必須にします。

## Role

- `super_admin`: organization identity、admin role、ownership transferを管理できる。
- `admin`: member/invitationと通常のworkspace運用を管理できる。
- `member`: tenant内の通常操作のみ。organization設定や権限昇格は不可。

legacy `owner` はmigrationで `super_admin` へ変換します。最後のsuper adminをremove/demoteする操作は拒否します。

DBは `(organization_id, user_id)` のmembership重複と、同じorganizationの複数 `super_admin` を一意indexで拒否します。migrationは重複membershipの最強roleを保存し、複数super adminをcanonical memberへ集約し、memberがいるのにsuper adminがいないorganizationでは決定的に1人を昇格します。memberが1人もいないorphan organizationはuserを捏造せず、運用者の修復対象として残します。

## Organization切り替え

- sidebar switcherをactive organizationの正本にする。
- activate APIは対象membershipを再検証してからsession stateを更新する。
- server renderとbrowser queryの両方が同じactive organizationを使う。
- clientから送られたorganization IDを信頼せず、membershipとquery条件を毎回照合する。
- organization未所属ユーザーは `/settings/organizations` で最初のorganizationを作成する。

新しいsessionは、同じuserの未失効sessionで最後に使われ、現在もmembershipがあるorganizationを継承します。該当する履歴がなくmembershipが1件だけならそのorganizationを選び、複数なら `activeOrganizationId = null` のままsidebarまたはorganization一覧で明示選択させます。`/me` はstale/null contextを同じ規則でtransaction内に永続修復します。UIとorganization一覧APIは先頭organizationを表示用fallbackとしてactive扱いしません。

member削除時はmembership、auditだけでなく、対象userが削除organizationをactiveにしている全sessionも同じtransactionでreconcileします。残る最新valid context、単一membership、nullの順に更新するため、削除済みtenantを指すsessionを残しません。

clientのactivate成功直後に旧tenantのTanStack Queryを一括invalidateしません。session contextだけが新tenantへ変わった状態で旧member/issue queryを再取得すると409/404になるため、in-flight queryをcancelし、route replaceまたはServer Component refreshで新tenantのquery keyを構築します。

Agent機能が有効なsessionでは、`active_organization_id`変更とAgent context失効も同じDB transactionです。migration `0015_agent_action_runtime`の`session_agent_context_rotate_organization` triggerがcontext epochを1増やし、旧epochのconnection ticket、grant、resume ticket、run、action、approval policyを失効します。これをclient-side cleanupの代わりにせず、切り替え後はAgent stream/uploadをabortし、Agent/files/issuesを含む旧tenant queryをcancelし、shell draft、thread、form registry、Blob URL、tenant query parameterをclearしてから`router.replace()`と`router.refresh()`を行います。route slugと新sessionのactive organizationが一致するまでAgent composerとclient toolは無効です。

人が開くorganization管理URLは `/organization/:organizationSlug/members|settings` とし、UUIDを公開URLへ使いません。Server Componentはsession userが所属するorganization一覧からslugを解決し、見つからないslugを404にしてから、内部APIへ検証済みorganization IDを渡します。slug変更後は新slugのURLへ置換します。

Better Auth organization pluginの管理・参照APIは直接公開しません。`/auth/organization/*` はdeny-by-defaultとし、招待recipient本人に必要な `get-invitation`、`list-user-invitations`、`accept-invitation`、`reject-invitation` の4 pathだけを残します。それ以外のorganization/member/invitation/team/custom-role pathはtop-level `disabledPaths` で404にし、認可・tenant境界・audit・error契約を持つElysia feature routeへ集約します。

招待accept直前にも `organizationHooks.beforeAcceptInvitation` でroleを `admin | member` に限定します。legacy `owner`、`super_admin`、null、未知roleのpending invitationはmigrationでexpired化し、migration未適用DBでもhookがfail closedします。

招待リンクは`/invitations/:invitationId`を正規URLとし、未ログインでもlanding pageを開けます。organization名、inviter、recipientなどの招待詳細はBetter Authの`get-invitation`が現在のsession emailとrecipient emailの一致を確認した後だけ表示します。未ログインには招待URLを`redirectTo`へ保持した新規登録/ログインを示し、別emailのsessionにはaccept actionを出さず、multi-sessionのswitch/add accountを促します。account切替後は認証済みTanStack Query cacheを破棄してServer Componentをrefreshし、同じ検証をやり直します。明確なnot-foundだけをterminal表示にし、5xx、network、schema不一致はprovider詳細を出さない再試行表示にします。

旧メールに含まれる`/organization/invitations/:invitationId`はqueryを保持した307 redirectで正規URLへ移します。ただし`/organization/invitations/members`と`/organization/invitations/settings`はslugが`invitations`の既存tenant routeとしてredirect対象外にし、永続DBのlegacy organizationを到達不能にしません。この互換処理はCloudflare/OpenNext対応のEdge `middleware.ts`に置き、Node runtimeになるNext 16の`proxy.ts`は使いません。

招待メールの送信者表示には認証済みsession userの表示名を使います。内部user IDを人向けの`inviterName`へ流用せず、表示名が空の場合だけtemplateの一般的なfallback文言へ倒します。

### Atomic bulk invitation

`POST /organizations/:organizationId/invitations`は、1〜20件のemailと全件共通の`admin | member` roleを受け取ります。emailはtrim・lowercase化して大小文字を無視して重複排除します。`admin`は`member`だけを招待でき、`super_admin`が`admin`を付与するときはfresh sessionが必要です。

既存memberまたは期限内pending invitationが1件でも含まれる場合、全件を同じ409で拒否し、どのaddressが該当したかはresponseへ反映しません。全invitation、各audit event、各email jobは同じDB transactionで作るため、一部だけが保存・送信される状態はありません。actor+organizationは30 recipient/時、organization全体は100 recipient/時です。quotaは競合したbatchも消費し、生のuser/organization IDを保存しないhash keyでTursoへ永続化します。

APIはjobをqueueした時点で201を返します。local BunではprocessorをawaitしてMailpitへ直ちに反映し、Cloudflare Workersでは`waitUntil`と毎分cronで処理します。配送失敗は招待をrollbackせず、安全なerror codeとbackoffだけをjobへ保存します。取消・期限切れは未送信/retry jobをterminalな`canceled`へ移します。providerが受け付けた直後にWorkerが停止した場合は同じメールが再送される可能性があるため、配送保証はexactly-onceではなくat-least-onceです。

`POST /organizations/:organizationId/invitations/:invitationId/resend`はpendingまたは期限切れ招待だけを同じIDで48時間延長し、元の`createdAt`を保持します。accepted/rejected/canceled、他tenant、不明role、既存member、同じrecipientの別pending招待はfail closedにします。member招待はadmin以上、admin招待はfresh sessionのsuper adminだけが再送でき、quotaは1 recipientとして数えます。transaction内でactor membershipを再確認し、inviterを現在のactorへ更新し、auditと既存outboxの再queueを同時に保存します。

## Destructive / privilege transfer

- role変更、member削除、ownership transferは確認dialogを使う。
- ownership transferの確認文字列は移管先memberのemail。
- ownership transferは1 transaction内で旧super adminを先にadminへ降格し、移管先をsuper adminへ昇格してからexactly-oneを再検証する。
- 高権限操作はfresh session/step-upを要求し、有効期間は900秒。
- UIはAPIの `step_up_required` を受け、追加認証後に元操作を再実行する。
- 成功した操作のactor、tenant、target、action、resultをaudit logへ残す。拒否はrequest ID付きoperational logへ残す。tokenやsecretはどちらにも入れない。
- invitation cancelは期限内pendingだけに許可する。accepted/rejected/cancelled/expiredは409 `invitation_not_pending`、期限を過ぎたpendingは一覧取得時にexpiredへ遷移する。

### Organization即時削除

`DELETE /organizations/:organizationId`は汎用tenant guardとは別の専用guardを使います。通常requestはmembership、active organization、`super_admin`、900秒以内のfresh sessionを要求し、bodyのslug完全一致、`confirmation: "DELETE"`、16〜128文字のopaqueな`idempotencyKey`がすべて必要です。route guardに加えてserviceでもrole/fresh/確認値を再検証します。

削除transactionでは、同じactorとkeyのcleanup jobを最初に確認します。同じorganizationなら既存receiptを返し、別organizationで使われたkeyなら409にします。新規削除はactorが現在も`super_admin`であること、request sessionが未失効かつ対象organizationをactiveにしていること、organizationとslugが一致することをmutation直前に再確認します。その後slug/emailを持たないjobを作成し、対象organizationをactiveにしている全sessionをnullへ戻してからorganizationをhard deleteします。member、invitation、issue、comment、activity、audit等のtenant rowはDBの`ON DELETE CASCADE`でも即時削除します。

削除成功後はmembership自体がなくなるため、同じHTTP requestのretryだけを限定的に許可します。専用guardがmembership 404時に `(actor user id, organization id, idempotency key)` の完全一致jobを確認し、fresh sessionを再要求してactive organization検証だけをskipします。別actor・別organization・別keyは404のままです。疑似membershipは作らず、replay handlerは削除serviceを再実行せず同じreceiptを返します。

## 複数アカウント

Better Authのmulti-session pluginをserver/client双方に設定します。account menuから現在のsessionを維持したまま別アカウントを追加し、保存済みsessionを切り替えられます。切り替え後はServer Componentをrefreshし、active organizationとpermissionを新sessionから再取得します。

Agent Shellを持つconsoleでaccountを切り替える場合は、旧session cookieがactiveな間に`POST /agent/context/revoke`を完了させます。revokeが失敗したらBetter Auth `setActive`を呼ばず、旧accountとlocal draftを維持します。成功後は認証済みqueryをすべてcancel/clearしてから`setActive`を呼び、Agent stream、upload、thread、composer、form registry、Blob URLを破棄し、`/dashboard`へreplaceして`router.refresh()`します。旧accountのactive organizationや`agentThread`を新accountへ引き継ぎません。

Better Auth UIが返すclientはfunction/proxyの場合があるため、multi-session capabilityの判定はobjectだけに限定しません。`listDeviceSessions`のresponseはWebローカルValibot schemaで検証し、不正なaccount/session modelやprovider内部errorをUIへ流さずfail closedします。

Better AuthやOAuth/passkey providerのclient errorは、Web-local Valibotでstable codeだけを読み、既知codeのallowlistを安全な固定文言へ対応付けます。未知codeやraw `message`、nested causeにはprovider response、token、内部障害が含まれ得るため表示せず、操作別fallbackを使います。表示ownerは操作componentまたはglobal ownerの一方に決め、同じ失敗を二重toastしません。

## Passkey登録

Passkeyの登録option生成とverifyは、Better Authの15分fresh sessionと`requireSession`をそのまま認可境界にします。stale sessionでは`SESSION_NOT_FRESH`を固定文言のstep-up dialogへ変換し、`/auth/sign-in?reauth=1&action=account.passkey.add&redirectTo=/settings/account`へ進みます。同一tabではallowlist済みのaction識別子だけを`sessionStorage`へ一時保存し、新しいsessionでsettingsへ戻った時に1回だけconsumeして登録を再開します。token、credential、provider messageは保存しません。

登録時は`authenticatorAttachment`を固定せず、端末内authenticatorと外付けsecurity keyの両方を許可します。cancelと既登録credentialはBetter Auth/WebAuthnの実codeをWeb-local Valibot allowlistで判定し、raw browser/provider errorをtoastへ出しません。

## GitHub OAuth

productionはBetter Auth組み込みGitHub providerを使います。ローカル開発とOAuth E2Eで`GITHUB_OAUTH_EMULATOR_URL`が設定された場合だけ、同じ`providerId: "github"`を持つGeneric OAuth providerへ切り替えます。両providerを同時登録せず、productionでemulator URLが設定されていたら起動を拒否します。

emulator modeは実GitHub credentialを読みません。固定fixtureまたは`GITHUB_OAUTH_EMULATOR_CLIENT_ID` / `GITHUB_OAUTH_EMULATOR_CLIENT_SECRET`だけを使い、localhost系originに限定したauthorize、token、`/user`、`/user/emails`へ接続します。profileとverified primary emailはValibotで検証し、raw response、authorization code、access token、provider errorをlog/traceへ出しません。

Better Auth 1.6.9ではcallback pathが異なります。

- production built-in GitHub: `/auth/callback/github`
- local/test Generic OAuth: `/auth/oauth2/callback/github`

`apps/github-emulator`は後者をstrict OAuth Appとしてseedします。この差はOAuth E2Eで固定し、Better Authをupgradeするときにclient methodと一緒に再確認します。

## Cookieとorigin

本番はHTTPSを前提に、app/APIを共通の親domainへ置きます（例: `app.example.com` と `api.example.com`）。`AUTH_COOKIE_DOMAIN=example.com` を必須設定し、次を同じdeploymentとして管理します。

- `BETTER_AUTH_URL=https://api.example.com`
- `APP_BASE_URL=https://app.example.com`
- `TRUSTED_ORIGINS=https://app.example.com`
- `CORS_ORIGIN=https://app.example.com`
- `AUTH_COOKIE_DOMAIN=example.com`

OpenAPI上のcookie名は `better-auth.session_token` で表現しますが、本番ではBetter Authがsecure prefixを付ける場合があります。CORSはallow-list + credentialsにし、wildcardとcredentialsを併用しません。

## Agent delegation

BrowserはBetter Auth cookieをAgent Workerへ送らず、cookie認証済みAPI public routeだけを呼びます。APIのglobal CSRF guardはunsafe methodの`Origin`を必須にし、`CORS_ORIGIN`または`API_PUBLIC_URL`とのexact matchを検証します。Agent専用の`x-csrf-token`方式は追加しません。

Cloudflare Service Bindingはpublic internetを遮断するnetwork boundaryであり、actorの認可ではありません。APIはsessionからuserとactive organizationを決め、membershipとprivate thread ownerをDB transaction内で再検証してから、60秒・一回限りのopaque connection ticketをAgent Workerへ渡します。tokenは256-bit以上のrandom値とし、DBにはhashだけを保存します。Browser response、URL、log、Sentryへ出しません。

Agent WorkerはAPI named `WorkerEntrypoint`内のprivate Elysia `POST /internal/agent/connections/consume`でticketをatomic consumeし、5分以内のrun grantへ交換します。以後はgrantを`Authorization: Bearer`で同じnamed entrypointの`/internal/agent/*`へ送り、各routeがlive session、active organization、membership、context epoch、thread/run owner、scope、expiry、現在permissionを再検証します。`x-user-id` / `x-organization-id`、modelのtool argument、page context、route slugをactor authorityにしません。public Elysia appへinternal appをmountせず、Agent WorkerへBetter Auth secret、cookie署名鍵、Turso credentialを渡しません。

v1でdelegation JWTを使わないのは、one-time consumeと即時失効にDB stateが必要だからです。opaque tokenはactive organization/account/role変更時に同じtransactionで失効でき、Agent Workerへ署名鍵を配る必要もありません。詳細なticket/grant/action lifecycleは[Agent runtime設計](./agent-runtime.md#認証認可の正本)を正本にします。

## Secret

`BETTER_AUTH_SECRET`、OAuth client secret、Turso tokenはCloudflare/GitHub secretとして注入します。`.env.example`、log、OpenAPI example、trace、Playwright artifactへ実値を出しません。

magic-link tokenはpluginの `storeToken: "hashed"` で保存し、Better Auth全体のverification identifierもhashed保存にします。auth loggerはlibraryから渡されたmessage/error argsを捨て、固定のcomponent/event/levelだけを出します。Better Callのfallback loggerがDrizzle errorのSQL paramsを出さないよう非API errorはapp-level error boundaryへthrowし、dummy tokenを含むDB障害testでtoken、cookie、SQL paramsがlogにないことを回帰確認します。
