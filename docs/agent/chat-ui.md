---
title: 製品AgentのChat UI/UX
status: accepted
implementation: active
last_reviewed: 2026-08-01
---

# Chat UI/UX

## Shellとheader

Agent shellのheaderにorganization名を表示しません。thread selector、新規thread、赤いarchive、pane closeを上部へ置きます。UI上は`thread`を使い、実装都合のデータ操作略語は使いません。

selectorはAPI順を維持し、`updatedAt DESC, id DESC`です。各itemはtitleと最終更新日時を表示します。archiveはdestructive styleと確認dialogを持ち、対象threadの未送信text、staged画像、upload、active responseへの影響を説明します。

## 新規thread

URLに`agentThread`がない場合は、Agent paneと専用Agent pageのどちらも常に`New conversation`のlocal draftを表示します。指定threadが存在しない、削除済み、archive済みの場合は`agentThread`をURLから除去し、同じlocal draftへ戻します。thread選択を要求する空画面は表示しません。

新規threadはDB rowを作らないlocal draftから開始します。次のどちらかで初めてthreadを作成します。

- 有意な最初のmessageを送信する
- 画像を選択してuploadを開始する

空のdraftまたは空threadには3件のsample promptを表示し、clickは送信せずcomposerを埋めます。

新規draftでも既存threadと同じcurrent page、Issue、memberのmention候補を提供します。初回作成時はplain textではなくTiptap documentと順序付きのtext/mention partをsnapshotし、作成後のcomposerへ一度だけ引き継ぎます。最初のchat requestはmentionのID/pathとtextの順序を保持します。thread作成に失敗した場合はdocument、mention、画像選択前のtext、permission選択をlocalに保持します。

permissionは新規draftでは`Ask always`をlocal既定値とし、thread作成前に`Full access`へ変更できます。`POST /agent/threads`は選択した`permissionMode`を受け取り、threadとsession、user、organization、context epochへ束縛した初期permissionを同一transactionで保存します。初回runはこのtransactionの完了後だけ開始します。

## Conversationとmessage part

conversation全体とcomposerを1枚の大きなCardで囲みません。conversationは平面、composerは独立した下部surfaceです。assistantは枠なし全幅、userだけを右寄せbubbleにし、各messageの`You` / `Issue agent`表示は省略してaccessible nameだけを保持します。approvalをabsolute/fixed layerやmessage末尾の別listへ移動せず、part順序を履歴の正本にします。

| part                       | 表示                                              |
| -------------------------- | ------------------------------------------------- |
| `text`                     | Markdown対応response                              |
| `reasoning`                | providerが返した標準本文をstream、保存、再表示    |
| tool part                  | tool名とstate、安全なschema検証済みprojectionだけ |
| pending action tool output | そのtool位置のinline approval card                |
| `source-url`               | 外部link                                          |
| `data-context-budget`      | messageではなくcontext meterへ反映                |
| `data-thread-title`        | title更新通知とselector再取得                     |

thinkingは「`useChat`のstatus」「providerの標準reasoning」「canonical tool part」を混同しません。送信後から最初の`stream part`を受け取るまでと、tool完了後から次のreasoningまたはtext partを受け取るまでは、conversation末尾にspinnerを表示します。reasoningまたは実行中のtoolが表示されている間は、それぞれの状態表示へ引き継ぎます。toolのRunning/Completed別行を作らず、同じtool partのstate更新だけを表示します。存在しない非公開chain-of-thoughtを別modelで推測生成しません。標準reasoningは各partをtoolと同じcanonical順序で表示し、stream中に自動展開して`思考中…`を表示し、完了後に閉じます。閉じた状態でもMarkdown記号を除いた先頭の有効な1行、完了状態、live runで計測できた所要時間を表示し、展開時は保存済み本文をMarkdownとして読めます。

toolのraw input/outputは折りたたみdetailsを含めてchat UIへ表示しません。各tool固有schemaで検証した公開projectionから、対象Issue番号、検索条件、結果件数、確認済みIssueへのlinkを表示します。Mastra標準の`skill` toolは`core`などの公開名と読込結果だけを表示・保存し、skill本文は公開しません。tenant識別子、credential、provider payload、private URL、内部errorを汎用rendererへ渡しません。

### Scroll追従

conversationは中央寄せの`max-w-3xl`とし、初期表示と末尾付近ではmessage追加、streaming、画像読込、resizeへ自動追従します。利用者が上へscrollした場合は読書位置を維持し、画面下部の`最新のメッセージへ移動`ボタンで末尾へ戻せます。Agent paneでは2 turn以上のとき右端にturn minimapを表示し、promptと回答のpreviewから対象turnへ移動できます。

## Composer

composerはTiptapを正本にし、textとmentionを同じdocument内で編集します。mentionは青いinline atom nodeで、右端X、Backspace/Delete、keyboard suggestion、IME、Escape、Arrow/Enterを扱います。送信時はtext/mention/画像を1つのpending snapshotへ移してeditorから即時消去し、失敗時は新しい入力を上書きしない場合だけ復元します。

permissionはicon付きselectとしてcomposer footerに置きます。表示専用のcontrolled selectとserver-backed更新を分離し、新規draftではlocal state、既存threadではserver stateを接続します。

- Ask always: Issue作成・更新・削除を毎回確認
- Full access: 現在threadのIssue作成・更新・削除を確認なしで許可

時間制限や削除確認文字列はUI契約に含めません。権限はserver正本で、session、organization、context epoch、threadへ束縛し、Jotaiへ正本を置きません。

Tiptap editorだけを内容に応じて最大`40vh`まで拡張し、それ以上は内部scrollにします。attachment、permission、円形context meter、Stop/Sendはdesktopで原則1行に置き、常にviewport内へ残します。狭幅だけ折り返します。chat composerにmonthly costは表示しません。`Enter`は送信、`Shift+Enter`は改行です。IME composition中とmention候補表示中の`Enter`は送信に使いません。

## Keyboard shortcuts

`@tanstack/react-hotkeys` 0.10.0をcatalog固定し、次を提供します。

| shortcut           | 動作                     |
| ------------------ | ------------------------ |
| `Mod+K`            | Agent pane切替           |
| `Enter`            | 送信                     |
| `Shift+Enter`      | 改行                     |
| `Mod+Shift+N`      | 新規thread draft         |
| `Mod+.`            | 実行停止                 |
| `Alt+ArrowUp/Down` | 更新順の前後threadへ移動 |
| `Mod+/`            | shortcut一覧             |

IME composition中は発火しません。送信はTiptap editor自身が処理し、upload中、modal、frozen context、active responseとの競合時は無効です。既存shortcutと同時利用が必要なscopeだけ`allow`し、dialogは自身のkeyboard scopeを優先します。

## Responsiveとaccessibility

desktopは幅を保存できるpersistent pane、mobileはfull-screen sheetです。message、tool JSON、selector、policyは横overflowさせません。icon buttonはaccessible nameを持ち、statusは`role=status`、取得失敗は`role=alert`を使います。focus、keyboard resize、reduced motion、dark themeをcomponent testとPlaywrightで確認します。
