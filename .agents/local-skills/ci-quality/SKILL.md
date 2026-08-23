---
name: ci-quality
description: enterprise-agentic-saas-starterのGitHub Actions、Oxlint/Oxfmt、Knip、jscpd、Vitest、Browser Mode、Playwright、テストケース設計、テスト整理、Turbo、buildとCI品質ゲートを変更するときに使う。
---

# CI and Quality

## 必読文書

- [品質強制](../../../docs/architecture/quality-enforcement.md)
- [システム境界](../../../docs/architecture/system-boundaries.md)
- [テスト戦略](../../../docs/testing-strategy/README.md)
- [テストケース設計・記述規約](../../../docs/testing-strategy/common/test-case-design.md)
- [coding agentの作業手順](../../../docs/architecture/coding-agent-workflow.md)

テストを追加、変更、統合または削除する場合は、テスト戦略の文書一覧から対象ワークスペースに
対応するアプリまたはパッケージ別文書も必ず読む。複数ワークスペースの配線では各文書とE2E文書を読む。

## Workflow

1. 要求規則をGiven-When-Thenで表し、対象ワークスペース別戦略を使って変更をworkspace graphと
   最低十分なtest layerへ写像する。
   上位層には固有の配線だけを残し、通常CIではfree suiteを全件実行する。
2. Oxlintはroot共通configとworkspace別overrideを合成し、warningをerrorとして扱う。
3. test fileはcomplexity/size/nestingだけを緩め、import/security/tenant境界を緩めない。
4. `check:static`へOxlint、Knip full/strict、jscpdを集約する。
5. rootの公開test scriptを`test`、`test:browser`、`test:e2e`、`test:eval:agent`、
   `test:e2e:full`の5本へ限定する。
6. CIをNix、quality、static-quality、browser、free-e2e、cloudflare-dry-runへ分ける。
7. paid suiteはfork PRへsecretを渡さず、fingerprint change/nightly/release条件で実行する。
8. 既存testを統合または削除する前に規則とriskの対応表を作り、同じ観測境界の置換先を確認する。

## Validation

- `bun run check`
- `bun run test:browser`
- `bun run test:e2e`
- `bun run build:cloudflare`
- config/skill/Nix変更時: `nix flake check`
- paid条件該当時: `bun run test:eval:agent`
- release candidateだけ: `bun run test:e2e:full`

変更中は最小のworkspace checkから始め、active exec planが指定する最終gateを全て実行します。

## 禁止事項

- warning-only期間、baseline、広いignore、期限のないwaiverを作らない。
- package-local Oxlint pluginをroot再帰commandで迂回しない。
- test codeからworkspace boundaryやarchitecture文書のlayer contractを迂回しない。
- Browser/E2E/paid suiteを通常のpre-push hookへ入れない。
- paid secret、provider response、private contextをartifactやlogへ出さない。
- generated `.agents/skills`を直接編集しない。
