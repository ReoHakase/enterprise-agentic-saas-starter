# Agent runtime設計

更新日: 2026-07-22

## 結論

Agent機能はWeb、API、Agentの3 Workerで構成し、Agent runtimeの正本にはMastraを使う。

```text
Browser
  │ AI SDK UI transport / cookie / CSRF
  ▼
Web Worker ───────────────► API Worker public app
                              │ auth / tenant / quota / thread / approval
                              │ AGENT_RUNTIME Service Binding
                              ▼
                           Agent Worker private entrypoint
                              │ Mastra product-agent
                              │ tools / web search / model stream
                              │ AGENT_INTERNAL_API Service Binding
                              ▼
                           API Worker named entrypoint
                              │ issue domain service / Drizzle / Turso / R2 / Images
```

次を設計上の不変条件とする。

- `apps/agent/src/mastra/index.ts`をproduction WorkerとMastra Studioで共有する。
- Cloudflare Agents SDK、独自tool loop、Mastraを並列のruntimeとして持たない。
- BrowserはAgent Workerへ直接接続しない。chatはAPI Workerの`POST /agent/chat`だけを呼ぶ。
- Agent Workerはpublic hostname、`workers.dev`、preview URLを持たない。
- Agent WorkerはTurso、R2、Better Auth tableへ直接触らない。
- account、organization、member、auth、billing設定はread-onlyとし、初期mutationはIssue create/update/deleteだけに閉じる。
- Issue mutationはcanonical previewとYes/No承認を通す。自動許可でもserver-side policy、action、auditを省略しない。
- 画像はBrowserからprivate R2へ一度だけuploadし、chatにはopaque asset IDだけを保存する。
- 検索、filter、sort、page、selected threadなど再現可能なview stateはnuqsへ置く。
- form valueはTanStack Form、server stateはTanStack Query、Jotaiはshellとcomposerの短命stateだけに使う。

## 草案から修正した矛盾

| 誤った前提 | 修正後 |
| --- | --- |
| Mastraは疎通確認だけでproductionへ含めない | Mastraを唯一のagent runtimeにする |
| BrowserがAgent WorkerのAIChatAgentへ直接WebSocket接続する | BrowserはAPI `/agent/chat`へ接続し、APIがprivate Agent Workerへproxyする |
| Agent custom domainを公開する | Agent WorkerはService Bindingだけで到達させる |
| Cloudflare Agents SDKとMastraがmessage/tool loopを別々に所有する | Mastra Agentがmodel、tool、streamを所有する |
| Agent UIを専用`/agent` pageへ閉じる | `(console)/layout.tsx`へpersistent Agent Shellをmountする |
| form draftをJotaiへ複製する | TanStack Formのmounted adapterだけを操作する |
| filter専用のtext-only Selectを作る | table/detailと同じIssue domain controlをprops拡張して使う |
| chat画像をbase64で送り、Issue作成時に再uploadする | private R2へ一度だけstageし、Issue作成時に同じobjectをclaimする |
| 1 toolごとにpublic/internal endpointを増やす | tool intentとdomain capabilityを分離し、共通prepare/executeへ集約する |

## `apps/agent`の構成

Mastra CLIが認識する`src/mastra/index.ts`をentrypointにする。

```text
apps/agent/
  package.json
  tsconfig.json
  vitest.config.ts
  wrangler.jsonc
  .dev.vars.example
  .env.local                 # ignored、mode 600
  README.md
  scripts/
    studio-health.ts
    studio-agent-smoke.ts
  src/
    worker.ts
    env.ts
    cloudflare-env.d.ts
    mastra/
      index.ts
      agents/
        product-agent.ts
      models/
        openrouter.ts
      skills/
        core.ts
        issue-triage.ts
        issue-writing.ts
        web-assistance.ts
      tools/
        account/
          read-account-context.ts
          read-active-organization.ts
        issues/
          search-issues.ts
          get-issue.ts
          create-issue.ts
          update-issue.ts
          delete-issue.ts
        members/
          search-organization-members.ts
        web/
          web-search.ts
      workflows/
        approved-issue-action.ts
      usage/
        normalize.ts
    api/
      internal-client.ts
      request-context.ts
```

`packages/domain`、`packages/agent-tools`、`packages/agent-skills`は作らない。business ruleは`apps/api/src/modules`に残し、Mastra toolはtyped internal capabilityを呼ぶ薄いadapterにする。

Mastra、AI SDK stream adapter、OpenRouter providerはproduction dependencyである。Mastra CLIだけをdev dependencyへ置く。TypeScriptはES2022、ES module、bundler resolutionを使う。

## Mastra instanceとmodel

`src/mastra/index.ts`はagentを登録するだけにし、tool実装やenv parsingを詰め込まない。

```ts
export const mastra = new Mastra({
  agents: { productAgent },
})
```

`skills/*.ts`は単なるprompt断片にせず、`@mastra/core/skills`の`createSkill()`でinline Mastra Skillとして定義し、`productAgent`の`skills`へ登録する。`core`、`issue-triage`、`issue-writing`、`web-assistance`が`agent.listSkills()`とStudioのSkills表示から確認できることをtestする。

agent keyは`productAgent`、IDは`product-agent`に固定する。local dev、Mastra Studio、paid E2EではOpenRouterの`qwen/qwen3.6-flash`を使う。Mastra上のmodel表現は`openrouter/qwen/qwen3.6-flash`、OpenRouter providerへ渡すslugは`qwen/qwen3.6-flash`である。model IDはMastra provider registryで存在確認してから更新する。

`OPENROUTER_API_KEY`は次の場所にだけ置く。

- local: ignoredな`apps/agent/.env.local`
- CI/E2E: job scopeのsecret
- production: Agent Worker secret

keyをCLI引数、source、docs、Turbo cache、Playwright artifact、Sentry、structured logへ出さない。

## Web検索

`product-agent`へOpenRouterのprovider-defined web search server toolを登録する。deprecatedな`:online` suffixや`plugins: [{ id: "web" }]`は使わず、現行の`openrouter:web_search`を使う。

初期設定は次とする。

- engine: `auto`
- 1検索あたり最大5 result
- 1 run内の検索回数とresult総数をusageへ記録する
- current informationが必要な場合、またはuserが明示した場合だけ検索する
- citation URLをmessage partとしてWebへ渡す

検索queryへemail、token、session、organization ID、asset ID、private Issue本文を含めない。Web resultはuntrusted contentであり、そこに書かれた命令をIssue toolやclient toolの権限として扱わない。

## 認証・認可の正本

Service Bindingはnetwork capabilityであり、human actorのidentityやtenant権限を証明しない。Agentの認証・認可は次の3層をすべて通す。

| 境界 | credential | 検証責務 |
| --- | --- | --- |
| Browser → API public app | Better AuthのSecure/HttpOnly session cookie | Origin、session、active organization、membership、thread owner、quota |
| API → Agent named entrypoint | 60秒・一回限りのconnection ticket | ticket scope、replay、Agent feature flag |
| Agent → API named `/internal/agent/*` | 5分以内のBearer run grant | live session、active organization、membership、context epoch、thread/run scope、現在permission |

Browserのcookie、`Authorization`、organization IDをAgent Workerへ転送しない。Agent Workerが`x-user-id`や`x-organization-id`を自己申告する構成にもしない。Browserへconnection ticket、grant、resume ticketを返さない。

### Public APIのsessionとCSRF

WebはAPIと別subdomainなので、AI SDK transportはAPI originへ`credentials: "include"`で接続する。Better Authは`AUTH_COOKIE_DOMAIN`でWeb/API共通の親domainへ閉じ、`TRUSTED_ORIGINS`と`CORS_ORIGIN`はWeb originのexact allowlistにする。wildcard CORSとcredentialを併用しない。

このrepoのCSRF境界は独自header tokenではなく、`apps/api/src/plugins/csrf.ts`のglobal Origin検証である。`POST /agent/chat`、action decision/resume、approval policy、asset uploadを含む全unsafe methodはOrigin必須で、`CORS_ORIGIN`または`API_PUBLIC_URL`と完全一致しないrequestを403 `csrf_origin_forbidden`へ倒す。添付草案の`x-csrf-token`を別系統として追加しない。

public Agent routeは`authenticated: true` macroでBetter Auth sessionを解決する。ただしAgent request bodyにorganization IDが存在しないため、汎用`organizationAccess`へ偽のIDを渡さない。service/repository transaction内で次の順に解決する。

1. `(sessionId, userId)`が一致し、期限内のsessionを取得する。
2. sessionの`activeOrganizationId`をcanonical tenantとし、nullを拒否する。
3. 現在のmembershipを取得し、未知roleをfail closedにする。
4. `(threadId, activeOrganizationId, ownerUserId, status = active)`でprivate threadを取得する。
5. context epoch、quota、message/attachment上限を検証する。
6. canonical message保存とconnection ticket発行を同じtransactionへ入れる。

非member、別tenant thread、不存在threadは同じ404にし、active organization不一致は409、session欠如・期限切れは401にする。Browserが送るroute slug、page context、mention label、`agentThread` queryは認可へ使わない。

`POST /agent/chat`のbodyは、最後のuser message、またはserver保存済みassistant messageに対応するallowlist済みclient-tool resultのstrict unionである。全履歴、user/organization、ticket、grant、approval policyのover-postを拒否する。client-tool continuationはassistant message ID、tool call ID、tool名、pending stateをDB上のcanonical messageと完全一致させ、Browserが任意のassistant/tool resultを捏造できないようにする。

### Opaque capabilityを使う理由

v1ではdelegation JWTを使わない。APIが256-bit以上のrandom値を生成し、DBにはSHA-256 hashとscopeだけを保存する。

```text
connection ticket
  TTL 60秒 / atomic one-time consume
  session + user + organization + thread + context epoch

connection grant
  TTL 5分
  startRunのための短期capability

run grant
  TTL 5分以内
  root run + thread + session + user + organization + context epoch + scope

resume ticket
  TTL 60秒以下 / atomic one-time consume
  approved action + session + user + organization + thread + context epoch
```

opaque tokenならactive organization変更、account切り替え、membership/role変更、thread archive、sign-out、manual revokeを即時DB失効へ反映でき、replayもatomic updateで防げる。JWTへ変えても`jti`の一回性と即時失効を保存するDBが必要になるため、現構成では署名鍵とclaim parserだけが増える。Agent Workerへ署名鍵、Better Auth secret、Turso credentialを渡さず、tokenの正当性はAPI named entrypointだけが判定する。

### Named entrypoint内の`/internal/*`と内部再認可

`AGENT_RUNTIME`はAgent Workerのnamed `AgentRuntime`だけを指し、Agent Workerのdefault `fetch`は常に404にする。`workers_dev = false`、`preview_urls = false`を維持し、route/custom domainを設定しない。

逆方向は`AGENT_INTERNAL_API`からAPI Workerのnamed `AgentInternalApi`をHTTP Service Bindingで呼ぶ。named entrypointの`fetch()`だけが`createAgentInternalApp(db)`を実行し、prefixを`/internal/agent`へ固定する。default/public `createApp(db)`へinternal appを`.use()`せず、public custom domain、OpenAPI、CORSから`/internal/*`へ到達させない。

Agent WorkerはEden Treatyのcustom `fetcher`を`AGENT_INTERNAL_API.fetch(request)`へ差し替える。型はserver-onlyな`AgentInternalApp` exportから推論し、dummy originはURL組み立てのためだけに使う。通常のglobal `fetch`やAPI public originへのfallbackは禁止する。Webが`@enterprise-agentic-saas/api/agent-client`をimportすることも禁止する。

internal appはElysia/Valibotのroute schemaを使う。connection ticketとresume ticketはstrict bodyからatomic consumeする。run開始だけは`Authorization: Bearer <connection grant>`、それ以外の実行中routeは`Authorization: Bearer <run grant>`を使う。header guardは形式を検証するだけで認証済み扱いにせず、各routeのservice/repositoryがhash lookupとlive DB再認可を行う。validation errorへtoken値やValibot issueを含めない。

pathはtool名のmirrorではなく、安定したdomain capabilityへ分ける。

```text
POST /internal/agent/connections/consume
POST /internal/agent/runs
POST /internal/agent/runs/cancel
POST /internal/agent/runs/finish
POST /internal/agent/runs/messages
GET  /internal/agent/context/account
GET  /internal/agent/context/organization
GET  /internal/agent/members
GET  /internal/agent/issue-labels
GET  /internal/agent/issues
GET  /internal/agent/issues/by-number/:number
GET  /internal/agent/issues/:issueId
POST /internal/agent/actions
GET  /internal/agent/actions/:actionId
POST /internal/agent/actions/:actionId/resume
POST /internal/agent/actions/:actionId/execute
GET  /internal/agent/assets/:assetId/model
```

`runs/cancel`と`runs/finish`はrun grantから対象runを一意に決め、client由来のrun IDを受けない。同じauthorization/transactionを共有する`actions`はcreate/update/deleteのdiscriminated unionを受ける。Mastraの`create_issue`等とHTTP endpointを一対一に増やさない。binary image responseなどEdenの通常data shapeに合わないrouteだけは、同じtyped internal client内の低水準fetch helperに隔離する。

run grantを受ける各internal methodは、hash lookupだけで許可せず毎回次を再検証する。

- sessionが未失効で、同じuserに属する
- active organizationがgrantのorganizationと完全一致する
- membershipとroleが現在も有効である
- context epochが同じである
- threadが同じtenantの同じownerに属する
- runが同じthread/session/user/tenant/scopeに属し、期限内かつ許可状態である
- read/writeごとの現在permission、Issue revision、assignee membership、asset leaseが有効である

これによりAgent Workerまたはmodelが任意のRPC methodを選べても、別actor/tenantへscopeを広げられない。Service Bindingだけ、Mastra tool schemaだけ、UIの非表示だけを認可境界にしない。

## Worker間通信

### BrowserからAPI

WebのAI SDK UI transportは`POST /agent/chat`へ次の最小payloadを送る。

```text
threadId
最後のuser message
attachment asset IDs
allowlistしたpage context
browser timezone
```

全message history、organization ID、raw image、private URL、object key、approval policyをclient authorityとして送らない。

APIはcookie、Origin、session、active organization、membership、thread owner、context epoch、quota、message sizeを検証する。canonical organizationとuserはsessionから決定する。

### APIからAgent

APIの`AGENT_RUNTIME` bindingはAgent Workerのnamed entrypointだけを指す。connection ticketには次を束縛する。

```text
session ID
user ID
active organization ID
context epoch
thread ID
issued at / expiry
```

connection ticketは一回限り、60秒、hash保存とする。Agent Workerがconsumeした後にAPIが5分のconnection grantを発行し、`startRun`がroot run IDとrun scopeを確定して5分以内のrun grantへ交換する。

Agent WorkerはMastra `product-agent.stream()`を実行し、`@mastra/ai-sdk`のstream adapterでAI SDK UI streamへ変換する。APIはstatus、content type、cancel signalを保持してBrowserへ返す。API/Agentどちらもstream全体をbufferしない。

### AgentからAPI

Agentの`AGENT_INTERNAL_API`はAPI Workerのnamed `AgentInternalApi`だけを指す。named entrypoint内のElysia appだけが`/internal/agent/*`を処理し、public Elysia appへはmountしない。

各tool callでAPIはrun grant、live session、active organization、context epoch、membership、現在permission、thread/run owner、scope、expiryを再検証する。modelが渡すorganization IDやroute slugをauthorizationへ使わない。

## Tool設計

初期server toolは次に閉じる。

### Read-only

- `read_account_context`
- `read_active_organization`
- `search_organization_members`
- `search_issue_labels`
- `search_issues`
- `get_issue`
- `web_search`

account projectionには現在の本人情報だけを含め、他organization一覧をmodelへ渡さない。organization projectionはactive organizationだけにする。member searchは初期状態でemailを返さない。

### Mutation

- `create_issue`
- `update_issue`
- `delete_issue`

account、organization、member、invitation、role、billing、auth、comment、既存Issue fileのmutation toolは作らない。

`1 tool = 1 endpoint`は採用しない。toolはmodelが選ぶintent、internal APIはstableなdomain capabilityである。write toolは共通の`prepareIssueAction`と`executeApprovedIssueAction`を使い、human HTTP routeと同じIssue domain serviceへ合流させる。

## Human-in-the-loop

write toolは直接Issueを変更しない。

```text
Mastra tool call
  → API prepare
  → normalized payload + canonical preview + action row
  → waiting approval
  → WebがAPIからpreview取得
  → Yes / No
  → one-time resume ticket
  → Mastra continuation
  → API execute transaction
```

canonical previewにはaction種別、title、description、status、priority、label、absolute due date、assignee表示名、添付画像、変更前後、破壊性、expiryを含める。modelが生成した説明を承認画面の正本にしない。

actionにはsession、user、organization、thread、run、context epoch、target revision、idempotency key、asset leaseを束縛する。execute transaction内で全条件を再確認し、mutation、activity、audit、receiptを同時commitする。payload差し替え、二重execute、stale revisionを拒否する。

### 自動許可

modeは次に閉じる。

- `ask_each`
- `auto_write`: create/update
- `auto_all`: create/update/delete

policyはsession、user、organization、thread、最大15分のexpiryへserver-sideで束縛する。Agent自身はpolicyを作成、延長、変更できない。`auto_all`はdeleteを含むことを明示する二段階confirmationを要求する。autoでもaction、decision provenance、audit、receiptを作る。

## Agent Shell

Agent Shellは`apps/web/app/(console)/layout.tsx`へmountする。

```tsx
<AgentShellProvider>
  <ConsoleShell>{children}</ConsoleShell>
  <AgentShell />
</AgentShellProvider>
```

専用`/organization/:slug/agent` pageだけへchat controllerを置かない。console内のdashboard、Issues、members、settings間を移動してもshell、active thread、composerを維持する。

### Responsive layout

- desktop: 右側resizable pane
- minimum: 360px
- default: 460px
- maximum: 720px
- mobile: drawer subtree外ownerのfull-screen Sheet
- keyboard: open/close、focus return、resize handleを操作可能にする
- main contentとpaneの両方でhorizontal overflowを起こさない

Jotaiはshell open、pane width、短命composer、local attachment selectionだけに使う。thread、message、approval、policy、usage、form value、URL stateをatomへ複製しない。

## URL stateとIssue filters

nuqsを使うstateは次である。

- `q`
- `status`
- `priority`
- `assignee`
- `label`
- `sort`
- `dir`
- `page`
- `agentThread`

defaultはURLから除去する。typingはdebounce + replace、離散操作はpush、filter/sort変更時はpageを1へ戻す。prompt、draft、approval、tool result、message、asset ID、email、tokenはURLへ置かない。

Issue filterはtable/detailと同じdomain controlを使う。共通componentのpropsへfilter mode、all/clear option、controlled value callback、read-only semanticsを追加し、status icon、priority icon、assignee avatar、badge、tipsを同じrendererで表示する。filterだけtext-onlyのprimitive Selectへ戻さない。

## Form draft client tools

form draftの正本はTanStack Formである。Jotaiへ値を複製しない。

`AgentFormRegistryProvider`へmounted form adapterを登録し、次を検証してから`form.setFieldValue()`を呼ぶ。

- readable/writable field allowlist
- active organization
- resource ID
- resource revision
- registry epoch
- dirty conflict

account、organization、auth、billing formはregistryへ登録しない。client toolはsubmitせず、password、token、hidden fieldを読まない。即時PATCH fieldはclient draft toolでなく承認付きserver toolを使う。

## Active organizationとaccount切り替え

switch開始時にmessage送信、stream、upload、tool、approval、form patchをfreezeする。

dirty form、composer、in-flight upload、staged asset、active run、pending approvalがある場合は次を表示する。

- Stay
- Discard local draft and switch

activation成功まではdraftとlocal Blobを保持する。sessionの`active_organization_id`変更は`session_agent_context_rotate_organization` DB triggerで同じtransaction内のcontext epochを必ず1だけ増やす。続く`agent_session_contexts_revoke_old_epoch` triggerが旧connection ticket、grant、run、action、resume ticket、approval policyを失効し、action terminal transitionがasset leaseを解放する。application codeとDB triggerの両方でepochを増やして二重rotationさせない。

成功後に次を順番に行う。

1. Agent streamとuploadをabortする。
2. Agent、files、issues、commentsを含む旧tenant queryをcancelする。
3. local Blob URL、composer、form registry、selected thread、Issue queryをclearする。
4. 旧organizationのready staged assetへDELETEを送らない。
5. 新slugへ`router.replace()`する。
6. `router.refresh()`でpersistent console layoutを更新する。

ready staged assetはserver既定72時間、pending uploadは1時間でcleanupする。switch失敗時は旧routeとdraftを維持し、別organizationへstateを付け替えない。route organizationとactive organizationが一致しない間はcomposerとclient toolをdisableする。

Better Authのmulti-session account切り替えはorganization切り替えと同一操作ではない。次の順序を固定する。

1. 旧session cookieのまま`POST /agent/context/revoke`を成功させる。失敗したら`setActive`を呼ばない。
2. in-flight Agent/tenant queryをcancelし、identity-scoped TanStack Query cacheをclearする。
3. Better Auth `multiSessionClient.setActive`でactive accountを切り替える。
4. Agent stream/upload、shell、thread、composer、form registry、Blob URLをclearする。
5. account固有のactive organizationを新sessionから再解決し、`/dashboard`へreplaceして`router.refresh()`する。

旧accountのactive organizationを新accountへコピーしない。新sessionのactive organizationがnullまたはstaleなら、既存のBetter Auth/`/me`規則どおり現在membershipを再検証して修復または明示選択へ進める。sign-out、session revoke、membership/role変更も該当sessionのAgent contextを失効させる。

## 画像とIssue添付

base64/data URIをchat transportへ送らない。

```text
Browser multipart upload
  → API ACL / magic bytes / dimensions / quota
  → private R2 staging object
  → opaque asset ID in chat
  → API Images bindingで2048px WebP variant
  → Mastra modelへ短命bounded image part
  → create_issue approval
  → DB transactionで同じstorage objectをIssue fileへclaim
```

初期上限は次である。

- 1画像: 10,000,000 bytes
- 1 message: 最大4画像、合計20,000,000 bytes
- dimension: 1辺10,000px、合計40,000,000 pixels
- model variant: max edge 2,048px、WebP quality 75、最大4 MiB
- organization storage quota: 1 GiB
- ready chat asset: 200/org
- pending: 8/user、32/org
- ready retention: 72時間、hard max 7日
- pending timeout: 1時間

Cloudflare側のcapacityとapplication quotaは分けて考える。2026-07時点でR2はbucketごとの保存容量とobject数がunlimitedで、1 objectは最大5 TiB、single-part uploadは最大5 GiBである。この機能の10 MB制限はR2由来ではなく、abuse、Worker memory、model input、費用を抑えるproduct側の制限である。Cloudflare Images bindingの`.input()`は最大20 MBであり、この設計はoriginalをImages hosted storageへ二重保存せず、10 MB以下のR2 objectをbindingへ入力してbounded variantだけを生成する。したがって容量制御の正本は1 GiB/org、asset件数、TTL、cleanup backlogであり、Cloudflareのplatform上限へ近づくまで無制限に受理する設計にはしない。platform limitは変更され得るためrelease時に公式R2/Images limitを再確認する。

R2 keyとprivate URLはWebやmodelへ渡さない。Agent WorkerへR2 bindingを渡さない。IssueへのpromotionはR2 copyやBrowser再uploadを行わず、claim/file metadataをtransactionで移す。promotion対象originalへprefix lifecycleを直接適用しない。

## Messageとmemoryの正本

productionでAgent WorkerからTursoへ直接接続しないため、Mastraのin-memory storageを永続正本にしない。

- Turso/API: thread ACL、metadata、canonical message history、run、action、usage
- Mastra: bounded server-authoritative historyを入力にしたagent execution
- Studio: local in-memory storageを許可
- R2: private original bytes

将来Mastra Memoryを永続化する場合は、API Service Binding越しのstorage adapterを追加する。Agent WorkerへTurso credentialを渡したり、同じmessageをAPI tableとMastra tableへ無計画に二重保存したりしない。

## Local developmentとMastra Studio

通常開発は次で起動する。

```sh
bun run dev
```

Web、API、private Agent Worker、Turso等を起動し、Agent Workerは`src/mastra/index.ts`をimportする。local devとE2EのmodelはOpenRouter Qwen3.6 Flashに固定する。

Studioは別commandで起動する。

```sh
bun run dev:agent:studio
```

URLは次である。

```text
https://mastra-studio.enterprise-agentic-saas.localhost
```

Studioも同じ`src/mastra/index.ts`をloadする。Studio専用のagent、mock tool、別promptを作らない。health、agent list、`product-agent` smokeをscriptで確認する。Studioはlocal development専用でproduction Workerへ同梱公開しない。

## Test strategy

### Unit / integration

- Mastra instanceが`product-agent`と全toolを登録する
- modelがOpenRouter Qwen3.6 Flashである
- Web検索provider toolが現行server toolとして登録される
- account/org mutation toolが存在しない
- API→Agent delegation expiry/replay
- Agent→API tenant/permission再検証
- Yes/No、auto policy、stale revision、idempotent retry
- image expiry、promotion race、quota、cleanup
- Sentry/log redaction
- active organization switch race
- shared Issue filter renderer

### Playwright paid Agent suite

fake Agent WebSocketやfake tool eventを使わない明示suiteを用意し、実API Worker、private Agent Worker、Mastra `product-agent`、OpenRouter Qwen3.6 Flashで次を確認する。

- layout-level shellがroute navigation後も維持される
- message stream
- Web検索とcitation
- Issue read
- Issue create preview、No、Yes
- auto mode expiry
- org切替によるstream abortとstate clear
- desktop pane resizeとmobile full-screen Sheet
- shared Issue filterのicon、badge、tips、query parameter

paid suiteは標準mock E2Eとcommandを分け、key、prompt、response本文をvideo、trace、console、HTML reportへ出さない。

### 必須gate

```sh
bun run check
bun run test:e2e:agent
bun run --cwd apps/api cf:typegen
bun run --cwd apps/agent cf:typegen
bun run --cwd apps/web cf:typegen
bun run build:cloudflare
bun run dev:agent:studio
```

## Deployment

相互Service Bindingがあるため、fresh accountはDB migration、bootstrap API（`AGENT_RUNTIME`なし）、Agent、final API、Web、smokeの順にする。既存環境の通常releaseは互換な旧APIを残してAgent、API、Webの順に更新する。bootstrap configを通常runtimeとして残さない。

- Web/APIのみcustom domainを持つ
- Agentはprivate Service Bindingのみ
- 3 Workerは別Sentry project、同じrelease SHA
- OpenRouter keyはAgent Worker secretだけ
- source map upload failure後にdeployを続行しない
- `AGENT_RUNS_ENABLED`等は文字列`1`だけを有効にする

production smokeではAPI health、Web sign-in、Agent public fetch fail-closed、API→Agent stream、Agent→API tool RPC、thread ACL、delegation replay、feature flag、readable stackを確認する。

## 参考資料

- [Mastra installation](https://mastra.ai/docs/getting-started/installation)
- [Mastra project structure](https://mastra.ai/docs/getting-started/project-structure)
- [Mastra agents](https://mastra.ai/docs/agents/overview)
- [Mastra tools](https://mastra.ai/docs/agents/using-tools)
- [Mastra Studio](https://mastra.ai/docs/studio/overview)
- [Mastra with AI SDK](https://mastra.ai/docs/frameworks/agentic-uis/ai-sdk)
- [OpenRouter web search server tool](https://openrouter.ai/docs/guides/features/server-tools/web-search)
- [Cloudflare Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Cloudflare Service Binding RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)
- [Cloudflare R2 limits](https://developers.cloudflare.com/r2/platform/limits/)
- [Cloudflare Images limits](https://developers.cloudflare.com/images/get-started/limits/)
- [nuqs documentation](https://nuqs.dev/docs)
