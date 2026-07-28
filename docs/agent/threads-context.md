---
title: 製品Agentのthreadとcontext
status: accepted
implementation: active
last_reviewed: 2026-07-28
---

# Threadとcontext

## Thread契約

`AgentThread`は次を返します。

```ts
type AgentThread = {
  id: string
  title: string
  status: "active" | "archived"
  createdAt: string
  updatedAt: string
}
```

listはlive session、active organization、membership、ownerを再検証し、Application DBのactive registryと
Mastra Storageのthread metadataの積集合を`updatedAt DESC, id DESC`で返します。`messageCount`は
初期contractに含めません。archive rowは通常listから除外しますが、過去approvalのread authorizationではowner確認対象として保持します。

Mastra Storageがthread metadataとmessage履歴の正本です。Mastra Memoryは同じStorage上のthreadから
model文脈を構成し、Application DBのregistryがauthorizationの正本です。API側へmessage副本を
作りません。transient `data-activity`、`data-run`、raw reasoning、provider metadata、credential、
raw imageは保存しません。

## 自動title

最初の有意なuser messageではmain responseと独立したbest-effort title taskを開始します。main streamは
title完了を待ちません。専用title Agentはtoolを持たず、reasoning `none`、temperature 0、10秒timeout、
最大96 output tokenで1〜80文字のtitleを生成します。Mastra Storageの現在titleが既定値のときだけ
更新し、失敗時は`New conversation`を維持して通常応答を継続します。titleは低優先度の補助modelで、
raw input/outputをtraceへ残しません。

main usage、Mastra workflow stage、Memory保存、Application run settlementを先に終え、title taskは
解放後のbackground処理として待ちます。title model usageは`title_<attempt>`の独立eventで、terminal
runに対するusage専用の冪等記録契約を使います。title失敗やusage重複でmain responseを失わせません。

## Model profile snapshot

各runはprofile/modelとcontext設定をsnapshotします。Qwen3.6 Flash profileは次です。

- provider model: `qwen/qwen3.6-flash`
- context window: 1,000,000 token
- reasoning effort: none
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
