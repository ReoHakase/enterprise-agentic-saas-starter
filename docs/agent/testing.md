---
title: 製品Agentのtestとrelease gate
status: proposed
implementation: planned
last_reviewed: 2026-07-24
---

# Testとrelease gate

## 保証範囲

Agent releaseは次の3層を分離します。

1. deterministic core: schema、tenant、capability、query guard、idempotency、stream projection
2. browser feature integration: UI state、Server Component、cookie、Worker/Service Binding配線
3. probabilistic verification: L6は全指定caseを独立stateで3/3、L7は固定canaryを各1回完了すること

LLMの回答文面一致はassertしません。tool call、tool inputの安全性、DB state、canonical stream part、approval state、Issue link、usage eventをassertします。

## Deterministic suite

### DB / API

- migrationのfresh/upgrade、既存row保持、trigger整合性
- thread所有者/tenant境界、message count、更新順とID tie break
- thread作成時の`permissionMode`既定値、明示的Full access、invalid mode拒否、session/user/organization/context epoch境界、threadと初期permissionのtransaction整合性
- title state/revision、manual CAS、auto/manual競合、最大80文字
- context compaction threshold、最新12 message、summary idempotency
- usage event idempotency、daily projection、price version切替、admin境界
- historical approval GETは現在ownerで読め、decision/resumeは元scope外で拒否
- mention/page/file/memberのserver再解決とcross-tenant拒否
- `get_issue`添付pagination、pending除外、file所有者/tenant境界、metadata projection
- Issue画像private routeの対応形式、変換条件、unknown-length 4 MiB fence、quota冪等性、private/no-store header

### Agent

- 自然なWeb検索をcurrent message、履歴、Issue、page context、tool resultから選ぶ
- private固有情報を一般化した公開query
- credential、email、電話、住所、member identity、opaque IDの拒否
- query、拒否文字列、Issue本文がlog/Sentryへ残らない
- 専用title Agentのforced rename、transient status sanitizer、usage正規化、approval resume
- fail/cancelでも観測済みusageを記録
- vision flagによる画像tool登録、chat画像との合計4枚上限、WeakMap media sidecar、実model入力だけのusage加算
- canonical履歴、stream、reload traceにbase64、private URL、object key、raw bytesがない

### Web / Browser Modeとfree Playwright

- headerにorganization名なし、selector metadata、赤いarchive
- thread未選択、stale URL、archive後に新規composerを表示し、未保存draft、sample prompt、初回send/attachmentでだけ作成
- 新規draftのAsk always既定値とFull access切替、共有mention候補、Tiptap snapshotの初回request引き継ぎ、thread作成失敗時のdraft/permission保持
- inline approval、過去approval reload、expired preview
- thinking/transient status/tool/source、trace重複なし、Issue個別link
- Tiptap inline mentionの順序、削除、送信、失敗復元、reload
- editor最大40vh、observed主表示とestimated fallbackを分離したcontext ring tooltip、360px pane/mobileでのoverflow、一行footer
- 全shortcut、IME、upload、modal、既存shortcut競合

pane state、shortcut、focus、approval UI、stream part表示はStorybook/Browser Modeで検証します。
Server Component、cookie、reload、API/Agent Worker配線だけをfree Playwright E1/E2へ残します。mockは
network/transport boundaryに置き、production hook、parser、controller、componentを差し替えません。

## Browserless paid eval

`bun run test:eval:agent`はrelease modelを使い、browserなしで次のscenarioを検証します。

contract profile:

1. 明示prefixなしの自然なWeb検索とsource part
2. 過去履歴、Issue read、tool resultを材料に一般化した検索
3. Issue readとorganization slug付き個別link
4. Ask alwaysのapproval前write禁止と、Full accessの許可された即時write
5. 既知markerを持つsynthetic Issue画像を選び、必要な画像toolを呼ぶ

stack profile:

1. 専用title Agentの自動titleとmanual rename race
2. 画像upload、公開Web検索、画像付きIssue作成のtool inputとDB/file/claim
3. Issue/member/current page mentionのserver再解決
4. thinking、transient status、tool/source traceのcanonical persistence
5. context usage event/cost projection
6. session更新後の過去approval reload

authorization、tenant、privacy、idempotency、approval、tool allowlistはdeterministic assertionで
判定します。自然言語の品質、関連性、説明の完全性だけをscorerの対象にします。

## Paid full-stack canary

`bun run test:e2e:agent`は一時Turso、real API/Agent Service Binding、real Better Auth session、
release modelを使い、標準free E2Eへ混ぜません。E4は次の固定2本を各1回実行します。

1. `agent-canary-read-source`: 自然文からread/Web検索tool、source、Issue linkを表示する
2. `agent-canary-approved-image-write`: approval後だけ画像付きIssue作成を完了する

上のacceptance scenarioを全て有料browserで重複実行しません。deterministic suite、
browserless contract/stack eval、E4 canaryへ責務を配分します。

L6/L7のsecret管理責任者、env隔離、artifact禁止、cleanupは
[Paid test secret](./operations.md#paid-test-secret)を共通契約とします。

## 3回eval

`bun run test:eval:agent`は各release scenarioを独立状態で3回実行し、3/3成功を要求します。
一試行でも安全境界違反、tool不選択、誤ったwrite、stream欠落、DB不一致があればfailです。
retryで成功率を隠しません。provider 429/5xxは別のinfrastructure failureとして記録し、
合格へ数えません。E4 browser canary自体は1回だけとし、flaky retryを設定しません。

## 常時実行するfree gate

```sh
bun run --cwd packages/db db:check
bun run check
bun run test:e2e
bun run --cwd apps/api cf:typegen
bun run --cwd apps/agent cf:typegen
bun run --cwd apps/web cf:typegen
bun run build:cloudflare
```

Schema変更時はtemporary outputへのgenerateによるschema drift、migration history、isolated migration
suiteも実行します。release testから開発DBへ`db:migrate`を実行しません。

## Agent fingerprint変更時

```sh
bun run test:eval:agent
```

## Release candidate

安いL6を先に通し、その後にL7を各1回実行します。

```sh
bun run test:eval:agent
bun run test:e2e:agent
```

加えてskill validation、docs link check、UI向け禁止用語checkを通します。warning、flaky、未説明・意図しないskip、未cleanup processが残る場合は完了扱いにしません。browser能力差による計画skipは理由と代替coverageをtest内へ明記します。
