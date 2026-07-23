# Chat UI参照

- shell headerからorganization名を外し、thread selector、新規、destructive archive、closeを置く。
- selector itemへ更新日時とmessage数を表示する。
- `agentThread`未指定、missing、archivedならURLを正規化し、選択要求画面ではなく入力欄とsample promptを持つlocal `New conversation`を表示する。sample promptだけではrowを作らない。
- conversationは平面、assistantは枠なし全幅、userだけbubble。話者labelを反復表示しない。
- composerはTiptapを使い、textとmentionを順序付きinline nodeとして同じdocumentへ保持する。
- 新規draftにもcurrent page/Issue/memberのmention候補を渡し、初回thread作成後へplain textでなくTiptap snapshotを一度だけ引き継ぐ。作成失敗時はtext、mention、permissionをlocalに残す。
- permission selectはcomposer footerへ置き、icon付き`Ask always | Full access`だけを各説明付きで表示する。表示部品をserver制御から分離し、新規draftはAsk alwaysをlocal既定値にする。thread作成とsession/user/organization/context epochへ束縛した初期permissionは同一transactionで保存する。UI文言に`CRUD`を使わない。
- approval cardはpending tool part位置へ通常messageとして描画する。
- editorだけ最大40vh、footerはdesktopで原則1行かつ常に表示する。Enter改行、Mod+Enter送信。
- thinkingはtransient status/reasoning/canonical tool partを分け、reasoning/tool detailsは既定で閉じる。statusとtool activityを履歴へ重複保存しない。
- Issue linkは確認済みtool result/receiptのnumberだけからorganization slug付きで作る。
- mentionはcurrent page/selected Issue/Issue/file/member。青inline node、右端X。requestはlabelを送らずID/pathをserverで再解決する。
- context ringはprovider実績があれば直前requestのactualを主表示と色判定に使う。estimateは`Preflight estimate`と`Estimated breakdown`へ分離し、実績がない場合だけ明示的にfallbackする。tooltipは単一block wrapperでviewport内に収める。chatにmonthly costを表示しない。

Hotkeysは`@tanstack/react-hotkeys` 0.10.0を使う。Mod+K、Mod+Enter、Mod+Shift+N、Mod+.、Alt+ArrowUp/Down、Mod+/を実装し、IME、upload、modal、既存scope競合をtestする。
