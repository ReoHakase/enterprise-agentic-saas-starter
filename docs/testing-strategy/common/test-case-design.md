---
title: Given-When-Thenによるテストケース設計・記述規約
status: accepted
implementation: active
last_reviewed: 2026-08-23
applies_to:
  - apps/**/*.test.*
  - apps/**/*.spec.*
  - apps/**/*.stories.*
  - packages/**/*.test.*
  - packages/**/*.stories.*
  - .github/**/*.test.*
---

# Given-When-Thenによるテストケース設計・記述規約

## 目的

テストを実装手順ではなく、リポジトリが保証する振る舞いの文書として読める形へ揃えます。
テストケース数や網羅率を目的にせず、変更理由が異なる規則を分け、同じ失敗原因を複数層で
過剰に検査しないことで保守費用を抑えます。

この文書は、Vitest、Storybook、Browser Mode、Playwrightを含む全テスト層へ適用します。
テスト層と実行費用は[テスト戦略](../README.md)、ブラウザー固有の同期とlocatorは
[Browser test記述規約](browser-test-writing.md)を正本とします。

## Given-When-Then

各シナリオを次の3要素で設計します。

| 要素    | 問い                             | 所有する内容                       |
| ------- | -------------------------------- | ---------------------------------- |
| `Given` | どのような前提か                 | 振る舞いの前に必要な状態とデータ   |
| `When`  | 何が起きると結果が生じるか       | 観測する結果を引き起こす振る舞い   |
| `Then`  | 利用者や外部境界から何が見えるか | リポジトリが保証する観測可能な結果 |

前提が存在しない初期表示などでは`Given`を省略します。空のsectionやcommentを作りません。
複数の画面操作が必要な場合も、個々のclickではなく利用者が達成しようとする1つの振る舞いを
`When`として表します。

Given-When-Thenは自然言語で要求とコードを対応させる構造として使います。Gherkinのfeature file、
step definition、Cucumber、テストコード生成は導入しません。

## BRIEF

シナリオは次のBRIEF原則を同時に満たします。

| 原則                | このリポジトリでの判断                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| Business language   | domain用語で利用者または外部境界の意図を表し、UI操作や内部関数名を主語にしない |
| Real data           | 境界や前提を明らかにする具体的なsynthetic dataを使い、本番データへ依存しない   |
| Intention revealing | テスト名と各stepが何を達成するかを表す                                         |
| Essential           | 規則の理解に不要な時刻、識別子、表示詳細、呼び出し回数を含めない               |
| Focused             | 原則として1つの変更理由を持つ規則だけを扱う                                    |
| Brief               | 自然言語のシナリオは通常5行以内にする                                          |

5行の目安はIssue、PR、テスト名、構造commentで表す自然言語に適用します。
テスト関数のコード行数、同じ境界表の入力数、後処理、ブラウザーのgeometry計算には適用しません。

具体的データは、`20_000_000` bytesの上限、`2026-03-29`のDST境界、管理者と一般memberの
権限差など、規則の理解を増やす場合に使います。値が規則と無関係なら、意味を持たせず短い固定値を
使います。実在する顧客ID、メールアドレス、private URL、認証情報は使いません。

## テストコードの構造

非自明なテストは`Given`、`When`、`Then`の順序が見えるように書きます。

```tsx
test("非チェックのCheckboxを選ぶとチェック状態になる", async () => {
  // Given: 非チェックのCheckboxを表示する
  render(<Checkbox />)

  // When: 利用者がCheckboxを選ぶ
  await user.click(screen.getByRole("checkbox"))

  // Then: Checkboxがチェック状態になる
  expect(screen.getByRole("checkbox")).toBeChecked()
})
```

初期状態の表示自体が結果を生む振る舞いなら、`When`から始めます。

```tsx
test("Checkboxを初期表示すると非チェック状態になる", () => {
  // When: Checkboxを初期表示する
  render(<Checkbox />)

  // Then: Checkboxが非チェック状態になる
  expect(screen.getByRole("checkbox")).not.toBeChecked()
})
```

関数呼び出しと期待値だけで意図が明白な短いテストには構造commentを強制しません。ただし、
テスト名とコードを自然言語のGiven-When-Thenへ直せない場合は、対象規則または分割を見直します。

### Given

- シナリオ固有の状態とデータをcall siteへ残します
- 全ケース共通のランタイム起動と後処理だけをhookへ置きます
- 前提確認がなければ偽陽性になり得る場合だけ、必要な状態を観測します
- 別のテストが前提を検査していることへ依存しません
- 実装詳細のobject graphを大量に組み立てる場合は、本番factoryまたは小さいtest builderを優先します

### When

- 原則として結果を引き起こす1つのtriggerだけを置きます
- ルート表示、関数呼び出し、HTTP request、ユーザー操作など、結果を生む振る舞いを明示します
- 複数のtechnical actionが1つの利用者意図を実現する場合は、1つの意味単位としてまとめられます
- 独立して変更できるtriggerが複数ある場合はシナリオを分けます

### Then

- 利用者、公開API、永続化先、監査記録などの観測可能な結果を検査します
- 同じatomic outcomeに属する複数結果は一緒に検査できます
- テスト名が永続化、順序、protocolを主張する場合は、その境界を直接観測します
- private method、class名、内部call順を公開契約の代わりにしません

## 一つの規則を決める

一つの規則は、原則として一つのtrigger、guard、atomic outcomeで定義します。

同じトランザクションのcommitまたはrollbackに属するprimary row、quota、audit、cleanupは、
一つのatomic outcomeです。assertion数が多いという理由だけで分割しません。一方、Range response、
conditional request、security headerのように独立して変更できるprotocol契約は別シナリオにします。

次のいずれかが異なる場合は分割を検討します。

- 変更理由または担当境界
- triggerまたはguard
- 失敗時に守るリスク
- 公開契約または導入・切り戻しの単位
- 正本となるテスト層

## テスト対応表

実装前に、要求規則とリスクを次の順序で整理します。

1. リポジトリが所有する振る舞いか確認する
2. 失敗時に守るリスクを決める
3. 最低十分な所有層を1つ決める
4. 正常、境界、拒否、失敗のうち理解を増やす代表シナリオを選ぶ
5. 上位ランタイム固有の代表配線が必要か決める

IssueとPRでは次の列を使います。

| 規則またはリスク | 最低十分な所有層 | 代表シナリオ | 代表上位配線 | 自動化しない理由 |
| ---------------- | ---------------- | ------------ | ------------ | ---------------- |

ケースを全入力の直積から機械的に作りません。意味のある同値分割と境界値を選び、複数軸を持つ
table-driven testは位置だけでなく意味が分かるnamed object rowを使います。単一のscalar境界表は、
表示名を加えて理解が増える場合だけnamed rowにします。

既存テストを削除する前に規則とリスクの対応表を作り、置換先が同じ観測境界を証明するまで削除しません。

## テスト層と重複

所有層はファイル名やランナーではなく、SUT、接続する実物、観測結果でシナリオごとに決めます。
同じコンポーネントを使っていても、DOM mappingを観測するW2、実ブラウザーのfocusを観測するW3、
Next.jsのroute lifecycleを観測するW6は異なる失敗原因を持ちます。

上位層には、次のようにその層だけが失敗させられる代表配線を残します。

- HTTP serialization、middleware、cookie、Origin
- SQL constraintと実トランザクション
- provider mappingとWorker binding
- focus、keyboard、layout、URL、history、RSC
- ワークスペース間の最終配線

上位層を進めるための最小locatorやloading観測は重複に含めません。同じ失敗原因を再証明する
assertionだけを重複とみなし、上位テスト名には固有の配線リスクを表します。

security、テナント、トランザクション、protocolのdefense-in-depthは、同じ値を検査していても
enforcement pointが異なる場合があります。各guardが防ぐリスクを記録してから統合を判断します。

## ライブラリ境界

外部ライブラリの入力空間や既定動作を再検査しません。次のいずれかをリポジトリが所有するときだけ
互換性テストを置きます。

- option、plugin、hookの選択と設定
- adapterによる入力、出力、errorの変換
- authorization、テナント、data安全性の追加
- 利用者へ約束する公開契約
- named security regression
- ブラウザー、Worker、DB、HTTPなどランタイム固有差

許可する場合は、依存理由をテスト名または隣接commentへ表し、consumerの最低十分な統合層に
代表シナリオを置きます。未変更methodの存在、ライブラリ内部call、未採用default、同じ設定の全組合せは
検査しません。

thin glueとして自動テストを追加しないのは、分岐、変換、認可、テナント、data安全性を所有せず、
型検査または既存の代表配線で同じリスクを検出できる場合だけです。IssueとPRへ理由と代替証拠を
記録します。

## ランナー別の適用

### Vitest

- 純粋規則、境界表、実libSQL、HTTP compositionなど、対象の所有層をテスト名から読み取れるようにします
- `mock`は観測対象となる外部境界へ限定し、ライブラリ内部call順を固定しません
- hookには共通ランタイムとcleanupだけを置き、シナリオ固有入力は`Given`へ残します
- snapshotは、構造全体が公開契約であり意図した差分を人が判断できる場合だけ使います

### StorybookとBrowser Mode

- `args`または`props`だけで成立するloading、empty、error、pendingなどの静的W3状態はnamed storyで
  文書化し、render assertionだけの`play`を置きません
- 実QueryClient、`controller`、MSWのrequest完了後に初めて到達する状態はW4です。request前後の遷移、
  cache、古いresponseの抑止を`Then`にする`play`またはBrowser Modeテストで自動検査できます
- `play`はkeyboard、focus、menu、form、retryなど意味のある操作を持つ場合だけ使います
- 操作のないgeometryとnative renderingは、named storyの`args`、decorator、fixtureを再利用する
  `*.browser.test.tsx`が所有します
- `step`は利用者意図を日本語常体で表し、周囲の`When`または`Then`へ対応させます

### Playwright

- W6は実Next.jsのroute、URL、history、document scroll、RSC lifecycleだけを所有します
- E1とE2はワークスペース間の最終配線だけを所有し、下位層の全分岐を再検査しません
- loginやnavigationなどのtechnical actionを列挙せず、利用者が達成するjourneyを`When`にします
- locator、非同期同期、geometry helperの例外は[Browser test記述規約](browser-test-writing.md)に従います

## 名前とcomment

次を日本語常体で書き、文末へ`。`、`.`、`!`、`?`を付けません。

- `describe`、`it`、`test`のtitle
- `it.each`、`test.each`のcase label
- Storybookの`step`
- 人が書く説明comment
- lint directiveの理由部分

`Given`、`When`、`Then`は予約した構造labelとして英語表記を維持し、後続説明を日本語にします。
story export、fixture identifier、route、directive、rule ID、protocol field、diagnostic error、
実際のUI labelは翻訳しません。

名前の各動詞と結果には直接の観測を対応させます。option値だけを見て「保存する」と表現したり、
status codeだけを見て「DBへアクセスする前に拒否する」と表現したりしません。

## 移行

新規または変更するシナリオと隣接commentからこの規約を適用します。既存英語titleの一括翻訳だけを
目的とする大規模差分は作りません。既存テストの整理は、所有規則の変更または専用の整理PRで、
テスト対応表を作ってから行います。

ファイル長は調査の入口にできますが、欠陥の判定には使いません。変更理由が異なる規則の同居、
重複した失敗原因、見えない前提、過剰なライブラリ検査を根拠に整理します。

## レビュー項目

- シナリオをGiven-When-Thenで説明できる
- BRIEFで一つの規則に集中している
- リポジトリが所有しないライブラリ動作を再検査していない
- 最低十分な所有層と上位固有配線が区別されている
- security、テナント、トランザクション、protocolの必要なguardを維持している
- test名とcommentが日本語常体で文末句読点を持たない
- テスト名の主張へ直接的な観測が対応している
- 新しいcaseが読者の理解または検出可能なリスクを増やしている

## 参照

- [Keep your scenarios BRIEF](https://cucumber.io/blog/bdd/keep-your-scenarios-brief/)
- [UIのテストへGiven-When-Thenを適用する考察](https://zenn.dev/m10maeda/articles/gwt-might-feel-more-natural-than-3a-for-ui-testing)
- [Vitest Test API](https://vitest.dev/api/test)
- [Vitest mocking](https://vitest.dev/guide/mocking.html)
- [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles/)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Storybook UI tests](https://storybook.js.org/docs/writing-tests)
