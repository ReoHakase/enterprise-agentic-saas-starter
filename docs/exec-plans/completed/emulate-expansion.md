---
id: PLAN-2026-009
title: emulate対応サービス拡張
status: completed
created: 2026-07-26
owners:
  - repository-maintainers
linked_specs:
  - ../../architecture/apps/emulate.md
  - ../../testing-strategy/apps/emulate.md
  - ../../architecture/system-boundaries.md
linked_adrs:
  - ../../decisions/ADR-007-workspace-testing-strategy.md
---

# emulate対応サービス拡張

## 目的

GitHub専用appを`apps/emulate`へ一般化し、GitHub、Google、
Slack、Microsoft、Apple、Okta、Stripeをローカルと決定的テストで起動できるようにする。
テスト層名を`EMU1`から`EMU3`へ統一する。

## 対象外

- Google等をBetter Authや製品機能へ接続すること
- `vercel-labs/emulate`が提供する上記以外のサービス
- 本番deploy、Git push、PR merge
- 有料テスト

## 前提条件

- `emulate@0.9.0`のprogrammatic APIを維持する
- 通常の`bun run dev`はGitHubだけを自動起動する
- 実プロバイダーの認証情報やURLを読み込まない
- サブエージェントを使用しない

## 変更対象path

- 旧GitHub専用appから`apps/emulate/**`
- `apps/api/turbo.json`
- `apps/web/package.json`とPlaywright設定
- `docs/architecture/**`と`docs/testing-strategy/**`
- `knip.config.ts`、`oxlint.config.ts`、`bun.lock`
- `.agents/local-skills/e2e-test/SKILL.md`

## 作業単位

1. サービス選択、ローカルURL検証、readiness契約を一般化する
2. workspaceと起動コマンドを`apps/emulate`へ移す
3. 文書、テスト層、品質設定、local skillの参照を更新する
4. lockfileをBunで再生成し、対象テストから全体検証へ広げる

## 進捗

- [x] 現行実装、上流API、配置境界を確認した
- [x] `apps/emulate`を実装した
- [x] 文書とskillを更新した
- [x] 必須検査を完了した
- [x] 実行計画を完了状態へ移した

## 判断記録

| 日付       | 判断                                      | 理由                                                 |
| ---------- | ----------------------------------------- | ---------------------------------------------------- |
| 2026-07-26 | `packages/emulate`ではなくappに置く       | 独立して待受する開発・テスト用HTTP実行系であるため   |
| 2026-07-26 | root開発起動はGitHubだけを維持する        | 未使用サービスの常時起動とPortless alias競合を避ける |
| 2026-07-26 | EMU3は既存GitHub Auth契約だけを対象にする | 未実装の製品接続を保証済みと誤認しないため           |

## 検証証跡

| command                            | 結果    | 証跡                                                       |
| ---------------------------------- | ------- | ---------------------------------------------------------- |
| `bun install --frozen-lockfile`    | success | 1,737 installsを確認し、lockfile変更なし                   |
| `bun run --cwd apps/emulate test`  | success | 6 files、46 tests、line coverage 100%                      |
| `bun run check`                    | success | 全9 workspaceのstatic、format、typecheck、unit/integration |
| `bun run test:e2e`                 | success | 決定的E2E 3 tests                                          |
| `nix flake check`                  | success | aarch64-darwinの4 checks                                   |
| 旧path、旧workspace名、旧layer検索 | success | semantic referenceなし                                     |

## リスクとrollback

workspace名とE2E起動コマンドの更新漏れが主なリスクである。旧pathと旧workspace名を
全体検索し、GitHub OAuth E1まで通す。問題がある場合はrenameと一般化を
同じ変更単位で戻し、GitHub専用起動へ戻せる。

## 完了条件

- 7サービスが明示選択で起動できる
- root開発起動と既存GitHub OAuth E1が維持される
- テスト層名が`EMU1`から`EMU3`へ統一される
- `bun run check`、`bun run test:e2e`、`nix flake check`が成功する
