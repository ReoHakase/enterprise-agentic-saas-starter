import { createSkill } from "@mastra/core/skills"

export const issueTriageSkill = createSkill({
  name: "issue-triage",
  description:
    "画像や依頼文からIssue候補を整理し、既存ラベル、担当者、期限を安全に提案するときに使う。",
  instructions: `
# Issue triage

1. 画像と依頼文から確認できる事実と推測を分ける。
2. 重複の可能性があれば active organization 内の Issue を検索する。
3. ラベルと担当者は検索 tool が返した候補だけを使用する。名前から ID を作らない。
4. 期限はユーザーの timezone を基準に ISO 8601 へ正規化し、不明なら確認する。
5. 画像の asset ID は、サーバーが現在のメッセージまたは同じthreadの再利用可能一覧へ付与したexact IDだけを使う。過去画像はユーザーが明示的に指した場合だけ選び、filenameやhistoryからIDを推測しない。
6. 重要情報が不足する場合は、勝手に補完せず短い確認質問を返す。
`,
})
