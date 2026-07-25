---
id: ADR-007
title: workspace別テスト戦略
status: proposed
date: 2026-07-26
owners:
  - repository-maintainers
supersedes:
  - ADR-003
---

# ADR-007 workspace別テスト戦略

## 背景

全workspaceへ共通の段階番号を当てると、実行環境、所有権、費用が異なるテストの境界が曖昧になります。また、実ブラウザーを使うWeb内の統合テストと、全workspaceを接続するE2Eを同じ分類へ置くと、失敗原因を分離しにくくなります。

## 決定

workspaceごとに次の分類を持ちます。

- API: A1-A5
- Web: W1-W6
- Product Agent: G1-G5
- DB: DB1-DB5
- Auth: AUTH1-AUTH4
- UI: UI1-UI5
- Email: MAIL1-MAIL4
- TypeScript config: TS1-TS2
- GitHub OAuth emulator: GE1-GE3
- E2E: E1-E2

Rootの公開test scriptは`test`、`test:browser`、`test:e2e`、`test:eval:agent`、`test:e2e:full`の5本だけにします。E1は実Web、API、Agent、DB/Authと台本付きモデルを使う決定的E2E、E2は実モデルを含むrelease用の最小full-stack canaryです。

PR CIはTurborepoのaffected判定と明示的な変更path対応表を併用します。base SHAを解決できない場合またはselectorが失敗した場合は、全無料suiteへ縮退します。`main`では常に全無料suiteを実行します。

VRTは方針だけをacceptedとし、実装を延期します。

## 理由

各workspaceが自身の公開契約と実行環境を所有し、最も小さく決定的な層へ回帰を置けます。ブラウザー、実Next.js、全workspace、実モデルという費用境界を明示すると、日常検証から有料testを分離しながら、release時の最終配線も維持できます。

## 検討した代替案

- 全workspaceへ共通の番号を割り当てる: 同じ番号でも必要なruntimeと所有権が異なる
- Playwright testをすべてE2Eとする: Web内で閉じるW6と全workspace配線の原因分離ができない
- 有料full-stack名を互換aliasで残す: 公開commandが増え、費用境界が曖昧になる
- PRを常にfull実行する: 安全だが変更影響が小さい場合も継続的にCI時間を消費する
- repository専用architecture checkerを追加する: package exports、lint、Knip、build、package testと責務が重複する

## 結果

workspaceごとのtest名は増えますが、利用者がrootで覚えるcommandは5本に限定されます。PR selectorの保守が必要になるため、fixture testとfull fallbackを必須にします。E2はsecretと明示承認があるrelease workflowだけが実行します。

## 強制方法

- package exports、TypeScript、Oxlint、Knip、build、package所有test
- root scriptとTurborepo taskの公開契約
- Playwright deterministic/full configの分離
- CI selectorのfixture testとfail-openではないfull fallback
- fork codeへpaid secretを渡さないrelease workflow

## 検証

- workspace別lint、typecheck、test
- `bun run check`
- `bun run test:browser`
- `bun run test:e2e`
- StorybookとCloudflare build
- `nix flake check`
- command、配置、import、CSF Next、文書linkの静的検査
