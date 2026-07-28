---
title: 製品Agent runtime信頼性
status: proposed
implementation: planned
last_reviewed: 2026-07-28
applies_to:
  - apps/web/src/features/agent/**
  - apps/api/src/modules/agent/**
  - apps/agent/src/mastra/**
related:
  - ../architecture/agent-runtime-and-mcp.md
  - ../testing-strategy/agent-refactor-mcp.md
---

# 製品Agent runtime信頼性

## 目的

Phase 1のMastra-native化後に、既知の不具合を同じ操作で再現し、残っている原因だけを修正します。旧構造へ個別patchを積み重ねず、native stream、Memory、tool state、cancelを基準に検証します。

## Release blocker

次のいずれかが再現する場合はAgent releaseを許可しません。

- server toolが実行中にUI上でerrorになる
- Stop後に同じthreadから次のmessageを送れない
- Stop後にrun、grant、quota reservationが残り続ける
- reasoningだけが流れ、textまたはtool callへ進まない
- Web検索が正常な公開queryで常時失敗する
- Issue attachmentをtoolから追加、削除、読取できない
- tool-local failureがconversation全体を再利用不能にする

## 不具合と構造上の原因

| 症状                    | 現在の構造上の原因                                                                                          | Phase 1後の期待                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 実行中toolがerror表示   | browserの`onToolCall`がserver toolまでclient tool executorへ渡し、allowlist外として`output-error`を書き戻す | client toolは`ui_*`だけ。server toolはnative stateを表示する                  |
| Stop後に会話不能        | abortでも同じsubmission IDを保持し、run cancel完了前にretryし、chat errorをclearしない                      | Stopは正常cancel。IDを破棄し、explicit cancel完了後に新規turnを許可する       |
| thinkingが終わらない    | raw reasoningを流し、reasoning-onlyを進捗として扱い、title callを先に待ち、output budgetがreasoningへ偏る   | raw reasoningを非表示、useful-output watchdog、titleはmain streamを遅らせない |
| Web検索error            | client tool誤判定に加え、Product Agentからsearch Agent、その内部でprovider server toolという多段構造        | 1つの`web_search` toolからsearch providerを直接呼ぶ                           |
| 既存Issueへ画像追加不可 | create toolだけがstaged asset promotionを持ち、update toolにattachment mutationがない                       | add/remove/readを独立toolとして提供する                                       |

## Tool UI state

native stateを次の表示へ変換します。

| native state         | 表示       | fatal error     |
| -------------------- | ---------- | --------------- |
| `input-streaming`    | 入力準備中 | しない          |
| `input-available`    | 実行中     | しない          |
| `approval-requested` | 承認待ち   | しない          |
| `output-available`   | 完了       | しない          |
| `output-denied`      | 拒否済み   | しない          |
| `output-error`       | 失敗       | tool card内だけ |
| turn abort           | 停止済み   | しない          |

raw inputとraw outputは既定で表示しません。安全に整形したsummaryだけを表示し、debug detailsはsynthetic dataまたは開発環境に限定します。

## Client tool境界

browserで実行するtoolは次だけです。

```text
ui_navigate
ui_open_issue
ui_set_issue_query
ui_read_form_draft
ui_patch_form_draft
```

`search_issues`、`get_issue`、`web_search`、Issue write、attachment toolはbrowserから`addToolOutput()`を返しません。

## Stop contract

### UI

- Stop操作はerror bannerを出さない
- composer snapshotを復元する
- pending submission IDを破棄する
- partial assistant messageは停止済みとして残すか、安全に除去する
- `clearError()`を呼ぶ
- cancel完了中だけSendを無効化する
- stream先頭の一時的な`data-run`からopaque run IDを保持し、Memoryへ永続化しない
- cancel完了後は新しいsubmission IDで次turnを開始する
- 通常のthread切替では承認待ちactionをcancelせず、そのthreadに残す。active responseだけを切替前にStopする
- archiveはAPI transactionが`running | waiting_approval` run、action、grant、resume ticketを失効させる正本であり、browser Stopへ置き換えない

### API

```text
POST /agent/threads/:threadId/runs/:runId/cancel
```

- live session、membership、owner、run ownershipを検証する
- `running | waiting_approval`から`canceled`へ冪等に遷移する
- grantと未消費のlive concurrency reservation/leaseを解放する
- 既に消費したmodel、Web検索、vision quotaは払い戻さない
- Agent側abortと同時実行されても同じterminal stateへ収束する
- completed runをcanceledへ戻さない
- terminal runへの再cancelはgrant lookupより前にsession、membership、owner、run ownershipで認可し、
  現在のterminal stateをそのまま返す

browserのclient tool自動継続は、最終stepに完了済みの`ui_*`だけがある場合に限定します。
server tool、approval待ち、denied、failedはbrowser continuationを開始しません。

### Agent

- request abortとtimeoutを区別する
- user abortはprovider errorとして記録しない
- `onAbort`とAPI cancelの二重呼出しを冪等にする
- abort後にusageが観測できた場合はbillable policyに従い一度だけsettleする
- abort原因は最初に確定した`user | useful_timeout | total_timeout`から上書きしない
- user abortはrun cancelを先に確定し、そのterminal grantでusageを記録して最後にexecutionを解放する

Stopのpartial assistant outputと`data-run`はsession-local UIだけに残します。file-backed Mastra Storageを
新しいruntime compositionから開き直したreloadでは、停止したuser messageだけを返します。
本番Workerは`enable_request_signal`、APIは加えて`request_signal_passthrough`を使いますが、Stopの
正本はbrowser abortと認可済みexplicit cancelです。今回のlocal multi-config E1 harnessでは
disconnect単独のterminal cancelを決定的に観測できなかったため、E1はexplicit cancel、G3/G4は
直接`Request.signal` abortを検査します。

## Reasoning contract

### 表示

productionではraw reasoning partを送信、保存、表示しません。Product Agentとtitle Agentのreasoningは
`none`です。

表示するstatus例:

```text
考えています
Issueを検索しています
画像を確認しています
公開情報を検索しています
```

statusはfinish、error、abort、disconnectで必ず消します。

### watchdog

useful outputは次のいずれかです。

- text delta
- tool call start
- tool result
- approval request

reasoning deltaだけではtimerを延長しません。

初期値:

```text
30秒 useful outputなし → useful-output timeout
90秒 run全体未完了   → total timeout
```

実測で調整します。

### retry

- model responseは自動retryしない
- 明示的なuser retryは新しいsubmission IDを使い、business idempotency contractは維持する
- user Stopは自動retryしない

## Web検索contract

- exact public queryをAPI guardで再検証する
- 外側の空白だけを除いたqueryを2〜200文字で検証し、同じ文字列をJSON promptへ渡す
- provider内の検索engineが使う内部query文字列は保証対象外
- query guard失敗時はproviderとquotaを呼ばない
- nested Agentを作らない
- timeout 25秒、`maxRetries: 0`、OpenRouter request 1件、reasoningなし
- Phase 2はQwen向けbeta server toolのlive compatibility失敗を受け、Exaの`web` pluginを
  `max_results: 3`で一時利用する。server toolへ戻す場合も同じquery/source/G5契約を通す
- sourceはHTTP(S) public URLだけ
- result本文、source数、title、URLをboundedにする
- provider固有errorをinternal telemetryへcodeとして残し、公開payloadへraw errorを出さない
- search failureはtool-local errorとして返し、Issue writeへfallbackしない

公開URLはAgent、Memory projection、API client、Webで同じcanonicalizerを使います。HTTP(S)だけを許可し、
userinfo、private/reserved hostを拒否し、provider由来queryとfragmentは名前に依存せず全体を除去します。
tool resultのsourceはcanonical `source-url` partへ昇格し、同一message内でcanonical URL単位に重複排除します。

## Issue attachment contract

### 追加

`add_issue_attachments`はstaged assetだけを受けます。

- `get_issue`が返したcurrent revisionを使い、推測しない
- 1回最大4件
- `expectedRevision`必須
- current permission必須
- assetのorganization、uploader、expiry、状態を再検証
- promotion、claim transfer、Issue revision、activity、auditを同一transaction

### 削除

`remove_issue_attachments`はready fileだけを受けます。

- `get_issue`が返したcurrent revisionとfile IDを使い、推測しない
- 1回最大20件
- `expectedRevision`必須
- current permission必須
- 対象Issueに属するfileだけ
- thumbnail整合を保つ
- typed owner/file rowのhard deleteとIssue revisionを同一transaction
- physical objectを`deleting`へ遷移してstorage cleanupへ引き渡す

### 読取

- `get_issue`はmetadata page
- `read_issue_attachment_image`は必要な1画像だけ
- raw bytesはstream、Memory、tool output、traceへ保存しない

## Phase 1後の再現手順

### Tool state

1. `search_issues`を呼ぶpromptを送る
2. tool cardが実行中になる
3. browserのclient tool executorが呼ばれていないことを確認する
4. tool cardが完了になる
5. global errorがないことを確認する

### Stop

1. reasoningまたはtext streaming中にStopする
2. cancel APIが200または既存terminal resultを返す
3. error bannerがないことを確認する
4. 同じthreadへ別messageを送る
5. 409、internal error、stale grantがないことを確認する

### Reasoning-only

1. scripted modelでreasoningだけを流す
2. useful-output timeoutで停止する
3. recoverable timeoutを表示する
4. 次turnを送れることを確認する

### Web検索

1. valid public queryを送る
2. query guard、quota、providerを1回ずつ通る
3. source付きresultを表示する
4. provider failure時はtool-local errorだけを表示する

### Attachment

1. chatへ画像をuploadする
2. existing Issueへ追加する
3. `get_issue`でmetadataを読む
4. `read_issue_attachment_image`で画像を読む
5. attachmentを削除する
6. reload後に反映を確認する

## Telemetry

保存可能:

- run ID
- provider request ID
- model route
- finish reason
- time to first chunk
- time to first useful output
- reasoning-only duration
- tool名
- bounded error code
- abort reason
- usage aggregate

保存禁止:

- raw reasoning
- prompt全文
- Issue本文
- tool private payload
- access token
- grant
- R2 key
- private URL

## 完了条件

- 既知5症状の再現testが追加される
- Phase 1後に全症状を再実行する
- 構造切替で消えた症状には不要な個別patchを追加しない
- 残った症状だけ原因を特定して修正する
- G1からG4、W1からW4、E1に回帰testを配置する
