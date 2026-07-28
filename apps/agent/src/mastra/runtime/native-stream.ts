const privateMetadataKeys = new Set([
  "callProviderMetadata",
  "providerMetadata",
  "resultProviderMetadata",
  "toolMetadata",
])

const redactNativeStreamChunk = <Value>(value: Value): Value => {
  if (Array.isArray(value)) {
    value.forEach((nested, index) => {
      value[index] = redactNativeStreamChunk(nested)
    })
    return value
  }
  if (!value || typeof value !== "object") return value
  for (const [key, nested] of Object.entries(value)) {
    if (privateMetadataKeys.has(key)) {
      Reflect.deleteProperty(value, key)
    } else {
      Reflect.set(value, key, redactNativeStreamChunk(nested))
    }
  }
  return value
}

export const redactNativeStream = <Chunk>(
  stream: ReadableStream<Chunk>
): ReadableStream<Chunk> =>
  stream.pipeThrough(
    new TransformStream<Chunk, Chunk>({
      transform(chunk, controller) {
        controller.enqueue(redactNativeStreamChunk(chunk))
      },
    })
  )

export const enforceRunLiveness = <Chunk>(
  stream: ReadableStream<Chunk>,
  validate: () => Promise<unknown>,
  onRevoked: (cause: unknown) => void
): ReadableStream<Chunk> =>
  stream.pipeThrough(
    new TransformStream<Chunk, Chunk>({
      async transform(chunk, controller) {
        try {
          await validate()
          controller.enqueue(chunk)
        } catch (cause) {
          onRevoked(cause)
          controller.terminate()
        }
      },
    })
  )

const usefulOutputTypes = new Set([
  "text-delta",
  "tool-input-start",
  "tool-input-delta",
  "tool-input-available",
  "tool-input-error",
  "tool-output-available",
  "tool-output-denied",
  "tool-output-error",
  "tool-approval-request",
])

export const observeUsefulNativeOutput = <Chunk>(
  stream: ReadableStream<Chunk>,
  onUsefulOutput: () => void
): ReadableStream<Chunk> =>
  stream.pipeThrough(
    new TransformStream<Chunk, Chunk>({
      transform(chunk, controller) {
        if (
          chunk !== null &&
          typeof chunk === "object" &&
          usefulOutputTypes.has(String(Reflect.get(chunk, "type")))
        ) {
          onUsefulOutput()
        }
        controller.enqueue(chunk)
      },
    })
  )

export const projectServerTimeoutError = <Chunk>(
  stream: ReadableStream<Chunk>,
  isServerTimeout: () => boolean
): ReadableStream<Chunk> =>
  stream.pipeThrough(
    new TransformStream<Chunk, Chunk>({
      transform(chunk, controller) {
        if (
          isServerTimeout() &&
          chunk !== null &&
          typeof chunk === "object" &&
          Reflect.get(chunk, "type") === "abort"
        ) {
          controller.enqueue(
            JSON.parse(
              '{"type":"error","errorText":"Agent response timed out."}'
            )
          )
          return
        }
        controller.enqueue(chunk)
      },
    })
  )
