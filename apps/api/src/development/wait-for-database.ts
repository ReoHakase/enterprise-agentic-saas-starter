import { count } from "drizzle-orm"

const RETRY_INTERVAL_MS = 500
const TIMEOUT_MS = 120_000

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

/** fresh seedのtransaction commit、または既存local DBのmigration完了を待つ。 */
export const waitForDevelopmentDatabase = async () => {
  const [{ db }, { files, user }] = await Promise.all([
    import("@enterprise-agentic-saas/db"),
    import("@enterprise-agentic-saas/db/schema"),
  ])
  const deadline = Date.now() + TIMEOUT_MS

  while (Date.now() < deadline) {
    try {
      // files queryが成功すればmigration 0010まで適用済み。
      // fresh seedは1 transactionなのでuserが見えた時点でfile rowsもcommit済み。
      // oxlint-disable-next-line no-await-in-loop -- startup readiness is sequential.
      await db.select({ id: files.id }).from(files).limit(1)
      // oxlint-disable-next-line no-await-in-loop -- both checks must use the same retry attempt.
      const rows = await db.select({ value: count() }).from(user)
      if ((rows[0]?.value ?? 0) > 0) return
    } catch {
      // DB process、migration、seedのいずれかが未完了。詳細をlogへ出さない。
    }

    // oxlint-disable-next-line no-await-in-loop -- retry delay protects local DB startup.
    await delay(RETRY_INTERVAL_MS)
  }

  throw new Error("Local Turso migration and seed did not become ready.")
}
