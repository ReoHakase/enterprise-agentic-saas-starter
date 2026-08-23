---
title: IssueとPull Requestの執筆契約
status: accepted
implementation: active
last_reviewed: 2026-08-23
applies_to:
  - .github/ISSUE_TEMPLATE/**
  - .github/pull_request_template.md
  - docs/exec-plans/**
---

# IssueとPull Requestの執筆契約

## 目的

Issueを実装前の作業契約、Pull Requestを実装後の差分と検証結果の契約として分離します。
要求振る舞いをBRIEFなGiven-When-Thenで記述し、テスト層とケースの判断を実装前後で追跡できる
状態にします。

IssueとPRの関係、担当、branch、Stack、mergeの一般契約はGitHub上の標準メタデータと
coding agentの`github-issue-pr-ops` skillを正本とします。この文書は、このリポジトリの本文構造と
テスト設計欄を定めます。

## 本文とGitHub metadata

本文には、現在信頼できる要求、差分、判断、検証だけを書きます。次の情報はGitHub metadataを
正本とし、本文へ複製しません。

Issue本文へ書かないもの:

- parent、sub-issue、blocked by、blocking
- Milestone、Assignee、linked branch、PR
- Project fieldとIssue Typeの現在値

PR本文へ書かないもの:

- Project field
- Stack番号、Stack内の順序、各PRのbase
- 現在のreview、check、merge可能状態

認証情報、private URL、provider raw error、個人情報を本文、画像、logへ含めません。

## Issue

Issueは、これから実現する振る舞いと予定する確認を所有します。

### 通常作業のsection

| section          | 所有する内容                                                 |
| ---------------- | ------------------------------------------------------------ |
| 概要             | このIssueが実現する成果                                      |
| 背景             | なぜ必要か                                                   |
| 要求振る舞い     | 実現すべき観測可能な規則をBRIEFなGiven-When-Thenで示したもの |
| テスト設計       | 規則とリスクの所有層、代表ケース、上位配線、非自動化理由     |
| 非スコープ       | このIssueで扱わないこと                                      |
| 変更ファイル     | 変更予定pathまたは`なし`と理由                               |
| 参照ドキュメント | 正本とした仕様、ADR、外部仕様                                |
| 受け入れ条件     | 第三者が完了を判定できる条件                                 |
| 確認手順         | 予定するcommandと手動確認                                    |
| リスクと切り戻し | 失敗時の影響と安全な戻し方                                   |

`要求振る舞い`は実装手順ではありません。通常は1規則につき次の3行で表し、複数規則はシナリオを
分けます。

```text
Given: organizationの管理者として認証されている
When: 新しいmemberを招待する
Then: organizationへ未完了の招待が1件作成される
```

UI変更でも「buttonをclickする」「linkをたどる」を要求振る舞いの主語にしません。利用者が達成する
目的を`When`、利用者または公開境界が観測する結果を`Then`にします。

### 不具合の追加section

不具合では通常作業に次を追加します。

| section    | 所有する内容                              |
| ---------- | ----------------------------------------- |
| 実際の動作 | 現在観測している結果                      |
| 再現手順   | 不具合を再現する最小操作                  |
| 環境       | OS、browser、commitなど再現に必要な条件   |
| 証拠       | 機密情報を除いたlog、画像、動画、発生頻度 |
| 影響範囲   | 利用者、機能、data、安全性への影響        |

従来の「期待動作」は`要求振る舞い`へ統合します。実際の動作、再現手順、証拠を要求振る舞いへ
混ぜません。

### 調査と大項目

spikeでは、確定済みの前提、調査を開始するtrigger、判断または証拠として残す結果を
Given-When-Thenで記述します。製品の振る舞いをまだ確定できない場合は、未確定である理由と
判断基準を書きます。

epicでは、個別シナリオを末端Issueへ置きます。epic固有の要求振る舞いとテスト設計がない欄は、
「個別のsub-issueで定義する」と理由を記載できます。空欄にはしません。

## テスト設計

IssueとPRの`テスト設計`は[テストケース設計・記述規約](../testing-strategy/common/test-case-design.md)へ
従い、次の列で記録します。

| 規則またはリスク | 最低十分な所有層 | 代表シナリオ | 代表上位配線 | 自動化しない理由 |
| ---------------- | ---------------- | ------------ | ------------ | ---------------- |

所有層は[テスト戦略](../testing-strategy/README.md)の`A1`から`E2`までの識別子を使います。
上位配線が不要なら`なし`と理由を書きます。

新しい自動テストを追加しない場合は、少なくとも次を記録します。

- 対象が分岐、変換、認可、テナント、data安全性を所有しないこと
- 型検査、静的検査、既存の代表配線のどれが同じリスクを検出するか
- named regressionまたはランタイム差が存在しないこと

「薄い変更」「ライブラリ依存」「既存テストで十分」だけでは理由になりません。

## Pull Request

PRは、実際に提供する振る舞い、Issueからの差異、現在のheadで得た検証結果を所有します。

| section        | 所有する内容                                                   |
| -------------- | -------------------------------------------------------------- |
| 概要           | 差分の成果                                                     |
| 関連Issue      | 対応Issueの参照と正確に1件の自動close                          |
| 対象範囲       | このPRに含む変更                                               |
| 非スコープ     | このPRで扱わないこと                                           |
| Issueとの差異  | 予定から追加、削除、変更した判断                               |
| 要求振る舞い   | 実際に提供するGiven-When-Then                                  |
| テスト設計     | 最終的な所有層とcase、追加・変更・削除したcoverage、その十分性 |
| 受け入れ条件   | 対応Issueの完了条件を現在の差分が満たすか                      |
| 確認結果       | 現在のheadで実行したcommandまたは操作と結果                    |
| 未実施         | 適用可能だが実施していない確認と理由                           |
| 展開と切り戻し | 導入手順、互換性、戻し方                                       |
| リスク         | 残るリスクと監視方法                                           |
| レビュー案内   | 読む順序、重点箇所、Stackの段固有責務                          |

Issueの要求をそのまま複製せず、実装後の振る舞いと差異へ更新します。command、画像、件数は
`確認結果`へ置き、`要求振る舞い`へ混ぜません。

`確認結果`へ書けるのは、対象のheadで実際に得た結果だけです。仮想例、下書き、未実装のIssue、
または対象のcheckoutを確認できない状況では、もっともらしいcommand、件数、成功結果を推測して
埋めません。次のように、取得できない理由と次に必要な確認を明記します。

```text
確認結果
  - 取得不可: 仮想例のため対象headと実行結果が存在しない

未実施
  - 実装後に対象workspaceの型検査と代表上位配線を確認する
```

Issueで変更path、依存ライブラリ、確認commandが未確定の場合も、実在しそうな値を補いません。
`未確定`と判断に必要な調査を書き、実装開始前に解消します。

対応するbranch作成型Issueを次のいずれかで正確に1件だけ閉じます。

```text
Closes #123
Fixes #123
Resolves #123
```

単なる参照は`#123`と書き、epicまたは別のIssueを同時に閉じません。

## 受け入れ条件と確認結果を分ける

要求振る舞いは「どう振る舞うか」、受け入れ条件は「完了と判定できるか」、確認手順と確認結果は
「何を実行して証明したか」を所有します。

```text
要求振る舞い
  Given: file size上限が20,000,000 bytesである
  When: 20,000,001 bytesのfileをuploadする
  Then: fileを保存せずsize limit errorを返す

受け入れ条件
  - 上限未満、上限ちょうど、上限超過の境界が仕様どおりである

確認結果
  - bun run --cwd apps/api test: 123 tests passed
```

## template

- 通常作業と調査、大項目: `.github/ISSUE_TEMPLATE/work.yml`
- 不具合: `.github/ISSUE_TEMPLATE/bug.yml`
- template chooser: `.github/ISSUE_TEMPLATE/config.yml`
- PR: `.github/pull_request_template.md`

Issue Formsは必要なsectionを入力させますが、BRIEFやテスト層の妥当性を機械判定しません。
内容品質はreviewで確認します。PR templateもsectionを提示する仕組みであり、GitHub Actionsによる
本文強制は今回導入しません。

## review項目

- 要求振る舞いがBRIEFなGiven-When-Thenで書かれている
- Issueは予定、PRは実装後の振る舞いと結果を所有している
- テスト設計が最低十分な所有層と上位固有配線を区別している
- 自動化しない場合に、所有しない規則と代替証拠が書かれている
- 受け入れ条件と確認結果が重複していない
- 確認結果が対象headで実際に取得した証拠だけを示している
- GitHub metadataを本文へ複製していない
- PRが対応するIssueを正確に1件だけ閉じる
- 未実施、リスク、展開と切り戻しが現在の状態を示している

## 参照

- [GitHub Issue Formsの構文](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
- [Issue templateの設定](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository)
- [Pull Request templateの作成](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)
