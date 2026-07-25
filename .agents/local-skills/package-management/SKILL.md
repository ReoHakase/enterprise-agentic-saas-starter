---
name: package-management
description: enterprise-agentic-saas-starterのBun catalog、dependency、workspace、package exports、TypeScript config、monorepo境界を変更するときに使う。
---

# Package Management

## 必読文書

- [システム境界](../../../docs/architecture/system-boundaries.md)
- [TypeScript config設計](../../../docs/architecture/packages/typescript-config.md)
- [品質強制](../../../docs/architecture/quality-enforcement.md)
- package追加時: [設計仕様の目次](../../../docs/architecture/README.md)

## Workflow

1. runtime、owner、dependency direction、public entrypointを決める。
2. 外部dependencyをroot catalogへexact versionで追加し、workspaceでは`catalog:`を使う。
3. runtime別TypeScript configを選び、不要なambient typeを入れない。
4. package exportとKnip workspace isolationを更新する。
5. lockfileをBunで再生成し、affected workspaceから全体checkへ広げる。

## Validation

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun run check:static`
- `bun run check`
- Nix入力変更時: `nix flake check`

## 禁止事項

- package間をrelative pathや非公開entrypointでdeep importしない。
- workspaceごとにcatalog dependencyのversionを重複記載しない。
- `packages/shared`や`packages/validators`をSaaS固有の便利箱として追加しない。
- lockfileやgenerated typeを手編集しない。
