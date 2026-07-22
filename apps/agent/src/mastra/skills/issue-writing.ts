import { createSkill } from "@mastra/core/skills"

export const issueWritingSkill = createSkill({
  name: "issue-writing",
  description:
    "Issueの作成、更新、削除を準備し、承認を伴う書き込みを正確に実行するときに使う。",
  instructions: `
# Issue write operations

- create、update、delete は専用 tool だけで行う。
- tool が approval-required preview を返したら、実行済みと表現せず承認待ちであることを伝える。
- Yes/No の選択後に再開された結果だけを最終結果として扱う。
- update と delete では tool が要求する expected revision を維持し、競合時に再試行で上書きしない。
- 自動許可の場合も tool の policy 判定を迂回しない。
- 一度の依頼で必要な変更だけを行い、account や organization 設定へ拡張しない。
`,
})
