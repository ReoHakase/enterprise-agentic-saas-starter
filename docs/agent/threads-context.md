# Threadとcontext

## Thread契約

`AgentThread`は次を返します。

```ts
type AgentThread = {
  id: string
  title: string
  titleRevision: number
  status: "active" | "archived"
  messageCount: number
  createdAt: string
  updatedAt: string
}
```

listはlive session、active organization、membership、ownerをtransaction内で再検証し、`updatedAt DESC, id DESC`で返します。`messageCount`は保存済みcanonical messageの件数です。archive rowは通常listから除外しますが、過去approvalのread authorizationではowner確認対象として保持します。

canonical message、reasoning、tool、source、context/title data partはAPI/Tursoが正本です。transient `data-activity`は保存しません。Mastra Memoryはauthorizationや履歴の正本ではありません。UI向け履歴はbounded projectionだけを返し、provider metadata、credential、raw imageを保存しません。

## 自動title

threadは`title_state_v2 = untitled | agent | user`と`title_revision`を持ちます。既定`New conversation`は`untitled`、専用title Agentは`agent`、手動変更は`user`です。

最初の有意なuser messageでmain Agentとは独立した専用title Agentを起動し、`rename_thread`だけをforced tool callします。title処理の失敗は本回答を失敗させず、`untitled`なら次turnで再試行します。すでに`agent | user`ならtitle Agent自体を起動しません。

Qwen/Alibabaはthinking mode中のforced `tool_choice`を拒否するため、専用title Agentだけreasoningを無効化します。製品Agent本体のreasoning mediumとtrace契約は変更しません。

`rename_thread({ title })`は次のcontractです。

- 現在のchat runとthreadだけを対象にする
- 最初の有意な発話後に呼ぶ
- trim後1〜80文字
- `title_state = untitled`を条件にしたcompare-and-swap
- 最大1回。二回目は現在titleと`renamed: false`を返す
- approval不要、Issue write budgetを消費しない
- modelへthread IDやtenant IDを選ばせない

streamは`data-thread-title`を返し、Webはthread listを再取得します。

手動変更は`PATCH /agent/threads/:threadId/title`へ1〜80文字と`expectedRevision`を送り、owner/tenant/revision CAS成功時に`title_state_v2=user`へ更新します。user titleは自動処理で上書きしません。

## Model profile snapshot

各runはprofile/modelとcontext設定をsnapshotします。Qwen3.6 Flash profileは次です。

- provider model: `qwen/qwen3.6-flash`
- context window: 1,000,000 token
- reasoning effort: medium
- max output: 4,096 token

modelの将来設定変更で過去runの解釈を変えないため、run rowへprofile、context window、事前推定input、reserved outputを保持します。

## Context budget

事前推定は文字数等から安全側に算出し、次を個別表示します。

- system
- skills
- tools
- history
- page context
- attachments

providerが返した直前runの実績input tokenは`observedInputTokens`として別に保存し、事前推定へ上書きしません。実績がある場合、chat UIの円形context ringはこの値を主表示と色判定に使い、tooltipで`Last request actual`と明示します。事前推定は`Preflight estimate`と`Estimated breakdown`へ分離します。まだ実績がない場合だけringを事前推定へfallbackし、表示文言とaccessible nameの両方で推定値だと明示します。

tooltipはviewport内へ幅を制限した単一block wrapperを持ち、狭いAgent paneやmobileでもactual、estimate、内訳を横並びにしません。chat UIに月間costは表示せず、usage APIと管理画面向け集計は別契約として維持します。

注意段階は70%=`notice`、85%=`warning`、95%=`critical`です。95%以上では古い履歴をdeterministic summaryへ圧縮し、最新12 messageを原文で保持します。summaryはorganization/thread、through sequence、estimated token、作成日時を持ち、再試行で同じ範囲を二重作成しません。

compaction後も安全に収まらない場合、現在のthreadへ送信せず新しいthreadを案内します。添付画像やtool payloadをsummaryへそのまま複製しません。

## Context API

`GET /agent/threads/:threadId/context`はowner境界を再検証し、message数、history事前推定、最新summary位置と推定量を返します。provider実績はrun usage側の値であり、このAPIの事前推定と区別します。

## Failure behavior

- 履歴取得失敗: conversationを捏造せずretry UIを表示
- title CAS競合: 現在titleを維持し通常応答を継続
- compaction保存失敗: runをfail closedにし、全文を無制限送信しない
- provider cancel/fail: 観測済みusageとstream partを可能な範囲で保存し、local draftを保持
- archived/missing thread: 同じnot-found projection。local stale selectionを解除
