import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

const telemetry = vi.hoisted(() => ({
  reportDevelopmentCauseChain:
    vi.fn<(environment: unknown, label: string, cause: unknown) => void>(),
}))

vi.mock("../adapters/telemetry/development-error", () => ({
  reportDevelopmentCauseChain: telemetry.reportDevelopmentCauseChain,
}))

import { createAgentRuntimeComposition } from "../composition/runtime-composition"
import {
  approvedIssueActionExecutionRegistry,
  executionRegistry,
  mastra,
} from "../index"
import {
  createNativeControlPlane,
  nativeRuntimeEnvironment,
} from "../test-support/native-runtime"
import { suspendApprovedIssueAction } from "../workflows/approved-issue-action"
import type { AgentControlPlanePort } from "./ports"
import { resumeIssueAction } from "./resume-action"
import {
  handleAgentRuntimeRequest,
  type AgentRuntimeDependencies,
} from "./run-agent"

const RESUME_TICKET = "ticket_0123456789abcdefghijklmnopqrstuvwxyz"
const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"
let workflowError: ReturnType<typeof vi.spyOn>

beforeAll(() => {
  workflowError = vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterAll(() => workflowError.mockRestore())

beforeEach(() => {
  telemetry.reportDevelopmentCauseChain.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

type ResumeApi = Pick<
  AgentControlPlanePort,
  "cancelRun" | "executeApprovedAction" | "finishRun" | "resumeApprovedAction"
>

const actionId = () => `action_${crypto.randomUUID().replaceAll("-", "")}`

const harness = (id: string) => {
  const cancelRun = vi.fn<ResumeApi["cancelRun"]>().mockResolvedValue({
    runId: "run_2",
    status: "canceled",
  })
  const resumeApprovedAction = vi
    .fn<ResumeApi["resumeApprovedAction"]>()
    .mockResolvedValue({
      attempt: 1,
      expiresAt: "2999-07-22T00:00:00.000Z",
      grant: RUN_GRANT,
      rootRunId: "root_1",
      runId: "run_2",
      shouldGenerateTitle: false,
    })
  const executeApprovedAction = vi
    .fn<ResumeApi["executeApprovedAction"]>()
    .mockResolvedValue({
      actionId: id,
      issue: { deleted: false, id: "issue_1", number: 1, revision: 1 },
      kind: "create_issue",
      status: "succeeded",
    })
  const finishRun = vi.fn<ResumeApi["finishRun"]>().mockResolvedValue({
    runId: "run_2",
    status: "completed",
  })
  return {
    api: {
      cancelRun,
      executeApprovedAction,
      finishRun,
      resumeApprovedAction,
    },
    executeApprovedAction,
    finishRun,
    resumeApprovedAction,
  }
}

const enabled = { runs: true, vision: true, writes: true }
const dependencies = (
  api: ResumeApi,
  features = enabled,
  signal = new AbortController().signal
) => ({
  api,
  executionRegistry: approvedIssueActionExecutionRegistry,
  features,
  mastra,
  signal,
})
const resumeRequest = (id: string, signal?: AbortSignal) =>
  new Request("https://agent.internal/actions/resume", {
    body: JSON.stringify({ actionId: id, resumeTicket: RESUME_TICKET }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal,
  })
type ApprovalRuntimeInitialize = ReturnType<
  AgentRuntimeDependencies["createApprovalResumeRuntime"]
>["initialize"]
const runtimeDependencies = (
  api: AgentControlPlanePort,
  close: () => Promise<void>,
  captureFailure = vi.fn<AgentRuntimeDependencies["captureFailure"]>(),
  initialize: ApprovalRuntimeInitialize = () =>
    Promise.resolve({
      executionRegistry: approvedIssueActionExecutionRegistry,
      mastra,
    })
) =>
  ({
    captureFailure,
    createApprovalResumeRuntime: () => ({
      initialize,
      storage: { close },
    }),
    createControlPlane: () => api,
    executionRegistry,
    mastra,
    requireModelCredential: false,
    toControlFailure: () => null,
  }) satisfies AgentRuntimeDependencies

const runtimeContext = () => {
  const pending: Promise<unknown>[] = []
  return {
    context: {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise)
      },
    },
    pending,
  }
}

describe("resumeIssueAction", () => {
  it("requires fail-closed run/write switches", async () => {
    const id = actionId()
    for (const features of [
      { runs: false, vision: true, writes: true },
      { runs: true, vision: true, writes: false },
    ]) {
      const test = harness(id)
      // The global workflow registry is intentionally exercised sequentially.
      // eslint-disable-next-line no-await-in-loop
      await expect(
        resumeIssueAction(
          { actionId: id, resumeTicket: RESUME_TICKET },
          dependencies(test.api, features)
        )
      ).rejects.toThrow("Issue action resume is unavailable")
      expect(test.resumeApprovedAction).not.toHaveBeenCalled()
    }
  })

  it("requires a persisted suspended state before consuming a ticket", async () => {
    const id = actionId()
    const test = harness(id)
    await expect(
      resumeIssueAction(
        { actionId: id, resumeTicket: RESUME_TICKET },
        dependencies(test.api)
      )
    ).rejects.toThrow("Issue action resume is unavailable")
    expect(test.resumeApprovedAction).not.toHaveBeenCalled()
    expect(test.executeApprovedAction).not.toHaveBeenCalled()
  })

  it("persists only JSON-safe approval identity and no runtime credential", async () => {
    const id = actionId()
    await suspendApprovedIssueAction(mastra, id)
    const state = await mastra
      .getWorkflow("approvedIssueActionWorkflow")
      .getWorkflowRunById(id)
    const serialized = JSON.stringify(state)

    expect(serialized).toContain(id)
    for (const secret of [RESUME_TICKET, RUN_GRANT, "OPENROUTER_API_KEY"]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it("keeps secret-bearing runtime closures out of the reopened raw workflow snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mastra-snapshot-"))
    const databasePath = join(directory, "workflow.db")
    const secrets = {
      ticket: "ticket_snapshot_secret_0123456789abcdefghijklmnopqrstuvwxyz",
      grant: "grant_snapshot_secret_0123456789abcdefghijklmnopqrstuvwxyz",
      providerKey: "provider_snapshot_secret_0123456789",
      privateUrl: "https://private.invalid/snapshot-object-secret",
      clientMarker: "client_snapshot_secret_marker",
      functionMarker: "function_snapshot_secret_marker",
    }
    const composition = createAgentRuntimeComposition({
      ...process.env,
      MASTRA_STORAGE_URL: `file:${databasePath}`,
      NODE_ENV: "test",
      OPENROUTER_API_KEY: secrets.providerKey,
    })
    const id = actionId()
    const privateClient = () =>
      `${secrets.privateUrl}:${secrets.clientMarker}:${secrets.functionMarker}`
    const reportFailure = vi.fn<(cause: unknown) => void>()
    const api = {
      cancelRun: async () => ({
        runId: secrets.functionMarker,
        status: "canceled" as const,
      }),
      executeApprovedAction: async () => {
        throw new Error(privateClient())
      },
      finishRun: async () => ({
        runId: secrets.grant,
        status: "completed" as const,
      }),
      resumeApprovedAction: async () => ({
        attempt: 1,
        expiresAt: "2999-07-22T00:00:00.000Z",
        grant: secrets.grant,
        rootRunId: secrets.clientMarker,
        runId: secrets.functionMarker,
        shouldGenerateTitle: false,
      }),
    }

    try {
      expect(privateClient()).toContain(secrets.privateUrl)
      expect(await api.resumeApprovedAction()).toMatchObject({
        grant: secrets.grant,
        rootRunId: secrets.clientMarker,
      })
      await suspendApprovedIssueAction(composition.mastra, id)
      const resumeRuntimeLease = composition.createApprovalResumeRuntime()
      const resumeRuntime = await resumeRuntimeLease.initialize()
      try {
        await expect(
          resumeIssueAction(
            { actionId: id, resumeTicket: secrets.ticket },
            {
              api,
              executionRegistry: resumeRuntime.executionRegistry,
              features: enabled,
              mastra: resumeRuntime.mastra,
              reportFailure,
              signal: new AbortController().signal,
            }
          )
        ).rejects.toThrow("Issue action resume is unavailable")
      } finally {
        await resumeRuntimeLease.storage.close()
      }
      expect(reportFailure).toHaveBeenCalledWith(
        expect.objectContaining({ message: privateClient() })
      )
      await composition.storage.close()

      const reopened = new DatabaseSync(databasePath, { readOnly: true })
      const tableNames = reopened
        .prepare(
          "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'"
        )
        .all()
        .flatMap((row) => (typeof row.name === "string" ? [row.name] : []))
      const rawSnapshot = JSON.stringify(
        Object.fromEntries(
          tableNames.map((name) => [
            name,
            reopened
              .prepare(`select * from "${name.replaceAll('"', '""')}"`)
              .all(),
          ])
        )
      )
      reopened.close()

      expect(rawSnapshot).toContain(id)
      for (const secret of Object.values(secrets)) {
        expect(rawSnapshot).not.toContain(secret)
      }
    } finally {
      await composition.storage.close().catch(() => undefined)
      await rm(directory, { force: true, recursive: true })
    }
  })

  it("reopens and resumes a persisted approval with a fresh request runtime", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mastra-resume-"))
    const databasePath = join(directory, "workflow.db")
    const environment = {
      ...process.env,
      MASTRA_STORAGE_URL: `file:${databasePath}`,
      NODE_ENV: "test",
    }
    const id = actionId()
    const composition = createAgentRuntimeComposition(environment)
    let reopenedComposition:
      | ReturnType<typeof createAgentRuntimeComposition>
      | undefined

    try {
      await suspendApprovedIssueAction(composition.mastra, id)
      await composition.storage.close()

      reopenedComposition = createAgentRuntimeComposition(environment)
      const resumeRuntimeLease =
        reopenedComposition.createApprovalResumeRuntime()
      const resumeRuntime = await resumeRuntimeLease.initialize()
      try {
        expect(resumeRuntime.mastra).not.toBe(reopenedComposition.mastra)
        expect(resumeRuntimeLease.storage).not.toBe(reopenedComposition.storage)
        const identityRuntimeLease =
          reopenedComposition.createApprovalResumeRuntime()
        const identityRuntime = await identityRuntimeLease.initialize()
        try {
          expect(identityRuntime.mastra).not.toBe(resumeRuntime.mastra)
          expect(identityRuntimeLease.storage).not.toBe(
            resumeRuntimeLease.storage
          )
        } finally {
          await identityRuntimeLease.storage.close()
        }

        const test = harness(id)
        const receipt = await resumeIssueAction(
          { actionId: id, resumeTicket: RESUME_TICKET },
          {
            api: test.api,
            executionRegistry: resumeRuntime.executionRegistry,
            features: enabled,
            mastra: resumeRuntime.mastra,
            signal: new AbortController().signal,
          }
        )

        expect(test.resumeApprovedAction).toHaveBeenCalledOnce()
        expect(test.executeApprovedAction).toHaveBeenCalledOnce()
        expect(test.finishRun).toHaveBeenCalledOnce()
        expect(receipt).toMatchObject({ actionId: id, status: "succeeded" })
      } finally {
        await resumeRuntimeLease.storage.close()
      }
    } finally {
      await composition.storage.close().catch(() => undefined)
      await reopenedComposition?.storage.close().catch(() => undefined)
      await rm(directory, { force: true, recursive: true })
    }
  })
})

describe("approval resume request lifecycle", () => {
  it("closes the request storage after a successful runtime resume", async () => {
    const id = actionId()
    const test = harness(id)
    const close = vi.fn<() => Promise<void>>().mockResolvedValue()
    const runtime = runtimeContext()
    await suspendApprovedIssueAction(mastra, id)

    const response = await handleAgentRuntimeRequest(
      resumeRequest(id),
      nativeRuntimeEnvironment,
      runtime.context,
      runtimeDependencies({ ...createNativeControlPlane(), ...test.api }, close)
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      actionId: id,
      status: "succeeded",
    })
    await Promise.all(runtime.pending)
    expect(close).toHaveBeenCalledOnce()
  })

  it("closes the request storage after a failed runtime resume", async () => {
    const id = actionId()
    const close = vi.fn<() => Promise<void>>().mockResolvedValue()
    const captureFailure = vi.fn<AgentRuntimeDependencies["captureFailure"]>()
    const runtime = runtimeContext()
    await suspendApprovedIssueAction(mastra, id)

    const response = await handleAgentRuntimeRequest(
      resumeRequest(id),
      nativeRuntimeEnvironment,
      runtime.context,
      runtimeDependencies(
        {
          ...createNativeControlPlane(),
          resumeApprovedAction: () => Promise.reject(new Error("unavailable")),
        },
        close,
        captureFailure
      )
    )

    expect(response.status).toBe(503)
    await Promise.all(runtime.pending)
    expect(captureFailure).toHaveBeenCalledWith("resume_failed")
    expect(close).toHaveBeenCalledOnce()
  })

  it("does not consume a ticket after the API-owned request deadline aborts", async () => {
    const id = actionId()
    const test = harness(id)
    const controller = new AbortController()
    const captureFailure = vi.fn<AgentRuntimeDependencies["captureFailure"]>()
    const close = vi.fn<() => Promise<void>>().mockResolvedValue()
    const runtime = runtimeContext()
    controller.abort(new Error("private caller timeout"))
    await suspendApprovedIssueAction(mastra, id)

    const response = await handleAgentRuntimeRequest(
      resumeRequest(id, controller.signal),
      nativeRuntimeEnvironment,
      runtime.context,
      runtimeDependencies(
        { ...createNativeControlPlane(), ...test.api },
        close,
        captureFailure
      )
    )

    expect(response.status).toBe(503)
    expect(test.resumeApprovedAction).not.toHaveBeenCalled()
    expect(test.executeApprovedAction).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(runtime.pending).toHaveLength(0)
    expect(captureFailure.mock.calls).toEqual([["resume_failed"]])
    expect(telemetry.reportDevelopmentCauseChain).not.toHaveBeenCalled()
  })

  it("reports a rejected storage close once without raw error reporting", async () => {
    const id = actionId()
    const test = harness(id)
    const privateCloseFailure = new Error("private storage close failure")
    const close = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(privateCloseFailure)
    const captureFailure = vi.fn<AgentRuntimeDependencies["captureFailure"]>()
    const runtime = runtimeContext()
    await suspendApprovedIssueAction(mastra, id)

    const response = await handleAgentRuntimeRequest(
      resumeRequest(id),
      nativeRuntimeEnvironment,
      runtime.context,
      runtimeDependencies(
        { ...createNativeControlPlane(), ...test.api },
        close,
        captureFailure
      )
    )

    expect(response.status).toBe(200)
    expect(runtime.pending).toHaveLength(1)
    await Promise.all(runtime.pending)
    expect(captureFailure.mock.calls).toEqual([["resume_storage_close_failed"]])
    expect(telemetry.reportDevelopmentCauseChain).not.toHaveBeenCalled()
  })

  it("reports init and rejected close failures with separate fixed ownership", async () => {
    const id = actionId()
    const initFailure = new Error("private storage init failure")
    const closeFailure = new Error("private storage close failure")
    const close = vi.fn<() => Promise<void>>().mockRejectedValue(closeFailure)
    const captureFailure = vi.fn<AgentRuntimeDependencies["captureFailure"]>()
    const runtime = runtimeContext()

    const response = await handleAgentRuntimeRequest(
      resumeRequest(id),
      nativeRuntimeEnvironment,
      runtime.context,
      runtimeDependencies(
        createNativeControlPlane(),
        close,
        captureFailure,
        () => Promise.reject(initFailure)
      )
    )

    expect(response.status).toBe(503)
    expect(runtime.pending).toHaveLength(1)
    await Promise.all(runtime.pending)
    expect(captureFailure.mock.calls).toEqual([
      ["resume_failed"],
      ["resume_storage_close_failed"],
    ])
    expect(telemetry.reportDevelopmentCauseChain).toHaveBeenCalledOnce()
    expect(telemetry.reportDevelopmentCauseChain).toHaveBeenCalledWith(
      nativeRuntimeEnvironment,
      "action-resume",
      initFailure
    )
    expect(telemetry.reportDevelopmentCauseChain).not.toHaveBeenCalledWith(
      nativeRuntimeEnvironment,
      "action-resume-storage-close",
      closeFailure
    )
  })

  it("returns before an init-failure close timeout and bounds waitUntil cleanup", async () => {
    vi.useFakeTimers()
    const id = actionId()
    const initFailure = new Error("private storage init failure")
    let finishClose: (() => void) | undefined
    const close = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          finishClose = resolve
        })
    )
    const captureFailure = vi.fn<AgentRuntimeDependencies["captureFailure"]>()
    const runtime = runtimeContext()

    const response = await handleAgentRuntimeRequest(
      resumeRequest(id),
      nativeRuntimeEnvironment,
      runtime.context,
      runtimeDependencies(
        createNativeControlPlane(),
        close,
        captureFailure,
        () => Promise.reject(initFailure)
      )
    )

    expect(response.status).toBe(503)
    expect(runtime.pending).toHaveLength(1)
    expect(close).toHaveBeenCalledOnce()
    expect(captureFailure.mock.calls).toEqual([["resume_failed"]])

    await vi.advanceTimersByTimeAsync(1_999)
    expect(captureFailure.mock.calls).toEqual([["resume_failed"]])
    await vi.advanceTimersByTimeAsync(1)
    await Promise.all(runtime.pending)
    expect(captureFailure.mock.calls).toEqual([
      ["resume_failed"],
      ["resume_storage_close_failed"],
    ])

    finishClose?.()
    await vi.runAllTicks()
    expect(captureFailure.mock.calls).toEqual([
      ["resume_failed"],
      ["resume_storage_close_failed"],
    ])
    expect(telemetry.reportDevelopmentCauseChain).toHaveBeenCalledOnce()
    expect(telemetry.reportDevelopmentCauseChain).toHaveBeenCalledWith(
      nativeRuntimeEnvironment,
      "action-resume",
      initFailure
    )
  })
})

describe("resumeIssueAction execution", () => {
  it("atomically consumes the ticket, executes with the fresh grant, and settles", async () => {
    const id = actionId()
    const test = harness(id)
    await suspendApprovedIssueAction(mastra, id)

    const receipt = await resumeIssueAction(
      { actionId: id, resumeTicket: RESUME_TICKET },
      dependencies(test.api)
    )

    expect(test.resumeApprovedAction).toHaveBeenCalledWith({
      actionId: id,
      resumeTicket: RESUME_TICKET,
    })
    expect(test.executeApprovedAction).toHaveBeenCalledWith({
      actionId: id,
      grant: RUN_GRANT,
    })
    expect(test.finishRun).toHaveBeenCalledWith({
      grant: RUN_GRANT,
      outcome: "completed",
    })
    expect(receipt).toMatchObject({ actionId: id, status: "succeeded" })
    expect(JSON.stringify(receipt)).not.toContain(RESUME_TICKET)
    expect(JSON.stringify(receipt)).not.toContain(RUN_GRANT)
  })

  it("stops before the approved side effect when the caller aborts during ticket consumption", async () => {
    const id = actionId()
    const test = harness(id)
    const controller = new AbortController()
    test.resumeApprovedAction.mockImplementation(async () => {
      controller.abort(new Error("private caller timeout"))
      return {
        attempt: 1,
        expiresAt: "2999-07-22T00:00:00.000Z",
        grant: RUN_GRANT,
        rootRunId: "root_1",
        runId: "run_2",
        shouldGenerateTitle: false,
      }
    })
    await suspendApprovedIssueAction(mastra, id)

    await expect(
      resumeIssueAction(
        { actionId: id, resumeTicket: RESUME_TICKET },
        dependencies(test.api, enabled, controller.signal)
      )
    ).rejects.toThrow("Issue action resume is unavailable")

    expect(test.resumeApprovedAction).toHaveBeenCalledOnce()
    expect(test.executeApprovedAction).not.toHaveBeenCalled()
    expect(test.finishRun).toHaveBeenCalledWith({
      grant: RUN_GRANT,
      outcome: "failed",
    })
  })

  it("settles the continuation as failed and hides execution details", async () => {
    const id = actionId()
    const test = harness(id)
    test.executeApprovedAction.mockRejectedValue(
      new Error(`private ${RESUME_TICKET} ${RUN_GRANT}`)
    )
    await suspendApprovedIssueAction(mastra, id)

    await expect(
      resumeIssueAction(
        { actionId: id, resumeTicket: RESUME_TICKET },
        dependencies(test.api)
      )
    ).rejects.toThrow("Issue action resume is unavailable")
    expect(test.finishRun).toHaveBeenCalledWith({
      grant: RUN_GRANT,
      outcome: "failed",
    })
  })

  it("hides ticket-consumption failures without executing the action", async () => {
    const id = actionId()
    const test = harness(id)
    test.resumeApprovedAction.mockRejectedValue(
      new Error(`private ${RESUME_TICKET}`)
    )
    await suspendApprovedIssueAction(mastra, id)

    await expect(
      resumeIssueAction(
        { actionId: id, resumeTicket: RESUME_TICKET },
        dependencies(test.api)
      )
    ).rejects.toThrow("Issue action resume is unavailable")
    expect(test.executeApprovedAction).not.toHaveBeenCalled()
  })

  it("rejects an expired or malformed fresh grant before execution", async () => {
    for (const grant of [
      {
        expiresAt: "2000-07-22T00:00:00.000Z",
        grant: RUN_GRANT,
      },
      {
        expiresAt: "2999-07-22T00:00:00.000Z",
        grant: "invalid",
      },
    ]) {
      const id = actionId()
      const test = harness(id)
      test.resumeApprovedAction.mockResolvedValue({
        attempt: 1,
        rootRunId: "root_1",
        runId: "run_2",
        shouldGenerateTitle: false,
        ...grant,
      })
      // Each case owns persisted workflow state in the shared test registry.
      // eslint-disable-next-line no-await-in-loop
      await suspendApprovedIssueAction(mastra, id)

      // Keep the assertion paired with the state created immediately above.
      // eslint-disable-next-line no-await-in-loop
      await expect(
        resumeIssueAction(
          { actionId: id, resumeTicket: RESUME_TICKET },
          dependencies(test.api)
        )
      ).rejects.toThrow("Issue action resume is unavailable")
      expect(test.executeApprovedAction).not.toHaveBeenCalled()
    }
  })

  it("rejects malformed and over-posted resume payloads before consuming", async () => {
    const id = actionId()
    const test = harness(id)
    await expect(
      resumeIssueAction(
        {
          actionId: id,
          extra: "secret",
          resumeTicket: RESUME_TICKET,
        },
        dependencies(test.api)
      )
    ).rejects.toThrow("Issue action resume is unavailable")
    expect(test.resumeApprovedAction).not.toHaveBeenCalled()
  })
})
