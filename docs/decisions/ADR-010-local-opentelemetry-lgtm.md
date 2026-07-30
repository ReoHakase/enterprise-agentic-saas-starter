---
title: local observabilityをOpenTelemetryと共有LGTMへ統一する
status: accepted
implementation: active
last_reviewed: 2026-07-29
---

# ADR-010 local observabilityをOpenTelemetryと共有LGTMへ統一する

## 背景

Sentry/Spotlightはerror中心で、Next.js、Elysia、Mastraのlog、metric、traceをCodexが一つのquery surfaceから調査できませんでした。local provider errorを過度に削ると原因が分からず、worktreeごとのcontainerはport、volume、lifecycleを複雑にします。

## 決定

OpenTelemetryをsignal contractにし、固定loopback portと固定Portless aliasを持つ一つの`grafana/otel-lgtm` containerを全worktreeで共有します。`dev.worktree.id`と起動ごとの`dev.session.id`で絞り込み、persistent named volumeは通常のdownで維持します。

`bun run dev`はreadinessだけを確認し、daemon、desktop application、containerを起動しません。Sentry/Spotlightとは二重送信せず交換します。localでは調査用contentを保持し、認証materialだけを保存前に除去します。production remote backendは別判断にします。

## 開発用基盤を小さく保つ制約

development-only observabilityへproduct architectureと同じ抽象layerを持ち込みません。

- repository固有の基盤はrootの`compose.observability.yaml`、`otelcol.observability.yaml`と、薄い`scripts/observability.ts`を基本形にする。
- 少数の開発用configに`tooling`、`utils`、`common`のような用途が曖昧なdirectoryを新設しない。
- runtime初期化は既存entrypointへ直接置く。generic exporter/provider/redactorやobservability専用workspace packageは、具体的な複数consumerまたはproduction要件が生じるまで作らない。
- live LogQL/PromQL/TraceQL、MCP接続、`down -> up`後の永続性は手動acceptanceとし、共有Docker singletonへ依存する自動smokeを通常のtestやCIへ追加しない。
- deterministic testはID/env、固定endpoint gate、lifecycle command、collector配線の最小境界だけにする。helperごとのmatrix testを増やさない。
- 認証material除去の中心はcollectorとし、Mastraのnested eventにはframework標準filterを使う。独自の多層防御を作らず、通常のprovider/body/tool contentを過剰に削除しない。

この制約を超える実装は、「将来必要かもしれない」ではなく、現在の失敗事例、再利用先、production要件のいずれかを根拠に別ADRで承認します。

## 結果

- CodexはGrafanaとread-only MCPからLogQL、PromQL、TraceQLを使える。
- fixed portとsingletonによりbrowser、server、Codexが同じbackendを見る。
- `bun run dev`へ管理者権限やDocker/OrbStackの起動権限を渡さない。
- 共有container内の別worktree telemetryはquery可能であり、security isolationではない。
- local volumeは手動削除までdiskを使用する。
- productionはGrafana Cloud等のmanaged backendまたは個別service構成を別途設計する。

## 検討した代替案

- Sentry/Spotlightとの併用: signalとqueryが二重化するため採用しない。
- worktreeごとのLGTM: resourceとlifecycle管理が増えるため採用しない。
- browser telemetryのNext.js relay: 不要なapplication dependencyになるため採用しない。
- exporter wrapper、共通redactor、live smoke harness: local開発用途に対してlayerとtest costが大きいため採用しない。

## 最小の検証

- Portlessのworktree/session env
- lifecycleの停止時fail-fastとup/down argv
- runtimeごとのlocal endpoint gate
- collectorのcanonical exporter、spanmetrics、認証material除去
- repository全体の`bun run check`、`bun run build:cloudflare`、`nix flake check`

実LGTMへの送信、query、MCP、volume再起動は通常の開発導線で手動確認します。
