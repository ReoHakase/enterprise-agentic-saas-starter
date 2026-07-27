import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { createAgentRuntimeComposition } from "../composition/runtime-composition"
import { approvedIssueActionExecutionRegistry, mastra } from "../index"
import { suspendApprovedIssueAction } from "../workflows/approved-issue-action"
import type { AgentControlPlanePort } from "./ports"
import { resumeIssueAction } from "./resume-action"

const RESUME_TICKET = "ticket_0123456789abcdefghijklmnopqrstuvwxyz"
const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"
let workflowError: ReturnType<typeof vi.spyOn>

beforeAll(() => {
  workflowError = vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterAll(() => workflowError.mockRestore())

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
const dependencies = (api: ResumeApi, features = enabled) => ({
  api,
  executionRegistry: approvedIssueActionExecutionRegistry,
  features,
  mastra,
})

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
      composition.approvedIssueActionExecutionRegistry.register({
        api,
        features: enabled,
        resumeTicket: secrets.ticket,
      })
      await suspendApprovedIssueAction(composition.mastra, id)
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
