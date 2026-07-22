---
name: backend-api
description: enterprise-agentic-saas-starterのElysia API、apps/api、feature-first modules、app.ts/index.ts/worker.ts/client.ts、Valibot Standard Schema、Eden、OpenAPI、Sentry observability、service/repository境界、Effectを使わない方針を変更するときに使う。
---

# Backend API

このskillは `apps/api` の実装で使う。backendは早期にpackage分割せず、Elysiaの型推論、Eden、`app.handle()` testを活かす。

## 標準構成

```txt
apps/api/src/
  app.ts       # createApp(db) — テスト可能な最小ファクトリ
  index.ts     # Bun: Sentry初期化 + createApp(db) + 本番plugin合成 + listen
  worker.ts    # Workers: @sentry/cloudflare + Cloudflare adapter
  client.ts    # Eden client export
  env.ts       # API固有のenv parse（db/authのenvは各packageが管理）
  observability/
    runtime.ts            # appからruntime SDKを隠すnoop-safe bridge
    sentry-bun.ts         # Bun SDKをapp import前に初期化
    sentry-adapter.ts     # Sentry共通adapter
    sentry-options.ts     # PII scrubとsamplingの共通設定
    spotlight.ts          # local endpointだけを許可
    structured-console.ts # 許可済みmetadataだけを構造化出力
  plugins/
    auth.ts          # @enterprise-agentic-saas/auth singleton を mount
    cors.ts          # env から CORS origins を読む
    csrf.ts          # unsafe methodのOrigin検証
    error.ts         # AppError → safe HTTP response + Sentry capture
    observability.ts # request ID/route/status/durationを相関
    openapi.ts       # OpenAPI spec
    request-id.ts    # x-request-id 付与
    server-timing.ts # Server-Timing header
  errors/
    app-error.ts     # AppError class + publicErrors helper
  modules/
    organizations/
      deletion-access.ts # 削除後replayだけを限定許可する専用guard
      deletion-jobs.ts   # R2 cleanup cronの冪等job processor
    issues/
      index.ts
      model.ts       # Valibot Standard Schema
      service.ts
      repository.ts
      test.ts
```

## アーキテクチャ原則

- public appでは`createApp(db)`を唯一のファクトリにする。private Agent Service Bindingだけはnamed `WorkerEntrypoint`の`fetch`内で`createAgentInternalApp(db)`を使ってよい。internal appをpublic `createApp`へ合成しない。
- 本番固有の関心事（auth, cors, server-timing）は独立 Elysia plugin にし、`index.ts` / `worker.ts` で `.use()` 合成する。
- app construction用の中間factoryは作らない。`observability/runtime.ts` はSDKをcore appから隔離し、test時にnoopで動かすbridgeとしてのみ許可する。
- `env.ts` は API 固有の env だけ持つ。`@enterprise-agentic-saas/db` / `@enterprise-agentic-saas/auth` が管理する env を重複させない。
- `errors/` にバレル `index.ts` は置かない。直接 `app-error` を import する。

## 方針

- `app.ts` は Elysia app を組み立てるだけ。listen しない。
- `index.ts` はBun Sentryを最初に初期化し、dynamic importで本番 pluginを合成してlistenする。clientやtestからimportしない。
- `worker.ts` はCloudflare SDKでhandlerをwrapする。Bun SDKをbundleしない。
- `client.ts` とprivate Service Binding用のEden clientは、`parseDate: false`をconsumerが上書きできない位置で固定する。既定値のままだとISO timestampが型上は`string`でも実行時だけ`Date`になり、Worker境界のgrant expiry検証を壊す。WebがimportしてよいAPI entrypointは`@enterprise-agentic-saas/api/client`だけにする。
- `/health`はHTTP runtimeだけを見るliveness、`/ready`は`select 1`でTurso/libSQL到達性も見るreadinessに分ける。依存先障害は503 `service_unavailable`へ丸め、DB詳細を公開しない。
- feature は `modules/<feature>` に置く。issue 題材でも、group/permission/org 前提の SaaS 設計を崩さない。
- `model.ts` はValibot Standard Schemaを置き、Elysiaの`body` / `params` / `query` / `response`へ直接渡す。schemaから型が必要なら`v.InferOutput`で導出し、手書き型との二重管理を増やさない。
- route modelは`apps/api`内に置く。Webとschemaを共有するためだけの`packages/validators`は作らず、Edenの公開型境界を優先する。
- Elysia の route validation で typed input を service へ渡す。
- service へ Elysia Context 丸ごとを渡さない。
- repository は Drizzle/libSQL access を持ち、DB error を `cause/privateContext` 付きに包む。
- Effect は使わない。通常の `async` / `Promise` / `AppError` / `Error.cause` で揃える。
- `AppError.publicMessage`だけをHTTP公開用のtrust markerにする。変更可能な`Error.message`は診断用であり、response serializerは参照しない。`publicContext`はconstructorとHTTP境界の両方でallowlist検証する。

## Elysia plugin

- 各 plugin は `new Elysia({ name: "..." })` で名前を付け、dedup される。
- plugin は env やシングルトンを自分で読む。ファクトリ引数を取らない。
- `createApp` 内 plugin（request-id, observability, error, csrf, openapi）はテストでも使うcore。
- entrypoint専用 plugin（auth, cors, server-timing）は本番のみ。
- plugin は composition に閉じ、service 層へ framework 依存を漏らさない。

## Sentryとruntime

- `createApp(db)`へSentry clientやenvを注入しない。Bun entrypointは`@sentry/bun`をapp importより前に初期化し、Cloudflare entrypointは`@sentry/cloudflare`の`withSentry`でWorker handlerをwrapする。
- workerd側は`nodejs_compat`または`nodejs_als`が必須。Bun SDKとCloudflare SDKを同じbundle/runtimeで同時初期化しない。
- Spotlightはdevelopmentかつlocalhost系endpointだけ許可し、error/log/traceを100%送る。productionではflagを無視し、DSN未設定ならSDKを無効にする。
- Sentry SDKから直接送る構成ではCloudflare WorkersのSentry OTLP destinationを併用しない。Workers Observabilityはplatform metrics/log確認の補助として残す。
- API source mapはWrangler dry-run bundleへSentry CLIでdebug IDを注入・uploadし、その同一artifactを`wrangler deploy --no-bundle`で送る。`upload_source_maps`だけでSentry upload済みと扱わない。
- structured logの相関keyはrequest ID、正規化route、status、duration、service/runtime/releaseに限定する。tenant/user/resource ID、email、body、cookie、tokenを属性へ載せない。

## テスト

- `createApp(testDb())` + `app.handle(new Request(...))` でテストする。
- テストはserver singletonの `@enterprise-agentic-saas/auth` / `@enterprise-agentic-saas/db` entrypointを importしない。schema exportと `file::memory:` libSQLで起動を軽くする。
- auth/group/permission は happy path だけでなく、unauthorized/forbidden/not found を確認する。
- E2E に行く前に、Valibot schema、service、repository、Elysia handlerをVitestで押さえる。日付契約は`app.handle()`に加え、実HTTP serverを通したEden clientでも型とruntime値の一致を確認する。

## 認証・tenant macro

- protected routeは `modules/authorization/access-control.ts` の `authenticated` または `organizationAccess` macroを必ず宣言する。handler内で個別にsession取得するrouteを増やさない。
- named `AgentInternalApi`の`/internal/agent/*`はBrowser session macroを使わない。connection/resume ticketはstrict bodyからatomic consumeし、run開始はBearer connection grant、以後はBearer run grantをstrict header schemaから取得する。service/repositoryでlive session、active organization、membership、context epoch、thread/run scope、現在permissionを再検証し、default/public app、統合OpenAPI、CORSへinternal routeをmountしない。
- `POST /internal/agent/runs/web-search/reserve`はBearer run grantとstrictなoperation IDだけを受ける。live root chat runを再認可し、user/hour・organization/dayのquotaと`web_search_used_at` markerを同一transactionへ冪等予約する。上限は429 + `retryAfter`で返し、raw grant/tool call IDをerrorやledgerへ保存しない。organization/userはbucketのFK scope列に閉じ、operation keyへ連結せずhash化する。
- `POST /internal/agent/runs/web-search/guard`はprovider送信直前のqueryをrun grantと現在tenantのknown member identityに照らして検査する。query、member名/email、拒否文字列、Issue本文をerror/log/Sentryへ出さない。chat context referenceのbrowser labelを信用せず、Issue/file/member/pageをactive organizationで再解決する。
- Agent public moduleはthread/run/action-permission/context/usageの責務を分け、public routeとprivate named entrypointを合成しない。thread permissionは`ask_always | full_access`だけをsession/user/org/thread/context epochへ束縛する。historical action GETは現在membership/owner、decision/resumeはorigin scopeで認可する。
- `organizationAccess` はroute schemaで検証済みのparams/query/bodyから `organizationId` を取り、session、membership、active organization、role、fresh sessionの順にfail-closedで解決する。
- 非memberによるtenant指定は、存在する他tenantと存在しないIDを区別せず404にする。role不足は403、所属しているがactive tenantが違う場合は409 `active_organization_mismatch`。
- repositoryのtenant resource queryはresource ID単独で検索せず、必ず `organizationId` と組み合わせる。親子resourceはDBのcomposite FKも併用する。
- `super_admin`移管は通常role PATCHから分離し、fresh sessionとtarget member email確認を要求する。移管transaction完了時のsuper_admin数を再確認する。
- `/me` はsessionのactive organizationをmembershipで再検証し、stale/nullなら最新の未失効valid session context、単一membership、nullの順で同一transaction内に永続修復する。`/organizations` は先頭membershipをactive表示するfallbackを持たず、sessionの実値だけを正本にする。
- member削除は対象userの旧tenantを指すsessionも同じtransactionで有効な別organizationまたはnullへreconcileする。
- organization削除は汎用`organizationAccess`へ例外flagを足さず、専用`organizationDeletionAccess` macroを使う。通常はmembership、active organization、`super_admin`、fresh sessionをすべて要求する。削除済みorganizationへの再送だけはmembership 404時にactor・organization・冪等性keyの完全一致jobを確認し、fresh sessionを再要求してactive検証だけをskipする。handlerはreceiptを直接返し、serviceを再実行しない。

## OpenAPI

- `/openapi` はScalar、`/openapi/json` はapp routeとBetter Auth routeを統合したOpenAPI 3.0.3 JSONを返す。Better Auth既定の`/auth/reference`は無効化し、documentationの正本を増やさない。
- Better Auth routeは`@enterprise-agentic-saas/auth/openapi`から実plugin構成のschemaを生成し、pathへ`/auth`を付けて統合する。auth routeをapps/apiで手書き複製しない。`disabledPaths`は生成結果にも反映されるため、app所有のorganization管理routeが含まれないことをauth/API双方のtestで固定する。
- Elysia 1.4はOpenAPI 3.0.3、Better Auth 1.6は3.1.1を生成する。実schemaに存在する`type: [T, "null"]`だけを`type: T, nullable: true`へ変換し、`$ref` siblingsは`allOf`へ保持する。未対応union/security schemeは黙って落とさず起動時にfail-fastする。
- Better Auth由来のoperationにもpath+methodから一意な`operationId`、summary、description、`Auth / ...` tagを補完する。app routeと合わせて重複operation IDをtestする。
- Scalarはagent upload、telemetry、auth永続化、default font、developer toolsを無効化する。同一originのtry-outはHttpOnly cookieをbrowser credentialとして使い、cookie値をUI設定やdocumentへ保存しない。
- route追加時は `operationId`、summary、description、tag、全request schema、status別response schema、securityを同時に追加する。
- protected routeのsecurity metadataはauth macroから付け、実行時guardとdocumentationが乖離しないようにする。
- error responseは共通 `ApiError` schemaを使う。examplesへ実ID、cookie、token、DB情報を入れない。
- `@elysia/openapi`には`@valibot/to-json-schema`のmapperを設定する。runtimeで維持する`check` / `check_items`のようにJSON Schemaへ表現できないactionはmapperの`ignoreActions`へ明示し、`custom` schemaは意味を説明する安全なOpenAPI schemaへ`overrideSchema`する。transformを含むquery schemaはOpenAPI生成testを必須にし、変換warningやroute schema全体の欠落を残さない。
- app-ownedなuser / organization / member / actor / uploaderの画像fieldは`profileImage`へ統一する。Better Auth routeと生成schemaの`image` / `logo`は書き換えず、repositoryまたはauth adapter境界でapp DTOへ変換する。
- unsafe methodはglobal CSRF guardで`Origin`を必須にし、`CORS_ORIGIN` / `API_PUBLIC_URL`との完全一致だけを許可する。CSRFの403と`csrf_origin_forbidden` exampleを各mutationのOpenAPI responseにも含める。
- resource作成は201へ統一する。このrepoではorganization、invitation、issue、issue commentのPOSTが対象で、実response、route schema、OpenAPI、client testを同時に変更する。
- `POST /organizations/:organizationId/invitations`は1〜20件のemail配列と共通roleを受けるatomic batchにする。trim/lowercase/case-insensitive重複排除後、既存memberまたは有効pending invitationが1件でもあれば全件rollbackし、どのaddressが該当したかを反映しない同一の409 `fieldErrors.emails`を返す。quotaはrecipient件数でactor+organization 30件/時、organization 100件/時をDBへ原子的に予約し、競合探索も消費して429 `retryAfter`を返す。quota keyには生のuser/organization IDを保存せずnamespaced hashを使う。
- `POST /organizations/:organizationId/invitations/:invitationId/resend`はpending/実効期限切れ/保存expiredだけを同じIDで再queueする。terminal stateはquota予約前に409、他tenant/不存在は404にする。transaction内でactor membershipとrole、既存member、別pendingを再確認し、別の保存pendingが時刻上expiredならそのrowとoutboxを先にterminalへ移してから対象を復活させる。有効pendingだけをrecipient conflictにし、expiry・inviter・audit・outboxをatomic更新する。outboxはattemptsをresetせずstatus/error/lease/completedだけを初期化し、旧workerをfenceする。
- Elysia/Valibotのrequest validationはruntimeで400 `validation_error`へ統一し、安全な`fieldErrors`を返す。OpenAPIも400を正本にし、runtimeが返さない422を追加しない。
- response validationはAPI実装のcontract違反として500 `internal_error`へ変換し、内部issue/field pathをresponseへ出さずobservability bridgeで記録・captureする。integration testは宣言したresponse schemaを実routeが破る形で境界を通す。
- 共通`ApiError`は安全なcode/message、必須request ID、allowlist済みcontext、必要な場合だけ`fieldErrors`を持つ。`Error.message`、入力値、tenant/resource ID、provider raw errorをschemaへ広げない。

## Auditとtransaction

- organization/member/invitation/issue/comment mutationは `audit_logs` へappend-only eventを残す。
- Issue公開契約は `/issues`、`/issues/:id`、`/issues/by-number/:number`、`/issues/:id/comments`、`/issues/:id/timeline` に統一し、旧 `/todos` aliasやTodo型を残さない。番号解決とtimelineもorganization IDを必須にし、tenant外resourceは404にする。
- Issue更新は更新前rowを同じtransactionで取得し、Issue本体、汎用audit、fieldごとの`issue_activity_events`を同一transactionで保存する。title、description、status、priority、assignee、labels、due dateの実差分だけを記録し、一括更新は同じbatch IDと安定したpositionを持たせる。
- Issueの`dueDate`はdate-only文字列ではなくISO timestampで受け渡し、DBのtimestamp列、activityのold/new value、OpenAPI responseを同じ精度に揃える。
- Timelineはactivity/commentのdiscriminated unionを新しい順のcursor paginationで返す。cursorはversion付きpayloadをbase64url化したopaque stringにし、`createdAt`だけでなくitem type、batch内position、IDを含むtotal orderでkeyset paginationする。同一timestampに複数field activityやcommentが並んでも欠落・重複させず、改ざん・未知version・不正encodingは400 `validation_error`へ丸める。comment-created auditを重複表示せず、actor profileは同じorganization membershipに限定してjoinし、退会済み・tenant外actorは安全なfallback名にする。UIが昇順表示へ並べ替えられるようtimestampを必ず返す。
- 重要mutationとaudit insertは同じDB transactionへ入れる。mutation後に別queryでauditを書き、audit失敗時に500を返す実装はretry時の二重操作につながるため禁止。
- organization作成はorganization、super_admin member、audit、既定active session更新を同じtransactionへ含める。
- organization内issue連番は `(organization_id, number)` uniqueを最終防波堤にし、process内organization別queueと、そのunique競合だけを対象にした限定retryを組み合わせる。
- issue commentは`authorId`だけでなく `author: { id, name, image }` を返す。user profileのjoinはcommentの`organizationId`と同じmemberだけに制限し、tenant外または退会済みauthorのname/imageを漏らさずfallback表示にする。
- organization削除はDB transaction内でactor membershipが`super_admin`であることと、request sessionが未失効かつ対象organizationをactiveにしていることをmutation直前に再確認する。その後PIIを持たないcleanup jobを先に保存し、対象をactiveにする全sessionをnullへ戻してorganizationをhard deleteする。tenant rowはDB cascadeで即時削除し、organization外部keyを持たないjobは残す。Cloudflare scheduled handlerが毎分R2 prefixを冪等削除し、list結果の各keyも同じencoded prefix内か再検証してからdeleteする。lease・指数backoff付きで再試行し、job完了/失敗の更新は`attempts + locked_at`をfencing tokenにして、lease期限切れの旧workerが再取得後の状態を上書きできないようにする。batch結果は`claimed/completed/failed/stale`の件数だけを記録し、job/organization/user IDをlogやSentry属性へ出さない。
- invitation email processorも毎分cronとrequest後background taskの両方から同じdurable jobを処理する。`pending`、retry可能な`failed`、lease切れ`processing`だけをclaimし、`attempts + locked_at`で完了/失敗をfenceする。取消・期限切れ・delivery context欠落は再claimしないterminal状態へ移し、送信失敗は201でcommit済みの招待responseを500へ巻き戻さない。provider受付直後のworker crashでは厳密なexactly-onceを保証できないため、少なくとも1回配送と狭い重複可能性をrunbookへ明記する。

## package 品質

- `apps/api/.oxlintrc.json` は server/Bun 向けに `node`, `promise`, `typescript`, `unicorn`, `oxc`, `import` を使う。
- React/Next/Tailwind/jsx-a11y plugin は `apps/api` へ入れない。
- README には役割、公開 entrypoint、依存方向、env 境界、validation 方針、test 方法を書く。
- API integration test は必須。`app.handle(new Request(...))` で health/auth mount/error response を確認する。

詳細なファイル例が必要なときだけ `references/backend-api.md` を読む。
