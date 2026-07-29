import { db } from "@enterprise-agentic-saas/db"
import {
  getLogger,
  instrument,
  OTLPTransport,
  withNextSpan,
  type ResolveConfigFn,
} from "@inference-net/otel-cf-workers"
import { WorkerEntrypoint } from "cloudflare:workers"
import { Elysia } from "elysia"
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker"

import { createApp } from "./app"
import { handleDevelopmentFileSeedRequest } from "./development/file-seed-handler"
import { sweepAgentActions } from "./modules/agent/actions/repository"
import { createAgentInternalApp } from "./modules/agent/internal-api"
import {
  agentMaintenanceResponse,
  isAgentMaintenanceMode,
  publicAgentRuntimeGateResponse,
} from "./modules/agent/maintenance"
import {
  configureAgentRuntime,
  type AgentRuntimeBinding,
} from "./modules/agent/runtime"
import { processAgentAssetLifecycle } from "./modules/files/agent-assets-cleanup"
import { processFileCleanupJobs } from "./modules/files/cleanup-jobs"
import {
  type FileImagesBinding,
  type FileR2Bucket,
} from "./modules/files/runtime"
import { configureFileStorageRuntimeFromWorkerEnvironment } from "./modules/files/worker-runtime"
import {
  processOrganizationDeletionJobs,
  type OrganizationFilesBucket,
} from "./modules/organizations/deletion-jobs"
import { processInvitationEmailJobs } from "./modules/organizations/invitation-email-jobs"
import { processProfileImageCleanupJobs } from "./modules/profile-images/cleanup-jobs"
import { createOtelObservabilityRuntime } from "./platform/observability/otel-adapter"
import { configureObservability } from "./platform/observability/runtime"
import { withStructuredConsole } from "./platform/observability/structured-console"
import { authPlugin } from "./platform/plugins/auth"
import { corsPlugin } from "./platform/plugins/cors"
import { serverTimingPlugin } from "./platform/plugins/server-timing"

type WorkerObservabilityEnv = {
  AGENT_RUNTIME?: AgentRuntimeBinding
  AGENT_ASSET_UPLOAD_ENABLED?: string
  AGENT_MAINTENANCE_MODE?: string
  DEV_SESSION_ID?: string
  DEV_WORKTREE_ID?: string
  DEV_FILE_SEED_TOKEN?: string
  FILES: FileR2Bucket & OrganizationFilesBucket
  IMAGES: FileImagesBinding
  NODE_ENV?: string
  OTEL_EXPORTER_OTLP_ENDPOINT?: string
  TURSO_DATABASE_URL?: string
}

type WorkerExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void
}

type WorkerScheduledController = {
  cron: string
  scheduledTime: number
}

const LOCAL_OTLP_HTTP_ENDPOINT = "http://127.0.0.1:4318"

type LocalTelemetryEnvironment = {
  DEV_SESSION_ID?: string
  DEV_WORKTREE_ID?: string
  NODE_ENV?: string
  OTEL_EXPORTER_OTLP_ENDPOINT?: string
}

const resolveLocalTelemetryResource = (
  environment: LocalTelemetryEnvironment,
  serviceName: string
) => {
  const sessionId = environment.DEV_SESSION_ID?.trim()
  const worktreeId = environment.DEV_WORKTREE_ID?.trim()
  if (
    environment.NODE_ENV !== "development" ||
    environment.OTEL_EXPORTER_OTLP_ENDPOINT !== LOCAL_OTLP_HTTP_ENDPOINT ||
    !sessionId ||
    !worktreeId
  )
    return undefined
  return {
    "dev.session.id": sessionId,
    "dev.worktree.id": worktreeId,
    "service.name": serviceName,
  }
}

export const resolveWorkerOtelConfig = (
  workerEnv: LocalTelemetryEnvironment
): ReturnType<ResolveConfigFn<WorkerObservabilityEnv>> => {
  const resource = resolveLocalTelemetryResource(
    workerEnv,
    "enterprise-agentic-saas-api"
  )
  if (resource) {
    withNextSpan(resource)
    return {
      service: { name: resource["service.name"] },
      trace: {
        exporter: {
          url: `${LOCAL_OTLP_HTTP_ENDPOINT}/v1/traces`,
        },
        batching: { strategy: "immediate" },
      },
      logs: {
        batching: { strategy: "immediate" },
        instrumentation: { instrumentConsole: false },
        transports: [
          new OTLPTransport({
            url: `${LOCAL_OTLP_HTTP_ENDPOINT}/v1/logs`,
          }),
        ],
      },
    }
  }
  return { service: { name: "enterprise-agentic-saas-api" } }
}

export const createWorkerOtelConfig: ResolveConfigFn<WorkerObservabilityEnv> = (
  workerEnv
) => resolveWorkerOtelConfig(workerEnv)

const configureWorkerObservability = (workerEnv: WorkerObservabilityEnv) => {
  const resource = resolveLocalTelemetryResource(
    workerEnv,
    "enterprise-agentic-saas-api"
  )
  const runtime = createOtelObservabilityRuntime(
    "enterprise-agentic-saas-api",
    resource
  )
  configureObservability(
    resource
      ? withStructuredConsole(runtime, "enterprise-agentic-saas-api")
      : runtime
  )
}

const logScheduledFailure = (
  component: string,
  errorCode: string,
  attributes: Record<string, unknown>
) => {
  getLogger("enterprise-agentic-saas-api").error("Scheduled operation failed", {
    ...attributes,
    component,
    errorCode,
  })
}

// OpenTelemetry SDKはWorker request境界で初期化し、application portを維持する。
const worker = new Elysia({ adapter: CloudflareAdapter })
  .use(createApp(db))
  .use(authPlugin)
  .use(corsPlugin)
  .use(serverTimingPlugin)
  .compile()

const appFetch = worker.fetch.bind(worker)

const agentInternalWorker = new Elysia({ adapter: CloudflareAdapter })
  .use(createAgentInternalApp(db))
  .compile()
const agentInternalFetch = agentInternalWorker.fetch.bind(agentInternalWorker)

const instrumentedAgentInternalApi = instrument(
  {
    fetch(
      request: Request,
      workerEnv: WorkerObservabilityEnv
    ): Promise<Response> | Response {
      configureWorkerObservability(workerEnv)
      if (isAgentMaintenanceMode(workerEnv.AGENT_MAINTENANCE_MODE)) {
        return agentMaintenanceResponse()
      }
      // named entrypointはdefault/public Workerとは別isolateになり得るため、
      // asset prepare/execute/model imageの全経路でbindingを初期化する。
      configureFileStorageRuntimeFromWorkerEnvironment(workerEnv)
      return agentInternalFetch(request)
    },
  },
  createWorkerOtelConfig
)
type InstrumentedAgentInternalFetch = NonNullable<
  typeof instrumentedAgentInternalApi.fetch
>
const fetchInstrumentedAgentInternalApi = async (
  request: Parameters<InstrumentedAgentInternalFetch>[0],
  workerEnv: WorkerObservabilityEnv,
  context: Parameters<InstrumentedAgentInternalFetch>[2]
): Promise<Response> => {
  const fetchHandler = instrumentedAgentInternalApi.fetch
  if (!fetchHandler) {
    throw new Error("Instrumented internal API is missing its fetch handler")
  }
  return await fetchHandler(request, workerEnv, context)
}

export class AgentInternalApi extends WorkerEntrypoint<WorkerObservabilityEnv> {
  fetch(
    request: Parameters<InstrumentedAgentInternalFetch>[0]
  ): Promise<Response> {
    return fetchInstrumentedAgentInternalApi(request, this.env, this.ctx)
  }
}

const workerWithScheduled = {
  async fetch(
    request: Request,
    workerEnv: WorkerObservabilityEnv,
    _context: WorkerExecutionContext
  ) {
    configureWorkerObservability(workerEnv)
    const agentGateResponse = publicAgentRuntimeGateResponse(request, {
      maintenanceMode: workerEnv.AGENT_MAINTENANCE_MODE,
      runtimeAvailable: workerEnv.AGENT_RUNTIME !== undefined,
    })
    if (agentGateResponse) return agentGateResponse
    if (workerEnv.AGENT_RUNTIME) configureAgentRuntime(workerEnv.AGENT_RUNTIME)
    configureFileStorageRuntimeFromWorkerEnvironment(workerEnv)
    const seedResponse = await handleDevelopmentFileSeedRequest(
      db,
      request,
      workerEnv
    )
    return seedResponse ?? appFetch(request)
  },
  scheduled(
    _controller: WorkerScheduledController,
    workerEnv: WorkerObservabilityEnv,
    context: WorkerExecutionContext
  ) {
    configureWorkerObservability(workerEnv)
    if (isAgentMaintenanceMode(workerEnv.AGENT_MAINTENANCE_MODE)) return
    const deletionJobs = processOrganizationDeletionJobs({
      bucket: workerEnv.FILES,
      database: db,
      onFailure: ({ attempts }) => {
        logScheduledFailure("organization-deletion", "r2_cleanup_failed", {
          attempts,
        })
        console.error({
          attempts,
          component: "organization-deletion",
          errorCode: "r2_cleanup_failed",
          event: "cleanup_job_failed",
          level: "error",
        })
      },
    }).then((result) => {
      console.info({
        component: "organization-deletion",
        event: "cleanup_batch_completed",
        level: "info",
        ...result,
      })
      return result
    })
    const fileCleanupJobs = processFileCleanupJobs({
      bucket: workerEnv.FILES,
      database: db,
      onFailure: ({ attempts }) => {
        logScheduledFailure("file-cleanup", "r2_cleanup_failed", { attempts })
        console.error({
          attempts,
          component: "file-cleanup",
          errorCode: "r2_cleanup_failed",
          event: "cleanup_job_failed",
          level: "error",
        })
      },
    }).then((result) => {
      console.info({
        component: "file-cleanup",
        event: "cleanup_batch_completed",
        level: "info",
        ...result,
      })
      return result
    })
    const profileImageCleanupJobs = processProfileImageCleanupJobs({
      bucket: workerEnv.FILES,
      database: db,
      onFailure: ({ attempts }) => {
        logScheduledFailure("profile-image-cleanup", "r2_cleanup_failed", {
          attempts,
        })
        console.error({
          attempts,
          component: "profile-image-cleanup",
          errorCode: "r2_cleanup_failed",
          event: "cleanup_job_failed",
          level: "error",
        })
      },
    }).then((result) => {
      console.info({
        component: "profile-image-cleanup",
        event: "cleanup_batch_completed",
        level: "info",
        ...result,
      })
      return result
    })
    const agentAssetLifecycle = processAgentAssetLifecycle({
      bucket: workerEnv.FILES,
      database: db,
      onFailure: ({ attempts, errorCode }) => {
        logScheduledFailure("agent-asset-cleanup", errorCode, { attempts })
        console.error({
          attempts,
          component: "agent-asset-cleanup",
          errorCode,
          event: "cleanup_job_failed",
          level: "error",
        })
      },
    }).then((result) => {
      console.info({
        component: "agent-asset-cleanup",
        event: "cleanup_batch_completed",
        level: "info",
        cleanupClaimed: result.cleanup.claimed,
        cleanupCompleted: result.cleanup.completed,
        cleanupFailed: result.cleanup.failed,
        cleanupStale: result.cleanup.stale,
        expiryConsidered: result.expiry.considered,
        expiryCompleted: result.expiry.expired,
        usageBucketsDeleted: result.usagePurge.bucketsDeleted,
        usageOperationsDeleted: result.usagePurge.operationsDeleted,
      })
      return result
    })
    const invitationJobs = processInvitationEmailJobs({
      database: db,
      onFailure: ({ attempts, errorCode, retryable }) => {
        logScheduledFailure("invitation-email", errorCode, {
          attempts,
          retryable,
        })
        console.error({
          attempts,
          component: "invitation-email",
          errorCode,
          event: "delivery_job_failed",
          level: "error",
          retryable,
        })
      },
    }).then((result) => {
      console.info({
        component: "invitation-email",
        event: "delivery_batch_completed",
        level: "info",
        ...result,
      })
      return result
    })
    const agentActionSweep = sweepAgentActions(db).then((result) => {
      console.info({
        component: "agent-action-sweep",
        event: "agent_action_sweep_completed",
        level: "info",
        ...result,
      })
      return result
    })

    context.waitUntil(
      Promise.all([
        agentActionSweep,
        deletionJobs,
        fileCleanupJobs,
        profileImageCleanupJobs,
        agentAssetLifecycle,
        invitationJobs,
      ]).then(() => undefined)
    )
  },
}

export default instrument(workerWithScheduled, createWorkerOtelConfig)
