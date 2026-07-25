---
title: テストカバレッジ収集仕様
status: proposed
implementation: planned
last_reviewed: 2026-07-26
applies_to:
  - apps/**
  - packages/**
  - vitest.config.ts
  - turbo.json
  - .github/workflows/**
---

# テストカバレッジ収集仕様

## 目的

カバレッジは、保守対象のコードが決定的テストから実行されていない場所を発見する補助指標です。品質、要件充足、安全性を単独で証明する指標ではありません。

## 収集対象

### 必須カバレッジ

`bun run test`で実行する次の層から収集します。

- A1からA5
- W1、W2、W5
- G1からG4
- DB1からDB5
- AUTH1からAUTH4のうちVitestで実行する部分
- UI1、UI2
- MAIL1からMAIL4のうちVitestで実行する部分
- GE1からGE3のうちVitestで実行する部分

### 別レポートにするブラウザーカバレッジ

- W3、W4
- UI3、UI4
- Storybook Vitest addon
- Vitest Browser Mode

ブラウザーカバレッジは診断用の別artifactとして保存します。初期導入ではNode側カバレッジと単純加算して一つの必須thresholdにしません。

理由:

- 同じsourceがNodeとbrowserで重複実行される
- instrumentationとsource mapの差で値の意味が変わる
- story数を増やすだけで見かけのcoverageが上がり得る
- Web componentの品質はrole、interaction、a11yのassertionで判断すべきである

### 収集しないもの

- W6のPlaywright app integration
- E1決定的E2E
- G5実モデル評価
- E2完全E2E
- VRT

上位テストのcoverageを下位テスト不足の代用にしません。

## provider

Vitestの`v8` providerを標準にします。

理由:

- NodeとChromiumで利用できる
- pre-instrumentationを必要としない
- AST remappingによりTypeScript sourceへ対応できる
- Istanbulより通常は実行負荷が小さい

Cloudflare Workersの実workerd runtime自体のcoverageは必須指標にしません。Worker codeはNode、Elysia、ephemeral HTTP、E2Eの振る舞いで検証します。

## includeとexclude

`coverage.include`には、実行時にimportされたfileだけでなく、保守対象のsource globを明示します。これにより完全に未実行のfileもレポートへ現れます。

例:

```ts
coverage: {
  provider: "v8",
  include: [
    "src/**/*.{ts,tsx}",
  ],
  exclude: [
    "**/*.d.ts",
    "**/*.stories.tsx",
    "**/*.test.{ts,tsx}",
    "**/*.spec.ts",
    "**/test-support/**",
    "**/development/**",
    "**/generated/**",
    "**/cloudflare-env.d.ts",
    "**/index.ts",
  ],
}
```

`index.ts`を無条件に除外するのではなく、公開re-exportだけのfileに限定します。runtime logicを持つentrypointは対象に残します。

## workspace別の重点

| 対象                      | 重視する指標                     | 理由                                            |
| ------------------------- | -------------------------------- | ----------------------------------------------- |
| Web model、schema         | branch、function                 | state transitionとvalidation分岐が重要          |
| API domain、service       | branch、function                 | 認可、失敗、transaction順序が重要               |
| API repository            | branchより振る舞い               | SQLとconstraintは行coverageだけでは評価できない |
| Agent core、tool executor | branch、function                 | security boundary、budget、stop conditionが重要 |
| DB migration              | カバレッジよりscenario inventory | SQL、legacy data、constraintの意味が重要        |
| UI component              | coverageよりinteraction、a11y    | render行の実行だけでは利用者の操作を証明しない  |
| Email template            | branch、render result            | conditional sectionとfallbackが重要             |
| Auth                      | branch、protocol scenario        | cookie、CSRF、redirect、session lifecycleが重要 |

## threshold方針

固定の一律thresholdを先に決めません。保守対象sourceを明示した全件実測値と既存閾値から、次の順で決定します。

1. 保守対象sourceを`coverage.include`へ明示する
2. 全テストを実行してline、branch、function、statementの実測値を取得する
3. 各実測値を整数で切り下げ、現在の対応閾値との高い方を新しい全体thresholdにする
4. Web model、API domain、Agent coreなど純粋で重要なglobへ個別thresholdを設定する
5. 新規fileまたは大規模変更fileで未検査branchが増えないことをreviewする
6. threshold変更は専用差分としてreviewする

自動的なthreshold更新を通常CIで有効にしません。改善が偶然の実行経路によるものか、意味のあるテスト追加によるものかを確認できないためです。

## coverage例外

coverage ignore commentは最後の手段です。使用時は次を記載します。

- 到達不能またはprovider固有である理由
- 代わりに保証するテスト層
- 対象行を最小化する
- 将来削除できる条件

大きなfileまたはbranch全体をignoreしません。

## `--changed`との関係

ローカルの`--changed`実行ではcoverageを無効化します。

```sh
bun --cwd apps/web run test -- \
  --changed=origin/main \
  --coverage.enabled=false
```

変更関連テストだけのcoverageは、全source coverageと異なる意味になるため、required CIのthresholdへ使いません。

## reportとartifact

必須report:

- text summary
- JSON summary
- LCOV
- HTML

配置例:

```text
coverage/
  apps-web/
  apps-api/
  apps-agent/
  packages-db/
  packages-auth/
  packages-ui/
  packages-email/
  browser/
```

CIではworkspace別artifactを保存し、root summaryで失敗workspaceを明示します。外部coverage SaaSは必須にせず、導入する場合もrepository内thresholdを正本とします。

## 失敗時の判断

coverage低下だけで機械的に無意味なテストを追加しません。次を順に確認します。

1. 保守対象sourceが正しくincludeされているか
2. generated、adapter glue、unreachable guardではないか
3. 未実行branchが重要な失敗または安全境界か
4. より低いテスト層で検査できるか
5. code layerの責務が過大で分割すべきではないか
