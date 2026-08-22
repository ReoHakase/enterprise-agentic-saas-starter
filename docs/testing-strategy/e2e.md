---
title: E2Eテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-08-02
applies_to:
  - apps/web/e2e/**
  - apps/web/playwright*.config.ts
  - apps/api/**
  - apps/agent/**
  - packages/auth/**
  - packages/db/**
related:
  - ./apps/web.md
  - ./apps/agent.md
  - ./common/ci-execution.md
---

# E2Eテスト戦略

## 目的

E2Eでは、Web、API、Agent、DB、認証を利用者の入口から永続化まで接続し、workspace間の最終配線を確認します。

E2Eを二層だけにします。

- `E1 決定的E2Eテスト`
- `E2 完全E2Eテスト`

## E2Eテスト層

| 名前                     | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                                                                           | 実物として使うもの                                                                                                                                   | 差し替えるもの                                                                                  | 対象コード/ファイル                                                                                                      | Test Runner | 実行速度 | CI時間課金以外の費用                  | 量   |
| ------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------- | -------- | ------------------------------------- | ---- |
| **決定的E2Eテスト (E1)** | E2E                 | <ul><li>実browserからWeb、API、Agent、DB、認証までのcritical journeyを一巡させる</li><li>Agent stream、tool execution、approval、DB persistence、reloadを確認する</li><li>Service Binding、capability、session refresh、usage projection、asset lifecycleを確認する</li><li>LLMと外部providerを台本付きまたはfakeへ差し替え、同じ入力から同じ結果になることを確認する</li><li>認可行列や全failureを網羅せず、workspace間配線だけを確認する</li></ul> | 実Chromium、実Next.js、実API Worker、実Agent Worker、実Service Binding、一時libSQL、Better Auth、必要に応じEmulateのGitHub service、local R2/Mailpit | LLMはscripted model、Web searchと外部providerはfake、実利用者データは使わない                   | `apps/web/e2e/deterministic/**`、`playwright.config.ts`の`deterministic` profile、E2E専用Worker config、test fixture API | Playwright  | 遅い     | なし                                  | 少数 |
| **完全E2Eテスト (E2)**   | E2E                 | <ul><li>本番に限りなく近いWeb、API、Agent、DB/Auth、実LLMを接続して最終疎通を確認する</li><li>自然文から実モデルのtool selection、source表示、approval付きwrite、永続化、reloadを確認する</li><li>公開Web検索、非公開Issue読取、承認付きIssue作成の固定3 journeyを確認する</li><li>確率的失敗、provider rate limit、model driftを観測し、G5と下位層へ回帰caseを追加する</li><li>リリース可否に必要な最小journeyだけを実行する</li></ul>              | 実browser、production相当Web/API/Agent、実LLM、一時またはrelease専用DB/Auth、production相当adapter                                                   | 実利用者データとproduction write targetは禁止。安全なsandboxがない外部serviceは明示的に制御する | `apps/web/e2e/full/**`、`playwright.config.ts`の`full` profile、release test environment                                 | Playwright  | 最も遅い | LLM料金と外部provider料金が発生し得る | 最小 |

## E1: 決定的E2Eテスト

### 構成

```text
real browser
  → real Next.js
  → real public API Worker
  → real private Agent Worker
  → real Service Binding
  → temporary real libSQL
  → real Better Auth
  → scripted model
  → fake external providers
```

### 保証するもの

- WebからAgent streamまでのprotocol
- connection ticket、capability、grant
- private Service Binding
- tool execution
- approval accept/reject
- DB persistence
- browser reload後のcanonical projection
- usage eventとUI projection
- session refresh
- temporary assetの作成とcleanup
- local emailまたはOAuth emulatorとの代表連携

### 保証しないもの

- 全permission matrix
- 全tool
- 全error code
- 全browserとviewport
- LLMの自然言語品質
- provider本番挙動
- DB constraintの網羅

これらはA1からA5、W1からW6、G1からG5、package固有testで保証します。

### 推奨journey

```text
read journey
  thread作成
  → scripted read tool
  → stream
  → source表示
  → reload

write journey
  approval required
  → acceptまたはreject
  → tool execution
  → DB state
  → reload

asset journey
  upload
  → scripted image/file tool
  → current画像と過去画像の選択・再利用
  → attachment追加・読取・削除
  → reload
  → cleanup
```

journeyを増やす前に、W4、W6、G4、A4へ下げられないか確認します。

## E2: 完全E2Eテスト

### 構成

```text
real browser
  → production-like Web
  → production-like API
  → production-like Agent
  → temporary/release DB and Auth
  → real model
  → production-like adapters
```

### 完全の意味

完全は配線の実在性を意味します。網羅性を意味しません。

```text
完全
  productionとほぼ同じruntime、provider、protocolを使う

網羅的
  全要件、全権限、全失敗、全toolを検査する
```

E2は完全ですが網羅的ではありません。

### 固定journey

- `agent-canary-web-search-source`: 明示した公開検索語からWeb検索を行い、公開情報源を表示する
- `agent-canary-private-issue-read`: 非公開Issueを読み取り、組織slug付きのIssueリンクを表示する
- `agent-canary-approved-issue-write`: 承認前に書き込まず、承認後だけIssueを作成する

画像のライフサイクル、過去画像の選択と再利用は決定的E1が所有し、有料E2では画像入力を扱いません。
reasoning `xhigh`の送信はtransport契約テストで固定し、有料E2ではreasoning tokenを検証値にしません。

通常は1から3種類の代表journeyに限定し、追加する場合は本番相当の配線でしか証明できないリスクを
明記します。

### 実行条件

- release candidate
- 明示的なmanual approval
- 有料secretを扱う保護されたworkflow
- synthetic test accountとisolated environment
- remote write targetのallowlist
- artifact privacy policyの確認

通常PRでは実行しません。nightly canaryは費用とdrift監視の必要性が認められる場合だけ実行します。

## G5との関係

実モデル挙動の主な評価はG5で行います。

```text
G5
  browserなし
  実prompt、実tool schema、実model
  tool implementationはcontrolled
  model behaviourを広く評価

E2
  full stack
  実model
  最小journey
  配線を最終確認
```

E2でmodel behaviour failureが見つかった場合:

1. G5へ小さい再現itemを追加する
2. tool schema、prompt、approval policyを修正する
3. G3/G4へ決定的なregression testを追加できる部分を追加する
4. E2は最終疎通のまま増やしすぎない

## Playwright高速化

### state isolation

次をnamespace化します。

```text
runId
workerId
testId
organizationId
userId
databasePath
R2 prefix
OAuth state
Mailpit message tag
```

全stateを消すreset endpointを使わず、namespace単位でcleanupします。

### setup

テスト対象でない前処理はUI操作で行いません。

```text
避ける
  UI login
  UI organization creation
  UI seed
  target assertion

推奨
  fixture API
  storageState
  target page
  target assertion
```

login ceremony自体を検査するjourneyだけUI loginを使います。

### parallelism

state isolation後にparallel executionを有効にします。

- OAuth、WebAuthn、single DB lockなど並列不可suiteは別projectまたはserial groupへ分ける
- workerごとにDB path、R2 prefix、OAuth namespaceを分ける
- shared mutable fixtureを持たない

### reuse

- pinned versionのbrowserをCIでinstallする
- migration済みtemplate DBをcopyする
- expensive seedをsuite単位で再利用する
- mock/provider serverをworker単位で再利用する
- trace、video、screenshotはfailure時だけ保存する

## browser matrix

### PR、mainのE1

- Chromium desktopを標準にする
- 内部環境変数`DETERMINISTIC_E2E_PROFILE=agent|auth|all`で必要なproject、web server、DB、
  teardownだけを構築する。未指定時は`all`としてrootの実行契約を維持する
- CIではAgent workflowを3ワーカー、OAuth・WebAuthnを含むAuth profileを1ワーカーで直列実行し、
  `Free E2E`で集約する。Agent profileの2ユーザーはsetup projectで初回作成し、各workerは既存userへ
  ログインして独立したsessionとstorage stateを持つ。write、search、attachmentを3ワーカーで実行し、
  共有runtimeのstream切断を伴うcancelは1ワーカーの依存projectとして最後に実行する
- WebKitはauth、keyboard、upload、focusなどbrowser差が重要な代表journeyだけにする
- mobileはlayout boundaryを持つ代表journeyだけにする

### nightly

必要な場合に限り、Chromium desktop/mobile、WebKit desktop/mobileのpairwiseな代表組合せを使います。

scenario、browser、viewport、themeの全直積を作りません。

## test dataとartifact

### E1

failure時に保存可能:

- trace
- screenshot
- video
- HTML report
- bounded server log
- synthetic fixture ID

secret、cookie value、private contentをredactします。

### E2

保存可能:

- scenario ID
- pass/fail
- tool名
- bounded error code
- duration
- usage aggregate
- run ID

原則保存禁止:

- provider raw response
- prompt全文
- tool private payload
- private DOM snapshot
- video
- trace
- screenshot

E2のAPIレスポンスは真偽値、件数、固定識別子、使用量の数値へ変換してから検証します。Playwrightの
検証失敗時にも、プロンプト全文、モデル出力、非公開URL、`objectKey`、生のプロバイダーレスポンスを
受信値へ含めません。

## 実行

```json
{
  "scripts": {
    "test:e2e": "env -u NO_COLOR WEB_PLAYWRIGHT_PROFILE=deterministic node node_modules/@playwright/test/cli.js test --config playwright.config.ts",
    "test:e2e:full": "bun --no-env-file e2e/fixtures/run-full-e2e.ts"
  }
}
```

内部project名はrootへ個別公開しません。

ローカルLGTMへ非rawのAPI trace・logと有料E2のAgent trace・logを送る場合だけ、明示的に次を指定します。

```sh
AGENT_E2E_OBSERVABILITY=1 PAID_E2E_APPROVED=1 \
  bun --env-file="$PWD/apps/agent/.env.local" run --cwd apps/web test:e2e:full
```

既定値は無効で、CIでは設定しません。E2Eランナーは固定loopback endpoint、実行ごとのsession ID、
E2E用worktree IDと`AGENT_E2E_RUN_ID`を一組でWorkerへ渡します。`AGENT_E2E_RUN_ID`はAPI・Agentの
生のcause報告を無効にし、固定error code、失敗status、HTTP属性だけをtrace・通常logへ残します。
Loki・Tempoの内容をPlaywright成果物へ添付しません。

## 受入条件

- E2EがE1とE2の二層だけである
- Web内で閉じる実Next.js browser testをW6が所有する
- ブラウザーなしの実モデル評価をG5だけが所有する
- E1が実Web、API、Agent、DB/Authを接続する
- E1がAPI keyなしで成功する
- E2がリリース前の最小journeyへ限定される
- E2で全権限や全failureを網羅しない
- stateがworker namespaceで隔離される
- 有料artifactへprovider/private contentが残らない
