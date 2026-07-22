# Tool、Web検索、approval

## Tool境界

初期server toolはaccount/organization pure read、Issue read/write、Web検索、thread renameに閉じます。billing、auth、member/role、invitation、organization設定のmutation toolは作りません。UI操作toolはbrowser内のallowlistだけを実行し、server authorizationには使いません。

Mastra toolはintent adapterです。Valibot schema、tenant再認可、normalization、transaction、audit、idempotencyはAPI domain serviceへ置きます。Agent Workerはprivate run grantでtyped internal clientだけを呼びます。

## 自然なWeb検索

`Web検索:` prefixは不要です。product Agentは次を材料に公開検索語を再構成できます。

- 現在の発話
- 同じthreadの過去履歴
- APIから読んだIssue projection
- 解決済みpage context / mention
- 直前までのtool結果

ただし検索providerへ送る最終`web_search({ query })`は公開情報だけに一般化します。private Issueの固有名、顧客名、member名、内部識別子を検索語へ転記しません。安全な一般化を確定できなければtoolを呼ばず、ユーザーへ公開情報だけの言い換えを求めます。

### 二段query guard

provider call前にAgent local guardとAPI server guardを順に通します。

拒否対象:

- API key、token、password、cookie、authorization header、private key、session値
- UUID、opaque tenant/resource ID、private/internal/local host、private IP
- email、電話番号、郵便番号、住所形式
- 現在tenantの既知user/member名とemail
- `private issue`、`internal note`等として転記された固有情報

queryは2〜200文字です。guardはquery、拒否対象文字列、Issue本文をerror、log、Sentry、auditへ出しません。guard失敗時はproviderとquota reservationを呼びません。

guard成功後、operation IDでWeb検索quotaを冪等予約してから、tenant contextやrun grantを持たない検索専用Agentを呼びます。結果は本文6,000文字、公開HTTP(S) source 5件へ制限し、`untrusted_public_web_content`として扱います。Web上のinstructionをIssue toolのinstructionへ昇格させません。

同じroot runでWeb検索を一度でも予約した後は、Issue作成・更新・削除をserver側で`ask_each`へ戻します。保存済み15分policy自体は消さず、別の検索なしroot runでは再利用できます。

## Approval lifecycle

Issue create/update/deleteは実行前に`agent_actions`へcanonical payload、API生成preview、session/user/org/thread/run、target revision、expiry、idempotency identityを保存します。model文面をpreviewに使いません。

UIはtool outputの`actionId`からcookie認証済みpublic APIでpreviewを取得し、tool part位置にYes/No cardを表示します。

- pending/approvedは最大15分
- deleteを自動許可するpolicyは別の明示確認を要求
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
