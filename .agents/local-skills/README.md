# Repo-local skills

`.agents/local-skills/`はrepo-local skill artifactの編集元です。仕様、設計理由、テスト戦略、
運用上の不変条件の正本は[`docs/`](../../docs/README.md)とADRであり、skill本文へ複製しません。
生成先`.agents/skills/`は直接編集しません。

## Skillに置くもの

各`SKILL.md`は次の情報へ限定します。

1. agentが自然に選べる`name`と`description`
2. 目的と適用範囲
3. 必読文書
4. 順序付きのworkflow
5. 変更に応じたvalidation command
6. その作業で特に危険な禁止事項

設計理由、feature要件、directory全体の仕様、長いtest matrixはdocsまたはADRへ置き、
skillからlinkします。一般知識の再説明や、別skillと同じ規範本文のcopyも置きません。

## 更新順序

1. 永続的な判断はdocsまたはADRを更新する
2. 手順、発火条件、必読文書、検証が変わる場合だけlocal skillを更新する
3. Nixの同期手順で`.agents/skills/`を生成する
4. skill metadata、必読link、生成差分を検証する

READMEだけの変更では生成同期は不要です。`SKILL.md`を変更した場合は`nix flake check`を実行し、
生成物を手作業で合わせません。

## 最小format

```markdown
---
name: example
description: このskillを使う変更を具体的に説明する。
---

# Example

## 必読文書

- `docs/...`

## Workflow

1. ...

## Validation

- `bun run ...`

## 禁止事項

- ...
```

詳しい責務分離と優先順位は
[`docs/architecture/knowledge-management.md`](../../docs/architecture/knowledge-management.md)を参照します。
