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

userとassistant messageは通常flow内へ表示します。approvalをabsolute/fixed layerやmessage末尾の別listへ移動しません。part順序が履歴の正本です。

| part | 表示 |
| --- | --- |
| `text` | Markdown対応response |
| `reasoning` | `Thinking` details、既定で閉じる |
| `data-activity` | status、tool activity、失敗状態 |
| tool part | tool名とstate、input/output details、既定で閉じる |
| pending action tool output | そのtool位置のinline approval card |
| `source-url` | 外部link |
| `data-context-budget` | messageではなくcontext meterへ反映 |
| `data-thread-title` | title更新通知とselector再取得 |

thinkingは「UI status」「provider reasoning」「観測済みtool/activity」を混同しません。provider非公開chain-of-thoughtを推測生成せず、providerがstreamしたbounded reasoningだけを保存・表示します。

## Composer

permission policyはcomposer footerに置きます。

- 毎回確認
- 15分間、Issue作成・更新を許可
- 15分間、Issue作成・更新・削除を許可

select item内に影響を説明し、削除許可は`ALLOW_ISSUE_DELETE`の明示確認を維持します。policyはserver正本で、Jotaiへ正本を置きません。

textareaだけを内容に応じて最大`40vh`まで拡張し、それ以上は内部scrollにします。attachment、policy、context/usage meter、Stop/Sendは常にviewport内へ残します。Enterは改行、Mod+Enterだけが送信です。

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

IME composition中は発火しません。送信shortcutはinputを無視しない設定でtextarea内から使えますが、upload中、modal、frozen context、active responseとの競合時は無効です。既存shortcutと同時利用が必要なscopeだけ`allow`し、dialogは自身のkeyboard scopeを優先します。

## Responsiveとaccessibility

desktopは幅を保存できるpersistent pane、mobileはfull-screen sheetです。message、tool JSON、selector、policyは横overflowさせません。icon buttonはaccessible nameを持ち、statusは`role=status`、取得失敗は`role=alert`を使います。focus、keyboard resize、reduced motion、dark themeをcomponent testとPlaywrightで確認します。
