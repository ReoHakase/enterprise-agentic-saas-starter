# Threadとcontext

## Thread契約

`AgentThread`は次を返します。

```ts
type AgentThread = {
  id: string
  title: string
  status: "active" | "archived"
  messageCount: number
  createdAt: string
  updatedAt: string
}
```

listはlive session、active organization、membership、ownerをtransaction内で再検証し、`updatedAt DESC, id DESC`で返します。`messageCount`は保存済みcanonical messageの件数です。archive rowは通常listから除外しますが、過去approvalのread authorizationではowner確認対象として保持します。

canonical message、reasoning、tool、source、activity、context/title data partはAPI/Tursoが正本です。Mastra Memoryはauthorizationや履歴の正本ではありません。UI向け履歴はbounded projectionだけを返し、provider metadata、credential、raw imageを保存しません。

## 自動title

threadは`title_state = untitled | agent`を持ちます。既定`New conversation`は`untitled`、明示titleは`agent`です。

`rename_thread({ title })`は次のcontractです。

- 現在のchat runとthreadだけを対象にする
- 最初の有意な発話後に呼ぶ
- trim後1〜80文字
- `title_state = untitled`を条件にしたcompare-and-swap
- 最大1回。二回目は現在titleと`renamed: false`を返す
- approval不要、Issue write budgetを消費しない
- modelへthread IDやtenant IDを選ばせない

streamは`data-thread-title`を返し、Webはthread listを再取得します。

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

providerが返した実績input tokenは`observedInputTokens`として別に保存・表示し、事前推定へ上書きしません。context meterと月間usage meterも別表示です。

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
