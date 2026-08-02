import { describe, expect, it } from "vitest"

import { projectServerTimeoutError, redactNativeStream } from "./native-stream"

const streamOf = <Value>(...values: Value[]) =>
  new ReadableStream<Value>({
    start(controller) {
      for (const value of values) controller.enqueue(value)
      controller.close()
    },
  })

const readAll = async <Value>(stream: ReadableStream<Value>) => {
  const values: Value[] = []
  for await (const value of stream) values.push(value)
  return values
}

describe("native UIMessage stream privacy", () => {
  it("preserves native tool/source state while recursively removing provider metadata", async () => {
    const chunk = {
      type: "tool-output-available",
      toolCallId: "call_1",
      output: {
        items: [
          {
            providerMetadata: { privateRequestId: "array-provider-secret" },
            value: "visible",
          },
          null,
        ],
        state: "output-available",
        source: { type: "source-url", url: "https://example.com" },
        providerMetadata: { privateRequestId: "provider-secret" },
      },
      callProviderMetadata: { authorization: "Bearer secret" },
      resultProviderMetadata: { rawResponse: "private response" },
      toolMetadata: { __mastraObservability: { traceId: "private-trace" } },
    }

    const stream = redactNativeStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(chunk)
          controller.close()
        },
      })
    )
    const redacted = (await stream.getReader().read()).value

    expect(redacted).toMatchObject({
      type: "tool-output-available",
      toolCallId: "call_1",
      output: {
        items: [{ value: "visible" }, null],
        state: "output-available",
        source: { type: "source-url", url: "https://example.com" },
      },
    })
    expect(JSON.stringify(redacted)).not.toContain("provider-secret")
    expect(JSON.stringify(redacted)).not.toContain("Bearer secret")
    expect(JSON.stringify(redacted)).not.toContain("private response")
    expect(JSON.stringify(redacted)).not.toContain("private-trace")
    expect(JSON.stringify(redacted)).not.toContain("array-provider-secret")
  })

  it("projects only server timeout aborts to a bounded safe error", async () => {
    await expect(
      readAll(
        projectServerTimeoutError(streamOf({ type: "abort" }), () => true)
      )
    ).resolves.toEqual([
      { type: "error", errorText: "Agent response timed out." },
    ])
    await expect(
      readAll(
        projectServerTimeoutError(streamOf({ type: "abort" }), () => false)
      )
    ).resolves.toEqual([{ type: "abort" }])
    await expect(
      readAll(
        projectServerTimeoutError(streamOf({ type: "text-delta" }), () => true)
      )
    ).resolves.toEqual([{ type: "text-delta" }])
  })
})
