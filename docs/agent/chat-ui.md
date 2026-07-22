# Chat UI/UX

## Shellとheader

Agent shellのheaderにorganization名を表示しません。thread selector、新規thread、赤いarchive、pane closeを上部へ置きます。UI上は`thread`を使い、実装都合のデータ操作略語は使いません。

selectorはAPI順を維持し、`updatedAt DESC, id DESC`です。各itemはtitle、最終更新日時、吹き出しicon付きmessage数を表示します。archiveはdestructive styleと確認dialogを持ち、対象threadの未送信text、staged画像、upload、active responseへの影響を説明します。

## 新規thread

新規threadはDB rowを作らないlocal draftから開始します。次のどちらかで初めてthreadを作成します。

- 有意な最初のmessageを送信する
- 画像を選択してuploadを開始する

空のdraftまたは空threadには3件のsample promptを表示し、clickは送信せずcomposerを埋めます。

## Conversationとmessage part

conversation全体とcomposerを1枚の大きなCardで囲みません。conversationは平面、composerは独立した下部surfaceです。assistantは枠なし全幅、userだけを右寄せbubbleにし、各messageの`You` / `Issue agent`表示は省略してaccessible nameだけを保持します。approvalをabsolute/fixed layerやmessage末尾の別listへ移動せず、part順序を履歴の正本にします。

| part | 表示 |
| --- | --- |
| `text` | Markdown対応response |
| `reasoning` | `Thinking` details、既定で閉じる |
| transient `data-activity` | 現在turnの「応答を生成中」だけ。履歴へ保存しない |
| tool part | tool名とstate、input/output details、既定で閉じる |
| pending action tool output | そのtool位置のinline approval card |
| `source-url` | 外部link |
| `data-context-budget` | messageではなくcontext meterへ反映 |
| `data-thread-title` | title更新通知とselector再取得 |

thinkingは「transient UI status」「provider reasoning」「canonical tool part」を混同しません。toolのRunning/Completed別行を作らず、同じtool partのstate更新だけを表示します。provider非公開chain-of-thoughtを推測生成せず、providerがstreamしたbounded reasoningだけを保存・表示します。statusはfinish、error、abort、disconnectで必ず消し、reload後へ残しません。

## Composer

composerはTiptapを正本にし、textとmentionを同じdocument内で編集します。mentionは青いinline atom nodeで、右端X、Backspace/Delete、keyboard suggestion、IME、Escape、Arrow/Enterを扱います。送信時はtext/mention/画像を1つのpending snapshotへ移してeditorから即時消去し、失敗時は新しい入力を上書きしない場合だけ復元します。

permissionはicon付きselectとしてcomposer footerに置きます。

- Ask always: Issue作成・更新・削除を毎回確認
- Full access: 現在threadのIssue作成・更新・削除を確認なしで許可

時間制限や削除確認文字列はUI契約に含めません。権限はserver正本で、session、organization、context epoch、threadへ束縛し、Jotaiへ正本を置きません。

Tiptap editorだけを内容に応じて最大`40vh`まで拡張し、それ以上は内部scrollにします。attachment、permission、円形context meter、Stop/Sendはdesktopで原則1行に置き、常にviewport内へ残します。狭幅だけ折り返します。chat composerにmonthly costは表示しません。Enterは改行、Mod+Enterだけが送信です。

## Keyboard shortcuts

`@tanstack/react-hotkeys` 0.10.0をcatalog固定し、次を提供します。

| shortcut | 動作 |
| --- | --- |
| `Mod+K` | Agent pane切替 |
| `Mod+Enter` | 送信 |
| `Mod+Shift+N` | 新規thread draft |
| `Mod+.` | 実行停止 |
| `Alt+ArrowUp/Down` | 更新順の前後threadへ移動 |
| `Mod+/` | shortcut一覧 |

IME composition中は発火しません。送信shortcutはinputを無視しない設定でTiptap editor内から使えますが、upload中、modal、frozen context、active responseとの競合時は無効です。既存shortcutと同時利用が必要なscopeだけ`allow`し、dialogは自身のkeyboard scopeを優先します。

## Responsiveとaccessibility

desktopは幅を保存できるpersistent pane、mobileはfull-screen sheetです。message、tool JSON、selector、policyは横overflowさせません。icon buttonはaccessible nameを持ち、statusは`role=status`、取得失敗は`role=alert`を使います。focus、keyboard resize、reduced motion、dark themeをcomponent testとPlaywrightで確認します。
