---
title: remote MCP、OAuth、PAT連携
status: accepted
implementation: active
last_reviewed: 2026-08-03
applies_to:
  - apps/api/src/mcp/**
  - packages/auth/**
  - packages/agent-contracts/**
  - packages/agent-tools/**
related:
  - ../architecture/agent-runtime-and-mcp.md
  - ../decisions/ADR-009-mcp-authentication-and-direct-tools.md
  - ../testing-strategy/agent-refactor-mcp.md
---

# remote MCP、OAuth、PAT連携

## 目的

ChatGPT、Codex、Claude CodeなどからSaaSのbusiness toolsと公開prompt、公開resourceを利用できるremote MCP serverを提供します。MCP serverは製品Agentをsubagentとして呼ばず、認証済みprincipalでAPIのapplication serviceを直接実行します。

## 配置

```text
apps/api/src/mcp/
  module.ts
  server.ts
  authentication.ts
  principal.ts
  transport.ts
  tools/
  prompts/
  resources/
```

`apps/api`は`packages/agent-contracts`のValibot schemaを再利用し、API内のapplication serviceを直接実行します。`packages/agent-tools`と`apps/agent`へ依存しません。

## Mastra MCPServer

Mastra `MCPServer`を利用し、次の独自実装を避けます。

- initialize
- capability negotiation
- tools/list
- tools/call
- prompts
- resources
- Streamable HTTP protocol

Cloudflare WorkersではMCP SDKの`CfWorkerJsonSchemaValidator`を使います。toolのValibot検証を維持したまま、MCPへ公開するJSON Schemaだけを事前生成し、実行時の動的コード生成を避けます。

登録するもの:

- business tools
- 外部公開可能なprompts
- 外部公開可能なresources

登録しないもの:

```text
agents
workflows
sampling
ui_*
rename_thread
web_search
internal skills
system instructions
```

AgentまたはWorkflowを設定すると自動tool化されるため、registry snapshot testで不在を固定します。

## MCP request path

```text
MCP client
  → POST /mcp
  → credentialをMcpPrincipalへ解決
  → scopeとcurrent permissionからtool registryを構成
  → MCPServer
  → API application service
  → Application DB / R2
```

`apps/agent`とAgent DBは通りません。

serverless transportは`POST /mcp`だけを受け付けます。標準clientが初期化後に試す任意のSSE購読用`GET /mcp`には`405 Allow: POST`を返し、clientはstateless Streamable HTTPを継続します。MCP responseのstatusとheaderはElysiaのresponseへ明示的に転記し、Cloudflare adapter通過後も`application/json`を維持します。

## Principal

```ts
type McpPrincipal =
  | {
      kind: "oauth-user"
      userId: string
      organizationId: string
      clientId: string
      scopes: McpScope[]
    }
  | {
      kind: "personal-access-token"
      userId: string
      organizationId: string
      credentialId: string
      scopes: McpScope[]
    }
  | {
      kind: "service-account"
      serviceAccountId: string
      organizationId: string
      credentialId: string
      scopes: McpScope[]
    }
```

初期MCP実装は`oauth-user`だけです。PATは最後のphaseで追加します。service accountは将来要件です。

## OAuth flow

```text
1. clientがcredentialなしで/mcpへ接続
2. APIが401とWWW-Authenticateを返す
3. clientがprotected resource metadataを取得
4. clientがOAuth metadataを取得
5. Authorization Code + PKCEを開始
6. browserでSaaSへログイン
7. organizationを選択
8. scopeへconsent
9. client callbackへredirect
10. codeをaccess tokenとrefresh tokenへ交換
11. clientがAuthorization: Bearerを付けて/mcpへ再接続
```

ChatGPT、Codex、Claude Codeなど対話型clientの標準経路です。

現在のOAuth実装はBetter Auth OAuth Providerを使い、`/mcp`を唯一のresource indicatorとしてauthorization requestとtoken requestの両方で必須にします。access tokenはhash保存するopaque tokenであり、access token revokeはrow削除、refresh token revokeは同じrefresh familyのaccess token削除として即時反映します。APIはtoken保存状態に加えて現在のmembershipをrequestごとに確認します。

認可画面では、未ログインの場合に署名済みauthorization queryを`redirectTo`へ保持してsign-inへ送り、ログイン後に同じ要求へ戻します。端末に複数のログイン済みaccountがある場合は、organization選択とconsentの両方でBetter Auth multi-sessionの既存account switcherからaccountを選び直せます。OAuth画面からdevice sessionのrevokeは行わず、accountを追加または切り替えた後も現在の署名済みOAuth URLを維持します。

未ログインから開始したauthorizationでは、sign-in後にorganization選択を必ず経ます。organization選択は通常のorganization一覧と同じTanStack Table rendererとidentity componentを使います。organization icon、メンバーavatar stack、member count、現在のroleを表示し、credentialは選択した1 organizationへ固定します。consent画面は要求されたscopeだけを対象に、対象を行、操作を列とする同じDataTable rendererの表を表示します。セル単位の選択に加えて、対象行と操作列のlabelまたはcheckboxによる一括選択を提供し、`offline_access`は権限scopeと分けて表示します。許可時は選択後のscope集合だけをBetter Authへ渡し、`offline_access`だけの発行は拒否します。有効なactive organizationを持つログイン済みaccountから開始した場合は、Better Authの標準`postLogin.shouldRedirect`に従ってorganization選択を省略できます。

## Organization binding

1 credentialは1 organizationへ固定します。

禁止:

- tool inputで`organizationId`を指定する
- headerでorganizationを切り替える
- 1 tokenで複数organizationを操作する

別organizationを利用する場合は別consentまたは別tokenを作成します。

## Scope

```ts
type McpScope =
  | "account:read"
  | "organization:read"
  | "members:read"
  | "issues:read"
  | "issues:create"
  | "issues:update"
  | "issues:delete"
  | "files:read"
  | "files:write"
```

`offline_access`は更新用tokenを要求する補助scopeであり、業務権限ではありません。Issueでは`create`、
`update`、`delete`を分けます。Filesでは現在の業務tool契約が`files:read`と`files:write`であり、
`files:write`がupload session、status、attachment管理を表すため、Filesだけにcreate/update/deleteを
増やしません。名称を増やすより、既存tool catalogとcurrent permissionの境界をそのまま表にします。

利用者はアカウント設定のMCP OAuth accessで、credential familyごとのclient名、紐付いた組織と現在のrole、
scope、作成日時、期限を確認できます。raw access token、refresh token、token hashは返しません。組織membershipが
失われたcredentialは組織情報を表示せず、APIのcurrent permission検査で利用も拒否します。revokeはrefresh
family全体またはaccess-only credentialを即時無効化します。

管理APIはfirst-party session cookieだけを受け付けます。

```text
GET    /me/mcp-oauth/sessions
DELETE /me/mcp-oauth/sessions/:credentialId
```

この一覧はMCP bearer tokenの管理APIではなく、Webアカウント設定専用の安全な投影です。

## Tool catalog

### Read

| tool                          | scope                       | current permission |
| ----------------------------- | --------------------------- | ------------------ |
| `read_account_context`        | `account:read`              | self               |
| `read_active_organization`    | `organization:read`         | membership         |
| `search_organization_members` | `members:read`              | member read        |
| `search_issue_labels`         | `issues:read`               | Issue read         |
| `search_issues`               | `issues:read`               | Issue read         |
| `get_issue`                   | `issues:read`               | Issue read         |
| `read_issue_attachment_image` | `issues:read`, `files:read` | Issue read         |

### Write

| tool                               | scope                          | current permission |
| ---------------------------------- | ------------------------------ | ------------------ |
| `create_issue`                     | `issues:create`                | Issue create       |
| `update_issue`                     | `issues:update`                | Issue update       |
| `delete_issue`                     | `issues:delete`                | Issue delete       |
| `add_issue_attachments`            | `issues:update`, `files:write` | Issue update       |
| `remove_issue_attachments`         | `issues:update`, `files:write` | Issue update       |
| `create_attachment_upload_session` | `files:write`                  | file upload        |
| `get_attachment_upload_status`     | `files:write`                  | own upload         |

MCP導入時点からreadとwriteを実装します。read-only rolloutは行いません。

## Authorization

```text
allowed =
  credential scope
  AND current membership
  AND current permission
  AND credential organization = resource organization
  AND resource state is valid
```

`tools/list`で利用不能toolを除外します。role変更はlisting後にも起こるため、`tools/call`で必ず再検証します。

## Direct write

MCP writeはAgent Approvalを使いません。

```text
tools/call
  → scope
  → current permission
  → expected revision
  → idempotency reservation
  → transaction
  → audit
  → receipt
```

clientのconfirmation UIは補助であり、server authorizationの代わりではありません。

## Idempotency

MCP JSON-RPC request IDはtransport相関専用であり、業務冪等キーへ流用しません。write tool schemaで
clientが明示した業務冪等キーを必須にし、client ID、principal、organization、tool名、正規化payload
digestへ束縛します。同じJSON-RPC request IDで異なるpayloadが来ても同じ業務操作とみなしません。

```text
clientId
principalId
organizationId
toolName
idempotencyKey
normalizedPayloadDigest
```

同じidentityと同じpayloadは既存receiptへ収束します。異なるpayloadはconflictです。

create、attachment add/removeにも適用します。update/deleteは`expectedRevision`を必須にします。

## Attachment upload

MCP tool inputへbase64を入れません。

```text
create_attachment_upload_session
  → one-time upload URLとupload ID
  → clientまたは連携Web UIがupload
  → get_attachment_upload_status
  → ready asset ID
  → add_issue_attachments
```

upload URLは短命、single-use、organization固定です。R2 keyを返しません。
upload reservation、temporary quota、storage objectはD1で管理し、期限切れreservationは次のsession作成時に
exact-key cleanup jobへ移します。ready assetをIssueへ追加すると、同じtransactionでfile claimへ移し、
temporary quotaだけを解除します。

## 公開promptとresource

MCPに独立したskill primitiveはありません。

- `triage_issue`: 利用者の依頼を最大4,000文字で受け取り、organization確認、重複検索、最新revision、冪等キー、秘密情報非入力を案内するprompt
- `guide://enterprise-agentic-saas/issues`: Issueの検索、作成、更新、削除を案内する読み取り専用resource
- `guide://enterprise-agentic-saas/attachments`: upload session、実byte upload、status確認、attachment追加・削除を案内する読み取り専用resource

内部Agent skill、system instruction、private endpoint、内部tool routingは公開しません。prompts/resources非対応client向けの独自`get_skill` toolも追加せず、business tool catalogを増やしません。

## client設定

公開endpointは`<API_PUBLIC_URL>/mcp`です。`<API_PUBLIC_URL>`はbrowserから到達できるHTTPS originへ置き換えます。OAuthでは同じURLをresource indicatorとして使い、organizationとscopeはbrowserのconsent画面で確定します。

### MCP Inspector

local開発では通常の`bun run dev`と一緒にWeb版MCP Inspectorを起動します。Inspectorだけを起動する
場合は次を実行し、表示URLは`portless-topology resolve`で確認します。

```sh
bun run dev:mcp-inspector
bun run portless-topology resolve mcp-inspector.enterprise-agentic-saas
```

Inspectorには同じworktreeの`<API_PUBLIC_URL>/mcp`とStreamable HTTP transportが設定済みです。
Web版のcallbackはInspectorの実効originにある`/oauth/callback`であり、main checkoutでは
`https://mcp-inspector.enterprise-agentic-saas.localhost/oauth/callback`です。linked worktreeや
Portlessのportが異なる場合は、表示中のInspector originをそのまま使います。

Inspector backendはloopbackへbindし、browser originを厳密なallowlistへ設定します。Inspector自身の
session tokenを維持します。tokenを表示するInspectorの通常stdoutは破棄し、
`DANGEROUSLY_OMIT_AUTH`や全interface bindは使用しません。credential stateは
`~/.mcp-inspector/storage`へ保存し、repositoryへ追加しません。

### ChatGPT

full MCPのwrite actionを使う場合は、ChatGPT webのBusinessまたはEnterprise/Edu workspaceでdeveloper modeを有効にします。`Settings > Apps > Create`またはworkspaceの`Apps > Create`からendpointへ`<API_PUBLIC_URL>/mcp`を指定し、認証方式にOAuthを選択して`Scan Tools`を実行します。browserでlogin、organization選択、consentを完了するとdraft appとして検査できます。公開前に管理者がtool差分とwrite actionを確認します。

現行の利用条件と画面経路は[OpenAI公式のdeveloper modeとMCP apps](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta)を正本とします。ChatGPTはlocal endpointへ直接接続しないため、production deploy前のlocal検証にはこの手順を使いません。

### Codex

Codex CLI、IDE extension、ChatGPT desktop appは同じCodex hostのMCP設定を共有します。local開発では
Portlessの実効API URLを解決し、Codexのuser設定へStreamable HTTP serverを追加してOAuth loginを
開始します。

```bash
MCP_URL="$(bun run --silent portless-topology resolve api.enterprise-agentic-saas)/mcp"

codex mcp add enterprise-agentic-saas-local \
  --url "$MCP_URL" \
  --oauth-resource "$MCP_URL"
codex mcp login enterprise-agentic-saas-local \
  --scopes "offline_access,account:read,organization:read,members:read,issues:read,issues:create,issues:update,issues:delete,files:read,files:write"
```

CodexはDynamic Client Registrationで実行時のloopback callbackを登録します。OAuth client ID、callback
URL、Bearer tokenを設定へ書きません。手書きする場合のuser設定は次と等価ですが、このrepositoryの
Nix生成`.codex/config.toml`は手編集しません。`url`と`oauth_resource`には同じ実効MCP URLを指定します。

```toml
[mcp_servers.enterprise-agentic-saas-local]
url = "https://api.<worktree>.enterprise-agentic-saas.localhost:<port>/mcp"
oauth_resource = "https://api.<worktree>.enterprise-agentic-saas.localhost:<port>/mcp"
```

別worktreeへ切り替える場合は`codex mcp remove enterprise-agentic-saas-local`で古いURLを削除し、
再度`add`と`login`を実行します。`codex mcp list`で接続状態を、Codex内の`/mcp`で公開tool、prompt、
resourceを確認します。設定項目とOAuth操作は
[Codex公式MCP文書](https://developers.openai.com/codex/mcp)を正本とします。

### Claude Code

remote HTTP serverを追加し、Claude Code内の`/mcp`からOAuth認証を開始します。

```bash
claude mcp add --transport http --scope user \
  enterprise-agentic-saas "<API_PUBLIC_URL>/mcp"
```

browserが自動で開かない場合は、`/mcp`が表示するURLをbrowserへコピーします。tokenはClaude Codeが保存・refreshします。現在のcommandとOAuth操作は[Claude Code公式MCP文書](https://code.claude.com/docs/en/mcp)を正本とします。

## Error contract

認証:

- credentialなし: 401とOAuth challenge
- invalid、expired、revoked: 401
- audience不一致: 401

認可:

- scope不足: tool非公開またはMCP forbidden error
- current permission不足: forbidden
- cross-tenant、不存在:同じnot-found projection

競合:

- expected revision不一致: conflict
- idempotency payload不一致: conflict

provider:

- R2、DBなどの一時障害: retryable internal error
- raw provider error、SQL、stack、credentialを返さない

## PAT

PATはPhase 5で追加します。

目的:

- SSH先
- container
- CI
- browserを開けないCodex、Claude Code、OpenClaw、Hermes

仕様:

```text
prefix          製品固有
principal       user
organization    1つに固定
audience        mcp
expiry          default 90日、max 365日
storage         hashのみ
reveal          作成時1回
revocation      即時
permission      requestごとに現在値を再確認
```

OAuthとPATは同じ`Authorization: Bearer`を使います。credential resolverがtoken形式を判別します。

PATからWeb sessionを作りません。PATを一般REST APIへ自動適用せず、MCP audienceへ限定します。

## Rate limitとaudit

rate limit軸:

- IP
- OAuth clientまたはcredential ID
- userまたはservice account
- organization
- tool class

監査項目:

- principal kind
- principal ID
- organization ID
- credential IDまたはOAuth client ID
- tool名
- resource ID
- result code
- idempotency identity
- timestamp

secret、raw payload、attachment bytesをauditへ入れません。

## 実装順序

### Phase 4 OAuth MCP

- OAuth Provider
- protected resource metadata
- organization consent
- scopes
- MCPServer
- all read/write tools
- upload session
- prompts/resources
- A1からA5、AUTH1からAUTH4、E1

### Phase 5 PAT

- API key pluginまたは同等のhash storage
- Web UIで発行、一覧、失効
- bearer resolver
- expiry、rotation、rate limit
- PAT E1 journey

## 受入条件

- APIがAgent appをimportしない
- MCP requestがAgent Workerを経由しない
- all business toolsがOAuthで動作する
- writeはscopeとcurrent permissionの両方を確認する
- AgentとWorkflowがMCP toolとして公開されない
- organizationをtool inputから選べない
- uploadにbase64またはR2 keyを使わない
- PATはOAuth完成後の独立phaseで実装される
