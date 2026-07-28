---
title: remote MCP、OAuth、PAT連携
status: proposed
implementation: planned
last_reviewed: 2026-07-28
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

ChatGPT、Codex、Claude Code、OpenClaw、HermesなどからSaaSのbusiness toolsと公開skillsを利用できるremote MCP serverを提供します。MCP serverは製品Agentをsubagentとして呼ばず、認証済みprincipalでAPIのapplication serviceを直接実行します。

## 配置

```text
apps/api/src/mcp/
  route.ts
  server.ts
  authentication.ts
  principal.ts
  authorization.ts
  protected-resource-metadata.ts
  prompts/
  resources/
```

`apps/api`は`packages/agent-tools`へ依存しますが、`apps/agent`へ依存しません。

## Mastra MCPServer

Mastra `MCPServer`を利用し、次の独自実装を避けます。

- initialize
- capability negotiation
- tools/list
- tools/call
- prompts
- resources
- Streamable HTTP protocol
- tool schema変換

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
  → local AgentToolExecutor
  → API application service
  → Application DB / R2
```

`apps/agent`とAgent DBは通りません。

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
jsonRpcRequestId
toolName
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

## Public skills

MCPに独立したskill primitiveはありません。

- userが選択する手順はprompt
- 読み取り専用ガイドはresource
- prompts/resources非対応client向けに必要ならread-only `get_skill` tool

内部Agent skillをそのまま公開しません。system policy、private endpoint、internal tool routingを除いた外部用projectionを作ります。

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
