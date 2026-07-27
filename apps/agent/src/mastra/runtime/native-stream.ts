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
