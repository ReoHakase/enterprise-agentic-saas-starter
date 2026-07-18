const RETRY_INTERVAL_MS = 500
const TIMEOUT_MS = 120_000

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

/** local DB processと保存済みmigrationの適用完了を待つ。 */
export const waitForDevelopmentDatabase = async () => {
  const [{ db }, { files }] = await Promise.all([
    import("@enterprise-agentic-saas/db"),
    import("@enterprise-agentic-saas/db/schema"),
  ])
  const deadline = Date.now() + TIMEOUT_MS

  while (Date.now() < deadline) {
    try {
      // files queryが成功すればmigration 0010まで適用済み。
      // oxlint-disable-next-line no-await-in-loop -- startup readiness is sequential.
      await db.select({ id: files.id }).from(files).limit(1)
      return
    } catch {
      // DB processまたはmigrationが未完了。詳細をlogへ出さない。
    }

    // oxlint-disable-next-line no-await-in-loop -- retry delay protects local DB startup.
    await delay(RETRY_INTERVAL_MS)
  }

  throw new Error("Local Turso migration did not become ready.")
}
