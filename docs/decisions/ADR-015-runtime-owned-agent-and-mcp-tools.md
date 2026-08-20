---
id: ADR-015
title: Agent toolとMCP toolを各runtimeが所有する
status: accepted
date: 2026-08-20
owners:
  - repository-maintainers
related:
  - ../architecture/agent-runtime-and-mcp.md
  - ../architecture/packages/agent-contracts.md
  - ../agent/mcp-integration.md
  - ../testing-strategy/agent-refactor-mcp.md
  - ./ADR-008-mastra-native-agent-runtime.md
  - ./ADR-009-mcp-authentication-and-direct-tools.md
---

# ADR-015 Agent toolとMCP toolを各runtimeが所有する

## 背景

AgentとMCPは同じIssue業務語彙を扱いますが、実行契約は同一ではありません。Agent toolはMastra
`RequestContext`、run grant、budget、`toolCallId`、Approval、suspend、画像のmodel outputを必要とします。
MCP toolはOAuth scope、現在のmembershipとpermission、JSON Schema、idempotency、transaction、audit、
`McpToolError`をAPI内で必要とします。

`packages/agent-tools`のMastra factoryを両runtimeで共有すると、Agent固有contextをAPIへ持ち込むか、
MCP固有annotationとerror変換をAgentへ持ち込む必要があります。実際にはMCPが再利用していたfactoryは
`read_account_context`と`get_issue`だけで、残りはAgentだけが利用していました。共有factoryは変更理由と
検証責任を一つにせず、runtime固有の公開契約を見えにくくします。

## 決定

- `packages/agent-tools`を削除する。
- Agentの12件のMastra tool factoryとexecutor境界は`apps/agent/src/mastra/tools/**`が所有する。
- APIの14件のMCP toolはすべて`apps/api/src/mcp/**`が`createMcpDirectTool`で登録する。
- `createMcpSharedTool`を削除し、Agentのtool objectをMCPへ再利用しない。
- `packages/agent-contracts`にはAgent、API、Webが同じ意味で利用するValibot schemaと業務語彙だけを残す。
- MCP専用のschema、error、idempotency、upload契約は`apps/api/src/mcp/contracts.ts`へ置き、互換re-exportを
  作らない。
- 同じ業務語彙を使う場合も、description、JSON Schema、annotation、output wrapping、error mappingは
  各runtimeが明示的に所有する。

この決定が置き換えるのは、ADR-008の`packages/agent-tools`を共通境界として強制する判断と、ADR-009の
APIが同packageへ依存する判断だけです。Agent専用Storage、MCPのAPI配置、OAuth、直接業務実行、現在の
permission再検証など、両ADRの残りの判断は維持します。

## 旧exportのconsumer matrix

削除前の`packages/agent-tools/src/index.ts`が公開していた全14 exportを次のように移管します。

| 旧export                              | 旧package外consumer | 分類                  | 移管または削除先                                                          |
| ------------------------------------- | ------------------- | --------------------- | ------------------------------------------------------------------------- |
| `AgentToolExecutionContext`           | なし                | 未使用の公開型        | package exportは削除。Agent-local `tool-runtime.ts`の非公開型として再定義 |
| `AgentToolExecutor`                   | なし                | 未使用の公開型        | package exportは削除。Agent-local `tool-runtime.ts`の非公開型として再定義 |
| `createReadAccountContextTool`        | Agent、API MCP      | runtime差がある旧併用 | Agent factoryは`apps/agent`、MCP direct登録は`apps/api`                   |
| `createReadActiveOrganizationTool`    | Agent               | Agent専用             | `apps/agent/src/mastra/tools/issues/read/factories.ts`                    |
| `createSearchOrganizationMembersTool` | Agent               | Agent専用             | `apps/agent/src/mastra/tools/issues/read/factories.ts`                    |
| `createCreateIssueTool`               | Agent               | Agent専用             | `apps/agent/src/mastra/tools/issues/write/factories.ts`                   |
| `createAddIssueAttachmentsTool`       | Agent               | Agent専用             | `apps/agent/src/mastra/tools/issues/write/factories.ts`                   |
| `createDeleteIssueTool`               | Agent               | Agent専用             | `apps/agent/src/mastra/tools/issues/write/factories.ts`                   |
| `createGetIssueTool`                  | Agent、API MCP      | runtime差がある旧併用 | Agent factoryは`apps/agent`、MCP direct登録は`apps/api`                   |
| `createSearchIssueLabelsTool`         | Agent               | Agent専用             | `apps/agent/src/mastra/tools/issues/read/factories.ts`                    |
| `createSearchIssuesTool`              | Agent               | Agent専用             | `apps/agent/src/mastra/tools/issues/read/factories.ts`                    |
| `createUpdateIssueTool`               | Agent               | Agent専用             | `apps/agent/src/mastra/tools/issues/write/factories.ts`                   |
| `createRemoveIssueAttachmentsTool`    | Agent               | Agent専用             | `apps/agent/src/mastra/tools/issues/write/factories.ts`                   |
| `createReadIssueAttachmentImageTool`  | Agent               | Agent専用             | `apps/agent/src/mastra/tools/issues/read/factories.ts`                    |

集計はAgent専用10件、runtime差がある旧併用2件、MCP専用0件、完全に同一な共有factory 0件、未使用の
公開型2件です。業務schemaはこのexport一覧の外にある`agent-contracts`で引き続き共有します。

## 理由

- Agentのgrant、budget、Approval、画像sidecarをAgent内で変更し、MCPの公開面へ波及させない。
- MCPのscope、permission、idempotency、audit、error codeをAPI内で変更し、Agent toolへ波及させない。
- 12件中2件だけのfactory再利用のためにworkspaceと抽象化を維持しない。
- Valibot schemaはruntimeに依存しない業務語彙として共有し、同じ上限や列挙値の重複は避ける。
- Mastra `createTool`と`MCPServer`の標準境界を各runtimeから直接利用する。

## 検討した代替案

- `packages/agent-tools`を維持してoptionでAgent/MCPを切り替える: runtime固有context、annotation、errorを
  optionへ集約した独自DSLになるため採用しない。
- 全schemaをAgentとAPIへ複製する: 業務上同一の上限、列挙値、response語彙が分岐するため採用しない。
- Agent toolをAPIへsource importする: app間の逆依存とAgent runtimeのMCP公開面への混入を生むため
  採用しない。
- API MCP toolをAgentへsource importする: Agent WorkerへDB、Auth、transactionの責務を持ち込むため
  採用しない。

## 結果

`@enterprise-agentic-saas/agent-tools`と`agent-contracts`のMCP専用exportは破壊的に削除されます。Agentと
APIは共有Valibot contractだけへ依存し、tool factoryの変更は所有runtimeのテストで完結します。同じ
tool IDでもAgentとMCPの実行面が異なることをcode配置、manifest、JSON Schema testで確認できます。

factoryの小さな重複は生じますが、共有されるのは同じ意味を持つschemaだけです。runtime固有の安全順序、
error projection、公開descriptionを暗黙のadapterで変換しません。

## 強制方法

- workspace allowlistとmanifestから`agent-tools`を削除する。
- Knip、Oxlint、frozen lockfileで削除済みworkspaceとimportの再導入を検出する。
- Agent tool factoryを`apps/agent/src/mastra/tools/**`へ閉じ、100% coverage gateを維持する。
- MCP contract、direct factory、application serviceを`apps/api/src/mcp/**`へ閉じる。
- `packages/agent-contracts`からMastra、MCP error、MCP idempotency、API upload contractをexportしない。

## 検証

- Agent 12 toolのinput正規化、`RequestContext`、grant、budget、`toolCallId`、Approval、画像projection、safe
  errorをG2で検査する。
- MCP 14 toolのregistry、scope、current permission、JSON Schema、array wrapping、`uniqueItems`、
  `McpToolError`、idempotency、auditをA1からA4で検査する。
- `read_account_context`と`get_issue`のdescription、flat input schema、valid lookup、mixed/missing lookup、
  invalid outputの互換性をAPI testで固定する。
- Agent、API、`agent-contracts`のlint、typecheck、testとroot static/typecheck/testを実行する。
- Agent、API、rootのCloudflare dry-runを実行する。
