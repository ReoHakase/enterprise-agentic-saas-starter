import { posix as path } from "node:path"

import { analyzeShell } from "./shell-analysis.ts"

const redirectOperators = new Set(["<", "<<", ">", ">>"])
const generatedSkillPath = /(?:^|[/\s"'`:])\.agents\/+skills(?:[/\s"'`:]|$)/u
const generatedSkillPathFragment = /(?:^|[/=])\.?\.agents(?:\/[^/\s"'`:]+)*/gu
const relativeGeneratedSkillPath = /(?:^|[/\s"'`:])skills(?:[/\s"'`:]|$)/u
const commandName = (word: string) => word.split("/").at(-1) ?? word

const normalizedAgentPath = (candidate: string, workingDirectory = ".") => {
  const normalizedCandidate = candidate.normalize("NFKC").replace(/\/+/gu, "/")
  const candidateValue = normalizedCandidate.includes("=")
    ? (normalizedCandidate.split("=").at(-1) ?? normalizedCandidate)
    : normalizedCandidate
  const normalized = path.normalize(
    candidateValue.startsWith("/")
      ? candidateValue
      : path.join(workingDirectory, candidateValue)
  )
  const parts = normalized.split("/")
  const markerIndex = parts.findIndex((part) => part === ".agents")
  if (markerIndex < 0) return null
  return parts.slice(markerIndex).join("/")
}

const touchesGeneratedSkillPath = (
  candidate: string,
  workingDirectory = "."
) => {
  const normalized = normalizedAgentPath(candidate, workingDirectory)
  if (!normalized) return false
  return (
    normalized === ".agents" ||
    normalized === ".agents/skills" ||
    normalized.startsWith(".agents/skills/")
  )
}

const isInsideGeneratedSkillPath = (candidate: string) => {
  const normalized = normalizedAgentPath(candidate)
  return (
    normalized === ".agents/skills" ||
    normalized?.startsWith(".agents/skills/") === true
  )
}

const hasGeneratedSkillPath = (
  values: readonly string[],
  workingDirectory = "."
) => {
  const normalizedWorkingDirectory = normalizedAgentPath(workingDirectory)
  if (isInsideGeneratedSkillPath(workingDirectory)) return true
  return values.some((value) => {
    const normalizedValue = value.normalize("NFKC").replace(/\/+/gu, "/")
    if (generatedSkillPath.test(normalizedValue)) return true
    if (
      normalizedWorkingDirectory === ".agents" &&
      relativeGeneratedSkillPath.test(normalizedValue)
    ) {
      return true
    }
    return [...normalizedValue.matchAll(generatedSkillPathFragment)].some(
      (match) => touchesGeneratedSkillPath(match[0], workingDirectory)
    )
  })
}

const readOnlyGeneratedSkillCommands = new Set([
  "cat",
  "cmp",
  "diff",
  "du",
  "echo",
  "file",
  "grep",
  "head",
  "ls",
  "md5",
  "pwd",
  "readlink",
  "realpath",
  "rg",
  "shasum",
  "stat",
  "tail",
  "test",
  "wc",
])

const readOnlyGitSubcommands = new Set([
  "diff",
  "grep",
  "log",
  "ls-files",
  "show",
  "status",
])

const isReadOnlyGeneratedSkillSegment = (segment: readonly string[]) => {
  if (segment.some((word) => redirectOperators.has(word))) return false
  const executable = commandName(segment[0] ?? "")
  if (executable === "cd") return true
  if (
    executable === "rg" &&
    segment.some((word) => word === "--pre" || word.startsWith("--pre="))
  ) {
    return false
  }
  if (readOnlyGeneratedSkillCommands.has(executable)) return true
  if (executable !== "git" || !readOnlyGitSubcommands.has(segment[1] ?? "")) {
    return false
  }
  return !segment.some(
    (word) =>
      word === "--ext-diff" ||
      word === "--output" ||
      word === "--textconv" ||
      word === "-c" ||
      word.startsWith("--config-env") ||
      word.startsWith("--output=")
  )
}

const resolveWorkingDirectory = (
  currentWorkingDirectory: string,
  segment: readonly string[]
) => {
  if (commandName(segment[0] ?? "") !== "cd") return currentWorkingDirectory
  const target = segment[1]
  if (!target || target.startsWith("-")) return currentWorkingDirectory
  return path.normalize(
    target.startsWith("/") ? target : path.join(currentWorkingDirectory, target)
  )
}

const hasProtectedPathReference = (
  segment: readonly string[],
  workingDirectory: string
) =>
  isInsideGeneratedSkillPath(workingDirectory) ||
  segment.some((word) => touchesGeneratedSkillPath(word, workingDirectory))

export const containsGeneratedSkillMutation = (
  source: string,
  toolName: string,
  initialWorkingDirectory = "."
) => {
  const analysis = analyzeShell(source)
  const values = [
    source,
    ...analysis.words,
    ...analysis.segments.map((segment) => segment.join(" ")),
  ]
  if (
    /apply_patch|edit|write/iu.test(toolName) &&
    hasGeneratedSkillPath(values, initialWorkingDirectory)
  ) {
    return true
  }
  if (
    hasGeneratedSkillPath(values, initialWorkingDirectory) &&
    analysis.segments.some(
      (segment) => !isReadOnlyGeneratedSkillSegment(segment)
    )
  ) {
    return true
  }
  let workingDirectory = initialWorkingDirectory
  for (const segment of analysis.segments) {
    if (
      hasProtectedPathReference(segment, workingDirectory) &&
      !isReadOnlyGeneratedSkillSegment(segment)
    ) {
      return true
    }
    workingDirectory = resolveWorkingDirectory(workingDirectory, segment)
  }
  return false
}
