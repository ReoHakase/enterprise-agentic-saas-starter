import { wrapLanguageModel } from "ai"

export type LivenessLanguageModel = Parameters<
  typeof wrapLanguageModel
>[0]["model"]

export const isLivenessLanguageModel = (
  value: unknown
): value is LivenessLanguageModel =>
  typeof value === "object" &&
  value !== null &&
  "specificationVersion" in value &&
  (value.specificationVersion === "v2" ||
    value.specificationVersion === "v3" ||
    value.specificationVersion === "v4") &&
  "doStream" in value &&
  typeof value.doStream === "function"

export const withRunLiveness = (
  model: LivenessLanguageModel,
  assertLive: () => Promise<unknown>
) =>
  wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      wrapStream: async ({ doStream }) => {
        await assertLive()
        const result = await doStream()
        return {
          ...result,
          stream: result.stream.pipeThrough(
            new TransformStream({
              async transform(chunk, controller) {
                await assertLive()
                controller.enqueue(chunk)
              },
            })
          ),
        }
      },
    },
  })
