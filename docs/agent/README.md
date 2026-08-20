---
title: 製品Agent仕様の入口
status: accepted
implementation: not-applicable
last_reviewed: 2026-08-19
---

# Agent仕様

このディレクトリは、製品Agentの仕様、実装境界、release acceptanceの正本です。coding agentの
情報routing、実装、検証、差分レビューの手順は
[`docs/architecture/coding-agent-workflow.md`](../architecture/coding-agent-workflow.md)を参照します。

過去の機能・test草案にあった有効な要件はここへ統合し、草案なしで設計と検証範囲を追跡します。
test layerと公開commandの正本は
[`docs/testing-strategy/apps/agent.md`](../testing-strategy/apps/agent.md)と
[`docs/testing-strategy/e2e.md`](../testing-strategy/e2e.md)であり、このdirectoryは製品scenarioと
release acceptanceを所有します。

## 読む順序

1. [Architectureとsecurity](./architecture-security.md) — 3 Worker、依存方向、opaque capability、tenant境界
2. [Chat UI/UX](./chat-ui.md) — shell、thread picker、composer、trace、shortcut、responsive契約
3. [Threadとcontext](./threads-context.md) — 永続化、自動title、context budget、compaction
4. [Tool、Web検索、approval](./tools-approval.md) — tool境界、検索query guard、inline approval、失敗時動作
5. [Asset、mention、page context](./assets-mentions.md) — chat画像、context reference、Issue link
6. [Usageとbilling](./usage-billing.md) — provider usage正規化、pricing、日次projection、meter
7. [Testとrelease gate](./testing.md) — deterministic test、paid E2E、3回eval、完了条件
8. [運用runbook](./operations.md) — local起動、secret、deploy、retention、障害対応

## Status matrix

| 関心ごと                                          | 正本                  | 実装status        | Release gate                                                                             |
| ------------------------------------------------- | --------------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| 3 Worker / private Service Binding                | architecture-security | 実装済み          | typegen、Cloudflare build、private route test                                            |
| opaque ticket / grant / epoch                     | architecture-security | 実装済み          | replay、失効、tenant test                                                                |
| thread count / sort / archive / auto/manual title | threads-context       | 実装済み          | DB/API/component/E2E                                                                     |
| context meter / compaction                        | threads-context       | 実装済み          | threshold、summary、provider usage test                                                  |
| thinking / transient status / tool / source表示   | chat-ui               | 実装済み          | canonical保存、完了時消去、reload、desktop/mobile                                        |
| 公開情報だけの検索語とquery guard                 | tools-approval        | 実装済み          | ユーザーが明示した検索語、secret/PII/opaque ID、履歴・Issue・tool結果eval                |
| historical approval reload                        | tools-approval        | 実装済み          | session更新後GET、decision/resume scope test                                             |
| mention / page context / Issue link               | assets-mentions       | 実装済み          | API再解決、cross-tenant、UI test                                                         |
| Issue添付metadata / オンデマンド画像理解          | assets-mentions       | 実装済み          | pagination、private model route、4枚上限、metadata-only reload                           |
| usage event / pricing / daily projection          | usage-billing         | 実装済み          | idempotency、price version、失敗/cancel test                                             |
| Agent UI shortcut                                 | chat-ui               | 実装済み          | IME、input、modal、desktop/mobile test                                                   |
| deterministic release suite                       | testing               | releaseごとに検証 | `bun run check`、Browser Mode/free E2E、typegen、Cloudflare build                        |
| paid eval / E2E canary                            | testing               | releaseごとに検証 | browserless G5 eval 3/3、Luna固定E2 3本（Web検索、非公開Issue読取、承認付き書込）を各1回 |

「実装済み」はcode pathが存在することを示し、「検証済み」は[Testとrelease gate](./testing.md)の対応gateが成功したことを示します。確率的なLLM出力は文面一致で保証せず、tool call、stream part、DB state、安全境界を検証します。

## 採用しない旧案

- browserやAgent WorkerへJWT署名鍵を配る方式
- 独自`x-csrf-token` headerを増やす方式
- Mastra Memoryをtenantデータやthread履歴の正本にする方式
- モデルが生成した`Web検索:`接頭辞だけを公開情報の根拠とする方式
- model文面をapproval preview、authorization、Issue linkの根拠にする方式
- API/Web/Agent間の旧interface互換layer

公開API、内部module、schemaはrelease前のため新契約へ直接移行します。
