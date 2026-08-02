---
name: ci-quality
description: enterprise-agentic-saas-starterのGitHub Actions、Oxlint/Oxfmt、Knip、jscpd、Vitest、Browser Mode、Playwright、Turbo、buildとCI品質ゲートを変更するときに使う。
---

# CI and Quality

## 必読文書

- [品質強制](../../../docs/architecture/quality-enforcement.md)
- [システム境界](../../../docs/architecture/system-boundaries.md)
- [テスト戦略](../../../docs/testing-strategy/README.md)
- [coding agentの作業手順](../../../docs/architecture/coding-agent-workflow.md)

## Workflow

1. 変更をworkspace graphとtest layerへ写像し、通常CIではfree suiteを全件実行する。
2. Oxlintはroot共通configとworkspace別overrideを合成し、warningをerrorとして扱う。
3. test fileはcomplexity/size/nestingだけを緩め、import/security/tenant境界を緩めない。
4. `check:static`へOxlint、Knip full/strict、jscpdを集約する。
5. rootの公開test scriptを`test`、`test:browser`、`test:e2e`、`test:eval:agent`、
   `test:e2e:full`の5本へ限定する。
6. CIをNix、quality、static-quality、browser、free-e2e、cloudflare-dry-runへ分ける。
7. paid suiteはfork PRへsecretを渡さず、fingerprint change/nightly/release条件で実行する。

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
