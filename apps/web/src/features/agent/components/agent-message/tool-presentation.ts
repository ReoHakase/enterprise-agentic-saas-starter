import * as v from "valibot"

const toolTitles: Record<string, string> = {
  add_issue_attachments: "Issueへ添付を追加",
  create_issue: "Issueを作成",
  delete_issue: "Issueを削除",
  get_issue: "Issueを確認",
  read_issue_attachment_image: "添付画像を確認",
  remove_issue_attachments: "Issueの添付を削除",
  read_account_context: "アカウント情報を確認",
  read_active_organization: "組織情報を確認",
  search_issue_labels: "ラベルを検索",
  search_issues: "Issueを検索",
  search_organization_members: "メンバーを検索",
  skill: "Agentの手順を確認",
  ui_navigate: "画面を移動",
  ui_open_issue: "Issueを開く",
  ui_patch_form_draft: "フォーム下書きを更新",
  ui_read_form_draft: "フォーム下書きを確認",
  ui_set_issue_query: "Issue検索条件を更新",
  update_issue: "Issueを更新",
  web_search: "Webで検索",
}

type ToolPresentation = {
  title: string
  request?: string
  result?: string
}
type PresentationInput = {
  issueCount: number
  issueNumber?: number
  input: unknown
  output: unknown
  state: string
  toolName: string
}

const issueStatusLabels = {
  closed: "Closed",
  in_progress: "In progress",
  open: "Open",
} as const
const issuePriorityLabels = {
  high: "High",
  low: "Low",
  medium: "Medium",
  no_priority: "No priority",
  urgent: "Urgent",
} as const
const skillLabels = {
  core: "基本手順",
  "issue-triage": "Issue分析の手順",
  "issue-writing": "Issue更新の手順",
  "web-assistance": "Web調査の手順",
} as const
const searchIssuesInputSchema = v.object({
  label: v.optional(v.pipe(v.string(), v.maxLength(40))),
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50))
  ),
  priority: v.optional(
    v.picklist(["high", "low", "medium", "no_priority", "urgent"])
  ),
  search: v.optional(v.pipe(v.string(), v.maxLength(200))),
  sortBy: v.optional(
    v.picklist([
      "number",
      "createdAt",
      "updatedAt",
      "dueDate",
      "priority",
      "status",
    ])
  ),
  sortDirection: v.optional(v.picklist(["asc", "desc"])),
  status: v.optional(v.picklist(["closed", "in_progress", "open"])),
})
const issueNumberInputSchema = v.object({
  number: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
})
const skillInputSchema = v.object({
  name: v.picklist(["core", "issue-triage", "issue-writing", "web-assistance"]),
})
const organizationOutputSchema = v.object({
  name: v.pipe(v.string(), v.maxLength(200)),
})
const boundedQueryInputSchema = v.object({
  query: v.optional(v.pipe(v.string(), v.maxLength(200))),
})

const skillPresentation = ({ input, state }: PresentationInput) => {
  const parsed = v.safeParse(skillInputSchema, input)
  const label = parsed.success ? skillLabels[parsed.output.name] : undefined
  return {
    title: label ? `${label}を確認` : "Agentの手順を確認",
    request: label ? `使用する手順: ${label}` : undefined,
    result:
      state === "output-available" && label
        ? `${label}を読み込みました`
        : undefined,
  }
}

const getIssuePresentation = ({
  input,
  issueCount,
  issueNumber,
  state,
}: PresentationInput) => {
  const parsed = v.safeParse(issueNumberInputSchema, input)
  const number =
    (parsed.success ? parsed.output.number : undefined) ?? issueNumber
  return {
    title: number ? `Issue #${number}を確認` : "Issueを確認",
    request: number ? `対象: Issue #${number}` : undefined,
    result:
      state === "output-available" && issueCount > 0
        ? `結果: Issue ${issueCount}件を取得`
        : undefined,
  }
}

const searchIssuesPresentation = ({
  input,
  issueCount,
  output,
  state,
}: PresentationInput): ToolPresentation => {
  const parsed = v.safeParse(searchIssuesInputSchema, input)
  if (!parsed.success) return { title: "Issueを検索" }
  const filters = [
    parsed.output.status ? issueStatusLabels[parsed.output.status] : undefined,
    parsed.output.priority
      ? issuePriorityLabels[parsed.output.priority]
      : undefined,
    parsed.output.label ? `label:${parsed.output.label}` : undefined,
    parsed.output.search ? `“${parsed.output.search}”` : undefined,
  ].filter((value): value is string => Boolean(value))
  const sort = parsed.output.sortBy
    ? `${parsed.output.sortBy} ${parsed.output.sortDirection ?? "asc"}`
    : undefined
  const request = [
    filters.length > 0 ? `条件: ${filters.join(" · ")}` : "条件: すべてのIssue",
    sort ? `並び順: ${sort}` : undefined,
    parsed.output.limit ? `最大${parsed.output.limit}件` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ")
  const validResult = Array.isArray(output) && issueCount === output.length
  return {
    title:
      filters.length > 0 ? `${filters.join("・")}のIssueを検索` : "Issueを検索",
    request,
    result:
      state === "output-available" && validResult
        ? `結果: ${issueCount}件`
        : undefined,
  }
}

const organizationPresentation = ({
  output,
  state,
}: PresentationInput): ToolPresentation => {
  const parsed = v.safeParse(organizationOutputSchema, output)
  return {
    title: parsed.success
      ? `${parsed.output.name}の組織情報を確認`
      : "組織情報を確認",
    request: "対象: 現在の組織",
    result:
      state === "output-available" && parsed.success
        ? `結果: ${parsed.output.name}を確認`
        : undefined,
  }
}

const directoryPresentation = ({
  input,
  output,
  state,
  toolName,
}: PresentationInput): ToolPresentation => {
  const parsed = v.safeParse(boundedQueryInputSchema, input)
  return {
    title: toolTitles[toolName] ?? "Agent機能を実行",
    request:
      parsed.success && parsed.output.query
        ? `検索語: “${parsed.output.query}”`
        : "検索語: すべて",
    result:
      state === "output-available" && Array.isArray(output)
        ? `結果: ${output.length}件`
        : undefined,
  }
}

export const toolPresentation = (
  input: PresentationInput
): ToolPresentation => {
  if (input.toolName === "skill") return skillPresentation(input)
  if (input.toolName === "get_issue") return getIssuePresentation(input)
  if (input.toolName === "search_issues") return searchIssuesPresentation(input)
  if (input.toolName === "read_active_organization")
    return organizationPresentation(input)
  if (
    input.toolName === "search_issue_labels" ||
    input.toolName === "search_organization_members"
  )
    return directoryPresentation(input)
  return { title: toolTitles[input.toolName] ?? "Agent機能を実行" }
}
