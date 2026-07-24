---
title: 知識管理と正本
status: proposed
implementation: planned
last_reviewed: 2026-07-24
---

# 知識管理と正本

## 目次

- [目的](#目的)
- [現在の問題](#現在の問題)
- [決定](#決定)
- [優先順位](#優先順位)
- [metadata](#metadata)
- [仕様の有効化](#仕様の有効化)
- [docsとskills](#docsとskills)
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

通常の参照順序は次です。

1. CI、schema、test、lintが機械的に強制する契約
2. `main`上の`status: accepted`文書とADR
3. accepted文書を参照するlocal skill
4. `AGENTS.md`
5. `status: proposed`文書

codeがaccepted文書と矛盾した場合、実装を自動的に仕様とみなしません。実装を直すか、文書とADRを変更して承認を受けます。

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

| 値 | 意味 |
| --- | --- |
| `proposed` | 提案中であり、既存のaccepted仕様を上書きしない |
| `accepted` | repository maintainerが承認し、mainへmerge済みの規範 |
| `superseded` | 別文書へ置換済み。置換先linkが必須 |

`implementation`:

| 値 | 意味 |
| --- | --- |
| `active` | code、CI、運用へ反映済み |
| `planned` | 承認と実装を同じ変更で行う予定 |
| `deferred` | 方針は保持するが現在は実施しない |
| `not-applicable` | indexなど実装状態を持たない |

VRTは`status`ではなく`implementation: deferred`で表します。

### ADR

ADRは`proposed | accepted | superseded`を使います。`accepted` ADRの意味を変える場合は本文を上書きせず、新しいADRでsupersedeします。

### exec plan

exec planは`draft | active | completed | abandoned`を使います。仕様の承認状態と作業の進捗を混同しません。

## 仕様の有効化

全面移行PRでは次を一つの切替として実施します。

1. 新docs、ADR、exec planを`proposed`または`draft`で追加
2. source、品質ゲート、テスト、Codex設定を最終形へ変更
3. 旧docsとskillsの重複規則を削除
4. metadata、link、skill validationを実行
5. repository maintainerが最終diffをレビュー
6. 規範文書とADRを`accepted`へ変更
7. exec planを`completed`へ変更し`completed/`へ移動
8. 同じPRをmainへmerge

移行途中のcommitを別PRとしてmergeしません。未mergeのbranchでは、現在のmainにある規則を通常feature changeの正本とします。

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

説明文は日本語を基本にします。ただしcode上の概念と識別子は英語へ統一します。

英語を維持する例:

- `domain`, `application`, `service`
- `port`, `adapter`, `repository`, `transport`
- `controller`, `view`, `composition root`
- `mock`, `fake`, `fixture`, `story`
- `light`, `dark`, `dialog`
- `unit`, `integration`, `E2E`, `VRT`
- product、library、command、file、scriptの正式名

同じ概念を文書では日本語、codeでは英語という形に分裂させないためです。

## 更新と廃止

- accepted文書の規範本文を変更するPRはowner reviewを必要とする
- superseded文書は置換先を明記する
- dead linkと孤立文書をCIで失敗させる
- skillの必読文書が存在しない場合はCIを失敗させる
- generated `.agents/skills`を直接編集しない

## 理由と代償

### 理由

- 人間とagentが同じ正本を読める
- skillの発火有無で仕様が変わらない
- ADRで理由と代替案が残る
- exec planで長い変更の現在状態を共有できる

### 代償

- docs、ADR、planの更新作業が増える
- metadata checkとlink checkが必要になる
- 小さな変更まで形式化すると負担になる

そのため、ADRとexec planは条件を満たす変更だけに限定します。

## 受入条件

- 同じ規範本文がdocsとskillへ重複していない
- proposedとacceptedの優先順位が明確
- VRTが`implementation: deferred`で表現される
- ADRとexec planの状態値が仕様文書と分離されている
- 全skillが必読文書と検証を持つ
- docs linkとmetadata checkがCIで実行される
