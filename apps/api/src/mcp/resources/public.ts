import type {
  MCPServerResourceContent,
  MCPServerResources,
  Resource,
} from "@mastra/mcp"

const issueGuideUri = "guide://enterprise-agentic-saas/issues"
const attachmentGuideUri = "guide://enterprise-agentic-saas/attachments"

const resources = [
  {
    uri: issueGuideUri,
    name: "Issue workflow guide",
    description:
      "Read-only guidance for finding and safely changing organization Issues.",
    mimeType: "text/markdown",
  },
  {
    uri: attachmentGuideUri,
    name: "Issue attachment guide",
    description:
      "Read-only guidance for uploading and attaching files to an Issue.",
    mimeType: "text/markdown",
  },
] satisfies Resource[]

const contents = new Map<string, MCPServerResourceContent>([
  [
    issueGuideUri,
    {
      text: [
        "# Issue workflow",
        "",
        "The catalog is filtered by this credential's scopes. Use only tools returned by `tools/list`; the steps below apply when the corresponding tool is available.",
        "All tools operate only in the organization chosen during OAuth authorization; organization identifiers are not tool input.",
        "",
        "1. When available, call `read_active_organization` to confirm the current role and permissions.",
        "2. When available, use `search_issues`, `search_issue_labels`, and `search_organization_members` before writing.",
        "3. When available, use `create_issue` with a stable idempotency key when no matching Issue exists.",
        "4. Call `get_issue` immediately before `update_issue` or `delete_issue` when those tools are available, then pass its exact revision.",
        "5. Treat a conflict as a signal to read the Issue again and review the new state before retrying.",
        "",
        "Do not include credentials or confidential links in tool input.",
      ].join("\n"),
    },
  ],
  [
    attachmentGuideUri,
    {
      text: [
        "# Issue attachment workflow",
        "",
        "The catalog is filtered by this credential's scopes. Use only the upload, status, attach, or detach tools returned by `tools/list`.",
        "1. When available, call `create_attachment_upload_session` with filename, media type, byte length, and a stable idempotency key.",
        "2. Send the exact bytes to the returned short-lived upload URL with the same bearer credential, media type, and byte length.",
        "3. When available, call `get_attachment_upload_status` until the upload is ready.",
        "4. Read the latest Issue revision, then call `add_issue_attachments` when that tool is available.",
        "5. To detach a file, read the latest revision and call `remove_issue_attachments` when that tool is available.",
        "",
        "Upload URLs are temporary and single-use. Do not embed file bytes in a tool call.",
      ].join("\n"),
    },
  ],
])

export const publicMcpResources: MCPServerResources = {
  listResources: async () => resources,
  getResourceContent: async ({ uri }) => {
    const content = contents.get(uri)
    if (!content) throw new Error("Public guide not found")
    return content
  },
}
