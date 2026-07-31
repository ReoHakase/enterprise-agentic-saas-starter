---
title: coding agentの作業手順
status: accepted
implementation: active
last_reviewed: 2026-08-01
applies_to:
  - AGENTS.md
  - flake.nix
  - .agents/local-skills/**
  - .agents/skills/**
  - .codex/config.toml
  - .vscode/mcp.json
  - .cursor/mcp.json
---

# coding agentの作業手順

## 目的

coding agentがリポジトリの正本を読み、依頼された範囲を実装し、決定的な検査と現在の差分の
レビューによって完了を判断する共通手順を定めます。特定clientのproject hook、custom agent、
Rulesには依存しません。

## 情報のrouting

作業開始時は次の順序で読みます。

1. rootの`AGENTS.md`
2. `docs/exec-plans/active/`にある対象plan
3. `.agents/local-skills/`から生成された変更領域のskill
4. skillが指定するarchitecture、テスト戦略、ADR

`AGENTS.md`は全作業に共通する短い契約、docsとADRは仕様と理由、local skillは発火条件、
手順、検証commandを所有します。`.agents/local-skills/`がrepo-local skillの編集元であり、
`.agents/skills/`はNixの生成先です。

## Nixで生成する設定

`flake.nix`はskillの選択とbundle、および次のMCPサーバーを一箇所で定義します。

- `chrome-devtools-mcp@1.5.0`
- `next-devtools-mcp@0.4.0`
- 書き込み機能を無効化したGrafana MCP

`nix develop`または`nix run .#sync-agent-config`は、同じ定義から次を生成します。

| 生成先               | 用途                          |
| -------------------- | ----------------------------- |
| `.agents/skills/`    | repo-localと外部skillのbundle |
| `.codex/config.toml` | Codexのproject scoped MCP     |
| `.vscode/mcp.json`   | VS Codeのworkspace MCP        |
| `.cursor/mcp.json`   | Cursorのworkspace MCP         |

生成物はGitで管理せず、手編集しません。`.codex/`ではrootの`.codex/config.toml`だけを
`.gitignore`へ置き、他のfileを一括して無視しません。`.codex/`に生成するのは`config.toml`だけです。
project hooks、custom agents、Rules、専用harness testは配置しません。同期時は`.codex`、`.cursor`、
`.vscode`がdirectory symlinkなら、repository外へ生成しないよう処理を拒否します。

## 作業と検証

1. 依頼と正本から不変条件、対象範囲、必要なテスト層を決めます。
2. 既存の無関係な変更を保持し、対象pathだけを変更します。
3. 静的検査または狭い単体テストなど、最小の決定的な検査から実行します。
4. active planと変更領域のskillが指定する必須commandまで検証を広げます。
5. 現在の差分をlogic、契約、security、回帰、テスト不足の観点でレビューします。
6. 指摘を修正し、変更後の差分で検査とレビューをやり直します。

ブラウザー、E2E、有料テストは、変更した境界をより低い層で証明できない場合だけ実行します。
必須検査の失敗、P0/P1の指摘、期限のない例外承認を残したまま完了としません。

## 安全境界

production deploy、Git push、PR merge、remote DB変更は、利用者の明示承認なしに実行しません。
生成物、lockfile、migrationは所有command以外で変更せず、機密情報をログ、応答、テレメトリー、
テスト成果物へ出しません。詳細なsource、品質、security境界は`AGENTS.md`と変更領域の正本文書を
優先します。

## 検証

設定変更では少なくとも次を確認します。

```sh
nix run .#sync-agent-config
nix flake check
bun run check
```

同期commandは別の一時rootへ2回実行しても同じ結果になり、3 clientの設定が同じ3 MCPを参照し、
Grafanaが`--disable-write`で起動する必要があります。
