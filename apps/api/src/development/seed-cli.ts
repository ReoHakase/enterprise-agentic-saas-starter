import { isLocalDatabaseUrl } from "./file-seed-handler"
import { reconcileDevelopmentFiles } from "./seed-client"
import { readDevelopmentSeedSession } from "./session"

const main = async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development file seed is disabled in production.")
  }
  if (!isLocalDatabaseUrl(process.env.TURSO_DATABASE_URL)) {
    throw new Error("Development file seed requires a local Turso URL.")
  }

  let session
  try {
    session = await readDevelopmentSeedSession()
  } catch {
    throw new Error(
      "Local API Worker is not running. Start `bun run dev` before reconciling R2 fixtures."
    )
  }
  const count = await reconcileDevelopmentFiles({
    endpoint: session.endpoint,
    token: session.token,
    timeoutMs: 30_000,
  })
  console.log(`Development R2 reconcile completed for ${count} fixtures.`)
}

await main()
