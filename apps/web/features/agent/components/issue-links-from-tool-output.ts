export const issueLinksFromToolOutput = (toolName: string, output: unknown) => {
  if (
    toolName !== "get_issue" &&
    toolName !== "search_issues" &&
    toolName !== "create_issue" &&
    toolName !== "update_issue"
  )
    return []
  const rawCandidates = Array.isArray(output) ? output : [output]
  const candidates = rawCandidates.flatMap((candidate) => {
    if (
      (toolName === "create_issue" || toolName === "update_issue") &&
      candidate &&
      typeof candidate === "object"
    ) {
      const issue = Reflect.get(candidate, "issue")
      return issue && typeof issue === "object" ? [issue] : []
    }
    return [candidate]
  })
  return candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return []
    const number = Reflect.get(candidate, "number")
    const title = Reflect.get(candidate, "title")
    return Number.isInteger(number) && Number(number) > 0
      ? [
          {
            number: Number(number),
            title: typeof title === "string" ? title : `Issue #${number}`,
          },
        ]
      : []
  })
}
