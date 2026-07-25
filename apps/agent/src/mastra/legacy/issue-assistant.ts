const retiredResponse = () =>
  new Response("Legacy Agent session retired", {
    status: 410,
    headers: {
      "cache-control": "private, no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  })

/**
 * 旧Agents SDK chatのSQLite Durable Object namespaceを保持するretention class。
 *
 * public routeやService Bindingからこのclassを参照せず、新規trafficはMastraの
 * `AgentRuntime`だけへ流す。既存namespaceを明示的にexportまたは廃棄するまで
 * Wrangler migration v1とclass exportを残し、暗黙のdata deletionを防ぐ。
 */
export class IssueAssistant {
  fetch(_request: Request): Response {
    return retiredResponse()
  }
}
