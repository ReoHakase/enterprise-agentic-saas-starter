---
name: agent-runtime
description: enterprise-agentic-saas-starterのAgent Worker、Mastra runtime、thread、tool、approval、usage、Agent UIを変更または検証するときに使う。
---

# Agent Runtime

## 必読文書

- [Agent設計](../../../docs/architecture/apps/agent.md)
- [Agent仕様](../../../docs/agent/README.md)
- [Agentテスト戦略](../../../docs/testing-strategy/apps/agent.md)
- observability変更時: [Observability](../../../docs/observability.md)
- securityやapproval変更時: [Agent security](../../../docs/agent/architecture-security.md)

## Workflow

1. API、Agent Worker、Webのtrust boundaryと変更対象のAgent仕様を確認する。
2. 手書きruntimeを`apps/agent/src/mastra/**`へ閉じ、外部I/Oをadapterへ置く。
3. tenant、capability、approval、usageの検証をAPIの正本へ残す。
4. 最小のdeterministic testから実装し、paid testは明示承認がある場合だけ実行する。
5. Cloudflare構成を変更した場合はproduction bundleまで検証する。

## Validation

- `bun run --cwd apps/agent lint`
- `bun run --cwd apps/agent typecheck`
- `bun run --cwd apps/agent test`
- Cloudflare変更時: `bun run --cwd apps/agent build:cloudflare`
- behavior変更時: `bun run test:eval:agent`

## 禁止事項

- DB、Auth、Email、WebをAgentから直接importしない。
- model output、label、opaque ID、Mastra Memoryを認可へ使わない。
- production、test artifact、remote telemetryへsecret、private URL、raw bytes、provider raw responseを残さない。local rich telemetryは固定local endpointかつdevelopmentの場合だけ認証materialをredactして保持する。
