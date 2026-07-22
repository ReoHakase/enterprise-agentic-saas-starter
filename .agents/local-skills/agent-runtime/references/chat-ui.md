# Chat UI参照

- shell headerからorganization名を外し、thread selector、新規、destructive archive、closeを置く。
- selector itemへ更新日時とmessage数を表示する。
- conversationは平面、assistantは枠なし全幅、userだけbubble。話者labelを反復表示しない。
- composerはTiptapを使い、textとmentionを順序付きinline nodeとして同じdocumentへ保持する。
- permission selectはcomposer footerへ置き、icon付き`Ask always | Full access`だけを各説明付きで表示する。UI文言に`CRUD`を使わない。
- approval cardはpending tool part位置へ通常messageとして描画する。
- editorだけ最大40vh、footerはdesktopで原則1行かつ常に表示する。Enter改行、Mod+Enter送信。
- thinkingはtransient status/reasoning/canonical tool partを分け、reasoning/tool detailsは既定で閉じる。statusとtool activityを履歴へ重複保存しない。
- Issue linkは確認済みtool result/receiptのnumberだけからorganization slug付きで作る。
- mentionはcurrent page/selected Issue/Issue/file/member。青inline node、右端X。requestはlabelを送らずID/pathをserverで再解決する。
- contextは円形ringとtooltipにestimated/observedと内訳を表示する。chatにmonthly costを表示しない。

Hotkeysは`@tanstack/react-hotkeys` 0.10.0を使う。Mod+K、Mod+Enter、Mod+Shift+N、Mod+.、Alt+ArrowUp/Down、Mod+/を実装し、IME、upload、modal、既存scope競合をtestする。
