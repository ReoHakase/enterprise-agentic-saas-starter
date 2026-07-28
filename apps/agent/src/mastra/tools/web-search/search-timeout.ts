import type { RawPublicWebResearchResult } from "./execute"

const PUBLIC_WEB_RESEARCH_TIMEOUT_MS = 25_000

export type PublicWebSearchProvider = (
  query: string,
  abortSignal?: AbortSignal
) => Promise<RawPublicWebResearchResult>

export const searchWithTimeout = async (
  search: PublicWebSearchProvider,
  query: string,
  abortSignal?: AbortSignal,
  onProviderError?: (cause: unknown) => void
): Promise<RawPublicWebResearchResult> => {
  const timeoutController = new AbortController()
  const timeout = setTimeout(
    () =>
      timeoutController.abort(
        new DOMException("Public Web search timed out", "TimeoutError")
      ),
    PUBLIC_WEB_RESEARCH_TIMEOUT_MS
  )
  const searchSignal = abortSignal
    ? AbortSignal.any([abortSignal, timeoutController.signal])
    : timeoutController.signal
  try {
    return await search(query, searchSignal)
  } catch (cause) {
    if (abortSignal?.aborted) abortSignal.throwIfAborted()
    onProviderError?.(cause)
    throw new Error("Public Web search is unavailable", { cause })
  } finally {
    clearTimeout(timeout)
  }
}
