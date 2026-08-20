---
title: packages/agent-contractsとpackages/agent-toolsの設計
status: accepted
implementation: active
last_reviewed: 2026-08-20
applies_to:
  - packages/agent-contracts/**
  - packages/agent-tools/**
---

# packages/agent-contractsとpackages/agent-toolsの設計

## 責務

`agent-contracts`はAgent、API、Web、将来のMCPが共有するValibot schemaと推論型を所有します。
`agent-tools`はMastra `createTool`を直接使う個別business tool factoryと、入出力ごとの薄い
`AgentToolExecutor`関数型だけを所有します。

## 依存方向

```text
apps/agent ─┬→ agent-contracts
            └→ agent-tools → agent-contracts

apps/api   ─┬→ agent-contracts
            └→ agent-tools

apps/web    └→ agent-contracts
```

packageからapp、DB、Auth、R2へ依存しません。認可、tenant解決、transaction、credentialはconsumerが
executorへ閉じた状態で注入します。tool inputへorganization、user、session、grant、tokenを含めません。

Agentのthread、message page、run、Issue action、execution receipt、approval policy、context
revocation、UIMessage streamで公開する値とschemaは`agent-contracts`を唯一の正本にします。APIはroute
responseとprivate Agent responseの検査へ同じschemaを直接渡し、WebもAPI client経由の再exportではなく
packageから直接importします。旧DB rowのpreviewだけはAPI内の再帰的なloose projectionで公開表示fieldへ絞り、
その後のHTTP responseはstrict schemaで検査します。

## 禁止する抽象化

- custom Capability DSL
- tool registry
- tool名で分岐するgeneric dispatcher
- business permission判定
- provider client
- app固有のRequestContext

各toolは個別factoryを持ち、Mastraのschema、annotation、transformをそのまま利用します。

## 検証

- package export、typecheck、Oxlint、Knip、cycle
- Valibot schemaの未知field、上限、private field拒否
- `createTool` factoryからfake executorへの1回の引渡し
- consumer側G2、A1、A4でruntime固有の接続

独自の公開テスト層番号は追加しません。colocated testはroot `bun run test`から実行します。
