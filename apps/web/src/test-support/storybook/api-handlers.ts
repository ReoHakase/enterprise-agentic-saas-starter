import { delay, http, HttpResponse } from "msw"

const imagePlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#e2e8f0"/></svg>`

const imageResponse = () =>
  HttpResponse.text(imagePlaceholder, {
    headers: { "Content-Type": "image/svg+xml" },
  })

export const storybookApiHandlers = [
  http.get("*/issues", () =>
    HttpResponse.json({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
    })
  ),
  http.get("*/issues/labels", () => HttpResponse.json({ items: [] })),
  http.get("*/issues/:issueId/thumbnail", () =>
    HttpResponse.json({ mode: "automatic", file: null })
  ),
  http.get("*/organizations/:organizationId/members", () =>
    HttpResponse.json([])
  ),
  http.get("*/me/sessions", () => HttpResponse.json([])),
  http.get("*/auth/get-session", () =>
    HttpResponse.json({
      session: { token: "session_storybook" },
      user: { id: "user_storybook" },
    })
  ),
  http.get("*/auth/list-accounts", () => HttpResponse.json([])),
  http.get("*/auth/passkey/list-user-passkeys", () => HttpResponse.json([])),
  http.get("*/auth/multi-session/list-device-sessions", () =>
    HttpResponse.json([])
  ),
  http.get("*/files/organizations/:organizationId/owners/issue/:issueId", () =>
    HttpResponse.json({ items: [], nextCursor: null })
  ),
  http.get(
    "*/files/organizations/:organizationId/:fileId/preview/:size",
    imageResponse
  ),
  http.get(
    "*/files/organizations/:organizationId/agent-assets/:assetId/preview/:size",
    imageResponse
  ),
  http.get("*/agent/actions/action-loading", async () => {
    await delay("infinite")
    return HttpResponse.json({})
  }),
  http.get("*/agent/threads/:threadId/context", ({ params }) =>
    HttpResponse.json({
      threadId: String(params.threadId),
      messageCount: 0,
      estimatedHistoryTokens: 0,
      latestSummaryThroughSequence: null,
      latestSummaryEstimatedTokens: null,
    })
  ),
  http.get("*/agent/threads/:threadId/messages", () =>
    HttpResponse.json({
      messages: [],
      total: 0,
      page: 0,
      perPage: 100,
      hasMore: false,
    })
  ),
  http.get("*/agent/threads/:threadId/permission", () =>
    HttpResponse.json({
      mode: "ask_always",
      permissions: {
        createIssue: false,
        updateIssue: false,
        deleteIssue: false,
      },
    })
  ),
  http.get("*/agent/threads", () => HttpResponse.json([])),
]
