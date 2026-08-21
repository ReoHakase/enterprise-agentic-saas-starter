---
title: packages/agent-contractsの設計
status: accepted
implementation: active
last_reviewed: 2026-08-20
applies_to:
  - packages/agent-contracts/**
---

# packages/agent-contractsの設計

## 責務

`agent-contracts`はAgent、API、Webが同じ意味で利用するValibot schemaと推論型を所有します。chat、run、
approval、Issue action、toolの業務入出力など、transportやruntimeに依存しない公開語彙だけを共有します。

Agentのthread、message page、run、Issue action、execution receipt、approval policy、context revocation、
UIMessage streamで公開する値とschemaはこのpackageを唯一の正本にします。APIはroute responseとprivate
Agent responseを同じschemaで検査し、WebもAPI client経由の再exportではなくpackageから直接importします。
旧DB rowのpreviewを読む場合だけAPI内のloose projectionで公開fieldへ絞り、その後のHTTP responseを
strict schemaで検査します。

```text
apps/web   ─┐
apps/api   ─┼→ @enterprise-agentic-saas/agent-contracts
apps/agent ─┘
```

packageからapp、DB、Auth、Email、R2、Mastraへ依存しません。API route schema、MCP error、OAuth scope判断、
idempotency、upload session、Agent `RequestContext`、tool factoryは所有しません。
tool inputへorganization、user、session、grant、tokenを含めず、認可済みruntime contextから解決します。

## Source構成

```text
packages/agent-contracts/src/
  chat.ts
  public-url.ts
  runtime.ts
  schemas.ts
  schema-types.ts
  tools.ts
  index.ts
```

- `chat.ts`: UIMessageとchat transportの公開contract
- `runtime.ts`: Agent内部Service Bindingで直列化するrequestとresponse
- `schemas.ts`と`schema-types.ts`: 共有response語彙と推論型
- `tools.ts`: Agent/APIが同じ意味で使うboundedなIssue tool入出力
- `public-url.ts`: 公開HTTP URLのcanonicalization
- `index.ts`: 上記だけを公開するpackage entrypoint

外部入力は原則として`v.strictObject`を使います。未知fieldを黙って削除せず、上限、列挙値、tenantや
capability fieldの混入を拒否します。APIはMCP専用contractを`apps/api/src/mcp/contracts.ts`、Agentは
Mastra tool factoryを`apps/agent/src/mastra/tools/**`で所有します。

## 禁止する抽象化

- Mastra `createTool` factoryとexecutor interface
- MCP tool registry、annotation、JSON Schema wrapper
- API route、repository、transaction、permission判断
- provider clientとruntime credential
- app固有の`RequestContext`
- tool名で分岐するgeneric dispatcherやCapability DSL

## 検証

- package export、typecheck、Oxlint、Knip、cycle
- Valibot schemaの未知field、上限、private field拒否
- schemaと推論型の一致
- G2、A1、A4でconsumer固有のruntime接続

package testは独自の公開テスト層番号を持たず、root `bun run test`から実行します。
