---
id: ADR-011
title: coding agentのskillとMCP設定をNixで管理する
status: accepted
date: 2026-08-01
owners:
  - repository-maintainers
supersedes:
  - ADR-004
---

# ADR-011 coding agentのskillとMCP設定をNixで管理する

## 背景

Codex固有のcustom agent、hook、Rules、専用testをリポジトリで管理していましたが、日常作業で
安定して利用されず、client固有設定と一般的な開発契約が重複していました。一方、repo-local skill、
外部skill、MCPサーバーはNixの固定入力と同期commandで既に管理しています。

## 決定

skillの選択とbundle、およびChrome DevTools、Next DevTools、読み取り専用GrafanaのMCP定義を
`flake.nix`へ集約します。同じ定義からCodex、VS Code、Cursorの設定を生成します。

Codex向けにはGit管理しない`.codex/config.toml`だけを生成します。project hooks、custom agents、
Rules、専用harness testは廃止します。作業手順は`AGENTS.md`、docs、local skill、通常の実装・検証・
差分レビューで構成します。

このADRは、custom agentによる独立レビューを必須にした[ADR-004](ADR-004-codex-independent-review.md)を
置き換えます。

## 理由

- skillとMCPの選択、version、生成先を一箇所で確認できる
- client固有の未使用機構を一般的な品質契約から除去できる
- 3 clientが同じMCP定義を使い、Grafanaの書き込み禁止を共通化できる
- `AGENTS.md`と品質検査を、利用可能な通常のagent作業へ一致させられる

## 検討した代替案

- tracked `.codex/config.toml`だけを残す: MCP定義が`flake.nix`と重複する
- custom agentsとhooksを任意機能として残す: 現在有効な契約と履歴が曖昧になる
- clientごとにMCP定義を手書きする: versionとsecurity optionが不整合になる
- `.agents/skills/`を編集元にする: Nix同期時の生成と削除が編集元へ衝突する

## 結果

`nix develop`または`nix run .#sync-agent-config`を実行するまでCodexのproject scoped MCP設定は
存在しません。client固有のhookやcustom agentによる強制はなくなり、通常の差分レビューと
リポジトリの決定的な品質検査を完了判断に使います。

## 強制方法

- rootの`.codex/config.toml`、`.agents/skills/`、各clientのMCP生成物をfileまたは生成先単位で
  `.gitignore`へ置く
- `flake.nix#mcpServers`を3 client共通のMCP定義にする
- `.codex`、`.cursor`、`.vscode`がdirectory symlinkの場合は同期を拒否する
- `AGENTS.md`、docs、local skillから廃止したroleとharness契約を除去する
- Oxlint、Knip、Vitestから`.codex`の実行入口を除去する

## 検証

- 一時rootへの同期を2回実行し、生成結果の冪等性を確認する
- CodexのTOML、VS CodeとCursorのJSONが同じ3 MCPを持つことを確認する
- Grafana commandが`--disable-write`を使うことを確認する
- `git ls-files .codex`が空で、rootの生成`.codex/config.toml`だけが無視されることを確認する
- `nix flake check`と`bun run check`を実行する
