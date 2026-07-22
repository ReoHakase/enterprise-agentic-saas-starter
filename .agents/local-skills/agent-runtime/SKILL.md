---
name: agent-runtime
description: enterprise-agentic-saas-starterのAgent Worker、Mastra、chat thread、context meter、thinking/tool trace、Web検索、Issue承認、usage、Agent UIを設計・実装・調査するときに使う。
---

# Agent Runtime

作業前に[Agent仕様](../../../docs/agent/README.md)のstatus matrixと、変更対象の仕様ページを読む。詳細実装は必要なreferenceだけを読む。

## 不変条件

- Browser → cookie認証済みAPI → private Agent Worker → API named entrypointの3 Worker境界を維持する。
- API/Tursoをthread、message、action、usage、tenant dataの正本にし、Mastra Memoryやmodel文面を認可へ使わない。
- capabilityはDB-backed opaque tokenにし、Origin検証へ独自CSRF headerを追加しない。
- Webは`@enterprise-agentic-saas/api/client`、Agentは`@enterprise-agentic-saas/api/agent-client`、APIだけがDBへ依存する。
- Agent WorkerへTurso、R2、Better Auth secret、JWT署名鍵を渡さない。public routeを作らない。
- model/tool inputのID、label、page pathを信用せず、APIがactive organizationで再解決する。
- Web検索は履歴、Issue、page context、tool結果を利用できるが、最終queryからcredential、PII、known member identity、opaque ID、private固有情報を除く。確定できなければ検索しない。
- Web検索後もthreadの`ask_always | full_access`を維持し、queryや検索結果から権限を拡張しない。
- approval preview、decision、receiptはAPI正本。cardはtool part位置へinline表示する。
- provider reasoning、tool、source、context budget、title data partをbounded canonical messageとして保存し、transient activityは保存しない。
- provider usageでreasoning/cacheを二重計上せず、失敗・cancelでも観測済みusageを冪等記録する。
- 旧`IssueAssistant`はretention隔離し、この変更へ`deleted_classes`を含めない。

## Reference routing

- capability、Worker、run、stream、tool: [references/runtime-security.md](./references/runtime-security.md)
- thread、context、usage、DB/API: [references/thread-context-usage.md](./references/thread-context-usage.md)
- UI、approval、mention、shortcut: [references/chat-ui.md](./references/chat-ui.md)
- deterministic / paid test、release gate: [references/testing.md](./references/testing.md)

## 最低検証

```sh
bun --filter @enterprise-agentic-saas/api test
bun --filter @enterprise-agentic-saas/agent test
bun --filter @enterprise-agentic-saas/web test
bun run check
bun run --cwd apps/api cf:typegen
bun run --cwd apps/agent cf:typegen
bun run --cwd apps/web cf:typegen
bun run build:cloudflare
```

Agent behavior変更はmockだけで完了にせず、[paid E2E仕様](../../../docs/agent/testing.md#paid-e2e)のrelease scenarioと3回evalを通す。
