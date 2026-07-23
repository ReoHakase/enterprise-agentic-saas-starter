# Testとrelease gate

## 保証範囲

Agent releaseは次の2層を分離します。

1. deterministic safety: schema、tenant、capability、query guard、idempotency、stream projection、UI state
2. probabilistic behavior: 実OpenRouter Qwen3.6 Flashがtoolを正しく選び、全scenarioを3回連続で完了すること

LLMの回答文面一致はassertしません。tool call、tool inputの安全性、DB state、canonical stream part、approval state、Issue link、usage eventをassertします。

## Deterministic suite

### DB / API

- migrationのfresh/upgrade、既存row保持、trigger整合性
- thread owner/tenant境界、message count、更新順とID tie break
- thread作成時の`permissionMode`既定値、明示的Full access、invalid mode拒否、session/user/organization/context epoch境界、threadと初期permissionのtransaction整合性
- title state/revision、manual CAS、auto/manual競合、最大80文字
- context compaction threshold、最新12 message、summary idempotency
- usage event idempotency、daily projection、price version切替、admin境界
- historical approval GETは現在ownerで読め、decision/resumeは元scope外で拒否
- mention/page/file/memberのserver再解決とcross-tenant拒否
- `get_issue`添付pagination、pending除外、owner/tenant境界、metadata projection
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

### Web / mock Playwright

- headerにorganization名なし、selector metadata、赤いarchive
- thread未選択、stale URL、archive後に新規composerを表示し、未保存draft、sample prompt、初回send/attachmentでだけ作成
- 新規draftのAsk always既定値とFull access切替、共有mention候補、Tiptap snapshotの初回request引き継ぎ、thread作成失敗時のdraft/permission保持
- inline approval、過去approval reload、expired preview
- thinking/transient status/tool/source、trace重複なし、Issue個別link
- Tiptap inline mentionの順序、削除、送信、失敗復元、reload
- editor最大40vh、observed主表示とestimated fallbackを分離したcontext ring tooltip、360px pane/mobileでのoverflow、一行footer
- 全shortcut、IME、upload、modal、既存shortcut競合

## Paid E2E

`bun run test:e2e:agent`は一時Turso、real API/Agent Service Binding、real Better Auth session、OpenRouter `qwen/qwen3.6-flash`を使います。標準mock E2Eへ混ぜません。

release journey:

1. renameを依頼しない最初のmessageで専用title Agentによる自動titleを確認
2. 明示prefixなしの自然なWeb検索とsource part
3. 過去履歴、Issue read、tool resultを材料に一般化した検索
4. Issue readとorganization slug付き個別link
5. Ask alwaysのYes / Noと、Full accessでcardなしの即時write
6. 1つのmessageで画像upload、自然な公開Web検索、画像付きIssue作成を行い、tool input、DB Issue/file/claim、preview、個別pageを確認
7. Issue/member/current page mentionのserver解決
8. thinking、transient status、tool traceのstreamとreload。完了/reload後statusなし、assistant重複なし
9. context ringとusage event/cost projection API
10. session更新後の過去approval reload
11. 既知markerを持つseed Issue画像を`get_issue`から選び、画像toolを呼び、markerの内容を説明

secret、provider response本文、DOM snapshot、video、trace、screenshotをartifactへ保存しません。run専用tmp directoryとmode 0600の`.dev.vars`を使い、cleanup時は自分が起動したprocessとvalidated tmp pathだけを削除します。

## 3回eval

`bun run test:eval:agent`は各release scenarioを独立状態で3回実行し、3/3成功を要求します。一試行でも安全境界違反、tool不選択、誤ったwrite、stream欠落、DB不一致があればfailです。retryで成功率を隠しません。provider 429/5xxは別のinfrastructure failureとして記録し、合格へ数えません。

## 最終command

```sh
bun run --cwd packages/db db:generate
bun run --cwd packages/db db:migrate
bun run check
bun run test:e2e
bun run test:e2e:agent
bun run test:eval:agent
bun run --cwd apps/api cf:typegen
bun run --cwd apps/agent cf:typegen
bun run --cwd apps/web cf:typegen
bun run build:cloudflare
```

加えてskill validation、docs link check、UI向け禁止用語checkを通します。warning、flaky、未説明・意図しないskip、未cleanup processが残る場合は完了扱いにしません。browser能力差による計画skipは理由と代替coverageをtest内へ明記します。
