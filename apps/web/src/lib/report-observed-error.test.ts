import { redirect } from "@tanstack/react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

const telemetry = vi.hoisted(() => ({
  activeSpan: true,
  recordException: vi.fn<(error: Error) => void>(),
  setAttributes: vi.fn<(attributes: unknown) => void>(),
  setStatus: vi.fn<(status: unknown) => void>(),
  throwOnGetActiveSpan: false,
}))
const developmentReporter = vi.hoisted(() => ({
  enabled: false,
  report: vi.fn<(...args: unknown[]) => void>(),
}))

vi.mock("@opentelemetry/api", () => ({
  SpanStatusCode: { ERROR: 2 },
  trace: {
    getActiveSpan: () => {
      if (telemetry.throwOnGetActiveSpan) throw new Error("trace unavailable")
      return telemetry.activeSpan
        ? {
            recordException: telemetry.recordException,
            setAttributes: telemetry.setAttributes,
            setStatus: telemetry.setStatus,
          }
        : undefined
    },
  },
}))
vi.mock("./development-error", () => ({
  isDevelopmentCauseReportingEnabled: () => developmentReporter.enabled,
  redactDevelopmentErrorText: (value: string) => value,
  reportDevelopmentCauseChain: developmentReporter.report,
}))

import { reportObservedError } from "./report-observed-error"

beforeEach(() => {
  vi.clearAllMocks()
  telemetry.activeSpan = true
  telemetry.throwOnGetActiveSpan = false
  developmentReporter.enabled = false
})

describe("Webで観測したエラーの報告", () => {
  it("Given Router redirect, When Query cacheが報告する, Then failureとして記録しない", () => {
    developmentReporter.enabled = true

    reportObservedError(
      redirect({ href: "/auth/sign-in?redirectTo=%2Fdashboard" })
    )

    expect(telemetry.setAttributes).not.toHaveBeenCalled()
    expect(telemetry.setStatus).not.toHaveBeenCalled()
    expect(developmentReporter.report).not.toHaveBeenCalled()
  })

  it("生のエラー詳細を転記せず有効spanをmarkする", () => {
    reportObservedError(new Error("provider failed with visible quota details"))

    expect(telemetry.recordException).not.toHaveBeenCalled()
    expect(telemetry.setAttributes).toHaveBeenCalledWith({
      "app.error.code": "internal_error",
      "app.operation": "web.application",
      "app.outcome": "failure",
    })
    expect(telemetry.setStatus).toHaveBeenCalledWith({ code: 2 })
  })

  it("未登録プロバイダーのerror codeを正規化する", () => {
    const error = Object.assign(new Error("provider failed"), {
      code: "provider-private-code",
      status: 500,
    })

    reportObservedError(error)

    expect(telemetry.setAttributes).toHaveBeenCalledWith({
      "app.error.code": "internal_error",
      "app.operation": "web.application",
      "app.outcome": "failure",
      "http.response.status_code": 500,
    })
  })

  it("予想される 4xx エラーをキャプチャしない", () => {
    const error = Object.assign(new Error("forbidden"), { status: 403 })

    reportObservedError(error)

    expect(telemetry.setStatus).not.toHaveBeenCalled()
  })

  it.each([
    { case: "statusフィールド", input: { error: { status: 401 } } },
    { case: "statusCodeフィールド", input: { error: { statusCode: 403 } } },
  ])(
    "$caseを持つBetter Authのネストした4xxエラーをcaptureしない",
    ({ input }) => {
      reportObservedError(input)

      expect(telemetry.setStatus).not.toHaveBeenCalled()
    }
  )

  it("同じError objectを1回だけcaptureする", () => {
    const error = new Error("failed")

    reportObservedError(error)
    reportObservedError(error)

    expect(telemetry.setStatus).toHaveBeenCalledOnce()
  })

  it("報告contextができる前にエラー識別情報を消費しない", () => {
    const error = new Error("failed")
    telemetry.activeSpan = false
    reportObservedError(error)

    telemetry.activeSpan = true
    reportObservedError(error)

    expect(telemetry.setStatus).toHaveBeenCalledOnce()
  })

  it("ローカルlogに元のErrorと意味のあるrequest contextを保持する", () => {
    developmentReporter.enabled = true
    const error = Object.assign(new Error("provider unavailable"), {
      requestId: "request-1",
      status: 503,
      value: { error: "service_unavailable" },
    })

    reportObservedError(error, {
      httpMethod: "post",
      httpRoute: "/agent/chat",
      operation: "agent.chat.request",
    })

    const attributes = {
      "app.error.code": "service_unavailable",
      "app.operation": "agent.chat.request",
      "app.outcome": "failure",
      "http.request.method": "POST",
      "http.response.status_code": 503,
      "http.route": "/agent/chat",
      request_id: "request-1",
    }
    expect(telemetry.setAttributes).toHaveBeenCalledWith(attributes)
    expect(developmentReporter.report).toHaveBeenCalledWith(
      expect.any(Object),
      error,
      attributes
    )
    expect(telemetry.recordException).not.toHaveBeenCalled()
  })

  it("telemetry障害でUIのエラー処理を置き換えない", () => {
    developmentReporter.enabled = true
    telemetry.setAttributes.mockImplementationOnce(() => {
      throw new Error("span unavailable")
    })
    developmentReporter.report.mockImplementationOnce(() => {
      throw new Error("log unavailable")
    })

    expect(() =>
      reportObservedError(new Error("application failure"))
    ).not.toThrow()
    expect(telemetry.setStatus).toHaveBeenCalledWith({ code: 2 })
  })

  it("trace APIが利用不能でも固定ローカルlogへ報告する", () => {
    developmentReporter.enabled = true
    telemetry.throwOnGetActiveSpan = true
    const error = new Error("application failure")

    expect(() => reportObservedError(error)).not.toThrow()
    expect(developmentReporter.report).toHaveBeenCalledWith(
      expect.any(Object),
      error,
      expect.objectContaining({ "app.error.code": "internal_error" })
    )
  })
})
