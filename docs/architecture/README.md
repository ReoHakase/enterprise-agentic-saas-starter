---
title: 設計仕様の目次
status: accepted
implementation: not-applicable
last_reviewed: 2026-07-26
---

# 設計仕様の目次

## 共通

- [知識管理](knowledge-management.md)
- [日本語技術文書の用語・表記基準](../jargon.md)
- [命名とlayer](naming-and-layers.md)
- [システム境界](system-boundaries.md)
- [品質強制](quality-enforcement.md)
- [Codex harness](codex-harness.md)

## apps

- [`apps/web`](apps/web.md)
- [`apps/api`](apps/api.md)
- [`apps/agent`](apps/agent.md)
- [`apps/emulate`](apps/emulate.md)

## packages

- [`packages/auth`](packages/auth.md)
- [`packages/db`](packages/db.md)
- [`packages/email`](packages/email.md)
- [`packages/ui`](packages/ui.md)
- [`packages/typescript-config`](packages/typescript-config.md)

## 更新規則

app/packageのdirectory、public entrypoint、import方向を変える場合は、そのworkspace文書と`system-boundaries.md`を同じPRで更新します。品質上限を変える場合は`quality-enforcement.md`とADRを更新します。
