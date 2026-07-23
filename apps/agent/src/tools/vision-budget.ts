const DEFAULT_MAXIMUM_IMAGE_COUNT = 4

export type AgentVisionBudget = {
  reserve: () => void
  markIncluded: () => void
  includedCount: () => number
}

/**
 * current message画像とIssue画像を同じrun単位で数える。
 * 失敗した取得もslotを解放せず、retryによる上限回避を許さない。
 */
export const createAgentVisionBudget = (
  initialIncludedCount = 0,
  maximumImageCount = DEFAULT_MAXIMUM_IMAGE_COUNT
): AgentVisionBudget => {
  if (
    !Number.isSafeInteger(initialIncludedCount) ||
    !Number.isSafeInteger(maximumImageCount) ||
    initialIncludedCount < 0 ||
    maximumImageCount < 0 ||
    initialIncludedCount > maximumImageCount
  ) {
    throw new Error("Invalid agent vision budget")
  }

  let reservedCount = initialIncludedCount
  let includedCount = initialIncludedCount
  return {
    reserve() {
      if (reservedCount >= maximumImageCount) {
        throw new Error("Agent image input limit reached")
      }
      reservedCount += 1
    },
    markIncluded() {
      if (includedCount >= reservedCount) {
        throw new Error("Agent image input was not reserved")
      }
      includedCount += 1
    },
    includedCount: () => includedCount,
  }
}
