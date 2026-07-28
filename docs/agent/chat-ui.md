---
title: 製品AgentのChat UI/UX
status: accepted
implementation: active
last_reviewed: 2026-07-25
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
| `reasoning`                | productionでは送信、保存、表示しない              |
| transient `data-activity`  | 現在turnの「応答を生成中」だけ。履歴へ保存しない  |
| tool part                  | tool名とstate、安全なschema検証済みprojectionだけ |
| pending action tool output | そのtool位置のinline approval card                |
| `source-url`               | 外部link                                          |
| `data-context-budget`      | messageではなくcontext meterへ反映                |
| `data-thread-title`        | title更新通知とselector再取得                     |

thinkingは「transient UI status」「provider reasoning」「canonical tool part」を混同しません。toolのRunning/Completed別行を作らず、同じtool partのstate更新だけを表示します。provider非公開chain-of-thoughtを推測生成せず、raw reasoning partをproduction stream、Storage、UIへ出しません。statusはfinish、error、abort、disconnectで必ず消し、reload後へ残しません。

toolのraw input/outputは折りたたみdetailsを含めてchat UIへ表示しません。各tool固有schemaで検証した公開projectionだけを表示し、tenant識別子、credential、provider payload、private URL、内部errorを汎用rendererへ渡しません。

### Scroll追従とminimap

desktop Agent paneとmobile full-screen sheetのconversationは、thread表示時に末尾から開始します。末尾との距離が96px以内なら追従中とみなし、message追加、streaming、画像読込、composerを含む周辺layoutのresizeで高さが変わったときも、次のanimation frameで末尾へ即時移動します。ただし利用者が上方向へscrollした時点で、96px以内でも追従を即時解除します。下方向へ末尾付近へ戻したときだけ再開し、履歴閲覧中の位置を新しいresponseで上書きしません。smooth scrollは使いません。

minimapはuser messageから次のuser message直前までを1 turnとして、2 turn以上あるshell conversationの右端中央へcompactなoverlayとして表示します。専用Agent pageには表示しません。markerはturn順に等間隔で並べ、conversation全高に比例した余白やmessage側の専用paddingを取りません。現在turnはviewport上端から1/3の位置を基準にし、markerは右端を起点として通常16px、現在・hover・focus時は1.5倍の24pxへ150msのtransform transitionで伸ばします。reduced motionでは即時切り替え、native scrollbarは残します。

各markerはturn番号とuser promptをaccessible nameに持ち、現在位置には`aria-current="location"`を付けます。hover/focus previewはmarkerの左側へ開き、user prompt、直後のassistant本文、画像・context・tool件数を保存済みmessage partからローカル生成します。添付だけのturnにもfallback labelを与えます。clickまたはEnterはturn先頭へ即時移動します。preview幅はmobile viewport内へ収め、dark themeでも同じ情報階層を維持します。

## Composer

composerはTiptapを正本にし、textとmentionを同じdocument内で編集します。mentionは青いinline atom nodeで、右端X、Backspace/Delete、keyboard suggestion、IME、Escape、Arrow/Enterを扱います。送信時はtext/mention/画像を1つのpending snapshotへ移してeditorから即時消去し、失敗時は新しい入力を上書きしない場合だけ復元します。

permissionはicon付きselectとしてcomposer footerに置きます。表示専用のcontrolled selectとserver-backed更新を分離し、新規draftではlocal state、既存threadではserver stateを接続します。

- Ask always: Issue作成・更新・削除を毎回確認
- Full access: 現在threadのIssue作成・更新・削除を確認なしで許可

時間制限や削除確認文字列はUI契約に含めません。権限はserver正本で、session、organization、context epoch、threadへ束縛し、Jotaiへ正本を置きません。

Tiptap editorだけを内容に応じて最大`40vh`まで拡張し、それ以上は内部scrollにします。attachment、permission、円形context meter、Stop/Sendはdesktopで原則1行に置き、常にviewport内へ残します。狭幅だけ折り返します。chat composerにmonthly costは表示しません。Enterは改行、Mod+Enterだけが送信です。

## Keyboard shortcuts

`@tanstack/react-hotkeys` 0.10.0をcatalog固定し、次を提供します。

| shortcut           | 動作                     |
| ------------------ | ------------------------ |
| `Mod+K`            | Agent pane切替           |
| `Mod+Enter`        | 送信                     |
| `Mod+Shift+N`      | 新規thread draft         |
| `Mod+.`            | 実行停止                 |
| `Alt+ArrowUp/Down` | 更新順の前後threadへ移動 |
| `Mod+/`            | shortcut一覧             |

IME composition中は発火しません。送信shortcutはinputを無視しない設定でTiptap editor内から使えますが、upload中、modal、frozen context、active responseとの競合時は無効です。既存shortcutと同時利用が必要なscopeだけ`allow`し、dialogは自身のkeyboard scopeを優先します。

## Responsiveとaccessibility

desktopは幅を保存できるpersistent pane、mobileはfull-screen sheetです。message、tool JSON、selector、policyは横overflowさせません。icon buttonはaccessible nameを持ち、statusは`role=status`、取得失敗は`role=alert`を使います。focus、keyboard resize、reduced motion、dark themeをcomponent testとPlaywrightで確認します。
