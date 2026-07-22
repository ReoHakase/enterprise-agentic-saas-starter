# Agent機能 runtime・tool・承認設計

更新日: 2026-07-22
状態: 実装前の設計正本

この文書は、認証済みユーザーがactive organization内の情報を会話で参照し、Issueを操作するAgent機能の実装仕様を定める。草案の3 Worker構成は維持するが、認証経路、状態の正本、human-in-the-loop、tenant切り替え、内部APIの境界を実装可能な形へ修正する。

## 結論

- Web、API、Agentの3 Worker構成を採用する。
- Agent runtimeはCloudflare Agents SDKのAIChatAgentとAI SDK Coreを第一候補にする。Mastraは初期実装へ重ねない。
- Agent Workerは「非公開Worker」ではなく、認証必須のAgent protocol routeだけをcustom domainで公開する。業務APIは公開しない。
- BrowserからAgent Workerへの接続は、API Workerが発行する短寿命・一回限りのopaque ticketで認証する。
- Agent Workerから業務dataへ触る経路は、API Workerのnamed WorkerEntrypointに対する一方向のService Bindingだけにする。
- accountとorganizationはread-only projectionだけをtoolとして公開し、mutation toolを作らない。初期のserver-side mutationはIssueのcreate、update、deleteだけに閉じる。
- Issue mutationは、DBに保存したcanonical actionと承認decisionを実行権限の正本にする。Yes/No UIだけを認可境界にしない。
- 自動許可はclient stateではなく、session・organization・thread・期限に束縛したserver-side policyにする。
- user-visibleで共有・再現したいpage stateにはnuqsを使う。form draftはTanStack Formを正本にし、Jotaiへ複製しない。
- toolと内部endpointを機械的に1対1へしない。toolはモデル向けintent、内部APIは安定したdomain capabilityとして設計する。

## 対象範囲

初期リリースで扱うもの:

- owner本人だけが利用できるorganization内のprivate thread
- streaming chatと切断後の再接続
- chatへ添付した画像の理解、説明文生成、private R2上の短期保持
- account、active organization、member、Issueのread
- title、description、label、due date、assignee、画像attachmentを含むIssueのcreate
- Issueのupdate、delete
- mutationごとのmanual approval
- 時限付きauto approval policy
- allowlistされたpage navigation、Issue list query操作、form draftのread/write
- run、action、usage、auditのtenant-safeな記録

初期リリースで扱わないもの:

- account、organization、member、invitation、role、billing、auth設定のmutation
- Issue comment、非画像file、既存Issueへのattachment追加・差し替え
- browser一般操作、任意URL fetch、code execution、MCP、外部channel
- background autonomy、schedule実行、複数organizationをまたぐrun
- organization内の共有threadやadminによる他人のthread閲覧
- chain-of-thoughtの保存・表示

## 草案から解消した矛盾と懸念

| 草案上の懸念 | 修正した仕様 |
| --- | --- |
| Agent Workerにpublic routeを持たせない一方、BrowserからuseAgent系clientで直接接続する | Agent protocol routeだけを認証必須で公開する。private-only proxyは別spikeが必要で、初期構成に含めない |
| APIからAgent、AgentからAPIの双方向Service Binding | AgentからAPIへの一方向bindingに固定し、deploy cycleとrequest loopを作らない |
| Mastra、Agents SDK、AI SDKがmessage、memory、tool loopを重複所有する | 初期runtimeをAIChatAgentとAI SDK Coreに一本化する。Mastraは具体的な不足が確認された場合だけ比較する |
| approval UIを出せば安全という前提 | canonical action、server-side decision、再認可、revision、idempotencyをDBで強制する |
| auto modeをJotaiやrequest parameterで切り替える | APIに保存した短寿命policyだけを認め、Agent自身はpolicyを変更できない |
| form draftをJotaiへ複製する | TanStack Formを唯一のdraft正本にし、mounted form adapter経由で限定fieldだけを操作する |
| 1 tool = 1 endpointを設計原則にする | tool intentとdomain capabilityを分離し、複数write toolは共通のprepare/execute protocolを使う |
| 現在のIssue tableがclient-side stateと最大100件の取得に閉じる | typed URL state、server filter、stable pagination、query keyを同じ値から構築する |
| active organizationの切り替えがchat、approval、draftを考慮しない | switch barrier、server-side revoke、WebSocket close、cache cancel、route refreshを一つのflowにする |
| Agentが既存のME取得を呼べばread-onlyになるという前提 | 現行のME取得はactive organizationを修復し得るため、Agent専用の副作用なしprojectionを作る |
| chat画像をbase64でmessageへ埋め、Issue作成時に再uploadする案 | 画像はBrowserから一度だけprivate R2へstaging uploadし、messageにはopaque asset IDだけを保存する。Issue作成時は同じR2 blobをDB transactionで一方向claimし、browser uploadもR2 copyも繰り返さない |

## 3 Workerの責務

    Browser
      | cookie + CSRF
      v
    API Worker --------------------> Turso
      | connection ticket
      v
    Browser ===== authenticated WebSocket ===== Agent Worker
                                                   | AIChatAgent Durable Object
                                                   | model provider
                                                   |
                                                   +---- Service Binding ----> API Worker named entrypoint

矢印の制約:

- BrowserからAPIへは既存のSecure/HttpOnly session cookieを使う。
- BrowserからAgentへcookieを送らず、API発行ticketだけを使う。
- API WorkerからAgent WorkerへService Bindingを張らない。
- Agent WorkerからTurso、R2、Better Auth tableへ直接触れない。
- Web WorkerからAgent内部RPCを呼ばない。

### Web Worker

- Agent shell、thread selector、composer、message、tool result、approval UIを描画する。
- chat送信前に画像をfiles moduleへ追加する認証付きAgent asset専用routeへ1 fileずつstream uploadし、readyになったasset IDだけをmessageへ加える。
- Cloudflare Agents clientのuseAgentとuseAgentChatで接続・streamを扱う。
- server dataはTanStack Query、form draftはTanStack Form、URL stateはnuqs、一時UIだけはJotaiで扱う。
- APIから取得したcanonical action previewを表示し、Yes/No decisionをAPIへ送る。
- Agentが要求したclient toolをallowlistとcurrent page contextに照らして実行する。

### API Worker

- Better Auth session、active organization、membership、role、permissionを正本として検証する。
- thread metadata、ticket、grant、run、action、approval policy、usage、auditをTursoへ保存する。
- Agent Worker専用のnamed WorkerEntrypointを提供する。
- Issue domain serviceをhuman APIとAgent capabilityの両方から再利用する。
- staged chat imageのquota、期限、model用変換、Issue fileへの一方向claimを管理する。
- actionのprepare、decision、executeをtransactionと状態遷移で強制する。

### Agent Worker

- AIChatAgentのDurable Objectでmessage、stream、接続再開、tool loopを管理する。
- model provider secretを保持する。
- system instructionとtool schemaを保持するが、業務dataの認可判断はしない。
- browser接続ごと、runごと、tool callごとにAPIのcapabilityを通す。
- vision modelへ渡す画像はAPI bindingから受け取る短命の変換streamだけにし、R2 bindingを持たない。
- database、R2、公開業務endpoint、任意fetchへ直接アクセスしない。

## Runtime選定

初期実装はCloudflare Agents SDKのAIChatAgentとAI SDK Coreを使う。これによりDurable Object、WebSocket、message persistence、resumable stream、tool approvalのclient protocolを一つのruntimeで扱える。

Mastraは初期実装へ追加しない。Studio、eval、workflow、provider abstractionなどに実測上の不足が出た場合だけ、次を満たすspikeとして評価する。

- messageとmemoryの正本を二重化しない
- tool executionとapprovalのauthorityをAPIから移さない
- Durable Object lifecycleと再接続を壊さない
- bundle size、cold start、Cloudflare互換性をbuildとsmoke testで証明する

AI ElementsはUI componentの参考またはsource-owned componentとして利用できるが、runtimeや認可境界にはしない。

## 接続認証とrun lifecycle

Browser WebSocketはcross-origin接続時に任意のAuthorization headerを付けられない。そのため、APIが発行するopaque ticketをquery parameterとして渡す。ticketがaccess logやtelemetryへ残らないよう、Agent Workerはsearch部分を記録しない。

### 接続手順

1. BrowserはAPIのPOST /agent/connectionsへthread IDだけを送る。
2. APIはcookie、Origin、CSRF、session、active organization、membership、thread ownerを検証する。
3. APIは256-bit以上のrandom ticketを生成し、SHA-256 hashだけをTursoへ保存する。
4. ticketはsession ID、user ID、organization ID、thread ID、agent context epoch、許可scope、発行時刻、60秒以下の期限へ束縛する。
5. Browserはwss://agent.example.com/agents/issue-assistant/{threadId}?ticket=... へ接続する。
6. Agent Workerはexact Originとrouteを検証し、API bindingのconsumeConnectionTicketを呼ぶ。
7. APIはticketをatomicに一回だけconsumeし、短寿命connection grantと最小限のidentity projectionを返す。
8. user messageごとにAgent WorkerがstartRunへmessageが参照するasset IDを渡す。APIはready状態、session、user、organization、thread、context epoch、件数、合計bytesを検証し、agent_run_assetsへ固定してからroot run IDとrun grantを返す。
9. 各tool callはrun grantを提示し、APIがlive session、active organization、membership、permission、run状態を再検証する。

reconnectでもticketを再利用しない。clientのasync query生成でAPIから新しいticketを取得し、同じthreadへ再認証する。既存streamへ再接続できるのは、同じsession・user・organization・thread・context epochに対するrunがまだ再開可能な場合だけとする。

ticket、connection grant、run grant、resume ticketはplaintextで保存しない。DBにはhashだけを置き、Agent Workerでは現在eventのmemoryだけで扱う。connection ticketの一時的なWebSocket query以外のURL、browser history、error、Sentry、structured log、auditへ出さない。期限切れ、再利用、別thread、別Origin、別organizationは同じ安全な接続失敗へ丸める。

### 各内部callで必ず再検証するもの

- 呼び出しがAgent Worker用Service Bindingから来たこと
- ticketまたはgrant hash、期限、失効、scope
- sessionが存在し、期限切れでないこと
- session userがgrantのuserと一致すること
- session.activeOrganizationIdがgrantのorganizationと一致すること
- sessionのagent context epochがgrant/action/upload reservationと一致すること
- userが現在もorganization memberであること
- toolに必要なpermissionが現在もあること
- thread owner、run owner、organizationが一致すること
- writeの場合はaction、approval、target revisionが有効であること

Service Binding自体はnetwork boundaryであり、上記のcapability token検証を省略する理由にはしない。

## Threadとrun

- threadはorganization内でowner userだけがread/writeできるprivate resourceにする。
- Agent Durable Objectのnameはunguessableなthread IDから決定する。
- URLのagentThreadはselection hintにすぎず、server ACLを通過するまで存在を認めない。
- 他人、別organization、不存在のthreadは同じnot foundへ丸め、URLからagentThreadを除去する。
- thread archiveは一覧から隠すだけで、削除ではない。
- production前にTurso metadataとDurable Object messageを両方purgeするdelete jobを実装する。organization削除とaccount削除も同じpurge経路へ接続する。
- background autonomyは許可しない。client disconnect、user cancel、organization/account切り替えでrunをcancel可能にする。

初期のhard limitは環境設定でさらに小さくできるようにし、少なくとも次を上限にする。

- user message: 20,000文字
- model step: 8
- tool execution: 20回
- write action: 5件
- run wall time: 5分
- read result: 1 toolあたり50件

run wall timeは各active model/tool executionに対する上限であり、approval待機時間を含めない。manual approval後のresumeApprovedActionは元runを再開せず、同じroot_run_id、parent_run_id、resumed_action_idを持つfresh 5分のcontinuation runとgrantを作る。model step、tool execution、write action、token/usage上限はroot run chain全体で累積し、continuation作成でresetしない。

上限到達は部分成功を隠さず、完了済みaction receiptと安全な停止理由を返す。writeを自動retryするときもaction IDとidempotencyを再利用する。

## Tool catalog

### Server-side read tool

| Tool | Capability | 制約 |
| --- | --- | --- |
| read_account_context | 本人の表示名、profile imageなどallowlistした本人情報 | email、session、passkey、provider、token、billingを返さない。副作用なし |
| read_active_organization | active organizationの名前、slug、本人role、Agent向けpermission、allowlistした非secret設定 | active一致を必須にし、secretやprovider設定を返さない |
| search_organization_members | active organizationのmember検索 | display name、profile image、roleだけ。emailは初期状態で返さない |
| search_issue_labels | organization内Issueで使われているlabel候補を検索 | case-insensitiveに集約し、既存表記だけを返す |
| search_issues | typed filterとstable paginationでIssue検索 | organizationはgrantから決定し、model入力のorganization IDを信頼しない |
| get_issue | Issue詳細を取得 | organization IDとIssue IDまたはnumberを常に組み合わせる |

read_account_contextは、active organizationを修復し得る既存のME use caseを再利用しない。Agent専用のpure projectionを作り、利用可能organization一覧や他organizationの名前をmodelへ渡さない。organization selectorはhuman UI/control planeに閉じ、Agent runは常にactive organization 1件だけを扱う。

### Server-side write tool

| Tool | Capability | 承認 |
| --- | --- | --- |
| create_issue | active organizationへIssueを作成し、同じthreadのstaged imageを0件以上claim | manualまたは有効なauto policy |
| update_issue | 既存Issueのallowlist fieldを更新 | manualまたは有効なauto policy、expected revision必須 |
| delete_issue | 既存Issueを削除 | manual。auto_allを明示有効化した場合だけauto、expected revision必須 |

既存のrole ruleを維持する。memberがdeleteできるのは自分が作成したIssueだけ、admin以上はorganization内のIssueをdeleteできる。Agentだから権限を拡張しない。

account、organization、member、invitation、role、comment、既存Issueのfile mutation toolは作らない。chat画像はBrowserが事前uploadし、create_issue actionだけがstaged assetをIssue fileへclaimできる。promptで対象外操作を要求されてもunsupportedとして説明する。

### Client-side tool

| Tool | 動作 | 制約 |
| --- | --- | --- |
| ui_navigate | app内のallowlist pathへ移動 | same-originのcanonical routeだけ。任意URL、javascript URL、redirect parameterは禁止 |
| ui_set_issue_query | Issue listのquery stateを変更 | nuqsの同じtyped setterをhuman UIと共有する |
| ui_open_issue | canonical Issue URLを開く | organization slugとIssue numberはpage contextから組み立てる |
| ui_read_form_draft | mounted formの許可fieldを読む | account/org/auth/billing formはregistryへ登録しない。password、token、hidden fieldは除外 |
| ui_patch_form_draft | mounted formの許可fieldを変更 | submitしない。dirty conflictとrevisionを確認する |

row selection UIが実装されるまでui_select_issuesは作らない。client toolはDOMや表示中rowをscrapeせず、version付きpage context registryだけを見る。page unmount、organization mismatch、resource revision mismatch、registry epoch mismatchでは失敗させる。

## 内部API設計

### 方針

1 tool = 1 endpointは採用しない。

toolはモデルが理解するintentで、内部APIは認可、transaction、idempotencyを持つdomain capabilityである。1つのtoolが複数capabilityを使う場合も、複数toolが同じcapabilityを共有する場合もある。tool名の追加だけでnetwork surfaceを増やさない。

Agent WorkerからAPI Workerへはnamed WorkerEntrypointのRPCを使う。HTTP fetch形式の汎用/internal/tools/{name}や、任意pathを渡せるdispatcherは作らない。Valibot schemaはapps/api内に閉じ、各method入口でruntime validationする。

想定するentrypoint method:

- consumeConnectionTicket
- startRun
- cancelRun
- finishRun
- readAccountContext
- readActiveOrganization
- searchOrganizationMembers
- searchIssueLabels
- searchIssues
- getIssue
- getAgentImageForModel
- prepareIssueAction
- getIssueActionDecision
- resumeApprovedAction
- executeIssueAction
- recordUsage

create_issue、update_issue、delete_issueは共通のprepareIssueActionとexecuteIssueActionを使う。kindはclosed union、payloadはkind別Valibot schemaで検証する。executeにはaction IDだけを渡し、modelが承認後にpayloadを差し替えられないようにする。

create_issueのpayloadはtitle、description、status、priority、labels、dueDate、assigneeId、attachmentAssetIdsをclosed schemaで受ける。attachmentAssetIdsは同じsession・user・organization・threadのreadyかつ期限内assetだけを許可し、modelがobject key、URL、raw bytesを渡す形にしない。

型が必要な場合は@enterprise-agentic-saas/api/agent-clientをserver-only exportとして追加する。apps/agentだけがimportし、apps/webは従来どおり@enterprise-agentic-saas/api/client以外をimportしない。実装やDB objectをexportしない。

public browser APIは次のcontrol planeに限定する。

- POST /agent/connections
- GET /agent/threads
- POST /agent/threads
- POST /agent/threads/:threadId/archive
- GET /agent/actions/:actionId
- POST /agent/actions/:actionId/decision
- POST /agent/actions/:actionId/resume-ticket
- PUT /agent/approval-policy
- DELETE /agent/approval-policy
- POST /agent/context/revoke

すべてcookie認証、exact Origin、CSRF、rate limitを使う。action decisionにはopaque idempotency keyを要求する。public responseにgrant、stored payload、provider dataを含めない。例外としてresume-ticket routeは、approved actionを再開する60秒以下・一回限りのopaque ticketだけを返し、DBにはhashだけを保存する。

chat imageのbinary data planeはfiles moduleへ次だけを追加する。

- POST /files/organizations/:organizationId/agent-threads/:threadId/assets
- GET /files/organizations/:organizationId/agent-assets/:assetId/preview/:width
- DELETE /files/organizations/:organizationId/agent-assets/:assetId

このrouteもactive organization、thread owner、tenant scopeを検証する。original download、public URL、Agent Workerからのpublic self-callは提供しない。

previewはauthorization後にだけcacheを読み、private responseを返す。DELETEはreadyかつ未promoteでactive action leaseのないassetだけをconditional claimし、claim削除、asset deleted、quota解放、storage object deleting、exact-key cleanup jobを同じtransactionへ入れる。active lease中は409とし、actionを先にNo/cancelするよう案内する。promoted assetの削除はIssue fileの権限付きdelete flowだけで行う。

## Issue actionとhuman-in-the-loop

AI SDKのneedsApprovalとclientのapproval responseは、streamとUIを停止・再開するprotocolとして使う。ただし、authorizationの正本にはしない。

### Prepare

1. write toolがprepareIssueActionを呼ぶ。
2. APIはrun grant、session、active organization、membership、permissionを再検証する。
3. inputをnormalizeし、target Issueとrevisionを同じorganizationで取得する。
4. createの場合はattachment assetが現在runへ固定され、同じthreadのready・未claim・期限内imageであること、assigneeが現在もmemberであること、labelとdue dateがschema内であることを確認する。
5. API自身がhuman-readableなcanonical previewを生成する。
6. agent_actionsへnormalized payload、preview、tool call ID、session、user、organization、thread、run、context epoch、target revision、idempotency key、expiryを保存し、attachmentごとにagent_action_assets leaseを同じtransactionで取得する。既に別の非terminal actionが保持するassetは409にする。
7. 有効なauto policyがなければstatusをpendingにし、runをwaiting_approvalにする。
8. 有効なpolicyがあればdecision provenanceをauto_policyとして保存し、同じtransactionでstatusをapprovedにする。

UIはmodelが生成した説明ではなく、GET /agent/actions/:actionIdから取得したcanonical previewを表示する。最低限、action種別、title、description、label、due date、assigneeの表示名、添付画像thumbnail、変更前後、破壊性、承認期限を示す。

### Manual decision

- Yes/NoはPOST /agent/actions/:actionId/decisionへ送る。
- APIは現在のbrowser session、active organization、thread owner、action状態、期限を再検証する。
- 同じidempotency keyと同じdecisionのretryは同じreceiptへ収束させる。
- 異なるdecision、別session、別payloadのretryは409にする。
- Yesのresponseまたはresume-ticket routeは、action、session、user、organization、thread、context epochへ束縛した60秒以下・一回限りのresume ticketを発行する。
- clientはAPI decision成功後にだけaction IDとresume ticketをAgent protocolへ渡す。これはwake-up hintであり、approvalの正本ではない。
- No、期限切れ、org switch、account switch、permission喪失はactionをterminal stateへ進め、agent_action_assets leaseを同じtransactionでreleaseし、execute不可にする。

### Execute

1. 同じmodel stepが生存中のauto approvalでは既存run grantを使う。manual approval、reconnect、hibernation後はAgent WorkerがresumeApprovedActionへaction IDとresume ticketを渡し、APIがticketをatomic consumeして元runと同じroot budgetへ属するcontinuation runと新しい短寿命run grantを発行する。
2. Agent Workerはrun grantとaction IDだけでexecuteIssueActionを呼ぶ。
3. APIはlive session、active organization、context epoch、membership、permission、approval、expiryをpreflightするが、この結果だけでcommitしない。
4. 単一DB transaction内でsession active organization、context epoch、membership、現在permission、actionがapprovedかつ未実行であることを再度読む。
5. 同じtransactionでupdate/deleteのtarget revisionとdelete権限、create/updateのassignee membership、label/due date schema、全assetのready状態、source ETag/size、current storage claim、未release action leaseを再検証する。root runではcurrent run bindingを、continuationではcontinuation.resumed_action_idとactionのorigin run bindingを検証し、conditional updateによりactionとasset claimを取得する。
6. いずれかが変わっていればactionをconflictedにし、action asset leaseをreleaseするtransactionだけをcommitして409を返す。stale payloadでIssueを変更しない。
7. createではIssue mutation、staged assetからIssue fileへの一方向claim、Issue activity、audit log、action receipt、actionのsucceeded化、action asset lease releaseを同じtransactionでcommitする。
8. update/deleteでもIssue mutation、Issue activity、audit log、action receipt、actionのsucceeded化を同じtransactionでcommitする。
9. transaction前後にR2 copyやprovider callを挟まない。commit前の一時障害は全変更をrollbackし、同じaction IDでretryできる。
10. 成功済みactionのretryは保存済みreceiptを返し、mutationを再実行しない。

Issueへ整数のmonotonic revisionを追加する。createは1、updateはatomicに+1する。stale update/deleteは409とし、新しいpreviewとapprovalを要求する。updatedAtだけをconcurrency tokenにしない。

actorUserIdは常に実ユーザーにし、別のAgent userを作らない。audit metadataにはsource = agent、approvalMode = manual またはauto_policy、action IDを安全な形式で保存する。prompt、message、Issue本文、tool argument、tokenはauditへ入れない。

runがwaiting_approvalの間、provider stream、Worker request、plaintext grantを保持しない。decision後はresume ticketを使い、保存済みmessage/action stateから新しいmodel stepとして再開する。decision通知が切断で失われた場合は、再接続後にcookie認証したGET actionでstatusをreconcileし、approvedなら新しいresume ticketを発行する。resume ticketを使わずapproval responseだけでexecuteできてはならない。

### Action state

許可する永続状態遷移は次に閉じる。

    pending  -> approved | rejected | expired | canceled
    approved -> succeeded | expired | canceled | conflicted

`executing`をtransactionの外から見える中間状態としてcommitしない。approvedのconditional claim、全material preconditionの再検証、Issue mutation、receipt、succeeded化を同じtransactionへ入れるため、process停止やDB一時障害ではapprovedのまま残り、同じaction IDのretryへ収束する。revision、delete権限、asset ETag/claim/lease、assigneeなどの再検証に失敗した場合は、その再検証transactionでconflicted化とlease releaseだけをatomicにcommitし、新しいpreviewとapprovalを要求する。succeeded、rejected、expired、canceled、conflictedはterminalであり、別状態へ戻さない。

### Action data retention

- pending/approved actionの有効期限は最大15分にし、期限後はexecuteできない。
- scheduled sweepは期限切れpending/approved actionをexpiredへ進め、agent_action_assets leaseを同じtransactionでreleaseする。prepareも対象assetの期限切れleaseをlazy sweepしてからpartial unique leaseを取得し、sweep遅延で恒久的な409を起こさない。
- normalized payloadとcanonical previewはterminal後7日でscrubし、status、kind、target ID、revision、decision provenance、result ID、error classification、timestampsだけの最小receiptを残す。
- 最小receiptは既存audit retentionに合わせ、少なくともidempotency retry期間中は保持する。Issue本文、画像、tool payloadをreceiptへ複製しない。
- thread、account、organization削除時はaction本文とreceiptをcross-store purge jobの対象にする。
- expired/rejected actionをmodel contextへ自動再投入しない。

## 自動許可policy

modeは次の3つにする。

| Mode | 自動承認する操作 |
| --- | --- |
| ask_each | なし。既定値 |
| auto_write | Issue create（staged image attachmentを含む）とupdate |
| auto_all | Issue create、update、delete |

auto_writeはallowlist内の全updateを含み、status close、description置換、assignee解除も自動化し得る。「safe」と表示せず、有効化確認へ対象operationを列挙する。将来、field/value単位の非破壊policyを導入する場合は別modeとして定義する。

auto_allの有効化は、通常のtoggleに加えてdeleteを含むことを明示した二段階のdestructive confirmationを要求する。

policyの制約:

- serverに保存し、session ID、user ID、organization ID、thread IDへ束縛する
- 最大15分で失効し、延長には再操作を要求する
- Agent toolから作成・変更・延長できない
- organization切り替え、account切り替え、sign out、thread archive、permission変更で失効させる
- client requestがauto=trueを送ってもpolicyがなければ無視する
- 自動承認でもagent_actionsとdecision receiptを必ず作る
- attachment件数・合計bytes・write件数のserver-side上限をpolicyより優先する
- UIに残り時間、scope、許可operationを常時表示し、すぐ解除できるようにする

Jotaiには表示中modeの正本を置かない。TanStack Queryでserver policyを取得し、mutation後にinvalidateする。

## URL stateとnuqs

nuqsを採用する。理由は、Next.js App Router上でtyped query parser、default除去、history制御、shallow update、debounce/throttle、server-side parsingを同じ定義から使えるためである。

URLへ置くのは、reload、Back/Forward、copyしたURL、Agent操作でも再現したいview stateだけにする。

Issue listのquery contract:

| URL key | 意味 | default |
| --- | --- | --- |
| q | title/description検索。200文字以下 | 空 |
| status | open、in_progress、closed | all |
| priority | no_priority、low、medium、high、urgent | all |
| assignee | organization member ID | all |
| label | label完全一致 | all |
| sort | number、created、updated、due、priority、status | updated |
| dir | asc、desc | desc |
| page | 1始まりのpage | 1 |
| agentThread | 選択中private thread ID | 未選択 |

typed parserはapps/web/features/issues/search-params.tsなどfeature内へ置く。NuqsAdapterをappのclient provider境界へ追加し、Server Componentは同じparserのserver cacheで値を読む。

実装規則:

- search入力は短いdebounceとhistory replaceを使う。
- filter、sort、page、Agentによる明示操作はhistory pushを使い、Backで戻せるようにする。
- default値はURLから除去する。
- filterまたはsort変更時はpageを1へ同じbatchで戻す。
- query-only変更はformのleave guardを発火させない。
- shallow updateを基本にする。Server Componentでのparse/prefetchは初期hydrationだけに使い、以後のtable dataは同じparsed stateをquery keyにしたclient TanStack Queryが取得する。
- RSC自身の出力を変えるqueryだけはshallow: falseにし、shallowのままRSC prefetchが再実行される前提を置かない。
- TanStack Query keyへorganization IDと全parsed filter/pageを含める。
- API request、table controlled state、URLを同じparsed objectから導出し、別useStateへ複製しない。
- invalid enum、長すぎる値、負数pageは安全なdefaultへ正規化する。
- agentThread、assignee、labelを含む全値をserverでtenant検証する。
- qやlabelはbrowser historyとcopy URLへ残ることをUI contractとして扱い、secret入力には使わない。Referrer-Policyをsame-originにし、Sentry、access log、analyticsではraw search stringをscrubする。

現在のIssue list APIは最大100件のarrayを返し、Webはclient側でfilter、sort、paginationしている。これをそのままURL化すると最初の100件だけを検索する不完全なUIになる。phase 1でGET /issuesをserver filterとstable pageへ変更し、items、page、pageSize、totalを返す。sort keyの後ろにIssue numberまたはIDのtie-breakerを必ず付ける。初期pageSizeは既存UIに合わせて10で固定し、URLへ重複させない。

pathnameはresource/navigation、query parameterはview stateという境界を守る。Issue詳細は既存の/organization/{slug}/issues/{number}を使い、modal/full pageのcanonical navigationを維持する。

URLへ置かないもの:

- prompt、composer draft、form draft
- approval payload、tool result、message
- email、token、ticket、grant
- page DOM、table row data
- auto approval policy

ui_set_issue_queryはhuman UIと同じnuqs setterを呼ぶ。tool専用のhidden query stateを作らない。

## Form draftとJotai

Jotaiをform draftのread/write実装に使うのは妥当ではない。TanStack FormとJotaiに同じfield value、dirty、validation、submit状態を持たせると、競合とstale submitが起きる。

Agent client tool用にAgentFormRegistryProviderを作り、mounted formがversion付きadapterを登録する。

adapterが持つもの:

- form ID
- user ID、organization ID
- resource type、resource ID、resource revision
- registry epoch
- readable field allowlist
- writable field allowlist
- readDraft
- validatePatch
- applyDraftPatch

applyDraftPatchはTanStack FormのsetFieldValueを使い、Web-local Valibotでfield別に検証する。Agent toolはform.submitを呼べない。submit、server mutation、navigationは既存のhuman actionまたは承認付きserver toolへ分ける。

追加の制約:

- account、organization、auth、billing formはadapter自体を登録しない。これらのreadはserver-sideのallowlisted projectionだけにする。
- password、secret、provider token、hidden fieldはreadableにも含めない。
- status、priority、assigneeなど即時PATCH controlはdraft toolへ含めず、承認付きIssue update toolを使う。
- userが既に変更したdirty fieldをAgent patchが上書きする場合は、field単位の差分previewと確認を出す。
- page unmount、organization切り替え、Issue revision更新、registry epoch変更時はpatchを拒否する。
- patch後も通常のfield validationとdirty表示を維持する。

Jotaiへ置いてよいのは再取得不要な一時UIだけにする。

- Agent paneのopen/close
- resize width
- composer draft。ただしuser・organization・threadでkeyを分け、既定ではmemoryまたはsessionStorageに限定する
- mobile drawerなどlocal interaction state

pane widthだけは秘密を含まないためlocalStorageへ保存できる。thread metadata、messages、run、approval、policy、server result、form value、query filterはJotaiへ置かない。

## Active organization切り替え

Agentのorganization scopeはroute slugではなく、現在のBetter Auth session.activeOrganizationIdを唯一のauthorityにする。routeはUI contextであり、内部toolへorganization IDを自由入力させない。

### Switch barrier

1. Webは新しいmessage、image upload、tool、approval decision、form patchをfreezeする。
2. dirty form、composer draft、in-flight image upload、ready staged asset、active run、pending approvalがあるか検査する。
3. 何もなければ続行する。ある場合はStayまたはDiscard local draft and switchを表示し、serverへupload済みのready画像はmessage送信前後を問わず通常retentionまで残ることを明示する。
4. Discardを選んでもactivation成功まではdraftのsnapshotを保持する。成功後はlocal Blob URL、selection、composer/form draftだけを破棄し、旧tenantのready staged assetへDELETEを送らない。送信前ready assetも送信済みassetもserver既定72時間retention、in-flightで残ったpendingは1時間timeoutのcleanupへ委ねる。
5. 既存のorganization activate APIを呼ぶ。
6. API transactionでsessionのactive organizationを更新してagent context epochを+1し、旧session scopeのticket、grant、resume ticket、running/waiting run、pending/approved action、approval policyをrevoke/cancelし、action asset leaseを解放する。
7. success後にWebSocketとin-flight uploadを閉じ、Agent stream/client toolをcancelし、Agent/filesを含む全tenant query familyをcancelする。
8. agentThreadとIssue list queryをdefaultへ戻し、旧organizationのJotai composer/draft、local Blob URL、asset selectionを破棄する。
9. 新slugの同等routeへrouter.replaceし、router.refreshでpersistent console layoutを更新する。
10. 新しいorganization contextのSSR/TanStack dataが揃うまで、旧Agent messageやIssue rowを表示しない。

active organizationを更新するDB経路は共通primitiveへ集約する。明示activationだけでなく、organization作成、membership削除、organization削除、stale context修復でもcontext epoch incrementとAgent grant/action/policyの失効を同じtransactionへ含める。

それでもsecurityは失効statusだけへ依存しない。各internal callがlive session.activeOrganizationIdとmembershipを再検証するため、別tabとのraceや失効処理の遅延があっても旧organizationのtoolは実行できない。

activationが失敗した場合:

- old routeとdraft snapshotを維持する。
- WebSocketとrunを勝手に新organizationへ付け替えない。
- canceled queryは旧contextで再取得できるようにする。
- server transactionが失敗した場合はgrant、action、policyも旧状態のままにする。

別tabへはBroadcastChannelなどでcontext changeを通知してWebSocketとlocal stateを閉じる。ただし通知をsecurity boundaryにはせず、API再検証をauthorityにする。

### routeとactive organizationが違う場合

- Agent composerとclient toolをdisableする。
- route organizationをAgent scopeとして暗黙採用しない。
- activation gateを表示し、切り替え完了後にだけchatを再開する。
- active organizationがnullならAgentを開始せず、organization選択画面へ案内する。

### Account切り替えとsign out

multi-session account切り替え前にも同じbarrierを使い、現在sessionのPOST /agent/context/revokeでepoch incrementと旧capability失効が成功した後にだけaccountを切り替える。success後はWebSocket、Agent query、Jotai、nuqsのagentThread、form registryを全消去し、router.refreshする。

sign outはsession失効でserver capabilityも無効になるが、client cleanupとrun cancelもbest effortで行う。古いaccountのcomposer draftを新accountへ表示しない。

## Stateの正本

| State | 正本 |
| --- | --- |
| session、active organization、membership、permission | Better Auth + Turso |
| thread owner、title、archive | Turso |
| run、grant、action、approval policy、usage、audit | Turso |
| image physical metadata、agent asset、Issue file ownership、expiry | Turso |
| private original image bytes | R2 |
| message、stream chunk、Agent runtime state | AIChatAgent Durable Object SQLite |
| chat表示・stream接続 | useAgentChat |
| thread list、action preview、policy | TanStack Query |
| Issue list view、selected thread | nuqs |
| form field、dirty、validation | TanStack Form |
| pane、drawer、短命composer | Jotai |

message本文をTursoへ二重保存しない。Tursoのthread rowはACLとcontrol plane metadataだけを持つ。Durable ObjectとTursoをまたぐ操作は単一transactionにできないため、idempotent jobと状態収束を設計する。

## Database baseline

最低限、次のtableと制約を追加する。

### agent_session_contexts

- session_idをprimary keyにし、user_id、context_epoch、updated_atを持つ
- active organizationまたはaccount contextを変える全経路でcontext_epochをatomicに+1する
- ticket、grant、run、action、upload reservationは発行時のepochを保存し、異なるepochでは使用できない
- Better Auth sessionのactive organization更新とepoch increment、旧capability失効は同じDB transactionへ入れる

### agent_threads

- id、organization_id、owner_user_id、title、status、created_at、updated_at
- unique (organization_id, id)
- owner membershipをread時に再検証する

### agent_runs

- id、root_run_id、parent_run_id nullable、resumed_action_id nullable、organization_id、thread_id、session_id、user_id、context_epoch、status、scope、started_at、expires_at、finished_at
- composite FK (organization_id, thread_id)
- client_message_idによるidempotency
- root run chain単位のstep、tool、write、token/usage counterを持ち、continuationでもhard limitをresetしない

### agent_connection_tickets / agent_grants

- plaintextを保存せずtoken_hashだけを保存する
- session、user、organization、thread、run、context_epoch、scope、expires_at、consumed_at、revoked_at
- hash unique、期限検索index

### agent_resume_tickets

- token_hash、action_id、session_id、user_id、organization_id、thread_id、context_epoch、expires_at、consumed_atを持つ
- 60秒以下・一回限りとし、resumeApprovedActionがatomic consumeする
- plaintextをDB、Durable Object、logへ保存しない

### agent_actions

- id、organization_id、thread_id、run_id、session_id、user_id、context_epoch、tool_call_id
- kind、normalized payload、canonical preview、target type、target ID、target revision
- status、decision provenance、idempotency key、expires_at、receipt、attempt
- unique (organization_id, idempotency_key)
- payloadはAPIだけが読み、public responseへそのまま返さない

### agent_approval_policies

- session_id、user_id、organization_id、thread_id、mode、expires_at、revoked_at
- active policyはscopeごとに最大1件

### agent_usage_events

- organization_id、thread_id、run_id、provider、model、input/output token count、duration、created_at
- provider request IDまたはrun event IDでidempotentにする
- prompt、response、tool input/outputを保存しない

### agent_resource_usage_buckets

- organization_id、user_id nullable、kind、window_start、countを持ち、scopeと時間窓をuniqueにする
- upload、vision transform、write actionのreservationをatomic incrementし、retryはoperation IDで二重加算しない
- bytes quotaだけでなく、staged object数、pending数、時間/日request数もserverで拒否できるようにする

### storage_objects

- id、organization_id、uploader_id、upload_id、object_key nullable、size、MIME、image format/dimensions、ETag、status（pending、ready、deleting、deleted）、cleanup_revision
- physical R2 objectだけを表し、filenameやlogical ownerをkeyへ含めない
- unique (organization_id, upload_id)、unique object_key
- 既存filesから1対1 backfillし、新しいfile/assetが参照する
- cleanup jobはstorage object ID、expected cleanup revision、exact keyを持ち、statusがdeleting、claimなし、revision一致の場合だけdeleteする
- R2 delete成功後はstatusをdeletedにし、object_keyをnullへscrubする。metadata rowはidempotency/history参照のretention中は残し、logical FKの有無だけでphysical deleteを判断しない

### storage_object_claims

- storage_object_idをprimary keyにし、organization_id、holder_type（agent_asset、transferring、file）、holder_id nullable、from_asset_id nullable、to_file_id nullable、revisionを持つ
- 1 physical objectに同時に存在できるlive logical holderをDB上で1件へ制限する
- ready agent assetとready fileはclaimとの一致をrepositoryとSQLite triggerで強制する。transferringはpromoting assetとpending fileの組だけを許す。file holder + pending fileは同じsource assetがpromotingまたはpromotedの場合だけtransaction中間状態として許す
- promotionではclaimをagent asset、transferring、planned fileの順に同じtransaction内で更新する
- expiry/file削除ではclaimをconditional deleteし、storage objectをdeletingへ進めてcleanup_revisionを増やしてからexact-key cleanup jobを作る。deleting objectの再claimは禁止する
- 既存filesのbackfill時はfile claimも1対1で作る

### agent_assets

- id、organization_id、thread_id、session_id、context_epoch、uploader_id、storage_object_id nullable、filename、status、expires_at、promoted_file_id
- composite FK (organization_id, thread_id)と(organization_id, storage_object_id)
- pending、ready、promoting、promoted、expired、deletedのclosed state。promotingはzero-copy transaction内でagent_asset、transferring、pending file向けfile claimへ順に移る間の中間状態だけに使い、commit後のAPI responseへ露出しない
- ready中は対応するstorage_object_claimsのagent_asset holderを必須にする
- promotion時はpromoted_file_idを保存してstorage_object_idをnullにし、historical asset rowが将来のfile/storage metadata purgeを妨げないようにする

### agent_run_assets

- organization_id、run_id、asset_id、storage_object_id nullable、source_etag、size snapshotを持つ
- startRun時にcurrent user messageが明示参照したassetを固定し、unique (run_id, asset_id)にする
- root runのgetAgentImageForModelとprepareIssueActionは現在runへ固定されたassetだけを受け付ける
- continuation runはresumed_action_idへscopeを閉じ、新しいasset/tool payloadを受けない。executeはagent_action_assetsとactionのorigin run bindingを再検証する
- 1 run最大4件・合計20,000,000 bytesを作成transactionで検証する
- run retention後はrowをpurgeし、storage object FKはON DELETE SET NULLにする

### agent_action_assets

- organization_id、action_id、asset_id、storage_object_id nullable、source_etag、size snapshot、lease_expires_at、released_at
- prepare時にasset bytesのversionをpinし、execute時の差し替えを拒否する
- unique (action_id, asset_id)
- released_at is nullのasset_idへpartial unique indexを置き、同じassetを複数の非terminal actionが保持できないようにする
- actionがterminalになるとleaseをreleaseする。cleanupはscalar leaseではなく未releaseかつ期限内のaction assetが存在しないことを確認する
- scheduled sweepとprepare時lazy sweepの両方で期限切れactionをexpired化し、lease releaseをidempotentに行う
- storage object FKはON DELETE SET NULLにし、terminal action dataのscrub後にphysical metadata rowをpurgeできるようにする

### files / issue_file_owners

- filesはpermanentなlogical fileとし、organization_id、storage_object_id、uploader、filename、statusを持つ
- issue_file_ownersのtyped composite FKと作成後のimmutable単一ownerを維持する
- Agent promotionは新しいfiles rowを作る操作であり、既存fileのowner変更ではない
- Agent promotionではplanned IDのpending fileを先に作り、ready fileは対応するstorage_object_claimsのfile holderを必須にする

### organization_file_usage

- staged imageも既存の1 GiB quotaへ含める
- total used bytesとtemporary bytesを持ち、temporary bytesはtotal以下にする
- promotionはtemporaryからpermanentへの分類変更だけで、total bytesを二重加算しない
- expiry/deleteはconditional transactionでquotaを一度だけ解放する

### issues

- integer revisionを追加し、create時1、update時+1にする
- Agent update/deleteはexpected revisionを要求する

agent tableはorganization_idを常に持ち、親resourceとのcomposite FKでtenant境界をDBにも強制する。schema変更はpackages/db/drizzleへmigrationを保存し、generate + migrateで適用する。通常起動でpushやresetを使わない。

Agent Durable Objectにもappend-only migrationを定義する。migration tagの変更順とrollback可否をdeploy runbookへ記録する。

## 画像付きchatとIssue attachment

### 結論

chat画像をbase64 data URIとしてWebSocket messageへ埋め込み、Issue作成時にtoolから/files APIへ再uploadする方式は採用しない。

推奨data path:

    Browser -- multipart, once --> API /files --> private R2 original
       |                                  |
       | asset ID only                    +--> Images binding --> bounded vision variant
       v                                                            |
    AIChatAgent message <--------------------------------------------+
       |
       +--> prepare create_issue --> canonical preview --> approval
                                                       |
                                                       v
                             DB transactionでagent assetをIssue fileへclaim

この方式ではbrowser uploadは1回、R2 objectも1個で済む。base64はmodel provider adapterが必要とする場合だけ、変換済みの小さいvision variantをAgent Worker内で最終requestへ組み立てる瞬間に生成する。base64、raw bytes、data URIをDurable Object message、Turso、tool argumentへ保存しない。

### なぜbase64をchat transportにしないか

- base64は元bytesより約33%大きくなる。
- JSON/WebSocket/DO persistence/model requestで同じ大きな文字列が複製され、Workersの128 MB isolate memoryへ圧力をかける。
- reconnect、message replay、tool retryのたびに同じ画像を転送する。
- Issue化するときにBrowserまたはAgentが再uploadする必要が生じ、idempotencyとtenant ownershipが曖昧になる。
- chat-only retention、quota、削除、malware/image検証をDBとR2 lifecycleへ結び付けられない。

Browserはuserが画像を選んだ時点で明示uploadするため、このupload自体にAgent approvalは不要である。Agentはupload toolを持たず、readyになったasset IDだけを参照する。

### Upload contract

既存の1 file/1 multipart request、private R2、organization quota、pendingからreadyへの二段階upload primitiveを再利用する。ただし、現行のgeneric file routeは作成済みIssue ownerを要求するため、そのrouteやfileOwnerTypesへagent_threadを足さない。chat asset専用のpublic contractをfiles moduleへ追加する。

    POST /files/organizations/:organizationId/agent-threads/:threadId/assets

Agent asset access serviceは次を検証する。

- cookie sessionとactive organization
- sessionのagent context epochとupload reservationのepoch一致
- threadのorganization
- thread owner userとsession user
- threadがarchiveされていないこと
- upload count、file size、organization quota

初期対応formatは既存preview contractと同じJPEG、PNG、WebP、GIFに閉じる。GIFはvision用には先頭frameだけを使う。SVG、HTML、AVIF、HEIC、動画は初期対象外にする。

制限:

- generic Issue fileは既存どおりdecimal 20,000,000 bytes以下
- chat imageは1枚10,000,000 bytes以下
- 1 requestは1 file
- 1 messageは最大4画像
- 1 messageの画像合計は20,000,000 bytes以下
- organizationのstagedとpermanentを合わせて既存の1 GiB quota内
- magic bytes、Images info、width、height、areaをserverで検証。chat画像は1辺10,000 px以下かつ40,000,000 pixels以下
- ready staged assetはorganizationあたり200件以下
- concurrent pending uploadはuserあたり8件、organizationあたり32件以下
- upload開始はuserあたり60件/時、organizationあたり1,000件/日以下
- vision transformはuserあたり200件/日、organizationあたり2,000件/日以下

これらは初期のserver-side defaultであり、environmentとplan上限で小さくできるようにする。bytes、object count、pending countはquota reservation transactionで、時間窓はidempotent usage bucketでatomicに消費する。超過は429とretry-afterへ丸め、account全体のupload/vision kill switchを設ける。alertだけで濫用を止める設計にしない。

multipart fieldsはuploadId、fileSize、fileに閉じる。同じuploadId、同じthread、同じbytesのretryは同じassetへ200で収束させ、初回readyは201、size、content type、thread、bytesが異なる再利用は409にする。quota reservation、pending row、R2 PUT、HEADによる実size/ETag確認、ready確定の順に進め、途中停止後も同じuploadIdでreconcileできるようにする。

R2 PUT後のready確定transactionでもlive session、active organization、context epoch、membership、thread owner、reservation、quotaを再検証する。org/account切り替えや権限失効と競合した場合はreadyにせず、reservationを一度だけ解放してstorage objectをdeletingへ進め、exact-key cleanup jobへ収束させる。request開始時の確認だけでfinalizeしてはならない。

pending uploadは作成から1時間をhard timeoutにする。期限を過ぎたreservationはscheduled cleanupがconditional claimし、quotaとpending countを解放し、存在するobjectをexact-key cleanupへ送り、assetをexpiredへ進める。期限切れuploadIdはtombstoneとしてretryをterminal 409へ収束させ、新しいuploadIdを要求する。R2 PUT成功後にresponse/finalizeが失われても、1時間を越えてquotaをlockし続けない。

基盤の20,000,000 bytesはImages bindingの20 MiB input上限をわずかに下回り、chat固有の10,000,000 bytesはさらに余裕を持たせる。multipart bodyをbase64やarrayBufferへ変換せず、可能な区間はstreamのままR2へ渡す。Elysia multipart parserがFile全体をbufferする実装になっていないかはphase 0でmemory smokeを行い、高並行時に128 MBを超えないことを確認する。

upload responseはasset ID、filename、size、image dimensions、previewability、expiresAtだけを返す。R2 key、bucket、provider URLを返さない。

### Physical objectとlogical resourceの分離

現行files schemaはphysical object、logical owner、ownerを含むR2 keyを一つのrowにまとめ、ownerは作成時からimmutableである。このままagent_threadをowner unionへ加えるだけでは、同じ画像をIssueへzero-copyで移せない。

正式仕様は次のzero-copy本実装とする。

- immutableなphysical metadataをstorage_objectsへ分け、filesはlogicalなpermanent fileとしてstorage_object_idを参照する。
- R2 keyをorganizations/{organizationId}/storage-objects/{storageObjectId}のようなowner非依存keyにする。
- agent thread uploadはfiles rowを作らず、agent_assetsがstorage_object_id、organization、thread、uploader、expiresAt、statusを持つ。
- Issue作成時は同じstorage objectを参照するimmutableなfiles rowとissue_file_ownersを作り、agent assetとclaimを次の順で移す。すべて同じDB transactionで行い、file owner自体は作成後も変更しない。
- agent assetとfileが同時にlive ownerにならないことを、storage_object_claimsのprimary key、repository条件、SQLite triggerで強制する。
- 一般的なowner変更・blob共有APIは作らず、同じactionのagent assetから新規Issue fileへのpromotionだけをDB transaction内で許可する。
- 既存files rowは1対1のstorage objectへbackfillし、既存のownerを含むR2 keyは移動せず読み続ける。新規objectからowner非依存key v2を使う。
- v2 file削除はfile claimをconditional deleteし、storage objectをdeletingへ進めてからDBで解決したexact object keyをcleanup jobへ入れる。Issue/organization削除もv2ではowner prefixに依存しない。
- legacy objectだけは既存owner prefix cleanupをbackstopとして維持し、v2 objectをprefix cleanup対象に混ぜない。

SQLite triggerはdeferredにできないため、promotion transactionのstatement順を固定する。

1. planned IDのpending fileとissue_file_ownerを作る。pending fileはまだlive表示しない。
2. ready assetをpromotingへ進める。この時点ではagent_asset claimを維持する。
3. claimをtransferringへ進め、from assetとto fileを固定する。triggerはpromoting assetとpending fileの組だけを許す。
4. claimをfile holderへ進める。この中間状態ではfileはpending、source assetはpromotingであることをtriggerが要求する。
5. assetをpromotedへ進め、storage_object_idをnullにしてpromoted_file_idを保存する。
6. fileをreadyへ進める。triggerはfile claimとの一致を要求する。
7. actionをsucceededへ進める前に、asset promoted、file ready、claim file、quota分類、activity/receiptの最終assertionを行う。

pending、promoting、transferringは同一transaction外へcommitせず、通常repositoryも返さない。どのstatementまたは最終assertionが失敗してもtransaction全体をrollbackし、ready asset + agent_asset claimへ戻る。

### v1からv2へのproduction rollout

owner入りkeyを使う現行filesからstorage object分離へ一度に切り替えない。次のexpand/contractを守る。

1. additive migrationでstorage_objects、storage_object_claims、v2 nullable列、key version、backfill checkpointを追加する。v1 columnとrouteは残す。
2. compatibility Workerを先行deployし、v1/v2をdual-readする。新しいv1 uploadは従来keyへ保存しつつstorage objectとfile claimもdual-writeする。旧Workerがmigration後に作ったrowはbackfill対象として検出する。
3. checkpointとclaim tokenを持つincremental backfillを繰り返し、全live v1 fileへ1対1のstorage object/file claimを作る。R2 objectは移動せずkey versionをlegacyにする。
4. file row、storage object、claim、quota、R2 HEADの整合性をtenant単位で検証し、不一致が0になるまでv2 write flagを有効にしない。
5. server-side flagで新規uploadだけowner非依存v2 keyへ切り替える。切替中もcompatibility Workerはlegacy/v2両方を読み、削除はkey versionごとにlegacy prefixまたはv2 exact-key jobへ振り分ける。
6. 旧isolate/requestのdrain時間後にbackfillと整合性検証を再実行する。v1-only writeが残る間はcontractへ進まない。
7. rollbackはv2 write flagを止めるだけで行い、compatibility Workerで既存v2 objectを読み続ける。v2 objectをv1 owner keyへ戻さず、bytesをcopyしない。
8. rollback window、旧releaseの最大稼働時間、全row検証を満たした後だけlegacy write path/columnをcontractする。legacy R2 keyのreadとcleanupはobjectが0になるまで残す。

deploy順はadditive migration、compatibility API、backfill、v2 flag、Web/Agentの順にする。各段階で停止・rollbackでき、旧Workerと新Workerが同じrowを処理してもunique constraintとclaim tokenで1件へ収束させる。

次のstream-copy案は、phase 0でzero-copy migrationに実証済みのblockerが見つかり、別ADRで例外承認した場合だけ使えるcontingencyとする。通常実装で選択肢として残さず、zero-copyと混在させない。

- chat imageを専用temporary prefixへ保存する。
- Issue作成時にAPI WorkerがR2からpermanent keyへstream copyし、検証後にtemporary objectをcleanupする。
- browserから再uploadしない。

小変更案はR2 copyとDB commitをatomicにできないため、materializing action、planned file ID/key、idempotency、orphan cleanup、retry stateが必要になる。実装量を比較すると、中核機能として継続利用するならphysical objectとlogical resourceを分離する方がthread、Issue、将来の別ownerにも一貫する。草案の1 file IDから複数ownerを直接参照する形は、ACL、quota、delete semanticsが曖昧になるため採用しない。

### Chat-only retention

staged imageの既定expiresAtはuploadから72時間とする。1日から7日の範囲でenvにより短くできるが、chat閲覧だけで延長しない。prepare済みactionだけはagent_action_assetsのactive lease rowでapproval expiry + 短いgraceまでpinできる。hard expiryをuploadから7日以内に固定し、actionがterminalになれば同じtransactionでleaseをreleaseする。thread messageは期限後も残せるが、画像部分はExpired attachmentとして表示し、再解析やIssue promotionを拒否する。

cleanupはDBをauthorityにする。

1. scheduled Workerが期限切れ、leaseなし、未promoteで、storage objectのcurrent claimを保持するassetをleaseする。
2. 同じtransactionでclaimをconditional deleteし、storage objectをdeletingへ進めてcleanup revisionを増やし、assetをexpiredにしてasset側storage_object_idをnullへ外し、quotaを解放してexact-key cleanup jobを作る。
3. cleanup workerがR2 deleteをretryし、claim tokenで古いworkerの完了updateを拒否する。
4. claimとexpiryが競合した場合はDBのconditional updateで一方だけを成功させる。
5. backlog age、expired bytes、delete failureをmetric/alertにする。

R2 lifecycle ruleはprefixでしか対象を選べないため、zero-copyでpermanentへclaimされ得るoriginalへ一律3日ruleを設定しない。vision derivativeなど絶対にpermanent化しない専用prefixには4日程度のlifecycleをdefense-in-depthとして設定できる。R2 lifecycle deleteはexpiration時刻から通常24時間程度遅れるため、product UIとquotaはDB cleanupのexpiresAtを正本にする。

thread archiveやorganization削除など、旧tenantのauthorityを保持するserver transactionで期限を前倒しする余地はある。ただしactive organization/account切り替え後のclientは旧tenant assetへDELETEしない。local Blob、selection、draftだけを即時破棄し、送信前を含むready assetはserver既定72時間retention、pendingは1時間timeoutを維持する。これによりswitch後のcross-tenant mutationをcleanupへ混ぜない。

### Vision modelへ渡す画像

Agent Workerへoriginal R2 bindingを追加しない。getAgentImageForModelは次を行う。

画像はIssue承認より前のchat解析時点でmodel providerへ送られる。chat composerの添付UIにこの送信先と短期retentionを明示し、userが送信を確定するまではproviderへ渡さない。

1. run grant、session、active organization、context epoch、thread owner、asset ID、expiryをAPIで再検証し、assetがagent_run_assetsで現在runへ固定されていることを確認する。
2. authorization後にだけprivate R2 originalを読む。
3. Images bindingでagent-vision-v1 profileへ変換する。
4. max edge 2,048 px、fit = scale-down、WebP quality 75、animation無効、metadata除去に固定する。
5. source ETagとprofile versionを含むprivate cache keyを使う。cache readも必ずauthorization後に行い、public responseやsigned URLは作らない。
6. Images outputはcontent lengthが未確定なので、APIで4 MiB + 1 byteまでbounded readする。超過時はreaderをcancelしてproviderへ1 byteも送らず、smaller imageを案内する。
7. 上限内と確認したbytesだけをBlob/Responseへ包み、byte-oriented ReadableStreamとしてAgent Workerへ渡す。

Cloudflare Workers RPCはReadableStream、Request、Responseをflow control付きで転送できる。originalをserialized objectへ入れず、最大4 MiBへfenceした変換結果だけをResponseで渡す。APIのbounded bufferとproviderがdata URIを必要とする場合のAgent側bufferを合わせても、original全体をWorker memoryへ置かない。

providerがURLを受けられてもprivate R2 URLや長寿命signed URLを発行しない。provider adapterがraw bytesを受けられるならstream/bytesを使い、data URIが必須ならAgent Workerで4 MiB以下のvariantだけをbounded bufferしてbase64化する。

AIChatAgentのmessageには次だけを保存する。

- asset ID
- safe display metadata
- user caption
- assistantが生成した説明

raw image、vision variant、R2 key、ticket、provider request bodyは保存しない。過去messageの全画像を毎stepへ再送せず、現在のuser messageで明示参照された期限内assetだけをvision inputにする。

### 画像からIssue fieldsを提案するflow

vision modelの自由文をそのままcreate_issueへ渡さない。次のclosed schemaへ一度構造化し、API dataで解決する。

- title
- description
- labels
- dueDate
- assigneeQuery
- attachmentAssetIds

labels:

- 既存Issue labelをcase-insensitiveに検索し、既存表記へcanonicalizeする。
- 大文字小文字だけが異なる既存表記が複数ある場合は自動選択せず、exact valueを候補としてuserへ確認する。
- 新規labelはtrim後1から40文字、最大20件など既存Issue schemaを守る。
- 画像に書かれた文字列を無条件にinstructionとして扱わない。

due date:

- browser timezoneをpage contextとして渡すが、authorizationには使わない。
- relative dateはcurrent dateとtimezoneを固定してISO timestampへ変換する。
- 年、timezone、時刻が曖昧でbusiness上重要ならuserへ確認し、推測で設定しない。
- approval previewにはtimezone付きの絶対日時を表示する。

assignee:

- search_organization_membersの結果からmember IDを選ぶ。
- 0件または同名複数件ならuserへ確認するかunassignedにする。
- image内の名前、email、model生成IDを直接assigneeIdとして使わない。
- prepareとexecuteの両方でmembershipを再検証する。

description:

- 画像から観察できた事実とmodelの推測を混同しない。
- OCRが不確かな文字、期日、担当者は不確実として示す。
- prompt injectionに見える画像内文章をtool instructionとして実行しない。

prepareIssueActionは全fieldとthumbnailをcanonical previewへ含める。userのYesまたは有効なauto policy後、execute transactionでIssue、labels/due/assignee、agent assetのIssue ownership、file_added activity、audit、action receiptを一度だけcommitする。

assetが承認待ちに期限切れ、別actionでclaim済み、削除済み、またはorganization/member contextが変わった場合は409にし、新しいupload/preview/approvalを要求する。

### Cloudflare capacityとcost

2026-07-22時点のCloudflare公表値と、このrepoの制限は分けて考える。

| Layer | Cloudflare上限・料金 | このrepoの境界 |
| --- | --- | --- |
| R2 capacity | 1 bucketのdata量とobject数はunlimited。1 object最大5 TiB | 1 file 20,000,000 bytes、1 organization合計1 GiB |
| R2 upload | single-part最大約5 GiB、multipart最大約4.995 TiB | 1 file/1 request、multipart不要 |
| Workers request | Free/Pro 100 MB、Business 200 MB、Enterprise既定500 MB | 20 MB fileをbase64化せずstreamする |
| Workers memory | 1 isolate 128 MB | original全体とbase64を同時保持しない |
| Images binding | input最大20 MB | generic上限のdecimal 20 MBは上限未満。chatは10 MB、model variantは4 MiB以下 |
| Images remote transform | 100 MB、100 MP、通常dimension 12,000 px | upload時にさらにapp側dimension/areaを検証 |

R2 Standardのfree tierは10 GB-month、Class A 100万request、Class B 1,000万requestで、egressは無料である。超過はStandard storageが$0.015/GB-month、Class Aが$4.50/100万、Class Bが$0.36/100万。chat画像は数日で消え、頻繁にreadするため、30日最低課金とretrieval feeがあるInfrequent Accessを使わずStandardにする。

Agent assetのR2 putではstorage classをStandardとして明示し、bucket defaultが将来変更されても短期assetがInfrequent Accessへ入らないようにする。

Cloudflare Images hosted storageは使わない。originalはR2に置き、Images bindingで変換するため、課金対象はImages Transformedだけである。月5,000 unique transformationまでfree、Paidでは超過分が$0.50/1,000 transformation。info callは課金対象外で、同じsourceと同じparameterの繰り返しは同じcalendar monthに1 unique transformationとして数えられる。

概算例:

- 5 MBのchat画像を月10,000枚uploadし、平均3日保持すると、平均live storageは約5 GBでR2 free tier内に収まる。
- 各画像へagent-vision-v1を1種類だけ適用すると10,000 unique transformationで、5,000超過分はPaid plan上およそ$2.50/月になる。
- browser previewの4幅は実際にrequestされたvariantだけが追加のunique transformationになる。

実費は月内の日別peak、request数、variant数、billing unit roundingで変わる。R2がunlimitedでもtenantの無制限uploadを許可せず、organization_file_usageへstagedBytesとpermanentBytesを分けて表示し、合計1 GiBをatomic reservationで守る。account全体でもR2 bytes、object count、Class A/B、Images unique transformations、cleanup backlogへbudget alertを設ける。

参考:

- [R2 limits](https://developers.cloudflare.com/r2/platform/limits/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [R2 object lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [R2 storage classes](https://developers.cloudflare.com/r2/buckets/storage-classes/)
- [Images limits](https://developers.cloudflare.com/images/get-started/limits/)
- [Images pricing](https://developers.cloudflare.com/images/pricing/)
- [Images Workers binding](https://developers.cloudflare.com/images/optimization/binding/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers RPC streams](https://developers.cloudflare.com/workers/runtime-apis/rpc/)

## Securityとprivacy

- system promptの「してはいけない」は補助であり、tool allowlistとAPI authorizationを正本にする。
- Issue、member名、page content、tool resultはuntrusted dataとして扱い、instructionとして実行しない。
- arbitrary fetch、open redirect、任意pathname、任意RPC methodを許可しない。
- model provider keyはAgent Worker secretだけに置く。
- Agentがsession、ticket、grant、API tokenをmintできるtoolを作らない。
- prompt、response、Issue本文、form値、tool argument/output、email、attachment名、raw image、base64/data URI、object key、token、ticket、grantをSentry、structured log、auditへ出さない。
- telemetryはtrace ID、固定error code、status、duration、件数、token countなど安全なmetadataだけにする。
- application error/log/traceは既存どおりSentry SDKを正本にし、Cloudflare OTLP exportを重ねない。
- model/provider errorはraw bodyを返さず、安全な分類とretry可否へ変換する。
- read toolにもrate limit、result count、文字数上限を設ける。
- mutationはidempotent action protocol以外から実行しない。
- prompt injection、cross-tenant ID probing、stale approval、replay、WebSocket ticket漏えいをthreat modelとtestへ含める。

chain-of-thoughtは要求、保存、表示しない。providerが安全なreasoning summaryを明示的に返す場合だけ通常のassistant contentとして扱う。

## Failure model

- connection ticket失敗: 再利用せずAPIから新規発行する。
- session失効: runをcancelし、再認証UIへ遷移する。
- active organization mismatch: runとpending actionをcancelし、switch完了を要求する。
- model一時障害: read-only stepだけbounded retryし、write action receiptを確認してから再開する。
- API binding障害: business toolをfail-closedにし、modelだけで成功と主張させない。
- approval期限切れ: 新しいactionとpreviewを作る。
- revision conflict: 409として最新Issueを再取得し、再preview・再approvalする。
- image upload失敗: 同じupload IDと同じbytesだけをretryし、message送信前にreadyを要求する。
- Images binding失敗またはfree plan 9422: original assetを維持し、画像説明だけをretry/manual inputへ倒す。添付済みでないのに成功としない。
- asset expiry/ETag mismatch: 409として再upload・再解析・再approvalを要求する。
- promotionとexpiryのrace: conditional DB updateで一方だけをcommitし、quotaとR2 cleanupをidempotentに収束させる。
- Browser切断: Durable Objectにstream stateを残し、fresh ticketによる再接続だけを許可する。
- Durable ObjectとTursoの一時的不整合: idempotent reconcile jobで収束し、別tenantへfallbackしない。

## Deploymentとlocal development

### Production

- apps/agentを独立Workerとして追加する。
- Agent Workerはcustom domainだけを持ち、workers.devを無効化する。
- 公開routeはAgent protocol pathだけに閉じ、それ以外は404にする。
- exact Web originだけを許可する。
- Web CSPのconnect-srcへAgent custom originだけを追加し、wildcardやworkers.devを許可しない。
- Agent access log、Sentry transaction name、analyticsでWebSocket queryを収集しないことをproduction smokeで確認する。
- Agent wrangler設定へDurable Object binding、append-only migration、API service bindingを定義する。
- API Workerにnamed AgentInternalApi entrypointを追加する。
- provider secretはAgent Workerだけへ設定する。
- Web、API、AgentのSentry environment/releaseを分離する。
- feature flagとserver-side kill switchで新規runとwrite toolを独立して停止できるようにする。

Service BindingはAgentからAPIへの一方向なので、deploy順はAPI、Agent、Webにできる。rollback時はまずWeb flagとwrite kill switchを止め、Agent、APIの順に戻す。APIの既存public routeはAgent deployへ依存させない。

### Local

日常開発は次の3 processをroot Turbo commandから起動する。

- Next.js dev
- API Wrangler dev
- Agent Wrangler dev

「3 Worker」はproduction topologyであり、localでNext devを本番Worker artifactとして動かす意味ではない。AgentからAPIへのService Bindingは別Wrangler session間の公式local経路を使い、experimentalなmulti-configだけを標準経路にしない。

phase 0で最低限、echo chat、ticket consume、WebSocket reconnect、resumable stream、named entrypoint RPC、R2からImages bindingを経由したbounded RPC image stream、multipart upload時のmemory、Sentry redaction、bundle sizeをspikeする。multipart memoryはまず[10 MB upload memory smoke](./upload-memory-smoke.md)でlocal回帰を記録し、local workerd RSSをproduction 128 MB/isolateの証明には使わない。release前にreal WorkerのMemory Usageとmemory errorも確認する。

Cloudflare構成を変更したら既存のbun run build:cloudflareにAgent Worker build/dry-runを含める。Bun buildだけで完了扱いにしない。

## 実装phase

### Phase 0: ADRとprotocol spike

- apps/agent最小Worker
- AIChatAgent echo
- connection ticketとfresh reconnect
- approval decision後のresume ticketとhibernation/reconnect再開
- AgentからAPI named entrypoint
- R2 imageをImages bindingで縮小し、4 MiBへbounded readしてからRPC ResponseでAgentへ渡す
- 10,000,000-byte multipart uploadのlocal並行memory smokeとreal Worker側のmemory error確認
- local 3 process
- Cloudflare build、Sentry redaction、kill switch

継続条件は、cross-domain接続、ticketの一回性、stream再開、binding、local devが実測で成立すること。

### Phase 1: read-only vertical slice

- private threadとrun control plane
- read_account_context、read_active_organization、search members/labels、Issue read
- agent context epoch、storage_objects、storage_object_claims、agent_assets、agent_run_assets、chat image upload、pending/72時間retention
- bytes、object count、pending、upload/vision時間窓のserver-side quota
- image description生成とasset IDだけのmessage persistence
- nuqsとserver-side Issue list
- Agent shell、state ownership、organization/account switch barrier
- thread archiveとowner ACL

### Phase 2: Issue CRUDとmanual approval

- Issue revision migration
- agent_actions state machine
- prepare/decision/execute
- resumeApprovedActionとone-time resume ticket
- canonical Yes/No UI
- create_issueへのlabel、due date、assignee、attachmentAssetIds追加
- agent assetからIssue fileへのzero-copy promotion
- Issue mutation、file ownership、activity、audit、receiptのtransaction統合
- idempotency、replay、stale revision test

### Phase 3: auto policyとclient tool

- ask_each、auto_write、auto_all
- policy TTL/revoke UI
- ui_navigate、ui_set_issue_query、ui_open_issue
- form registry、draft read/patch、dirty conflict UI

### Phase 4: reliability、quota、retention

- usage aggregation、budget/abuse tuning、account kill switch
- cross-store purge/reconcile
- archived thread retention
- chaos、load、provider failover
- cleanup backlogとR2/Images budget alert

### Phase 5: optional runtime evaluation

Studio、eval、workflow等の具体的gapが残る場合だけMastraを比較する。現行のstate ownershipとapproval authorityを二重化する案は採用しない。

## Acceptance criteria

### Authorization

- 別organizationのthread、Issue、action IDを渡しても同じ404/拒否になる。
- sessionのactive organizationが変わった直後から旧grantが使えない。
- active organization変更と同時にcontext epochが増え、確認済みだが未commitのexecute/upload finalizeも旧epochではcommitできない。
- roleやmembershipを失った直後からtoolが使えない。
- Agentにaccount/org mutation methodが存在しない。

### Approval

- modelやclientがapproval済みと偽装してもDB decisionなしではexecuteできない。
- hibernationや切断後はfresh one-time resume ticketがなければexecuteできず、ticket replayも拒否する。
- 5分を超えて15分以内に承認してもfresh continuation runで再開でき、root run chainのstep/tool/write上限はresetされない。
- YesのretryでIssueが重複更新されない。
- No、期限切れ、org switch後はexecuteできない。
- prepare後にIssueが変わると409になり、古いpayloadを実行しない。
- auto modeでもaction、decision、auditが残る。
- previewしたasset ETag/sizeと実際にIssueへ付いたstorage objectが一致する。
- assignee脱退、asset expiry、asset差し替えでは古いapprovalを実行できない。

### Image lifecycle

- Browserは同じ画像を1回だけuploadし、reconnectやIssue作成で再uploadしない。
- WebSocket、Durable Object SQLite、Turso、log、Sentryにdata URI、base64、raw imageが残らない。
- chat-only assetは期限後にread/vision/promotionできず、quotaとR2 objectがcleanupへ収束する。
- promoted Issue fileはagent assetの期限後も残る。
- upload/action retryでもstorage object、Issue、Issue fileが各1件だけ作られる。
- expiry cleanupとpromotionのraceで同じstorage objectが削除・二重所有されない。
- promotionの各intermediate stateはtransaction外へ見えず、任意statement失敗でready asset + agent claimへrollbackする。
- current runへ固定されていないassetはvision入力にもIssue attachmentにも使えず、4件・20 MB上限をAPIが拒否する。
- 4 MiBを超えるImages outputはproviderへ部分送信される前に拒否される。
- pending uploadは1時間後にquotaとobject cleanupへ収束し、bytes未満でもobject/pending/request/vision上限を超えれば429になる。
- 画像内のprompt injectionでallowlist外toolやaccount/org mutationを呼べない。

### UI state

- Issue filter、sort、page、Agent操作がURLへ反映され、reloadとBack/Forwardで再現する。
- URLとTanStack Query keyとAPI filterが一致する。
- shallow query更新後はclient TanStack Queryが再取得し、初期RSC prefetchのstale dataを表示しない。
- form draftをJotaiへ複製せず、Agent patch後もTanStack Formのdirty/validationが正しい。
- organization/account切り替えで旧message、thread、query、draft、image previewが一瞬でも新contextへ表示されない。

### Runtime

- ticketは一回限りで、期限切れとreplayを拒否する。
- resume ticketも一回限りで、action/session/organization/thread/context epochが違えば拒否する。
- reconnectにはfresh ticketが必要で、同scopeのstreamだけ再開できる。
- Agent WorkerからDB/R2へ直接accessできない。
- APIとAgentに循環Service Bindingがない。
- provider/API障害時に実行していないwriteを成功と表示しない。
- Images変換失敗時もR2 originalを失わず、Issue attachmentの成否と画像説明の成否を区別する。
- v1/v2移行中に旧Workerがupload/deleteしてもbackfillとkey-version cleanupへ収束し、v2 write flagを戻しても既存v2 fileを読める。

### Privacyとquality

- prompt、message、Issue本文、tool payload、tokenがlog/Sentry/auditへ出ない。
- unit、API integration、Durable Object、Playwright E2E、Cloudflare smokeを分離して実行する。
- bun run checkとbun run build:cloudflareが通る。

## 参考資料

- [Cloudflare Agents](https://developers.cloudflare.com/agents/)
- [Chat agents](https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/)
- [Cross-domain authentication](https://developers.cloudflare.com/agents/runtime/operations/cross-domain-authentication/)
- [Human-in-the-loop](https://developers.cloudflare.com/agents/concepts/agentic-patterns/human-in-the-loop/)
- [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Service Binding RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)
- [nuqs options](https://nuqs.dev/docs/options)
- [nuqs server-side parsing](https://nuqs.dev/docs/server-side)
- [nuqs batching](https://nuqs.dev/docs/batching)
