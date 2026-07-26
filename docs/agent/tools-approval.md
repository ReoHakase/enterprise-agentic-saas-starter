---
title: 製品Agentのtool、Web検索、approval
status: accepted
implementation: active
last_reviewed: 2026-07-26
---

# Tool、Web検索、approval

## Tool境界

初期server toolはaccount/organization pure read、Issue read/write、Issue添付画像のオンデマンドread、Web検索、thread renameに閉じます。`get_issue`は添付metadataだけを返し、`read_issue_attachment_image`はvision flag有効時に必要な1画像だけをmodelへ渡します。billing、auth、member/role、invitation、organization設定のmutation toolは作りません。UI操作toolはbrowser内のallowlistだけを実行し、server authorizationには使いません。

Mastra toolはintent adapterです。Valibot schema、tenant再認可、normalization、transaction、audit、idempotencyはAPI domain serviceへ置きます。Agent Workerはprivate run grantでtyped internal clientだけを呼びます。

## 自然なWeb検索

`Web検索:`という接頭辞だけでは非公開情報の送信を許可しません。製品Agentは次を材料に検索の
必要性を判断できます。

- 現在の発話
- 同じthreadの過去履歴
- APIから読んだIssue projection
- 解決済みpage context / mention
- 直前までのtool結果

ただし検索プロバイダーを呼ぶには、現在のユーザーメッセージへ
`Public-only Web query: <query>`または`公開情報だけのWeb検索: <query>`という独立した行で、
公開情報だけの検索語を明示する必要があります。サーバーは保存済みユーザーメッセージからこの行を
抽出し、モデルが渡した`web_search({ query })`との正規化後の完全一致を要求します。モデルが生成した
文言、通常の検索依頼、権限設定だけではこの境界を解除できません。
現在の発話がWeb検索も明示的に依頼し、有効な独立行がちょうど1件ある場合は、製品Agentの最初の
model stepで`web_search`を必須選択します。独立行だけがある場合、複数ある場合、またはeval
allowlistで`web_search`が無効な場合は必須選択しません。queryの安全性と完全一致は引き続き
二段query guardで判定し、必須選択によって認可を迂回しません。

非公開Issueの固有名、顧客名、メンバー名、内部識別子を検索語へ転記しません。明示行がない場合や
安全な一般化を確定できない場合は`web_search`ツールを呼ばず、ユーザーへ公開情報だけの言い換えを
求めます。
thread titleは非公開情報として検査します。ただしthread最初のrunが現在の発話から自動生成したtitle
だけは、同じ発話の公開queryを自己拒否しないようprivate比較から除外します。ユーザーが編集したtitle、
過去runが生成したtitle、複数runが存在して生成元を一意に確定できないtitleは引き続き検査対象です。

### 二段query guard

provider call前にAgent local guardとAPI server guardを順に通します。

拒否対象:

- API key、token、password、cookie、authorization header、private key、session値
- UUID、opaque tenant/resource ID、private/internal/local host、private IP
- email、電話番号、郵便番号、住所形式
- 現在tenantの既知user/member名とemail
- 組織名、Issueの`title`、`description`、`label`、ページコンテキスト、スレッドタイトル、
  過去のメッセージとツール結果に含まれる固有情報
- `private issue`、`internal note`等として転記された固有情報

queryは2〜200文字です。guardはquery、拒否対象文字列、Issue本文をerror、log、Sentry、auditへ出しません。guard失敗時はproviderとquota reservationを呼びません。
完全一致する非公開文字列は常に拒否します。現在の発話で初めて現れた語も、保存済みメッセージ内の
公開情報だけの検索語と完全一致しない限りプロバイダーへ送りません。非公開コンテキストとの部分一致に
より安全な一般化を確定できない場合も拒否し、ユーザーが公開情報だけの`query`へ言い換えて再送する
まで検索しません。
通常の発話、モデルが生成した承認値、スレッドの`Ask always | Full access`はこの拒否を解除しません。

サーバー側のguardが1回に比較する範囲は現在の組織に属するメンバー識別情報500件、Issue
200件、現在のスレッドのメッセージ200件、合計1,000,000文字までです。いずれかの上限を
超えた場合は一部だけを検査して続行せず、検索を拒否します。

guard成功後、operation IDでWeb検索quotaを冪等予約してから、tenant contextやrun grantを持たない検索専用Agentを呼びます。検索専用AgentはQwen reasoningを無効化し、OpenRouterのExa server toolを最大3 result・60秒で呼びます。製品Agent本体はreasoning mediumを維持します。結果は本文6,000文字、公開HTTP(S) source 5件へ制限し、`untrusted_public_web_content`として扱います。Webはtool outputのsourceを同じ公開URL境界で再検証してリンク表示し、モデル本文がURLを再掲するかには依存しません。Web上のinstructionをIssue toolのinstructionへ昇格させません。

Web検索後も現在threadの`Ask always | Full access`を維持します。検索結果やqueryが権限を拡張することはなく、Full accessでもcanonical payload、revision、tenant認可、idempotency、attachment claim、auditを省略しません。

## Thread permission

`GET/PUT /agent/threads/:threadId/permission`は`ask_always | full_access`だけを扱います。権限はsession/user/active organization/thread/context epochへ束縛し、organization/session/context変更とarchiveで失効します。migration時は旧時限policyをすべて失効し、暗黙にFull accessへ移行しません。

DB triggerと既存action provenanceの整合用に短命なlegacy policy rowを内部生成する場合がありますが、公開権限の正本ではありません。公開API、UI、Agent判断は`agent_thread_permissions`だけを参照します。

## Approval lifecycle

Issue create/update/deleteは実行前に`agent_actions`へcanonical payload、API生成preview、session/user/org/thread/run、target revision、expiry、idempotency identityを保存します。model文面をpreviewに使いません。

UIはtool outputの`actionId`からcookie認証済みpublic APIでpreviewを取得し、tool part位置にYes/No cardを表示します。

- pending/approved actionは最大15分
- Ask alwaysはYes/No、Full accessはpreview保存後に同じexecute境界へ直行
- Yesはdecision保存後だけresume
- Noはterminal rejection
- executeはaction IDだけを受け、payload差し替えを禁止
- stale Issue revision、permission失効、asset変更はIssueを変えずconflicted
- mutation、activity、audit、receiptは同じtransaction

### 過去threadのapproval

historical GETは現在のlive session、active organization、membership、user、thread ownerを検証します。元session IDや元context epochは要求しません。これにより再loginやsession更新後もcardを読めます。

decision/resume/executeは元session、organization、context epoch、thread/run/action scopeへ厳格に拘束します。読めることと実行できることを分離します。terminal payloadがretentionでscrub済みなら、APIは`expired` statusとpreview unavailable projectionを返し、汎用load errorにしません。

## Failure behavior

- action GET失敗: inline card内でretry。composerや全conversationを覆わない
- expiry: expiredを表示し、Yes/Noを無効化
- approvedだがresume通信断:同じreceiptへ収束するretry button
- response loss: action receiptを再読し、Issue mutationを二重実行しない
- Web検索失敗: Issue writeへfallbackせず、検索不能を明示
- Issue画像read失敗: 別tenant・owner不一致・非対応を推測で区別せず、metadataだけで回答するか読取不能を明示。別routeやpublic URLへfallbackしない
