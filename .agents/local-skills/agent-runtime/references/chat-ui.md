# Chat UI参照

- shell headerからorganization名を外し、thread selector、新規、destructive archive、closeを置く。
- selector itemへ更新日時とmessage数を表示する。
- permission selectはcomposer footerへ置き、各modeの影響をitem内へ書く。UI文言に`CRUD`を使わない。
- approval cardはpending tool part位置へ通常messageとして描画する。
- textareaだけ最大40vh、footerは常に表示する。Enter改行、Mod+Enter送信。
- thinkingはstatus/reasoning/tool activityを分け、reasoning/tool detailsは既定で閉じる。
- Issue linkは確認済みtool result/receiptのnumberだけからorganization slug付きで作る。
- mentionはcurrent page/selected Issue/Issue/file/member。青chip、右端X。labelをserver dataとして信用しない。
- context meterとmonthly usage meterを別表示する。

Hotkeysは`@tanstack/react-hotkeys` 0.10.0を使う。Mod+K、Mod+Enter、Mod+Shift+N、Mod+.、Alt+ArrowUp/Down、Mod+/を実装し、IME、upload、modal、既存scope競合をtestする。
