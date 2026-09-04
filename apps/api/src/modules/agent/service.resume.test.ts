import { afterEach, describe, expect, it, vi } from "vitest"

import { HttpError } from "../../errors/http-error"
import type { AgentServicePorts } from "./ports"
import { createAgentService } from "./service"

const RESUME_TICKET = "resume_0123456789abcdefghijklmnopqrstuvwxyz"
const unusedPort = (): Promise<never> =>
  Promise.reject(new Error("Unexpected Agent service port call"))

const createPorts = (
  fetchAgentRuntime: AgentServicePorts["fetchAgentRuntime"]
): AgentServicePorts => ({
  archiveAgentThreadForSession: unusedPort,
  cancelAgentRunForSession: unusedPort,
  createAgentThreadForSession: unusedPort,
  decideAgentActionForSession: unusedPort,
  fetchAgentRuntime,
  getAgentActionForSession: unusedPort,
  getAgentApprovalPolicyForSession: unusedPort,
  getAgentMonthlyUsageForSession: unusedPort,
  getAgentOrganizationUsageForSession: unusedPort,
  issueAgentConnectionTicket: unusedPort,
  listAgentThreadsForSession: unusedPort,
  prepareAgentActionResumeForSession: () =>
    Promise.resolve({
      kind: "ticket",
      resume: {
        expiresAt: "2999-07-22T00:00:00.000Z",
        ticket: RESUME_TICKET,
      },
    }),
  prepareAgentChatForSession: unusedPort,
  prepareAgentClientToolContinuationForSession: unusedPort,
  putAgentApprovalPolicyForSession: unusedPort,
  revokeCurrentAgentContext: unusedPort,
})

const stalledRuntime = () => {
  let request: Request | undefined
  const fetchAgentRuntime = vi.fn<AgentServicePorts["fetchAgentRuntime"]>(
    (input) => {
      request = input
      if (input.signal.aborted) {
        return Promise.reject(input.signal.reason)
      }
      return new Promise((_resolve, reject) => {
        input.signal.addEventListener(
          "abort",
          () => reject(input.signal.reason),
          { once: true }
        )
      })
    }
  )
  return { fetchAgentRuntime, getRequest: () => request }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const useFakeAbortSignalTimeout = () =>
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const controller = new AbortController()
    setTimeout(
      () =>
        controller.abort(
          new DOMException("The operation timed out", "TimeoutError")
        ),
      milliseconds
    )
    return controller.signal
  })

describe("Agent action resume transportの契約", () => {
  it("resume ticket期限前に停止したAgent runtimeを中断する", async () => {
    vi.useFakeTimers()
    const timeout = useFakeAbortSignalTimeout()
    const runtime = stalledRuntime()
    const service = createAgentService(createPorts(runtime.fetchAgentRuntime))
    const result = service.resumeAgentAction({
      actionId: "action_1",
      sessionId: "session_1",
      userId: "user_1",
    })
    const caughtResult = result.catch((cause: unknown) => cause)

    await vi.advanceTimersByTimeAsync(49_999)
    expect(runtime.getRequest()?.signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    await expect(caughtResult).resolves.toMatchObject({
      code: "service_unavailable",
      retryAfter: 30,
    })
    const request = runtime.getRequest()
    expect(request?.signal.aborted).toBe(true)
    expect(request?.signal.reason).toMatchObject({ name: "TimeoutError" })
    expect(timeout).toHaveBeenCalledWith(50_000)
  })

  it("causeを公開せずcaller cancellationを転送する", async () => {
    const runtime = stalledRuntime()
    const service = createAgentService(createPorts(runtime.fetchAgentRuntime))
    const controller = new AbortController()
    const privateCause = new Error("private browser disconnect")
    const result = service.resumeAgentAction(
      {
        actionId: "action_1",
        sessionId: "session_1",
        userId: "user_1",
      },
      controller.signal
    )

    controller.abort(privateCause)

    let caught: unknown
    try {
      await result
    } catch (cause) {
      caught = cause
    }
    expect(caught).toBeInstanceOf(HttpError)
    expect(caught).toMatchObject({
      code: "service_unavailable",
      message: "service_unavailable",
      retryAfter: 30,
    })
    if (!(caught instanceof Error)) throw new Error("Expected HttpError")
    expect(caught.cause).toBe(privateCause)
    expect(caught.message).not.toContain(privateCause.message)
    expect(runtime.getRequest()?.signal.reason).toBe(privateCause)
  })
})
