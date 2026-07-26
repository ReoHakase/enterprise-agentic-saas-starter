---
title: 知識管理と正本
status: accepted
implementation: active
last_reviewed: 2026-07-25
---

# 知識管理と正本

## 目次

- [目的](#目的)
- [現在の問題](#現在の問題)
- [決定](#決定)
- [優先順位](#優先順位)
- [情報の配置](#情報の配置)
- [metadata](#metadata)
- [仕様の有効化](#仕様の有効化)
- [docsとskills](#docsとskills)
- [製品Agentとcoding-agent](#製品agentとcoding-agent)
- [ADR](#adr)
- [exec plan](#exec-plan)
- [言語と命名](#言語と命名)
- [更新と廃止](#更新と廃止)
- [理由と代償](#理由と代償)
- [受入条件](#受入条件)

## 目的

人間とcoding agentが同じ正本を読み、先に読んだfileによって設計判断が変わらない状態を作ります。

## 現在の問題

既存repositoryでは、設計規則、画面仕様、テスト戦略、運用知識が`docs/`とlocal skillsへ重複しています。local skillは必要な時にagentへ読み込まれますが、人間が一覧しにくく、長期的な仕様の正本には向きません。

重複があると次が起きます。

- docsだけ更新され、skillが古い
- skillだけ更新され、人間が変更を発見できない
- 同じ規則の説明と例外が少しずつ異なる
- agentが発火したskillだけを正本と誤認する

## 決定

```text
docs/
  仕様、設計理由、テスト戦略、運用上の不変条件

.agents/local-skills/
  発火条件、必読文書、作業順序、検証command

AGENTS.md
  全作業に共通する短い契約と索引

docs/decisions/
  長期間残る設計判断

docs/exec-plans/
  複雑な変更の実行状態と証跡

code/schema/test/CI
  実行可能な契約
```

local skillへ規範本文を複製しません。skillは関連docsを指し、作業時の手順だけを保持します。

## 優先順位

意図と現在実行される挙動は分けて扱います。

1. `main`上の`status: accepted`文書とADRが、意図した仕様と設計理由の正本
2. code、schema、test、CI、lintが、その仕様を現在実行・強制する契約
3. accepted文書を参照するlocal skillが、作業時の手順
4. `AGENTS.md`が、全作業に共通する短い契約と索引
5. `status: proposed`文書が、未承認の次期案

実行可能な契約は現状を正確に示しますが、accepted文書と矛盾するcodeを自動的に新仕様とは
みなしません。矛盾を見つけたら作業を止め、実装を仕様へ合わせるか、文書とADRを変更して承認を
受けます。testを通すために文書を弱めることも、文書だけを変えて未実装を`active`とすることも
禁止します。

## 情報の配置

| 情報                                      | 置き場所                  | 理由                           |
| ----------------------------------------- | ------------------------- | ------------------------------ |
| 要求、invariant、設計理由、代替案         | architecture文書またはADR | 人間とagentが一覧できる        |
| test layer、runner、cost、実行条件        | `docs/testing-strategy/`  | test実装とcost判断を分離しない |
| 一回の大規模変更の順序、進捗、証跡        | active exec plan          | 永続仕様と途中状態を混ぜない   |
| CLI、障害対応、rollback checklist         | runbook                   | 実行者が順番に追える           |
| 発火条件、必読文書、workflow、検証command | local skill               | 必要な作業時だけ短くloadできる |
| 型、schema、test、CI gate                 | code                      | 規則を機械的に強制できる       |

例えば「AgentからDBを直接importしない」はarchitecture文書とADRで理由を説明し、
`package.json#exports`、Oxlint、Knip、実testで強制します。skillにはその本文をcopyせず、
必読文書と検証commandだけを書きます。

## metadata

### 規範文書

```yaml
---
title: 文書名
status: proposed
implementation: planned
last_reviewed: 2026-07-24
---
```

`status`:

| 値           | 意味                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| `proposed`   | 提案中であり、既存のaccepted仕様を上書きしない                          |
| `accepted`   | repository maintainerが最終内容を承認した規範。main上にあるときだけ有効 |
| `superseded` | 別文書へ置換済み。置換先linkが必須                                      |

`implementation`:

| 値               | 意味                             |
| ---------------- | -------------------------------- |
| `active`         | code、CI、運用へ反映済み         |
| `planned`        | 承認と実装を同じ変更で行う予定   |
| `deferred`       | 方針は保持するが現在は実施しない |
| `not-applicable` | indexなど実装状態を持たない      |

VRTは`status`ではなく`implementation: deferred`で表します。

### ADR

ADRは`proposed | accepted | superseded`を使います。`accepted` ADRの意味を変える場合は本文を上書きせず、新しいADRでsupersedeします。

### exec plan

exec planは`draft | active | completed | abandoned`を使います。仕様の承認状態と作業の進捗を混同しません。

## 仕様の有効化

複数の正本を同時に変える大規模PRでは、次を一つの切替として実施します。

1. 新docs、ADR、exec planを`proposed`または`draft`で追加
2. source、品質ゲート、テスト、Codex設定を最終形へ変更
3. 旧docsとskillsの重複規則を削除
4. repository maintainerが最終diffをレビュー
5. 規範文書とADRを`accepted`へ変更し、exec planを`completed`へ変更して`completed/`へ移す
6. 上のstatus変更を含む最終headでも必須checkとreviewを確認する
7. 同じPRをmainへmergeし、その時点でaccepted仕様とcompleted履歴を同時に有効化する

切替途中のcommitを別PRとしてmergeしません。未mergeのbranchでは、現在のmainにある規則を通常feature changeの正本とします。

## docsとskills

local skillは次だけを持ちます。

```text
frontmatter
目的
必読文書
作業手順
検証
禁止事項
```

skillへ長い設計理由、feature固有要件、テストmatrixを置きません。新しい知見が永続的な規則ならdocsまたはADRへ追加し、skillはlinkだけを更新します。

`.agents/local-skills/`はskill artifactの編集元という意味での正本です。architectureやproduct仕様の
正本という意味ではありません。生成先`.agents/skills/`はNixで同期し、直接編集しません。詳細は
[local skills README](../../.agents/local-skills/README.md)を参照します。

## 製品Agentとcoding agent

`docs/agent/`は製品Agentの機能、security、operation、release acceptanceを扱います。
Codex custom agent、reviewer、sole-writer、hookは
[Codex harness](codex-harness.md)で扱います。

`docs/agent/`を`docs/product-agent/`へ改名する案も検討しましたが、既存linkと運用参照の変更量に
対して情報の責務はindexで十分区別できるため、現pathを維持します。将来、
製品Agent以外のAgent仕様が増えて衝突する場合だけ独立ADRで改名します。

## ADR

ADRが必要な条件:

- 複数workspaceへ影響する
- public contract、security、tenant、migration、CI、harnessを変える
- 有力な代替案を却下する
- 将来の変更を制約する
- 一般知識だけでは逆の判断をしやすい

ADRに必須のsection:

```text
Context
Decision
理由
Alternatives
結果
強制方法
検証
```

task固有の小さな判断はexec planの判断記録へ置き、再利用される時点でADRへ昇格します。

## exec plan

exec planが必要な条件:

- 複数workspaceを横断する
- migration、auth、tenant、public API、CI、harnessを変更する
- 失敗時のrollbackが必要
- 変更が一つの通常PRで把握しにくい

active planは進捗、判断記録、検証証跡を更新します。完了後も履歴として残します。

## 言語と命名

説明文は日本語を基本にします。コード識別子、パス、設定値、製品や標準の正式名称は原文を維持し、
一般的な説明へ必要性のない英単語を混ぜません。詳細な判断順序と推奨表記は
[日本語技術文書の用語・表記基準](../jargon.md)を正本にします。

コード上の概念を英語で維持する場合はインラインコードにし、初出で日本語の意味を説明します。
例えば`port`、`adapter`、`composition root`はコード構成と一対一で対応する場合に維持できます。
一方、一般説明では「ドメイン層」「アプリケーションサービス」「単体テスト」のように日本語または
定着したカタカナ表記を使います。

コード上の責務名と依存方向は[命名とlayer](naming-and-layers.md)で定義し、日本語文章上の表記は
用語・表記基準で定義します。用語の役割と文章上の表記を混同しません。

## 更新と廃止

- accepted文書の規範本文を変更するPRはowner reviewを必要とする
- acceptedは承認状態を表し、mainへmergeされるまで既存mainの仕様を上書きしない
- superseded文書は置換先を明記する
- generated `.agents/skills`を直接編集しない

## 理由と代償

### 理由

- 人間とagentが同じ正本を読める
- skillの発火有無で仕様が変わらない
- ADRで理由と代替案が残る
- exec planで長い変更の現在状態を共有できる

### 代償

- docs、ADR、planの更新作業が増える
- 小さな変更まで形式化すると負担になる

そのため、ADRとexec planは条件を満たす変更だけに限定します。

## 受入条件

- 同じ規範本文がdocsとskillへ重複していない
- proposedとacceptedの優先順位が明確
- VRTが`implementation: deferred`で表現される
- ADRとexec planの状態値が仕様文書と分離されている
- 全skillが必読文書と検証を持つ
