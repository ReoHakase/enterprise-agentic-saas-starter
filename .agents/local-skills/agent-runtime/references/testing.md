# Agent test参照

deterministic testは文面でなくschema、tool call、stream part、DB state、安全境界をassertする。API/DBはtenant、title CAS、context compaction、usage idempotency/pricing、historical approvalを含める。Agentはnatural Web検索、一般化、secret/PII/ID拒否、observability scrub、usage正規化を含める。Webはinline approval、trace、mention、draft、height、shortcut、IME、desktop/mobileを含める。

paid E2Eはreal Better Auth、temporary Turso、API/Agent Service Binding、OpenRouter Qwen3.6 Flashを使う。response本文やsecretをartifactへ出さない。release evalは各scenarioを3回、全試行成功が必要。provider障害を合格へ数えない。

完了条件は`docs/agent/testing.md`の全command、skill validation、docs link/禁止用語checkにwarning・flaky・未説明のskipがないこと。
