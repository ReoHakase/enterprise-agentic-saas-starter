# Agent test参照

deterministic testは文面でなくschema、tool call、stream part、DB state、安全境界をassertする。API/DBはtenant、thread作成と初期permissionのtransaction、permission mode既定値/invalid値/context epoch、title state/revision CAS、auto/manual競合、context compaction、usage idempotency/pricing、historical approvalを含める。Agentは専用title Agent、natural Web検索、一般化、secret/PII/ID拒否、transient status、observability scrub、usage正規化を含める。Webは未選択/stale/archive後の新規composer、sample prompt、新規permission/mention snapshot、作成失敗時のdraft保持、inline approval、trace重複なし、Tiptap mentionの順序/削除/復元/reload、observed/estimated context ringと狭幅overflow、shortcut、IME、desktop/mobileを含める。

paid E2Eはreal Better Auth、temporary Turso、API/Agent Service Binding、OpenRouter Qwen3.6 Flashを使う。renameを依頼しない自動titleと、1 message内の画像upload→自然な公開Web検索→画像付きIssue作成を必須journeyにし、tool inputとDB Issue/file/claimをassertする。response本文やsecretをartifactへ出さない。実modelの1 runは5分budgetを使い切ることがあるため、stream closeやSend再有効化の待機は5分より短くせず6分を許容する。release evalは各scenarioを3回、全試行成功が必要。provider障害を合格へ数えない。

完了条件は`docs/agent/testing.md`の全command、skill validation、docs link/禁止用語checkにwarning・flaky・未説明のskipがないこと。
