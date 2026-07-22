---
name: agent-runtime
description: enterprise-agentic-saas-starterへMastraのchat Agent、Agent Worker、AI SDK UI transport、human-in-the-loop承認、自動許可、Issue CRUD、Web検索、画像入力、client tool、Agent Shell、active organization切り替えを追加・変更・調査するときに使う。
---

# Agent Runtime

このskillはWeb、API、Agentの3 WorkerにまたがるAgent機能で使う。実装前にdocs/agent-runtime.mdを読み、以下のrepo固有contractを優先する。

## Runtime境界

- Web Worker、API Worker、Agent Workerの3 Workerに分ける。
- Agent runtimeはMastraを正本にする。Agent、tool、workflow、skill、model、streamをCloudflare Agents SDKや独自tool loopへ二重実装しない。
- `apps/agent/src/mastra/index.ts`を唯一のMastra entrypointにし、production WorkerとMastra Studioの両方からimportする。
- BrowserはAgent Workerへ直接接続しない。AI SDK UI transportでcookie認証済みAPI Workerの`POST /agent/chat`を呼び、APIがsession、CSRF、active organization、thread ownerを検証してからprivate `AGENT_RUNTIME` Service Bindingへstreamをproxyする。
- Agent Workerは`workers.dev`、preview URL、custom domainを持たない。APIからbindingするnamed entrypointだけがMastra agentを実行し、default `fetch`はfail closedにする。
- Agent WorkerからAPI Workerへは`AGENT_INTERNAL_API` named WorkerEntrypointを使う。API public fetchへ`/internal/*`をmountせず、Agent toolはtyped domain capabilityだけを呼ぶ。
- Agent WorkerはTurso、R2、Better Auth tableへ直接触らない。
- Agent WorkerからAPIへはnamed WorkerEntrypointのtyped RPCを使う。任意pathやtool名を渡すgeneric dispatcherを作らない。

## Mastra project構成

- `apps/agent/package.json`へMastra CLIをexact catalog dependencyとして置き、`mastra dev`と`mastra build`をpackage scriptから呼ぶ。
- TypeScriptはES2022、ES module、bundler resolutionを維持する。
- `src/mastra/index.ts`は`Mastra` instanceだけを組み立て、`agents/product-agent.ts`、`models/openrouter.ts`、`tools/`、`skills/`、`workflows/`へ責務を分離する。
- modelはlocal dev、Mastra Studio、E2Eで`openrouter/qwen/qwen3.6-flash`を使う。model IDはMastra provider registryで検証し、keyは追跡対象外の`.env.local`だけから読む。
- Web検索はMastra AgentのtoolとしてOpenRouterの現行`openrouter:web_search` server toolを登録する。deprecatedな`:online`や`plugins: [{ id: "web" }]`を使わず、検索結果上限とusageを記録する。
- Web検索queryへtoken、email、private asset ID、organization ID、Issue本文などtenant private dataを混ぜない。Web上の内容はuntrusted dataとして扱い、業務toolのinstructionに昇格させない。
- Mastra Studioは開発専用で、production Agent Workerの公開routeにはしない。StudioとWorkerでagent定義やtool実装をforkしない。

## 認証とtenant

- delegation、run grant、resume ticketは256-bit以上のrandom値を使い、DBにはhashだけを保存する。
- chat受付、run、tool call、action executeの各段階でlive sessionを再取得する。
- session ID、user ID、active organization ID、agent context epoch、thread ID、run ID、scope、expiryをgrantへ束縛する。
- active organization/account contextを変える全DB経路でepochを+1し、旧delegation、grant、run、action、resume ticket、policyを同じtransactionで失効する。
- 各内部callでsession expiry、active organization完全一致、context epoch、membership、現在permission、thread/run ownerを再検証する。
- model入力のorganization ID、route slug、page contextをauthorizationに使わない。
- 別tenant、非member、不存在resourceは同じnot foundへ丸める。
- account/organization設定はpure read projectionだけを提供し、mutation method自体を作らない。active organizationを修復し得るME use caseをAgent readへ流用しない。account projectionへorganization一覧を含めない。

## Toolと内部API

初期server toolは次に閉じる。

- read_account_context
- read_active_organization
- search_organization_members
- search_issue_labels
- search_issues
- get_issue
- create_issue
- update_issue
- delete_issue

account、organization、member、invitation、role、billing、auth、comment、既存Issue fileのmutation toolを追加しない。

toolはmodel向けintent、内部APIはdomain capabilityである。1 tool = 1 endpointを原則にしない。Issue write toolは共通のprepareIssueActionとexecuteIssueActionを使い、human public APIと同じIssue domain serviceへ合流させる。

API schemaはapps/apiのValibotに閉じる。Agent Worker用typeが必要なら@enterprise-agentic-saas/api/agent-clientをserver-only exportにし、apps/webからimportしない。Mastra toolは薄いadapterにし、認可、正規化、transaction、auditをtoolへ移さない。

## Issue actionと承認

- Mastra/AI SDKのtool approval eventはUI/stream protocolであり、認可の正本ではない。
- create/update/delete前にagent_actionsへnormalized payload、API生成preview、tool call、session/user/org/thread/run、target revision、idempotency、expiryを保存する。
- UIはmodel文章でなくcookie認証したAPIからcanonical previewを取得してYes/Noを表示する。
- clientがMastra continuationへapproval responseを渡すのはAPI decision保存後だけにする。
- manual approvalやstream切断後はAPI発行の60秒以下・一回限りのresume ticketを使い、resumeApprovedActionが同じroot budgetに属するfresh 5分のcontinuation runとgrantを発行する。approval responseだけでexecuteせず、continuationでstep/tool/write limitをresetしない。
- executeにはaction IDだけを渡し、承認後のpayload差し替えを禁止する。
- execute transaction内でもsession、active org、context epoch、membership、permission、action decision、expiry、Issue revision/delete権限、assignee membership、asset status/ETag/claim/run binding/action leaseを再検証する。競合時はIssueを変えずaction conflicted化とlease releaseだけをcommitする。
- Issue mutation、activity、audit、action receiptは同じDB transactionへ入れる。
- issueへmonotonic integer revisionを追加し、stale update/deleteは409で再preview・再approvalさせる。
- actorUserIdはhuman userのままにし、auditへsource、approval mode、action IDだけを安全に加える。promptやtool payloadは入れない。
- response loss/retryは同じaction receiptへ収束させ、mutationを二重実行しない。
- waiting approval中にprovider stream、request、plaintext grantを保持し続けず、decision後にresume ticketと保存stateから新しいstepを開始する。
- pending/approvedは最大15分、terminal payload/previewは7日でscrubし、本文を含まない最小receiptだけをaudit retentionへ合わせる。

## 自動許可

- modeはask_each、auto_write、auto_allに閉じる。
- auto_writeはIssue create（staged image attachmentを含む）とupdate、auto_allはdeleteも含む。updateを「安全」と誤認させる名称にしない。
- auto_all有効化はdeleteを明示する二段階のdestructive confirmationを要求する。
- policyはserverへ保存し、session/user/org/threadと最大15分のexpiryへ束縛する。
- Agent toolやclient request parameterからpolicyを作成・延長できない。
- organization/account切り替え、sign out、thread archive、permission変更でrevokeする。
- autoでもagent action、decision provenance、audit、receiptを必ず作る。
- Jotaiへpolicyの正本を置かず、TanStack Queryで取得する。

## Chat画像とIssue attachment

- Browserは画像をmultipartでAPIへ一度だけuploadし、chat messageにはopaque asset IDだけを保存する。
- base64/data URI、raw image、private URLをchat request、Mastra memory、Turso、tool argument、logへ保存しない。
- providerがdata URIを要求する場合も、Imagesで縮小したbounded variantをAgent Workerの最終provider callで一時生成するだけにする。
- 現行generic /files owner routeは作成済みIssueを要求する。fileOwnerTypesへagent_threadを足さず、files moduleへAgent asset専用routeを追加する。
- Agent asset uploadはcookie、CSRF、active org、context epoch、thread owner、quota、magic bytes、Images info、1辺10,000px以下、40,000,000 pixels以下を検証する。R2 PUT後のfinalize transactionでも全contextを再検証する。
- multipart fieldsはuploadId、fileSize、fileに閉じ、pending/R2/HEAD/readyの二段階処理とuploadId idempotencyで通信断へ収束させる。
- chatは1画像10,000,000 bytes以下、1 message最大4画像・合計20,000,000 bytes以下にする。generic file上限20,000,000 bytes、organization合計1 GiBは維持する。
- startRunでcurrent messageのassetをagent_run_assetsへ固定し、root runのgetAgentImageForModel/prepareはrunへ固定されたassetだけを受ける。continuationはresumed_action_idへscopeを閉じ、executeはactionのorigin run bindingを検証する。
- ready staged asset 200/org、pending 8/user・32/org、upload 60/user/hour・1,000/org/day、vision 200/user/day・2,000/org/dayを初期上限にし、bytes以外もatomicにrate limitする。
- pending uploadは1時間、ready chat assetは既定72時間、hard max 7日でexpireする。
- JPEG、PNG、WebP、GIFだけを初期対応し、visionではanimationを無効化する。
- originalは各putでstorage classを明示してprivate R2 Standardへ置き、Cloudflare Images hosted storageを使わない。
- Agent WorkerにR2 bindingを渡さない。APIのgetAgentImageForModelがACL確認後にmax edge 2,048px、WebP quality 75のvariantを4 MiB + 1 byteまでbounded readし、超過をprovider送信前に拒否する。上限内の結果だけをRPC Responseで返す。
- image内の文字やIssue dataはuntrusted contentであり、tool instructionとして扱わない。

現行filesはphysical objectとIssue ownerを同じrow/keyに持つため、単純なowner変更はしない。中核実装では次へ分離する。

- storage_objects: immutableなR2 object metadataとowner非依存key
- storage_object_claims: 1 physical objectにつき1件だけのlive holder
- agent_assets: thread/user/org、storage object、status、expiresAt
- files: permanentなlogical file、storage object、immutable Issue owner
- agent_action_assets: prepare時のasset ID、ETag、size snapshot

Issue createの最終transactionではpending file、asset promoting、claim transferring、claim file、asset promoted + storage FK null、file ready、最終assertionの順を固定する。SQLiteのimmediate triggerが各中間状態を検証し、transaction外へcommitしない。一般的なblob共有やowner変更APIは作らない。

v1からv2はadditive schema、compatibility dual-read/dual-write、fenced backfill、整合性検証、v2 write flag、旧isolate drain、contractのexpand/contractで移行する。旧R2 keyは動かさず、rollbackはflag停止後もcompatibility APIでv2を読む。

stream-copy fallbackはphase 0でzero-copy migrationの実証済みblockerが見つかり、別ADRで例外承認した場合だけ使う。その場合もmaterializing action、planned IDs、fenced retry、orphan cleanupを必須にし、BrowserやAgent toolから再uploadしない。

agent_action_assetsを1 assetにつき1件のactive leaseにし、scalar leaseへ依存しない。scheduled sweepとprepare時lazy sweepで期限切れactionをexpired化してleaseをreleaseする。chat-only cleanupはlive claimと期限内の未release leaseがないことを確認し、claim削除、storage objectのdeleting化、quota解放、exact-key cleanup jobをtransactionへ入れる。R2 prefix lifecycleはzero-copy promotion対象originalへ適用しない。

create_issueはtitle、description、labels、dueDate、assigneeId、attachmentAssetIdsを一つのactionとしてpreview/approveする。

- labelは既存表記へcase-insensitiveにcanonicalizeし、既存Issue schemaの件数・文字数を守る。
- relative due dateはbrowser IANA timezoneとprepare基準時刻で一度だけISOへ解決し、曖昧なら質問する。
- assigneeはmember searchのopaque IDだけを使い、prepareとexecuteの両方でmembershipを確認する。
- previewへ画像、永続添付になる旨、全説明、label、絶対期限、担当者表示名を出す。
- asset expiry、ETag変更、別actionのpromotion、assignee脱退は409で新actionを要求する。

## Client state

user-visibleでreload、copy URL、Back/Forward、Agent操作を再現したいstateにはnuqsを使う。

- Issue listはq、status、priority、assignee、label、sort、dir、pageをtyped query stateにする。
- selected threadはagentThread query parameterにするが、server ACL通過まで存在を信頼しない。
- defaultはURLから除去し、search typingはdebounce + replace、離散操作はpushを使う。
- filter/sort変更とpage=1をbatch更新する。
- URL、TanStack Query key、API request、controlled table stateを同じparsed objectから導出する。
- queryだけの変更をdirty leave guardへ通さない。
- shallow更新後のdataはclient TanStack Queryで取得し、RSC prefetchが再実行される前提を置かない。RSC出力を変えるqueryだけshallow: falseにする。
- URL view stateのraw search stringをSentry/log/analyticsへ出さず、Referrer-Policyをsame-originにする。
- prompt、draft、approval、tool result、message、email、token、asset IDなどをURLへ置かない。

form draftはTanStack Formだけを正本にする。AgentFormRegistryProviderへmounted form adapterを登録し、readable/writable field allowlist、organization/resource/revision/epochを検証する。

- patchはform.setFieldValueを使い、submitしない。
- account/org/auth/billing formはregistryへ登録せず、readもserver projectionだけにする。
- 即時PATCH fieldはdraft toolでなく承認付きserver toolを使う。
- userのdirty fieldを上書きするときは差分確認を出す。
- unmount、org mismatch、revision/epoch mismatchでは拒否する。

Jotaiはpane、drawer、width、短命composerなど再取得不要な一時UIだけに使う。thread、message、approval、policy、server result、URL state、form valueを複製しない。

## Active organizationとaccount切り替え

- switch開始時にmessage、image upload、tool、approval、form patchをfreezeする。
- dirty form、composer、in-flight upload、staged asset、run、pending approvalを検査し、StayまたはDiscard local draft and switchを出す。成功後はlocal Blob、selection、draftだけを破棄し、旧tenantのready assetへDELETEしない。送信前を含むready assetはserver既定72時間retention、pendingは1時間timeoutでcleanupされることを明示する。
- activation成功まではdraft/local Blob snapshotを保持する。
- active organization更新transactionでcontext epochを+1し、旧sessionのdelegation、grant、resume ticket、run、action、policyをrevoke/cancelし、action asset leaseを解放する。
- success後にAgent streamとuploadをabortし、Agent/files/issuesを含む全tenant queryをcancelする。
- agentThread、Issue query、Jotai composer、Blob URL、form registryをclearし、新slugへreplaceしてrouter.refreshする。
- securityはrevoke statusだけへ依存せず、各internal callでlive active orgとmembershipを再検証する。
- failure時は旧route/draftを維持し、別organizationへstateを付け替えない。
- route orgとactive orgが違う間、Agent composerとclient toolをdisableする。
- account switch前はold sessionのagent context revokeを成功させ、switch後に全Agent client stateをclearする。

## Agent Shellとclient state

- Agent Shellは専用pageに閉じず、`apps/web/app/(console)/layout.tsx`からproviderとshellを一度だけmountする。console内のroute navigationでconversationとcomposerを維持する。
- desktopは右側resizable pane（360px以上、既定460px、720px以下）、mobileはfull-screen sheetにする。open、pane幅、短命composerだけをJotaiへ置く。
- thread一覧、message、approval、usageはTanStack Queryまたはchat transportのserver stateを正本にする。専用`/agent` pageが必要でも同じshell componentを再利用し、別chat runtimeをmountしない。
- Issue filterのstatus、priority、assignee等はtable/detailと同じdomain controlを使う。filter用にtext-only Selectを複製せず、共通controlのpropsでfilter semantics、icon、badge、tipsを切り替える。

## Stateと保存

- Better Auth/Turso: session、active org、membership、permission
- Turso: thread metadata、run、grant、action、policy、usage、storage object、asset、file ownership
- Mastra memory/storage: messageとagent runtime state。production adapterを決めるまでin-memory persistenceを本番前提にしない
- R2: private original bytes
- AI SDK UI `useChat`: chat表示とAPI proxy stream
- TanStack Query: server control plane data
- nuqs: navigation/view state
- TanStack Form: form state
- Jotai: ephemeral shell state

message本文をTursoへ二重保存しない。prompt、response、Issue本文、raw image、base64、filename、object key、token、provider raw errorをSentry、structured log、auditへ出さない。Sentry SDKを正本にし、Cloudflare OTLP exportを重ねない。

## 本番deploy

- Web、API、Agentは別Worker、別Sentry projectにする。WebとAPIだけがcustom domainを持ち、Agentは`workers_dev`、preview URL、custom domainを無効化する。
- APIの`AGENT_RUNTIME` Service BindingはAgentのnamed runtime entrypointだけを指す。Agentの`AGENT_INTERNAL_API`はAPIのnamed `WorkerEntrypoint` `AgentInternalApi`だけを指す。どちらのdefault public fetchにも内部routeをmountしない。Worker名やentrypointを変えたらbinding先とtypegenを同時に更新する。
- 運用者はbackup/restore pointを確認してからproduction workflowを起動する。workflowはEnvironment approvalとconcurrency lockの下で、migration→API→Agent→Web→smokeの順に進める。`0011_file_activity_backfill`互換deployだけはAPIをmigration前へ先行させるが、その後もAgent→Webの順を守る。
- `AGENT_ASSET_UPLOAD_ENABLED`、`AGENT_RUNS_ENABLED`、`AGENT_VISION_ENABLED`、`AGENT_WRITES_ENABLED`はGitHub Environmentへ明示的な文字列`0`または`1`で必ず設定し、runtimeは`1`だけを有効にする。未設定や`true`を有効扱いしない。
- 3 Workerのruntime secretは`umask 077`の一時JSONを`wrangler deploy --secrets-file`へ渡してcodeと同じversionへ注入し、必ず削除する。secret値をCLI引数、log、`GITHUB_OUTPUT`、artifactへ出さない。特にOpenRouter key、各Sentry DSN、Sentry auth tokenをjob-wide envへ置かない。
- 3 Workerは同じcommit SHAを`SENTRY_RELEASE`に使う。API/AgentはWrangler dry-run artifactへSentry debug IDをinject・uploadしてから同じbundleを`--no-bundle` deployし、WebはSentry upload付きOpenNext build後に生成済みartifactをdeployする。Sentry upload失敗後にdeployを続行しない。
- `SENTRY_AUTH_TOKEN`はsource map stepだけへ渡しruntimeへ保存しない。Cloudflareの`upload_source_maps`はCloudflare stack向けに維持するがSentry uploadの代わりにしない。application telemetryはSentry SDKだけから送り、Cloudflare Sentry OTLP exportを重ねない。
- deploy前にAPI/Agent/Webの`cf:typegen`と全WorkerのCloudflare dry-runを通す。deploy後はAPI health/ready/OpenAPI、Web sign-in、Agent通常HTTPのfail-closed、API→Agent stream、Agent→API RPC、thread ACL、feature flag、3 projectのreadable stackをsmokeする。

## 実装時の確認

- delegation expiry/replay、cross-tenant ID、org switch race、membership/role失効をAPI integration testする。
- manual Yes/No、auto policy、stale revision、idempotent retryをtestする。
- same image/action retryでstorage object、Issue、fileが各1件だけになることをtestする。
- chat-only asset expiry、promotionとのrace、quota解放、R2 cleanupをtestする。
- chat transport/Mastra memory/Turso/log/Sentryにbase64/raw imageが残らないことをtestする。
- nuqsのreload/Back/ForwardとAgent query操作、form dirty conflictをPlaywrightで確認する。
- Playwrightはfake Agent protocolで成功扱いにせず、実API Worker、private Agent Worker、Mastra `product-agent`、OpenRouter Qwen3.6 Flashを起動する専用suiteを持つ。外部callを行うsuiteは明示commandへ分離し、keyやresponse本文をartifactへ出さない。
- `bun run dev`と`bun run dev:agent:studio`で同じ`src/mastra/index.ts`がloadされ、Studioのagent listとQwen smokeが成功することを確認する。
- localでは`docs/upload-memory-smoke.md`の専用Workerで10,000,000-byte multipartを並列実行し、失敗数とworkerd peak RSSの回帰を記録する。local process RSSはproduction 128 MB/isolateの証明にせず、release前にreal Workers環境でもAPI→Agent stream、Agent→API RPC、Images input、memory errorをsmokeする。
- Cloudflare変更時はBun buildだけで完了扱いにせず、少なくとも次を実行する。

    bun run check
    bun run --cwd apps/api cf:typegen
    bun run --cwd apps/agent cf:typegen
    bun run --cwd apps/web cf:typegen
    bun run build:cloudflare
