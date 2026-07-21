---
name: agent-runtime
description: enterprise-agentic-saas-starterへCloudflare Agents SDKのchat Agent、Agent Worker、AI SDK tool、human-in-the-loop承認、自動許可、Issue CRUD、画像入力、client tool、active organization切り替えを追加・変更・調査するときに使う。
---

# Agent Runtime

このskillはWeb、API、Agentの3 WorkerにまたがるAgent機能で使う。実装前にdocs/agent-runtime.mdを読み、以下のrepo固有contractを優先する。

## Runtime境界

- Web Worker、API Worker、Agent Workerの3 Workerに分ける。
- Agent runtimeはCloudflare Agents SDKのAIChatAgentとAI SDK Coreを正本にする。初期実装へMastraを重ねない。
- Agent Workerはcustom domainでAgent protocol routeだけを公開し、workers.devと他routeは閉じる。
- BrowserはAPI発行の60秒以下・一回限りのopaque connection ticketでAgent WebSocketへ接続する。cross-origin WebSocketへcookieや任意Authorization headerがある前提にしない。
- Service BindingはAgentからAPIへの一方向だけにし、APIからAgentへのbindingや循環callを作らない。
- Agent WorkerはTurso、R2、Better Auth tableへ直接触らない。
- Agent WorkerからAPIへはnamed WorkerEntrypointのtyped RPCを使う。任意pathやtool名を渡すgeneric dispatcherを作らない。

## 認証とtenant

- ticketとgrantは256-bit以上のrandom値を使い、DBにはhashだけを保存する。
- connection、run、tool call、action executeの各段階でlive sessionを再取得する。
- session ID、user ID、active organization ID、agent context epoch、thread ID、run ID、scope、expiryをgrantへ束縛する。
- active organization/account contextを変える全DB経路でepochを+1し、旧ticket、grant、run、action、resume ticket、policyを同じtransactionで失効する。
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

API schemaはapps/apiのValibotに閉じる。Agent Worker用typeが必要なら@enterprise-agentic-saas/api/agent-clientをserver-only exportにし、apps/webからimportしない。

## Issue actionと承認

- AI SDKのneedsApprovalはUI/stream protocolであり、認可の正本ではない。
- create/update/delete前にagent_actionsへnormalized payload、API生成preview、tool call、session/user/org/thread/run、target revision、idempotency、expiryを保存する。
- UIはmodel文章でなくcookie認証したAPIからcanonical previewを取得してYes/Noを表示する。
- clientがAgent protocolへapproval responseを送るのはAPI decision保存後だけにする。
- manual approval、reconnect、DO hibernation後はAPI発行の60秒以下・一回限りのresume ticketを使い、resumeApprovedActionが同じroot budgetに属するfresh 5分のcontinuation runとgrantを発行する。approval responseだけでexecuteせず、continuationでstep/tool/write limitをresetしない。
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
- base64/data URI、raw image、private URLをWebSocket、Durable Object SQLite、Turso、tool argument、logへ保存しない。
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
- dirty form、composer、in-flight upload、staged asset、run、pending approvalを検査し、StayまたはDiscard local draft and switchを出す。未送信・leaseなしassetは成功後に即cleanupし、送信済みassetはretentionまで残ることを明示する。
- activation成功まではdraft/local Blob snapshotを保持する。
- active organization更新transactionでcontext epochを+1し、旧sessionのticket、grant、resume ticket、run、action、policyをrevoke/cancelし、action asset leaseを解放する。
- success後にWebSocketとuploadをabortし、Agent/files/issuesを含む全tenant queryをcancelする。
- agentThread、Issue query、Jotai composer、Blob URL、form registryをclearし、新slugへreplaceしてrouter.refreshする。
- securityはrevoke statusだけへ依存せず、各internal callでlive active orgとmembershipを再検証する。
- failure時は旧route/draftを維持し、別organizationへstateを付け替えない。
- route orgとactive orgが違う間、Agent composerとclient toolをdisableする。
- account switch前はold sessionのagent context revokeを成功させ、switch後に全Agent client stateをclearする。

## Stateと保存

- Better Auth/Turso: session、active org、membership、permission
- Turso: thread metadata、run、grant、action、policy、usage、storage object、asset、file ownership
- Agent Durable Object SQLite: message、stream、runtime state
- R2: private original bytes
- useAgentChat: chat表示とstream
- TanStack Query: server control plane data
- nuqs: navigation/view state
- TanStack Form: form state
- Jotai: ephemeral shell state

message本文をTursoへ二重保存しない。prompt、response、Issue本文、raw image、base64、filename、object key、token、provider raw errorをSentry、structured log、auditへ出さない。Sentry SDKを正本にし、Cloudflare OTLP exportを重ねない。

## 実装時の確認

- ticket expiry/replay、cross-tenant ID、org switch race、membership/role失効をAPI integration testする。
- manual Yes/No、auto policy、stale revision、idempotent retryをtestする。
- same image/action retryでstorage object、Issue、fileが各1件だけになることをtestする。
- chat-only asset expiry、promotionとのrace、quota解放、R2 cleanupをtestする。
- WebSocket/DO/Turso/log/Sentryにbase64/raw imageが残らないことをtestする。
- nuqsのreload/Back/ForwardとAgent query操作、form dirty conflictをPlaywrightで確認する。
- real Workers環境でticket、reconnect、RPC stream、Images input、10 MB upload memoryをsmoke testする。
- Cloudflare変更時はBun buildだけで完了扱いにせず、少なくとも次を実行する。

    bun run check
    bun run --cwd apps/api cf:typegen
    bun run build:cloudflare
