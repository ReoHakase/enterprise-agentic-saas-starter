---
id: PLAN-2026-028
title: coding agent設定のNix集約
status: completed
created: 2026-08-01
owners:
  - repository-maintainers
linked_specs:
  - ../../architecture/coding-agent-workflow.md
  - ../../architecture/knowledge-management.md
  - ../../architecture/quality-enforcement.md
  - ../../local-development.md
linked_adrs:
  - ../../decisions/ADR-001-docs-and-skills-source-of-truth.md
  - ../../decisions/ADR-011-nix-managed-agent-config.md
---

# coding agent設定のNix集約

## 目的

Git管理中の`.codex` harnessを廃止し、repo-local skillの選択・bundle生成と3つのMCP定義を
`flake.nix`へ集約します。同期時だけ`.codex/config.toml`を生成し、Codexのproject scoped MCPを
維持します。

## 対象外

- applicationの公開API、schema、型、production runtime
- `flake.lock`
- LefthookとGit hook
- Browser、E2E、有料テストの新規追加または変更
- 完了済みexec planの履歴修正

## 前提条件

- `.agents/local-skills/`をrepo-local skillの編集元として維持する
- `.agents/skills/`はNix生成先とし、直接編集しない
- `mcpServers`を3 client共通の定義にする
- Grafana MCPは書き込み機能を無効にする

## 変更対象path

```text
.codex/**
.gitignore
AGENTS.md
README.md
flake.nix
package.json
knip.config.ts
vitest.config.ts
.agents/local-skills/**
docs/**
```

## 作業単位

1. tracked `.codex/**`と専用harness testを削除する。
2. `flake.nix`からCodex、VS Code、CursorのMCP設定を生成する。
3. lint、Knip、Vitestの`.codex`入口と旧`.mcp.toml`生成物を除去する。
4. `AGENTS.md`、正本文書、local skill、ADRを新しい作業手順へ更新する。
5. 一時rootで同期の冪等性と3 clientの設定内容を検証する。
6. Nixとリポジトリの必須検査を実行し、現在の差分をレビューする。

## 進捗

- [x] 現行の`.codex`、Nix生成、品質設定、正本文書を調査した
- [x] tracked `.codex/**`を削除した
- [x] 3 clientのMCP生成を`flake.nix`へ集約した
- [x] root品質設定から`.codex`入口を除去した
- [x] `AGENTS.md`、正本文書、local skill、ADRを更新した
- [x] 一時rootで同期と生成内容を検証した
- [x] 必須commandを実行した
- [x] 現在の差分をレビューし、指摘を反映した

## 判断記録

| 日付       | 判断                                                | 理由                                                                              |
| ---------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| 2026-08-01 | `.codex/config.toml`だけを同期時に生成する          | Codexのproject scoped MCPを維持するため                                           |
| 2026-08-01 | Codex TOMLは`codex` flavorと`toml-inline`で生成する | Nix上の単一定義をCodexの設定形式へ変換するため                                    |
| 2026-08-01 | custom agents、hooks、Rules、専用testを残さない     | 現在利用していないclient固有harnessを廃止するため                                 |
| 2026-08-01 | `.agents/local-skills/`を引き続き編集元にする       | 生成先への同期・削除と編集元を衝突させないため                                    |
| 2026-08-01 | `.codex/config.toml`だけをGitの無視対象にする       | 廃止したproject設定の再追加をGitで検出するため                                    |
| 2026-08-01 | client設定directoryのsymlinkを同期前に拒否する      | repository外への意図しない生成を防ぐため                                          |
| 2026-08-01 | 同期smokeを永続的なflake checkへ追加しない          | 専用harness testを廃止し、一時root acceptanceで検証する承認済み境界を維持するため |

## 必須検証

```sh
bun install --frozen-lockfile
nix flake check
bun run check
```

追加確認:

- 一時rootへ`sync-agent-config`を2回実行し、生成結果が同じ
- Codex TOMLとVS Code/Cursor JSONが同じ3 MCP、固定version、Grafanaの`--disable-write`を持つ
- `.codex/`に`config.toml`以外のagents、hooks、Rulesがない
- 実worktreeで`codex mcp list`がChrome、Next、Grafanaを表示する
- commit後に`git ls-files .codex`が空で、rootの生成`.codex/config.toml`だけがGitに無視される

## 検証証跡

| commandまたは確認                                           | 結果 | 実行証跡                                                                                 |
| ----------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                             | 成功 | 1,768 installsを確認し、依存関係とlockfileに変更なし                                     |
| `nix flake check`                                           | 成功 | `agent-skills`、`agent-config-sync`、`devShell`、2 appsを評価し、対象systemのcheckが成功 |
| `bun run check`                                             | 成功 | static、format、型検査、rootおよび全workspaceのunit/integrationが成功                    |
| `bun run format:check`                                      | 成功 | 1,369 filesがOxfmt準拠                                                                   |
| `bun run lint:root`                                         | 成功 | `.codex`を入口に含めないroot Oxlintがwarning、errorなし                                  |
| `bunx vitest run --config vitest.config.ts`                 | 成功 | root test 5 files、25 tests                                                              |
| 一時rootへの`nix run .#sync-agent-config`を2回実行          | 成功 | 2回とも同じ3 client設定とskill bundleを生成し、symlink先とserver集合が一致               |
| Codex TOML、VS Code JSON、Cursor JSONのparseと比較          | 成功 | 全設定がChrome、Next、Grafanaの3 serverを持ち、package version固定を確認                 |
| Grafana wrapperの検査                                       | 成功 | `--disable-write`と固定した`--enabled-tools`を確認                                       |
| 実worktreeの`nix run .#sync-agent-config`と`codex mcp list` | 成功 | `chrome-devtools-mcp`、`next-devtools-mcp`、`grafana`の3件が`enabled`                    |
| P2修正後の一時root同期2回                                   | 成功 | Codex、VS Code、Cursorの厳密なsymlink destinationとserver集合が2回とも一致               |
| malicious `.codex` directory symlink                        | 成功 | 明示errorで同期前に拒否し、外部targetとskill生成先を変更しない                           |
| root `.codex/config.toml`だけの無視設定                     | 成功 | 対象fileは無視し、`.codex/agents/example.toml`は無視しないことを確認                     |
| P2修正後の`nix flake check`                                 | 成功 | `sync-agent-config`を含むapps、packages、devShell、checksが成功                          |
| 現在の差分のレビュー                                        | 成功 | `flake.lock`、Lefthook、application、generated skillに変更なし。P0/P1と必須検査失敗なし  |

commit前のGit indexは削除前のtracked pathを保持するため、通常の`git ls-files .codex`は旧16 pathを
表示します。検証時は次を確認しました。

- `git ls-files --deleted .codex`が16 pathを返し、全pathが削除差分である
- 実worktreeから検証用`.codex/config.toml` symlinkと空directoryを除去すると、16 pathが全て`D`になる
- `git check-ignore --no-index -v .codex/config.toml`が`.gitignore`の`/.codex/config.toml`を返す
- commit後は`git ls-files .codex`が空になり、次回同期で生成した`.codex/config.toml`は未追跡表示されない

## リスクとrollback

同期前はCodexのrepo MCPを利用できません。READMEとローカル開発文書から公開同期commandを案内し、
`nix develop`では自動同期します。rollbackではADR-011を新しいADRで置き換え、必要なclient設定を
再設計します。削除した未使用harnessをそのまま復元しません。

## 完了条件

- tracked `.codex/**`がない
- 3 clientのMCP設定が`mcpServers`から生成される
- skillの編集元と生成先が維持される
- 必須commandが成功する
- P0/P1、必須検査失敗、期限のない例外承認が残っていない
