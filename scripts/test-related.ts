#!/usr/bin/env bun

import { existsSync } from "node:fs"
import { relative, resolve } from "node:path"

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..")

type VitestWorkspace = {
  directory: string
  project?: "unit"
}

export type VitestCommand = {
  args: readonly string[]
  cwd: string
}

const ROOT_WORKSPACE: VitestWorkspace = { directory: "." }

const VITEST_WORKSPACES: readonly VitestWorkspace[] = [
  { directory: "apps/agent" },
  { directory: "apps/api" },
  { directory: "apps/emulate" },
  { directory: "apps/web", project: "unit" },
  { directory: "packages/agent-contracts" },
  { directory: "packages/agent-tools" },
  { directory: "packages/auth" },
  { directory: "packages/db" },
  { directory: "packages/email" },
  { directory: "packages/portless-topology" },
  { directory: "packages/ui", project: "unit" },
]

const SUITE_TRIGGER_NAMES = new Set([
  "tsconfig.json",
  "vitest.config.ts",
  "vitest.setup.ts",
  "vitest.browser.setup.ts",
])

const WORKSPACE_SUITE_TRIGGER_PATTERNS = new Map([
  [
    "packages/db",
    /^packages\/db\/(?:drizzle\/|src\/schema\/|drizzle\.config\.ts$)/u,
  ],
])

const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/u
const BROWSER_ONLY_FILE_PATTERN =
  /(?:\/e2e\/|\/test\/app\/|\.browser\.test\.|\.stories\.)/u

type FileGroup = {
  files: string[]
  fullSuite: boolean
  workspace: VitestWorkspace
}

const normalizePath = (file: string) =>
  file.replaceAll("\\", "/").replace(/^\.\//u, "")

const isInsideRepository = (file: string) => {
  const absolute = resolve(REPOSITORY_ROOT, file)
  const pathFromRoot = relative(REPOSITORY_ROOT, absolute)
  return pathFromRoot !== ".." && !pathFromRoot.startsWith("../")
}

const isRootVitestFile = (file: string) =>
  file === "package.json" ||
  file === "tsconfig.json" ||
  file === "vitest.config.ts" ||
  file.startsWith(".github/") ||
  file.startsWith("scripts/")

const workspaceFor = (file: string) => {
  const workspace = VITEST_WORKSPACES.find(
    ({ directory }) => file === directory || file.startsWith(`${directory}/`)
  )
  if (workspace) return workspace
  return isRootVitestFile(file) ? ROOT_WORKSPACE : undefined
}

const isSuiteTrigger = (file: string, workspace: VitestWorkspace) =>
  (workspace.directory === "." && file === "package.json") ||
  (workspace.directory !== "." &&
    file === `${workspace.directory}/package.json`) ||
  SUITE_TRIGGER_NAMES.has(file.split("/").at(-1) ?? "") ||
  WORKSPACE_SUITE_TRIGGER_PATTERNS.get(workspace.directory)?.test(file) === true

const isVitestFile = (file: string) =>
  SOURCE_FILE_PATTERN.test(file) && !BROWSER_ONLY_FILE_PATTERN.test(file)

const isRelevantFile = (file: string, workspace: VitestWorkspace) =>
  isSuiteTrigger(file, workspace) ||
  (isVitestFile(file) &&
    (workspace.directory !== "." || isRootVitestFile(file)))

const targetFor = (file: string, workspace: VitestWorkspace) => {
  const workspaceRoot =
    workspace.directory === "."
      ? REPOSITORY_ROOT
      : resolve(REPOSITORY_ROOT, workspace.directory)
  const target = relative(
    workspaceRoot,
    resolve(REPOSITORY_ROOT, file)
  ).replaceAll("\\", "/")
  return target.startsWith("./") ? target : `./${target}`
}

const commandFor = (group: FileGroup): VitestCommand => {
  const cwd =
    group.workspace.directory === "."
      ? REPOSITORY_ROOT
      : resolve(REPOSITORY_ROOT, group.workspace.directory)
  const project = group.workspace.project
    ? [`--project=${group.workspace.project}`]
    : []

  if (group.fullSuite) {
    return {
      args: ["bun", "vitest", "run", "--coverage=false", ...project],
      cwd,
    }
  }

  return {
    args: [
      "bun",
      "vitest",
      "related",
      "--run",
      "--coverage=false",
      ...project,
      ...group.files.map((file) => targetFor(file, group.workspace)),
    ],
    cwd,
  }
}

export const buildVitestCommands = (
  stagedFiles: readonly string[]
): VitestCommand[] => {
  const groups = new Map<string, FileGroup>()

  for (const rawFile of stagedFiles) {
    const file = normalizePath(rawFile)
    if (!file || !isInsideRepository(file)) continue
    const workspace = workspaceFor(file)
    if (!workspace || !isRelevantFile(file, workspace)) continue

    const key = workspace.directory
    const group = groups.get(key) ?? {
      files: [],
      fullSuite: false,
      workspace,
    }
    group.files.push(file)
    group.fullSuite ||= isSuiteTrigger(file, workspace)
    group.fullSuite ||= !existsSync(resolve(REPOSITORY_ROOT, file))
    groups.set(key, group)
  }

  return [...groups.values()]
    .toSorted((left, right) => {
      if (left.workspace.directory === ".") return -1
      if (right.workspace.directory === ".") return 1
      return left.workspace.directory.localeCompare(right.workspace.directory)
    })
    .map(commandFor)
}

type VitestCommandRunner = (command: VitestCommand) => Promise<number>

const runCommand: VitestCommandRunner = async (command) => {
  const child = Bun.spawn(command.args, {
    cwd: command.cwd,
    stderr: "inherit",
    stdout: "inherit",
  })
  return await child.exited
}

const runSequentially = async (
  commands: readonly VitestCommand[],
  runner: VitestCommandRunner,
  index = 0
): Promise<number> => {
  const command = commands[index]
  if (!command) return 0
  return runner(command).then((exitCode) => {
    if (exitCode !== 0) return exitCode
    return runSequentially(commands, runner, index + 1)
  })
}

export const runVitestCommands = (
  commands: readonly VitestCommand[],
  runner: VitestCommandRunner = runCommand
) => runSequentially(commands, runner)

if (import.meta.main) {
  process.exitCode = await runVitestCommands(
    buildVitestCommands(process.argv.slice(2))
  )
}
