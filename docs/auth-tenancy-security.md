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

Better Auth organization pluginの管理・参照APIは直接公開しません。`/auth/organization/*` はdeny-by-defaultとし、招待recipient本人に必要な `get-invitation`、`list-user-invitations`、`accept-invitation`、`reject-invitation` の4 pathだけを残します。それ以外のorganization/member/invitation/team/custom-role pathはtop-level `disabledPaths` で404にし、認可・tenant境界・audit・error契約を持つElysia feature routeへ集約します。

招待accept直前にも `organizationHooks.beforeAcceptInvitation` でroleを `admin | member` に限定します。legacy `owner`、`super_admin`、null、未知roleのpending invitationはmigrationでexpired化し、migration未適用DBでもhookがfail closedします。

招待メールの送信者表示には認証済みsession userの表示名を使います。内部user IDを人向けの`inviterName`へ流用せず、表示名が空の場合だけtemplateの一般的なfallback文言へ倒します。

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

削除transactionでは、同じactorとkeyのcleanup jobを最初に確認します。同じorganizationなら既存receiptを返し、別organizationで使われたkeyなら409にします。新規削除はactorが現在も`super_admin`であること、request sessionが未失効かつ対象organizationをactiveにしていること、organizationとslugが一致することをmutation直前に再確認します。その後slug/emailを持たないjobを作成し、対象organizationをactiveにしている全sessionをnullへ戻してからorganizationをhard deleteします。member、invitation、todo、comment、audit等のtenant rowはDBの`ON DELETE CASCADE`でも即時削除します。

削除成功後はmembership自体がなくなるため、同じHTTP requestのretryだけを限定的に許可します。専用guardがmembership 404時に `(actor user id, organization id, idempotency key)` の完全一致jobを確認し、fresh sessionを再要求してactive organization検証だけをskipします。別actor・別organization・別keyは404のままです。疑似membershipは作らず、replay handlerは削除serviceを再実行せず同じreceiptを返します。

## 複数アカウント

Better Authのmulti-session pluginをserver/client双方に設定します。account menuから現在のsessionを維持したまま別アカウントを追加し、保存済みsessionを切り替えられます。切り替え後はServer Componentをrefreshし、active organizationとpermissionを新sessionから再取得します。

Better Auth UIが返すclientはfunction/proxyの場合があるため、multi-session capabilityの判定はobjectだけに限定しません。`listDeviceSessions`のresponseはWebローカルValibot schemaで検証し、不正なaccount/session modelやprovider内部errorをUIへ流さずfail closedします。

Better AuthやOAuth/passkey providerのclient errorは、Web-local Valibotでstable codeだけを読み、既知codeのallowlistを安全な固定文言へ対応付けます。未知codeやraw `message`、nested causeにはprovider response、token、内部障害が含まれ得るため表示せず、操作別fallbackを使います。表示ownerは操作componentまたはglobal ownerの一方に決め、同じ失敗を二重toastしません。

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

## Secret

`BETTER_AUTH_SECRET`、OAuth client secret、Turso tokenはCloudflare/GitHub secretとして注入します。`.env.example`、log、OpenAPI example、trace、Playwright artifactへ実値を出しません。

magic-link tokenはpluginの `storeToken: "hashed"` で保存し、Better Auth全体のverification identifierもhashed保存にします。auth loggerはlibraryから渡されたmessage/error argsを捨て、固定のcomponent/event/levelだけを出します。Better Callのfallback loggerがDrizzle errorのSQL paramsを出さないよう非API errorはapp-level error boundaryへthrowし、dummy tokenを含むDB障害testでtoken、cookie、SQL paramsがlogにないことを回帰確認します。
