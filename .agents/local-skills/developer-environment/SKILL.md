---
name: developer-environment
description: enterprise-agentic-saas-starterのNix、direnv、dotenvx、Bun、Wrangler、Turso、Mailpit、LGTMとlocal development commandを変更または診断するときに使う。
---

# Developer Environment

## 必読文書

- [ローカル開発](../../../docs/local-development.md)
- [システム境界](../../../docs/architecture/system-boundaries.md)
- [Observability](../../../docs/observability.md)
- deploy関連時: [Cloudflareデプロイと運用](../../../docs/deployment-operations.md)

## Workflow

1. host、Nix shell、Bun、Workerのどのruntimeで失敗しているかを切り分ける。
2. secretを表示せず、必要なenvironment variable名とbindingだけを確認する。
3. repository commandとpackage scriptを正本にしてlocal serviceを起動する。
   Portless公開URLは`bun run portless-topology resolve <logical-name>`で確認し、
   serviceごとにraw `portless get`を実行しない。
   ObservabilityはDocker/Portlessを利用者が起動した後に`bun run observability:up`を使う。
   `bun run dev`からdaemon、desktop app、container lifecycleを起動しない。
4. generated typeやlockfileは所有commandで再生成する。
5. environment変更後はfresh shell相当とNix evaluationを検証する。

## Validation

- `bun install --frozen-lockfile`
- `nix flake check`
- `bun run check`
- Cloudflare binding変更時: `bun run build:cloudflare`

## 禁止事項

- secret値、token、email本文をterminal outputへ出さない。
- remote DBやproduction Workerをlocal検証から変更しない。
- generated fileを手編集しない。
- local convenienceのためにsecurity checkやmigration lifecycleを迂回しない。
