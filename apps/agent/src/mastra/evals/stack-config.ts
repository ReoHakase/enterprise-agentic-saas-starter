import { resolve } from "node:path"

const repositoryRoot = resolve(import.meta.dirname, "../../../../..")
const apiWorkspace = resolve(repositoryRoot, "apps/api")
const agentWorkspace = resolve(repositoryRoot, "apps/agent")

export const APPLICATION_DATABASE_AUTH_TOKEN: string =
  "agent-eval-application-token"
export const AGENT_STORAGE_AUTH_TOKEN: string = "agent-eval-storage-token"

export const createAgentEvalConfigs = (input: {
  agentName: string
  availableTools: readonly string[]
  apiName: string
  apiOrigin: string
  agentDatabaseOrigin: string
  databaseOrigin: string
  namespace: string
}) => ({
  api: {
    compatibility_date: "2026-07-22",
    compatibility_flags: [
      "nodejs_compat",
      "enable_request_signal",
      "request_signal_passthrough",
    ],
    images: { binding: "IMAGES" },
    main: resolve(apiWorkspace, "src/worker.ts"),
    name: input.apiName,
    observability: { enabled: false },
    r2_buckets: [
      {
        binding: "FILES",
        bucket_name: `agent-eval-${input.namespace.slice(-32)}`,
      },
    ],
    services: [
      {
        binding: "AGENT_RUNTIME",
        entrypoint: "AgentRuntime",
        service: input.agentName,
      },
    ],
    vars: {
      AGENT_ASSET_UPLOAD_ENABLED: input.availableTools.includes(
        "add_issue_attachments"
      )
        ? "1"
        : "0",
      API_PUBLIC_URL: input.apiOrigin,
      APP_BASE_URL: input.apiOrigin,
      APP_NAME: "Enterprise Agentic SaaS Agent Eval",
      AUTH_COOKIE_DOMAIN: "127.0.0.1",
      BETTER_AUTH_SECRET:
        "agent-eval-only-secret-with-at-least-thirty-two-characters",
      BETTER_AUTH_URL: input.apiOrigin,
      CORS_ORIGIN: input.apiOrigin,
      EMAIL_FROM: "noreply@example.test",
      EMAIL_PROVIDER: "noop",
      GITHUB_CLIENT_ID: "agent-eval-unused",
      GITHUB_CLIENT_SECRET: "agent-eval-unused-secret",
      NODE_ENV: "test",
      PORT: new URL(input.apiOrigin).port,
      TRUSTED_ORIGINS: input.apiOrigin,
      TURSO_AUTH_TOKEN: APPLICATION_DATABASE_AUTH_TOKEN,
      TURSO_DATABASE_URL: input.databaseOrigin,
    },
  },
  agent: {
    compatibility_date: "2026-07-22",
    compatibility_flags: ["nodejs_compat", "enable_request_signal"],
    main: resolve(agentWorkspace, "src/mastra/worker.ts"),
    name: input.agentName,
    observability: { enabled: false },
    preview_urls: false,
    services: [
      {
        binding: "AGENT_INTERNAL_API",
        entrypoint: "AgentInternalApi",
        service: input.apiName,
      },
    ],
    vars: {
      AGENT_EVAL_ALLOWED_TOOLS: JSON.stringify(input.availableTools),
      AGENT_RUNS_ENABLED: "1",
      AGENT_VISION_ENABLED: "1",
      AGENT_WRITES_ENABLED: "1",
      MASTRA_STORAGE_AUTH_TOKEN: AGENT_STORAGE_AUTH_TOKEN,
      MASTRA_STORAGE_URL: input.agentDatabaseOrigin,
      NODE_ENV: "test",
    },
    workers_dev: false,
  },
})
