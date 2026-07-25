---
title: exec plan運用
status: accepted
implementation: not-applicable
last_reviewed: 2026-07-25
---

# exec plan運用

## 状態

- `draft`: scopeと手順をレビュー中
- `active`: 実行中
- `completed`: 完了条件と証跡を満たした
- `abandoned`: 理由を残して中止

## 必須項目

```text
目的
対象外
関連仕様とADR
前提条件
変更対象path
作業単位
進捗
判断記録
検証証跡
リスクとrollback
完了条件
```

## 運用

- 複雑な作業を開始する前にactive planを作る
- 作業中に進捗、判断記録、検証証跡を更新する
- 完了時に`completed/`へ移す
- task固有の判断が永続化すべき場合はADRへ昇格する

## plan一覧

### 実行中

現在、実行中のplanはありません。

### 完了

- [文書、source構成、品質ゲート、テスト、Codex harnessの全面移行](completed/one-shot-harness-migration.md)

## template

[`template.md`](template.md)を使用します。
