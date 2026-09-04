---
id: PLAN-2026-033
title: Given-When-Thenテスト設計規約
status: active
created: 2026-08-23
owners:
  - Codex
linked_specs:
  - docs/testing-strategy/common/test-case-design.md
  - docs/architecture/issue-pr-authoring.md
  - docs/architecture/coding-agent-workflow.md
linked_adrs:
  - docs/decisions/ADR-016-natural-language-given-when-then.md
---

# Given-When-Thenテスト設計規約

## 目的

全テスト層のケース設計を自然言語のGiven-When-ThenとBRIEFへ統一し、最低十分な所有層と
ライブラリ境界を明確にする。IssueとPRから要求振る舞い、テスト設計、実行結果を追跡できるようにし、
既存テスト整理の判断と経験的評価の証跡を残す。

## 対象外

- 既存テストコードとstoryの書き換え
- 既存英語test titleの一括翻訳
- Gherkin、Cucumber、step definition、テストコード生成の導入
- PR本文を検査する新しいGitHub Actions
- 製品API、database schema、dependencyの変更
- Browser Mode、E2E、有料テストの実行

## 前提条件

- テスト層は`docs/testing-strategy/README.md`のA/W/G/DB/AUTH/UI/MAIL/TS/EMU/E分類を維持する。
- `.agents/local-skills/`を編集元とし、`.agents/skills/`と`.github/skills/`を手編集しない。
- GitHub metadataをIssueとPR本文へ複製しない。
- 未追跡の`.playwright-cli/`と無関係な差分を保持する。
- 経験的評価は前回の規約案を知らない新しいagentで行い、自己再読を代用しない。

## 変更対象path

- `AGENTS.md`
- `docs/testing-strategy/**`
- `docs/architecture/{README,coding-agent-workflow,issue-pr-authoring}.md`
- `docs/decisions/{README,ADR-016-natural-language-given-when-then}.md`
- `docs/exec-plans/{README,active/PLAN-2026-033-given-when-then-test-design}.md`
- `.agents/local-skills/{ci-quality,frontend,e2e-test}/SKILL.md`
- `.github/ISSUE_TEMPLATE/**`
- `.github/pull_request_template.md`

## 作業単位

1. 既存テストから強み、独立規則の同居、層間重複、ライブラリ境界を監査する。
2. Given-When-Then、BRIEF、テスト対応表、命名、comment、段階移行を正本文書へ定義する。
3. IssueとPRの`要求振る舞い`、`テスト設計`、`確認手順`、`確認結果`の責務を分離する。
4. ADR、`AGENTS.md`、local skill、Issue Forms、PR templateを正本へ接続する。
5. 固定場面とchecklistを新しいagentへ渡し、曖昧点を1原因群ずつ修正する。
6. 文書、YAML、skill同期、Nix、root品質検査を実行し、現在の差分をreviewする。
7. 第1段階の完了後、既存テスト整理を別PRへ分けて進める。

## 進捗

- [x] current `origin/main`へfast-forwardし、ADR番号とWeb test pathを再確認した
- [x] 既存のVitest、Storybook、Playwrightを読み、維持する規則と整理候補を分類した
- [x] 経験的評価の場面とchecklistを変更前に固定した
- [x] テストケース設計、Issue/PR契約、ADRを完成させた
- [x] `AGENTS.md`、local skill、Issue Forms、PR templateを完成させた
- [x] 経験的評価を収束させた
- [x] 静的検査、Nix同期検査、root品質検査を完了した
- [x] 現在の差分にP0/P1または必須検査失敗がないことを確認した

## 既存テストの評価

### 維持する規則

- `apps/api/src/modules/files/service.test.ts`のfile size上限未満、上限ちょうど、上限超過は、
  1つの境界規則を具体的な値で示している。
- 同fileの削除transactionでfile、quota、cleanup、auditを同時に確認するケースは、1つのatomicな
  rollback契約として維持する。
- `packages/auth/src/index.test.ts`のinvalid tokenでcookieとsessionを変更しないケースは、認証上の
  safety ruleとGiven-When-Thenが明確である。
- `issues-workspace.test.tsx`のplaceholder rowをread-onlyにするケースと同一scopeのrefetchだけ
  selectionを維持するケースは、複数assertionが1つの不変条件へ集中している。

### 後続PRで整理する候補

- file previewのRange、conditional request、security headerを独立したprotocol規則へ分ける。
- image width allowlistとcache failure時のfail-openを別規則へ分ける。
- invitation resend、expired renewal、owner role拒否、email回数、safe logを独立規則へ分ける。
- auth helper内に隠れたcookie domain、path、HttpOnly、SameSite、Secureのassertionを、意図が見える
  `Then`へ移す。
- W2とW3で重複する検索debounce、pagination、selection件数、callback mappingは、W2を所有層とし、
  W3へfocus、keyboard、layoutなど実ブラウザー固有の規則だけを残す。
- `Empty`、`Pending`、`ActiveFilterSummaries`などの静的storyは状態文書として維持し、render
  assertionだけの`play`を除く。
- W6のhistory testに同居するsticky header geometry、下書き破棄後のhistory復元、直アクセス時の
  代替navigationを独立シナリオへ分ける。

ファイル長とassertion数は欠陥判定に使わない。各候補は、整理前に規則とリスクの対応表を作り、
security、テナント、トランザクション、protocolの観測境界を維持してから変更する。

## 経験的評価

### 固定場面

#### A. Vitestとライブラリ境界

`apps/api/src/modules/files/service.test.ts`と`packages/auth/src/index.test.ts`を読み、コードを変更せず、
規則の所有層、維持する安全性、分割候補、Given-When-Then名の例を提案する。

1. `[critical]` リポジトリが所有する設定、adapter、安全性とライブラリ既定動作を区別する
2. `[critical]` security、テナント、トランザクション、protocolの必要な観測を維持する
3. atomic outcomeの複数assertionをファイル長だけで分割しない
4. テスト名とcomment例を日本語常体・文末句読点なしのGiven-When-Thenへ揃える
5. 各規則へ最低十分な所有層と必要な代表上位配線を割り当てる

#### B. Storybook、Browser Mode、Playwright

Issues workspaceの`issues-workspace.test.tsx`、`issues-workspace-controls.test.tsx`、
`issues-workspace.stories.tsx`、Issues dashboardの`client.test.tsx`、`client.stories.tsx`、W6の
`route-contracts.spec.ts`を読み、コードを変更せず、層間重複とブラウザー固有の観測を分類する。
`client.test.tsx`を名前だけでW4とみなさず、SUT、接続する実物、観測結果から再分類する。

1. `[critical]` W2、W3、W4、W6を接続範囲と観測結果で分類する
2. `[critical]` focus、keyboard、layout、URL、historyなど実ランタイム固有の証明を維持する
3. 静的named storyと意味のある`play`を区別する
4. BRIEFなGiven-When-Thenと日本語test proseの例を示す
5. 同じ失敗原因の再証明と上位層を進める最小観測を区別する

#### C. IssueとPR

分岐、入出力変換、認可、テナント、データ安全性、名前付き回帰、ランタイム差を所有しない薄い
ライブラリadapterを変更する想定で、Issue本文とPR本文を作る。型検査、静的検査、既存の代表配線が
同じ接続リスクを検出できるものとする。対象head、Issue番号、path、command、実行結果は与えない。

1. `[critical]` IssueとPRの両方へ役割が異なる`要求振る舞い`と`テスト設計`を書く
2. `[critical]` 自動テストなしを無条件の例外にせず、所有しない規則と代替証拠を示す
3. 受け入れ条件、予定する確認、実行結果を分離する
4. GitHub metadataを本文へ複製せず、PRで対応Issueを正確に1件だけ閉じる
5. 要求振る舞いをBRIEFなGiven-When-Thenにし、実装手順やcommandを混ぜない

### hold-out場面

既存database migrationへテナント制約を追加する想定で、DB層とAPI層のdefense-in-depthを単純な
重複として削らず、Given-When-Then、所有層、更新経路、既存data、切り戻しを設計する。

1. `[critical]` DB制約とAPIのテナントpredicateを強制地点別のリスクとして維持する
2. `[critical]` 新規DB、既存dataの更新、migration失敗とrollbackの安全性を扱う
3. BRIEFなGiven-When-Thenを日本語常体・文末句読点なしで示す
4. DB所有層と代表API配線を分け、同じassertionを複製しない
5. Gherkin tooling、code generation、既存テストの一括書き換えを導入しない

### 評価規則

- `[critical]`が1件でも一部達成または未達なら全体を失敗とする。
- 達成=1、一部達成=0.5、未達=0として正確性を算出する。
- `tool_uses`と`duration_ms`を取得できない場合は取得不可とし、推測しない。
- agentの曖昧点を`Issue / Cause / General Fix Rule`で記録する。
- 変更前に、どのchecklistの判定文を満たす修正かを記録する。
- 一度に1つの原因群だけを修正し、前回を知らない新しいagentで再評価する。
- 新しい曖昧点0件が2回連続し、正確性改善が3 point以内、取得できる場合は道具使用数±10%、
  duration±15%になった後、hold-out場面を実行する。

### 固定評価promptの契約

- checklistは、評価者が作成したinventory、整理案、例、Issue本文、PR本文を評価する。既存テストの
  現在の適合度は採点せず、別の`対象コードの欠陥`へ記録する。
- inventoryはリポジトリが所有する規則またはリスクを1行とし、対象の既存シナリオ群をいずれかの
  行へ割り当てる。
- `Trace`はchecklist項目ごとに、成果物を直接導けるinstructionがある場合を`OK`、instructionが
  存在しない場合を`Missing`、競合または複数解釈がある場合を`Unclear`とする。
- `対象コードの欠陥`は指定したテストファイルの名前、構造、観測、層、ライブラリ境界に限定し、
  本番ロジックの欠陥へ範囲を広げない。
- `Retries`は同じ判断または成果物をやり直した回数とする。出力の切り詰め、読み取り範囲の追加、
  shell globの補正は含めない。
- 未提供のIssue番号は正確に1件のplaceholderと公開前の置換条件を示せば達成とする。実在しそうな
  番号、head、path、command、成功結果は補わない。
- 経験的評価では、このactive planを期待結果を含む評価データとして意図的に除外する。これは
  blank-slate評価だけの明示的な例外であり、通常作業でactive planを読む規則との競合ではない。
- `維持`はリスクの検出可能性を最低十分な所有層と代表上位配線へ残すことを指し、同じassertionを
  複数層へ残すことを指さない。
- 明示的に未提供または調査範囲外としたhead、path、command、Issue番号、既存coverage、named regressionの
  有無はinstructionの不明点に含めない。推測せず、必要なら対象コードの所見または未提供入力へ分ける。
- `Discretionary fill-ins`は評価者が判断して補った選択だけを記録し、明示的な未提供値の一覧にしない。

### 結果

| iteration | 場面 | 成否 | 正確性 | 道具使用数 | duration | 再試行 | 弱いphase                   |
| --------- | ---- | ---- | ------ | ---------- | -------- | ------ | --------------------------- |
| 1         | A    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 1         | B    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 1         | C    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | 確認結果の証拠境界          |
| 2         | A    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | 対象別戦略へのrouting       |
| 2         | B    | 失敗 | 90%    | 取得不可   | 取得不可 | 0      | Web固有戦略との所有境界競合 |
| 2         | C    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 3         | A    | 失敗 | 50%    | 取得不可   | 取得不可 | 2      | 評価単位の解釈              |
| 3         | B    | 成功 | 90%    | 取得不可   | 取得不可 | 0      | W3静的状態とW4非同期状態    |
| 3         | C    | 成功 | 100%   | 取得不可   | 取得不可 | 2      | 固定場面の前提              |
| 4         | A    | 失敗 | 60%    | 取得不可   | 取得不可 | 0      | checklistの評価対象         |
| 4         | B    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 4         | C    | 成功 | 90%    | 取得不可   | 取得不可 | 0      | TraceとIssue番号placeholder |
| 5         | A    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 5         | B    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | 対象ファイルの列挙          |
| 5         | C    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 6         | A    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | 除外条件と範囲外入力        |
| 6         | B    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | 文書pathと維持の意味        |
| 6         | C    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | 未提供入力の分類            |
| 7         | A    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 7         | B    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 7         | C    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 8         | A    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 8         | B    | 成功 | 90%    | 取得不可   | 取得不可 | 0      | W3 geometryの配置           |
| 8         | C    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 9         | A    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 9         | B    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 9         | C    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 10        | A    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 10        | B    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| 10        | C    | 成功 | 100%   | 取得不可   | 取得不可 | 0      | なし                        |
| hold-out  | DB   | 成功 | 100%   | 23         | 取得不可 | 0      | なし                        |

初回は3件とも全checklistを満たし、`[critical]`の脱落はなかった。Aで見つかった永続化と
アクセス順の観測不足、Bで見つかったW4不足と層間重複は、既存テスト監査の成果であり、規約を
適用する際の不明点ではない。Cでは仮想場面にもかかわらず、具体的なW6 path、command、成功結果を
裁量で補った。この1件を新しい不明点として扱う。

#### iteration 1の不明点

Issue: 仮想PRでも現在のheadで成功したように読める確認結果を補える

Cause: PRが現在のheadの結果を所有するとは定義したが、対象headまたは実行証拠が存在しない場合の
記入方法を定義していなかった

General Fix Rule: 実際に取得した結果だけを確認結果へ書き、仮想、未実装、未確認の場合は推測せず、
取得不可または未実施の理由と次に必要な確認を記録する

iteration 2では、場面とchecklistを変えず、上記の証拠境界だけを修正した正本とtemplateを評価する。

#### iteration 2の不明点

Issue: W2とW3のkeyboard、focus、accessible description、callback mappingの所有が文書間で競合する

Cause: 共通規約は実ブラウザーのkeyboard、focus、layoutをW3へ割り当てたが、
`docs/testing-strategy/apps/web.md`の既存DataTable項目は同じ観測をW2とW3の両方へ要求していた

General Fix Rule: 操作ではなく`Then`で分け、W2はpublic valueとsemantic state、W3は実ブラウザーの
keyboard、focus、layoutだけを所有する

Issue: テスト整理時に対象ワークスペース別戦略が必読か判別できない

Cause: `ci-quality`は共通READMEを必読にするが、READMEの一覧が索引か、対象別文書へのroutingかを
明記していない

General Fix Rule: テスト追加または整理では、対象ワークスペースのテスト戦略文書を必読として明記する

iteration 3では、critical項目を一部達成にしたWeb固有の所有境界競合だけを修正する。対象別戦略への
routingは次の独立したinstruction themeとして残す。

#### iteration 3の不明点

Issue: W2の静的なfocus可能性と、W3の操作後focus結果の境界が判別しにくい

Cause: W2の許可対象を`focusable state`とのみ記載し、`tabIndex`などの静的契約と`activeElement`の
動的結果を区別していなかった

General Fix Rule: W2はrole、disabled、`tabIndex`など静的なfocus可能性、W3は実ブラウザーでの
focus移動とfocus returnを所有する

Issue: 静的W3 storyの`play`禁止を、非同期W4のempty、error状態にも適用するか判別しにくい

Cause: `args`だけで成立するW3状態と、実QueryClient、`controller`、MSWのrequest完了後に到達する
W4状態を区別していなかった

General Fix Rule: 静的W3状態は`play`なしで文書化し、W4はrequest前後の遷移、cache、古いresponseの
抑止を`Then`にする操作テストで自動検査する

Issue: 評価のTrace、inventory、対象コードの欠陥の単位が判別しにくい

Cause: 固定場面は成果物を要求したが、評価用語の単位と、checklistが成果物を評価することを
明記していなかった

General Fix Rule: 評価promptでchecklistの対象、Traceの3値、inventoryの行単位、欠陥報告範囲を定義する

Issue: 薄い`adapter`場面で自動テストを省略するための全前提が与えられていない

Cause: 分岐と安全性を所有しないことだけを固定し、変換、named regression、ランタイム差、既存代表配線は
未指定だった

General Fix Rule: 未指定なら省略を断定せず成立条件を示す。評価場面で結論を固定する場合は全前提を入力する

iteration 4では、Web層境界の同じ原因群として、W2の静的focus可能性とW3の動的focus結果、
W3の静的状態とW4の非同期状態を修正する。評価promptと対象別戦略routingは後続の独立テーマとする。

#### iteration 4の不明点

Web場面は全checklistが達成となり、instruction上の新しい不明点は0件だった。Vitest場面では成果物が
所有境界を正しく分類しているにもかかわらず、既存英語テストと複合テストの現在状態をchecklistへ
採点した。Issue/PR場面では、実番号がないplaceholderを公開前条件付きで正しく扱ったが一部達成とした。

Issue: checklist、Trace、Retries、Issue番号placeholderの評価単位が評価者ごとに変わる

Cause: 場面と判定文は固定したが、採点対象、3値の条件、再試行の数え方、未提供値の達成条件を
定義していなかった

General Fix Rule: checklistは作成した成果物だけを採点し、既存コードの欠陥を分離する。Trace、Retries、
inventory、欠陥範囲、placeholderの判定条件を固定する

iteration 5では、リポジトリのinstructionを変更せず、固定評価promptの測定契約だけを修正する。

#### iteration 5の不明点

3場面とも全checklistを満たし、`[critical]`の脱落はなかった。VitestとIssue/PR場面の新しい不明点は
0件だった。

Issue: W4 connected story/testの対象に`client.test.tsx`を含めるか判別しにくい

Cause: 対象ファイルを列挙せず、配置名からW4を推測できる書き方だった。実際の`client.test.tsx`は
Query hookとWorkspaceを`mock`しており、接続実物による分類ではW2寄りである

General Fix Rule: 対象pathを列挙し、配置や接尾辞ではなくSUT、接続実物、観測結果で再分類するよう
固定評価promptへ明記する

iteration 6では、リポジトリのinstructionを変更せず、同じ測定契約の対象列挙だけを修正する。

#### iteration 6の不明点

3場面とも全checklistを満たし、`[critical]`の脱落はなかった。報告された不明点は、評価用に意図的に
除外したactive plan、明示的な未提供値、調査範囲外のcoverage、短縮した文書path、riskを維持するという
語の解釈へ集中した。

Issue: 評価用の除外条件、未提供入力、調査範囲外をinstruction不明点として報告できる

Cause: blank-slate評価の例外、`維持`の対象、instruction不明点と未提供入力の境界を明示していなかった

General Fix Rule: active planの除外は評価専用の明示的例外とする。riskの検出可能性を維持し、同じ
assertionは複製しない。意図的な未提供値と範囲外情報はinstruction不明点へ数えない

iteration 7では、リポジトリのinstructionを変更せず、同じ測定契約の分類条件だけを修正する。

#### iteration 7の結果

3場面とも正確性100%、`[critical]`の脱落なし、instruction上の新しい不明点0件、再試行0件となった。
測定契約は収束した。iteration 2から保留していた対象ワークスペース別テスト戦略へのroutingを
独立テーマとして正本、`AGENTS.md`、`ci-quality`へ反映したため、最終instructionの連続0件判定は
iteration 8から数え直す。

#### iteration 8の不明点

VitestとIssue/PR場面は正確性100%、instruction上の新しい不明点0件、再試行0件だった。

Issue: 操作のないW3 geometryをstoryの`play`または`*.browser.test.tsx`のどちらへ置くか一意に決められない

Cause: 共通規約はstory fixtureを再利用するbrowser testへ割り当てたが、Web戦略は
`*.browser.test.tsx`をW4 feature integrationへ限定し、同時にnamed storyでgeometryを固定すると記載した

General Fix Rule: 接尾辞で層を固定せず、named storyは状態fixture、意味のある操作は`play`、操作のない
geometryとnative renderingはfixtureを再利用するW3 browser test、実QueryClient、controller、MSWを
接続する結果はW4とする

iteration 9では、上記のW3 geometry配置だけを修正した正本を評価する。

#### iteration 9の結果

3場面とも正確性100%、`[critical]`の脱落なし、instruction上の新しい不明点0件、再試行0件となった。
W3の状態fixture、意味のある`play`、W3 browser test、W4 feature integrationを接続実物と観測結果から
一意に分類できた。最終instructionの連続0件判定は1回目である。

#### iteration 10の結果

3場面とも正確性100%、`[critical]`の脱落なし、instruction上の新しい不明点0件、再試行0件となった。
iteration 9から正確性差0 pointで、取得可能な道具使用数とdurationはなかった。最終instructionで
2回連続0件となったため、固定3場面の経験的評価は収束した。

#### hold-outの結果

DB migrationとテナント境界の未使用場面は正確性100%、`[critical]`の脱落なし、instruction上の
新しい不明点0件、再試行0件となった。道具使用数は23、durationは取得不可だった。DB2の複合外部キー、
DB3のfresh・upgrade・不正legacy data・途中失敗、A3の`id + organization_id` predicate、A4の代表404配線を
異なる強制地点として設計し、自動補正によるテナント捏造を避けた。収束時の100%から低下0 pointで、
許容する15 point未満を満たした。

### 失敗パターン台帳

| pattern名                  | 代表Issue                                                                | General Fix Rule                                                         | 検出iteration |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------- |
| 未取得の検証結果の具体化   | 仮想PRへ実在しそうなcommandと成功結果を補う                              | 対象headで得た結果だけを書き、未取得は理由と次の確認を示す               | 1             |
| Web所有境界の二重定義      | W2とW3が同じkeyboard、focus、callback結果を所有する                      | W2はpublic valueとsemantic state、W3は実ブラウザー固有結果だけを所有する | 2             |
| 対象別戦略へのrouting不足  | 共通READMEから対象別戦略を読む義務が判別できない                         | テスト追加と整理では対象ワークスペースの戦略を必読にする                 | 2             |
| Web所有境界の残留曖昧さ    | W2のfocusable stateとW3のfocus結果、W3静的状態とW4非同期状態が混同できる | 静的契約と実ブラウザー結果、静的storyと非同期遷移を分ける                | 3             |
| 評価単位の未定義           | Trace、inventory、欠陥範囲を評価者ごとに補う                             | 固定評価promptで各単位を定義する                                         | 3             |
| 薄いglue場面の前提不足     | 自動テスト省略に必要な条件の一部が未指定                                 | 未指定なら条件付き判断とし、固定結論なら全前提を与える                   | 3             |
| 評価測定の不一致           | 既存テストの現在状態を成果物checklistへ採点しplaceholderを未達扱いする   | 成果物、Trace、Retries、placeholderの判定条件を固定する                  | 4             |
| 評価対象pathの未定義       | `client.test.tsx`を名前だけでW4扱いできる                                | 対象pathを列挙しSUT、接続実物、観測結果で再分類させる                    | 5             |
| 評価除外と未提供値の誤分類 | active plan除外、未提供値、範囲外coverageをinstruction不明点へ含める     | 評価専用例外と未提供入力を明示し、risk維持をassertion複製と区別する      | 6             |
| W3 geometry配置の二重定義  | 操作のないgeometryをstoryとW4限定browser testの両方へ割り当てる          | named storyをfixtureとし、W3 browser testとW4を接続実物で分類する        | 8             |

## 判断記録

| 日付       | 判断                                                      | 理由                                                     |
| ---------- | --------------------------------------------------------- | -------------------------------------------------------- |
| 2026-08-23 | 構造をGiven-When-Thenへ統一し、別の三段階表現を併記しない | 要求とコードで同じ振る舞いの語彙を使うため               |
| 2026-08-23 | Gherkin toolingとcode generationを導入しない              | native runnerとの二重保守を増やさないため                |
| 2026-08-23 | BRIEFの5行目安を自然言語だけへ適用する                    | atomicな複数結果やブラウザー検査を行数で誤分割しないため |
| 2026-08-23 | 既存テストコードは第1段階で変更しない                     | 規約導入とcoverage変更を同じ差分へ混ぜないため           |
| 2026-08-23 | ADR番号を計画時の015から016へ変更した                     | `origin/main`にADR-015が追加済みだったため               |
| 2026-08-23 | PR本文のGitHub Actionsによる強制は導入しない              | templateとreviewの効果を先に確認するため                 |

## 検証証跡

| command                                                  | 結果 | 証跡                                                                              |
| -------------------------------------------------------- | ---- | --------------------------------------------------------------------------------- |
| Issue Form YAML parseと必須field検査                     | 成功 | `work.yml`と`bug.yml`の全textareaがrequiredで、`要求振る舞い`と`テスト設計`を含む |
| PR template必須headingとclosing行検査                    | 成功 | 必須9 sectionと`Closes #`が正確に1行                                              |
| 変更文書のlocal link検査                                 | 成功 | 欠落link 0件                                                                      |
| 一時`AGENT_CONFIG_ROOT`への`nix run .#sync-agent-config` | 成功 | 生成した`ci-quality`、`frontend`、`e2e-test`から正本linkを確認                    |
| `nix flake check`                                        | 成功 | `aarch64-darwin`のapp、package、agent skill、devShell検査が成功                   |
| `bun install --frozen-lockfile`                          | 成功 | fast-forward後のworkspace依存linkを復元し、lockfile変更なし                       |
| `bun run check`                                          | 成功 | lint、Knip、jscpd、format、typecheck、unit/integrationが成功                      |
| `git diff --check`                                       | 成功 | whitespace errorなし                                                              |

保持対象の未追跡`.playwright-cli/`はroot formatterの対象だが、既存YAML 56件が未整形だった。内容を
変更せず一時directoryへ移し、終了時に必ず元へ戻すtrap付きで`bun run check`を実行した。
Browser Mode、E2E、有料testはruntime変更がなく、この計画の対象外であるため実行していない。

## リスクとrollback

規約を儀礼的に適用すると、空の`Given`、実装手順を列挙する`When`、assertionを1件ずつ分割した
短いだけのテストが増える。空のsectionを作らず、atomic outcomeとBRIEFを同時に確認する。

ライブラリ境界を広く解釈するとsecurity regressionを削除する危険がある。削除前の対応表と
enforcement pointごとのリスクを必須にする。rollbackはIssue Formsとskill routingを外し、ADR-016を
supersedeして既存のテスト戦略だけへ戻す。製品codeとテストcodeは第1段階で変更しないため、製品動作の
rollbackは不要である。

## 完了条件

- 正本文書、ADR、Issue Forms、PR template、`AGENTS.md`、local skillが同じ契約を参照する
- 規約本文がskillへ重複していない
- 3場面の経験的評価が収束し、hold-out場面で15 point以上悪化しない
- Issue Form YAMLとskill frontmatterが有効である
- `bun run check`、`nix flake check`、一時rootへのskill同期、`git diff --check`が成功する
- 第1段階の差分に既存テストコード、依存関係、lockfile変更がない
- P0/P1または必須検査失敗が残っていない
