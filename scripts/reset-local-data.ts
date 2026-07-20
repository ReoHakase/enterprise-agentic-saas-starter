import { rm } from "node:fs/promises"
import { createInterface } from "node:readline/promises"
import { fileURLToPath } from "node:url"

import { assertRepositoryLocalTursoUrl } from "../packages/db/src/local-database"

const RESET_CONFIRMATION = "reset-local-development"
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url))

const askForConfirmation = async () => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    return await prompt.question(
      `This removes local Turso and Wrangler R2 state. Type ${RESET_CONFIRMATION} to continue: `
    )
  } finally {
    prompt.close()
  }
}

const main = async () => {
  const databaseUrl = process.env.TURSO_DATABASE_URL
  if (!databaseUrl) {
    throw new Error(
      "TURSO_DATABASE_URL is required so remote database configurations can be rejected."
    )
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Local development data cannot be reset in production.")
  }
  assertRepositoryLocalTursoUrl(databaseUrl)

  const confirmation =
    process.env.CONFIRM_DEV_DATA_RESET ?? (await askForConfirmation())
  if (confirmation !== RESET_CONFIRMATION) {
    throw new Error(
      `Reset canceled. Set CONFIRM_DEV_DATA_RESET=${RESET_CONFIRMATION} for a non-interactive local run.`
    )
  }

  await Promise.all([
    rm(`${repositoryRoot}packages/db/.local/turso`, {
      force: true,
      recursive: true,
    }),
    rm(`${repositoryRoot}apps/api/.wrangler/state`, {
      force: true,
      recursive: true,
    }),
    rm(`${repositoryRoot}apps/api/.wrangler/development`, {
      force: true,
      recursive: true,
    }),
  ])

  console.log(
    "Local Turso and Wrangler storage state removed. Run `bun run dev:db:seed` when fixture data is needed, then run `bun run dev`."
  )
}

await main()
