import type { MemoryCommitOutcome } from "../workflows/memory-commit/workflow-contract"

export type CanonicalResponsePersistence = {
  stage(outcome: MemoryCommitOutcome): Promise<void>
  commit(): Promise<void>
}

const MAX_CANONICAL_RESPONSE_COMMIT_ATTEMPTS = 4
const CANONICAL_RESPONSE_COMMIT_RETRY_DELAY_MS = 5

export class CanonicalResponseCommitDeferredError extends Error {
  override name = "CanonicalResponseCommitDeferredError"
}

const commitCanonicalResponse = async (
  persistence: CanonicalResponsePersistence,
  attempt = 0
): Promise<void> => {
  try {
    await persistence.commit()
  } catch (cause) {
    if (attempt + 1 >= MAX_CANONICAL_RESPONSE_COMMIT_ATTEMPTS) {
      throw new CanonicalResponseCommitDeferredError(
        "Canonical response commit is deferred",
        { cause }
      )
    }
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        CANONICAL_RESPONSE_COMMIT_RETRY_DELAY_MS * 2 ** attempt
      )
    )
    return commitCanonicalResponse(persistence, attempt + 1)
  }
}

export const completeSuccessfulRun = async ({
  desiredOutcome,
  persistence,
  recordUsage,
  onCommitDeferred,
  scheduleTitle,
}: {
  desiredOutcome: MemoryCommitOutcome
  persistence: CanonicalResponsePersistence
  recordUsage(): Promise<void>
  onCommitDeferred(): void
  scheduleTitle(): void
}) => {
  await recordUsage()
  await persistence.stage(desiredOutcome)
  try {
    await commitCanonicalResponse(persistence)
  } catch (cause) {
    onCommitDeferred()
    throw cause
  }
  scheduleTitle()
}
