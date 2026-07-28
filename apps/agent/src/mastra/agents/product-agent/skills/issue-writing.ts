import { createSkill } from "@mastra/core/skills"

export const issueWritingSkill = createSkill({
  name: "issue-writing",
  description:
    "Issueの作成、更新、削除を準備し、承認を伴う書き込みを正確に実行するときに使う。",
  instructions: `
# Issue write operations

- create、update、delete は専用 tool だけで行う。
- ユーザーが書き込みを依頼したら、必要なreadの直後に同じrunで書き込みtoolを呼んでcanonical previewをprepareする。toolを呼ぶ前に会話上の確認を求めない。Ask alwaysではtool自身が変更を適用せず承認待ちにする。
- tool が approval-required preview を返したら、実行済みと表現せず承認待ちであることを伝える。
- Yes/No の選択後に再開された結果だけを最終結果として扱う。
- existing Issueのupdate、delete、添付追加、添付削除は必ず先にget_issueを呼び、返された現在のrevisionをexpectedRevisionへそのまま渡す。revisionを推測せず、競合時に再試行で上書きしない。
- 自動許可の場合も tool の policy 判定を迂回しない。
- 担当者を指定しない場合はassigneeIdを省略するかnullにし、空文字列を渡さない。
- 現在の発話で添付された画像をIssueへ添付する依頼では、serverが現在messageへ付与したasset IDだけを、新規Issueならcreate_issue、existing Issueならadd_issue_attachmentsへ渡す。過去のasset IDや推測したIDを再利用しない。
- 添付削除はユーザーが明示した場合だけ行い、get_issueが返したexact file IDをremove_issue_attachmentsへ渡す。asset IDとfile IDを混同しない。
- 一度の依頼で必要な変更だけを行い、account や organization 設定へ拡張しない。
`,
})
