import { analyzeShell, shellTokens } from "./shell-analysis.ts"

const commandName = (word: string) => word.split("/").at(-1) ?? word

export const containsDrizzlePush = (source: string) =>
  analyzeShell(source).segments.some((segment) => {
    const drizzleIndex = segment.findIndex(
      (word) =>
        commandName(word) === "drizzle-kit" ||
        /(?:^|\/)drizzle-kit\/bin\.cjs$/u.test(word)
    )
    return (
      drizzleIndex >= 0 &&
      segment.slice(drizzleIndex + 1).some((word) => word === "push")
    )
  })

export const containsUnsafeDynamicShellExecution = (source: string) =>
  analyzeShell(source).unsafeDynamicExecution

const mutatingFindActions = new Set([
  "-delete",
  "-exec",
  "-execdir",
  "-ok",
  "-okdir",
])

export const containsUnsafeRepositoryFind = (
  source: string,
  workingDirectory: string
) =>
  analyzeShell(source).segments.some((segment) => {
    const findIndex = segment.findIndex((word) => commandName(word) === "find")
    if (findIndex < 0) return false
    const tail = segment.slice(findIndex + 1)
    const hasMutation = tail.some((word) => mutatingFindActions.has(word))
    const hasRepositoryTarget = tail.some((word) => {
      const normalized = word.replace(/\/+$/u, "")
      return (
        normalized === "." ||
        normalized === ".." ||
        normalized === workingDirectory.replace(/\/+$/u, "")
      )
    })
    return hasMutation && hasRepositoryTarget
  })

type ProtectedCommandKind =
  | "cloudflare_deploy"
  | "database_reset"
  | "git_config"
  | "git_merge"
  | "git_push"
  | "pull_request_merge"
  | "remote_database"

const gitSubcommand = (segment: readonly string[]) => {
  const gitIndex = segment.findIndex((word) => commandName(word) === "git")
  if (gitIndex < 0) return null
  for (let index = gitIndex + 1; index < segment.length; index += 1) {
    const word = segment[index]
    if (!word) continue
    if (
      word === "-C" ||
      word === "-c" ||
      word === "--git-dir" ||
      word === "--work-tree" ||
      word === "--namespace"
    ) {
      index += 1
      continue
    }
    if (word.startsWith("-")) continue
    return commandName(word)
  }
  return null
}

const gitAliasKind = (
  segment: readonly string[]
): "git_merge" | "git_push" | null => {
  for (const word of segment) {
    const alias = word.match(/^alias\.[^=]+=(.*)$/u)?.[1]
    if (!alias) continue
    if (/(?:^|[\s!;])(?:push|send-pack)(?:\s|$)/u.test(alias)) {
      return "git_push"
    }
    if (/(?:^|[\s!;])merge(?:\s|$)/u.test(alias)) return "git_merge"
  }
  return null
}

const gitConfigRemovalOptions = new Set(["--unset", "--unset-all"])

const isGitAliasConfiguration = (segment: readonly string[]) => {
  if (gitSubcommand(segment) !== "config") return false
  if (segment.some((word) => gitConfigRemovalOptions.has(word))) return false
  const aliasIndex = segment.findIndex((word) =>
    /^alias\.[^=]+(?:=.+)?$/u.test(word)
  )
  if (aliasIndex < 0) return false
  const aliasWord = segment[aliasIndex] ?? ""
  return aliasWord.includes("=") || segment[aliasIndex + 1] !== undefined
}

const hasRuntimeGitAlias = (
  source: string,
  words: readonly string[],
  segments: readonly string[][]
) => {
  if (!segments.some((segment) => gitSubcommand(segment) !== null)) return false
  const values = [source, ...shellTokens(source), ...words]
  return values.some(
    (word) =>
      /^GIT_CONFIG_KEY_[0-9]+=alias\./u.test(word) ||
      /^GIT_CONFIG_(?:GLOBAL|SYSTEM)=/u.test(word) ||
      (word.startsWith("GIT_CONFIG_PARAMETERS=") && word.includes("alias."))
  )
}

const gitCommandKind = (
  segment: readonly string[]
): "git_config" | "git_merge" | "git_push" | null => {
  const executable = commandName(segment[0] ?? "")
  if (executable === "git-push" || executable === "git-send-pack") {
    return "git_push"
  }
  if (executable === "git-merge") return "git_merge"
  if (isGitAliasConfiguration(segment)) return "git_config"
  const aliasKind = gitAliasKind(segment)
  if (aliasKind) return aliasKind
  const subcommand = gitSubcommand(segment)
  if (subcommand === "push" || subcommand === "send-pack") return "git_push"
  return subcommand === "merge" ? "git_merge" : null
}

const rulesCanPromptGitAction = (
  segment: readonly string[],
  rulesEligible: boolean,
  subcommand: "merge" | "push"
) => {
  const gitIndex = segment.findIndex((word) => commandName(word) === "git")
  const executable = segment[gitIndex]
  const prefix = segment.slice(0, gitIndex)
  const allowedExecutable =
    subcommand === "push"
      ? executable === "git" || executable === "/usr/bin/git"
      : executable === "git"
  const allowedPrefix =
    prefix.length === 0 ||
    (subcommand === "push" && prefix.length === 1 && prefix[0] === "env")
  return (
    rulesEligible &&
    allowedExecutable &&
    allowedPrefix &&
    segment[gitIndex + 1] === subcommand
  )
}

const exactPrefix = (segment: readonly string[], expected: readonly string[]) =>
  expected.every((word, index) => segment[index] === word)

const packageManagerNames = new Set(["bun", "npm", "pnpm", "yarn"])
const resetScriptNames = new Set(["db:reset", "dev:db:reset"])
const resetScriptPaths = new Set([
  "packages/db/src/reset.ts",
  "scripts/reset-local-data.ts",
])
const deployWorkspaces = new Set(["apps/agent", "apps/api", "apps/web"])

const hasPackageScript = (segment: readonly string[], scriptName: string) => {
  const packageManagerIndex = segment.findIndex((word) =>
    packageManagerNames.has(commandName(word))
  )
  if (packageManagerIndex < 0) return false
  const argumentsAfterManager = new Set(segment.slice(packageManagerIndex + 1))
  return argumentsAfterManager.has(scriptName)
}

const isDatabaseReset = (segment: readonly string[]) =>
  segment.some(
    (word) =>
      resetScriptNames.has(word) ||
      [...resetScriptPaths].some(
        (scriptPath) => word === scriptPath || word.endsWith(`/${scriptPath}`)
      )
  )

const rulesCanPromptDatabaseReset = (
  segment: readonly string[],
  rulesEligible: boolean
) =>
  rulesEligible &&
  (exactPrefix(segment, ["bun", "run", "dev:db:reset"]) ||
    exactPrefix(segment, ["bun", "run", "--cwd", "packages/db", "db:reset"]) ||
    exactPrefix(segment, ["bun", "scripts/reset-local-data.ts"]) ||
    exactPrefix(segment, ["bun", "packages/db/src/reset.ts"]))

const rulesCanPromptWranglerDeploy = (
  segment: readonly string[],
  rulesEligible: boolean
) =>
  rulesEligible &&
  (exactPrefix(segment, ["wrangler", "deploy"]) ||
    exactPrefix(segment, ["bunx", "wrangler", "deploy"]) ||
    exactPrefix(segment, ["npx", "wrangler", "deploy"]) ||
    exactPrefix(segment, ["bunx", "--bun", "wrangler", "deploy"]) ||
    exactPrefix(segment, ["npx", "-y", "wrangler", "deploy"]))

const isPackageDeploy = (segment: readonly string[]) =>
  hasPackageScript(segment, "deploy")

const rulesCanPromptBunDeploy = (
  segment: readonly string[],
  rulesEligible: boolean
) =>
  rulesEligible &&
  (exactPrefix(segment, ["bun", "run", "deploy"]) ||
    (exactPrefix(segment, ["bun", "run", "--cwd"]) &&
      deployWorkspaces.has(segment[3] ?? "") &&
      segment[4] === "deploy"))

const isTurboDeploy = (segment: readonly string[]) => {
  const turboIndex = segment.findIndex((word) => commandName(word) === "turbo")
  return (
    turboIndex >= 0 &&
    segment[turboIndex + 1] === "run" &&
    segment[turboIndex + 2] === "deploy"
  )
}

const rulesCanPromptTurboDeploy = (
  segment: readonly string[],
  rulesEligible: boolean
) =>
  rulesEligible &&
  (exactPrefix(segment, ["turbo", "run", "deploy"]) ||
    exactPrefix(segment, ["bunx", "turbo", "run", "deploy"]))

const isPullRequestMerge = (segment: readonly string[]) => {
  const ghIndex = segment.findIndex((word) => commandName(word) === "gh")
  if (ghIndex < 0) return false
  const tail = segment.slice(ghIndex + 1)
  const prIndex = tail.indexOf("pr")
  const apiIndex = tail.indexOf("api")
  return (
    (prIndex >= 0 && tail[prIndex + 1] === "merge") ||
    (apiIndex >= 0 &&
      (tail.includes("graphql") ||
        tail.some(
          (word) =>
            /\/pulls\/[^/]+\/merge(?:[?#].*)?$/u.test(word) ||
            word.includes("mergePullRequest")
        )))
  )
}

const rulesCanPromptPullRequestMerge = (
  segment: readonly string[],
  rulesEligible: boolean
) => rulesEligible && exactPrefix(segment, ["gh", "pr", "merge"])

const hasRemoteFlag = (words: readonly string[]) =>
  words.some((word) => word === "--remote" || word.startsWith("--remote="))

const tursoProtectedDatabaseCommands = new Set([
  "branch",
  "config",
  "create",
  "destroy",
  "import",
  "replicate",
  "shell",
  "tokens",
  "unarchive",
])

const isTursoDatabaseCommand = (segment: readonly string[]) => {
  const tursoIndex = segment.findIndex((word) => commandName(word) === "turso")
  const tail = segment.slice(tursoIndex + 1)
  const databaseIndex = tail.indexOf("db")
  return (
    tursoIndex >= 0 &&
    databaseIndex >= 0 &&
    tail
      .slice(databaseIndex + 1)
      .some((word) => tursoProtectedDatabaseCommands.has(word))
  )
}

const isDrizzleMigration = (segment: readonly string[]) => {
  const drizzleIndex = segment.findIndex(
    (word) =>
      commandName(word) === "drizzle-kit" ||
      /(?:^|\/)drizzle-kit\/bin\.cjs$/u.test(word)
  )
  return drizzleIndex >= 0 && segment[drizzleIndex + 1] === "migrate"
}

const isDatabaseMigrationScript = (segment: readonly string[]) =>
  hasPackageScript(segment, "db:migrate") ||
  hasPackageScript(segment, "db:prepare")

const isRemoteDatabaseCommand = (segment: readonly string[]) => {
  if (
    isTursoDatabaseCommand(segment) ||
    isDrizzleMigration(segment) ||
    isDatabaseMigrationScript(segment)
  ) {
    return true
  }
  const wranglerIndex = segment.findIndex(
    (word) => commandName(word) === "wrangler"
  )
  if (wranglerIndex < 0) return false
  const tail = segment.slice(wranglerIndex + 1)
  const d1Index = tail.indexOf("d1")
  if (d1Index < 0) return false
  const command = tail[d1Index + 1]
  const subcommand = tail[d1Index + 2]
  if (command === "create" || command === "delete") return true
  if (command === "time-travel" && subcommand === "restore") return true
  if (!hasRemoteFlag(tail)) return false
  return (
    command === "execute" ||
    (command === "migrations" && subcommand === "apply")
  )
}

const rulesCanPromptRemoteDatabase = (
  segment: readonly string[],
  rulesEligible: boolean
) =>
  rulesEligible &&
  ((isTursoDatabaseCommand(segment) &&
    ((exactPrefix(segment, ["turso", "db"]) &&
      (tursoProtectedDatabaseCommands.has(segment[2] ?? "") ||
        segment[2] === "-c" ||
        segment[2] === "--config-path")) ||
      exactPrefix(segment, ["turso", "-c"]) ||
      exactPrefix(segment, ["turso", "--config-path"]))) ||
    exactPrefix(segment, ["bun", "run", "db:migrate"]) ||
    exactPrefix(segment, ["bun", "run", "db:prepare"]) ||
    exactPrefix(segment, [
      "bun",
      "run",
      "--cwd",
      "packages/db",
      "db:migrate",
    ]) ||
    exactPrefix(segment, [
      "bun",
      "run",
      "--cwd",
      "packages/db",
      "db:prepare",
    ]) ||
    exactPrefix(segment, [
      "node",
      "node_modules/drizzle-kit/bin.cjs",
      "migrate",
    ]) ||
    exactPrefix(segment, ["wrangler", "d1", "execute", "--remote"]) ||
    exactPrefix(segment, [
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "--remote",
    ]) ||
    exactPrefix(segment, ["wrangler", "d1", "time-travel", "restore"]) ||
    exactPrefix(segment, ["wrangler", "d1", "create"]) ||
    exactPrefix(segment, ["wrangler", "d1", "delete"]))

const isOpenNextDeploy = (segment: readonly string[]) => {
  const openNextIndex = segment.findIndex(
    (word) => commandName(word) === "opennextjs-cloudflare"
  )
  return openNextIndex >= 0 && segment[openNextIndex + 1] === "deploy"
}

const rulesCanPromptOpenNextDeploy = (
  segment: readonly string[],
  rulesEligible: boolean
) =>
  rulesEligible &&
  (exactPrefix(segment, ["opennextjs-cloudflare", "deploy"]) ||
    exactPrefix(segment, ["bunx", "opennextjs-cloudflare", "deploy"]) ||
    exactPrefix(segment, ["npx", "opennextjs-cloudflare", "deploy"]))

const isWranglerRollback = (segment: readonly string[]) => {
  const wranglerIndex = segment.findIndex(
    (word) => commandName(word) === "wrangler"
  )
  return (
    wranglerIndex >= 0 && segment.slice(wranglerIndex + 1).includes("rollback")
  )
}

const rulesCanPromptWranglerRollback = (
  segment: readonly string[],
  rulesEligible: boolean
) =>
  rulesEligible &&
  (exactPrefix(segment, ["wrangler", "rollback"]) ||
    exactPrefix(segment, ["bunx", "wrangler", "rollback"]) ||
    exactPrefix(segment, ["npx", "wrangler", "rollback"]) ||
    exactPrefix(segment, ["wrangler", "versions", "rollback"]))

const protectedCommandKindForSegment = (
  segment: readonly string[],
  rulesEligible: boolean
): ProtectedCommandKind | null => {
  const gitKind = gitCommandKind(segment)
  if (gitKind === "git_config") return "git_config"
  if (
    gitKind === "git_push" &&
    !rulesCanPromptGitAction(segment, rulesEligible, "push")
  ) {
    return "git_push"
  }
  if (
    gitKind === "git_merge" &&
    !rulesCanPromptGitAction(segment, rulesEligible, "merge")
  ) {
    return "git_merge"
  }
  if (
    isPullRequestMerge(segment) &&
    !rulesCanPromptPullRequestMerge(segment, rulesEligible)
  ) {
    return "pull_request_merge"
  }
  if (
    isDatabaseReset(segment) &&
    !rulesCanPromptDatabaseReset(segment, rulesEligible)
  ) {
    return "database_reset"
  }
  const wranglerIndex = segment.findIndex(
    (word) => commandName(word) === "wrangler"
  )
  if (
    wranglerIndex >= 0 &&
    segment.slice(wranglerIndex + 1).includes("deploy") &&
    !rulesCanPromptWranglerDeploy(segment, rulesEligible)
  ) {
    return "cloudflare_deploy"
  }
  if (
    isWranglerRollback(segment) &&
    !rulesCanPromptWranglerRollback(segment, rulesEligible)
  ) {
    return "cloudflare_deploy"
  }
  if (
    isOpenNextDeploy(segment) &&
    !rulesCanPromptOpenNextDeploy(segment, rulesEligible)
  ) {
    return "cloudflare_deploy"
  }
  if (
    isPackageDeploy(segment) &&
    !rulesCanPromptBunDeploy(segment, rulesEligible)
  ) {
    return "cloudflare_deploy"
  }
  if (
    isTurboDeploy(segment) &&
    !rulesCanPromptTurboDeploy(segment, rulesEligible)
  ) {
    return "cloudflare_deploy"
  }
  if (
    isRemoteDatabaseCommand(segment) &&
    !rulesCanPromptRemoteDatabase(segment, rulesEligible)
  ) {
    return "remote_database"
  }
  return null
}

const isRulesEligibleSource = (
  source: string,
  segments: readonly string[][]
) => {
  if (segments.length !== 1 || /['"\\$`;&|<>\n\r]/u.test(source)) {
    return false
  }
  const tokens = shellTokens(source)
  const segment = segments[0]
  return (
    segment !== undefined &&
    tokens.length === segment.length &&
    tokens.every((word, index) => word === segment[index])
  )
}

export const protectedCommandKind = (
  source: string
): ProtectedCommandKind | null => {
  const { segments, words } = analyzeShell(source)
  if (hasRuntimeGitAlias(source, words, segments)) return "git_config"
  const rulesEligible = isRulesEligibleSource(source, segments)
  for (const segment of segments) {
    const kind = protectedCommandKindForSegment(segment, rulesEligible)
    if (kind) return kind
  }
  return null
}
