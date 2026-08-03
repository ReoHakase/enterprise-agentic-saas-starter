import type { MCPServerPrompts } from "@mastra/mcp"

const TRIAGE_ISSUE_PROMPT = "triage_issue"
const maximumRequestLength = 4_000

const prompt = {
  name: TRIAGE_ISSUE_PROMPT,
  description:
    "Plan and carry out an Issue change in the currently authorized organization.",
  arguments: [
    {
      name: "request",
      description: "The Issue task the user wants to complete.",
      required: true,
    },
  ],
}

const requestArgument = (args: unknown) => {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new Error("A request argument is required")
  }
  const request = Reflect.get(args, "request")
  if (
    typeof request !== "string" ||
    request.trim().length === 0 ||
    request.length > maximumRequestLength
  ) {
    throw new Error("A valid request argument is required")
  }
  return request.trim()
}

export const publicMcpPrompts: MCPServerPrompts = {
  listPrompts: async () => [prompt],
  getPromptMessages: async ({ args, name }) => {
    if (name !== TRIAGE_ISSUE_PROMPT) {
      throw new Error("Public prompt not found")
    }
    const request = requestArgument(args)
    return [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "Work only in the organization selected during OAuth authorization.",
            "Read the organization context before changing an Issue, search before creating duplicates, and read the latest Issue revision before an update or delete.",
            "For every write, use a stable idempotency key for the same intended operation and never reuse it for different input.",
            "Summarize the intended change for the user before a destructive operation. Do not place credentials or confidential links in Issue fields.",
            `User request: ${request}`,
          ].join("\n"),
        },
      },
    ]
  },
}
