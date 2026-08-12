---
id: ADR-009
title: MCPをAPIへ配置しOAuth認証でbusiness toolを直接実行する
status: accepted
date: 2026-07-28
owners:
  - repository-maintainers
supersedes:
  - none
related:
  - ../architecture/agent-runtime-and-mcp.md
  - ../agent/mcp-integration.md
  - ../testing-strategy/agent-refactor-mcp.md
---

# ADR-009 MCPをAPIへ配置しOAuth認証でbusiness toolを直接実行する

## 背景

ChatGPT、Codex、Claude Code、OpenClaw、Hermesなどへ、製品AgentそのものではなくSaaSのtoolsと公開skillsを提供します。

MCP serverを`apps/agent`へ置く、または`apps/api`から`apps/agent`へproxyすると、MCP clientのagent loopの内側で製品Agentを再び動かす二重Agent構成になり、latency、token、tool選択、approval、auditが複雑になります。

`apps/api`へMCPServerを置く場合も、`apps/agent`をimportするとapp間の逆依存が生じます。共有すべきものはAgent runtimeではなくbusiness tool contractです。

## 決定

- remote MCP serverは`apps/api`へ配置する
- Mastra `MCPServer`を使用する
- `apps/api`は`packages/agent-contracts`と`packages/agent-tools`へ依存し、`apps/agent`へ依存しない
- MCP requestは`apps/agent`へproxyしない
- MCPへbusiness read/write tool、公開prompt、公開resourceを登録する
- Agent、Workflow、sampling、`ui_*`、internal skillsを登録しない
- 初期MCP認証はOAuth 2.1 Authorization Code + PKCEとする
- credentialは1 organizationへ固定する
- write toolはOAuth scopeと現在のpermissionを満たした場合に直接実行する
- MCP writeに製品Agent Approvalを適用しない
- expected revision、idempotency、transaction、auditをAPIで必須にする
- PAT形式のMCP個人アクセストークンはOAuth完成後の最後のphaseに追加する
- PATからWeb sessionを作らない
- OAuth access tokenは即時revokeを成立させるため、Better Auth OAuth Providerのopaque tokenを使う
- OAuth authorization requestとtoken requestはMCP resource indicatorを必須にし、credentialのaudienceをMCPへ固定する

## 理由

### MCP client自身がagent loopを持つ

MCP serverはtool executorとして振る舞えば十分です。製品Agentを挟むと、clientが選んだtoolを別Agentが再判断し、予測可能性と監査性が下がります。

### APIがbusiness authorizationの正本

membership、role、permission、Issue revision、R2 ACL、billingはAPIが所有します。MCP serverを同じWorkerへ置けば、追加hopなしでapplication serviceを呼べます。

### Mastra MCPServerでprotocol実装を減らす

initialize、tools/list、tools/call、schema、prompts、resources、Streamable HTTPを独自実装しません。

### OAuthを標準にする

対話型clientではorganizationとscopeをbrowserで確認でき、short-lived access token、refresh、revokeを利用できます。長期secretをclient configへ直接保存する必要がありません。

Better AuthのJWT access tokenはrevoke後も期限までlocal検証できるため、MCPではprovider標準のopaque access tokenを選びます。providerがhash保存、refresh rotation、access token削除、refresh family失効を担い、APIは保存済みtoken、固定resource、現在のmembershipをrequestごとに確認します。

### PATを最後に分離する

headless環境にはPATが有用ですが、OAuth、scope、principal、tool authorizationを先に完成させると、PATはcredential resolverの追加として実装できます。最初から両方式を同時実装すると認証不具合の原因分離が難しくなります。

## 検討した代替案

### MCP serverを`apps/agent`へ置く

却下します。API認可のため結局APIを呼び、MCPとAgent runtimeの公開面が混在します。

### APIからAgentへproxyする

却下します。不要なWorker invocationと二重Agent構成を作ります。

### custom MCP serverを実装する

却下します。Mastraが提供するprotocol、schema、prompts、resourcesを再実装する理由がありません。

### OAuthだけを永久に使う

却下します。SSH、container、CI、browserなしのCLIを扱いにくくします。ただしPATは最後のphaseにします。

### PATだけを使う

却下します。対話型clientでscope consent、short-lived token、refresh、client別revokeを失います。

### MCP writeをすべて禁止する

却下します。対象clientからIssue管理を完結できません。scope、current permission、revision、idempotency、auditで安全に直接実行します。

### MCP writeをWeb approval待ちにする

却下します。clientがheadlessの場合に完結せず、通常のbusiness permissionと二重policyになります。高リスクtoolを追加する場合はtool単位で別ADRを作ります。

## 結果

### 利点

- MCP requestが最短経路でbusiness serviceへ到達する
- Agent runtimeの障害がMCP business toolを巻き込まない
- AgentとMCPでtool schemaを共有できる
- OAuth scopeとcurrent permissionを明確に分離できる
- PATを後から同じprincipal modelへ追加できる

### 代償

- `apps/api`がMastra MCP dependencyを持つ
- OAuth metadata、consent、token lifecycleを実装する必要がある
- OAuth Providerのtable定義はBetter Auth CLI出力と照合しつつ、既存tenant固有indexを持つ`auth.generated.ts`から分離して維持する必要がある
- `tools/list`と`tools/call`の両方でpermissionを確認する必要がある
- MCP writeはclient側確認UIの有無に関係なく実行されるため、scope管理が重要になる

## 強制方法

- import ruleで`apps/api -> apps/agent`を禁止する
- MCPServer configに`agents`と`workflows`を渡さない
- registry snapshotで`ask_*`、`run_*`、`ui_*`がないことを確認する
- tool input schemaにorganization IDを含めない
- `tools/call`ごとにcurrent membershipとpermissionを再検証する
- write toolへexpected revisionとidempotencyを適用する
- PAT audienceをMCPへ限定する

## 検証

- A1でscopeとpermission policy
- A2でlocal executorとwrite ordering
- A3でOAuth/PAT、idempotency、transaction
- A4でMCP protocolとregistry
- A5でserverless HTTP transport
- AUTH1からAUTH4でOAuthとPAT credential lifecycle
- E1でOAuth read/write、最後のphaseでPAT read/write
