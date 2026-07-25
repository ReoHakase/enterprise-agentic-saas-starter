const shellOperators = new Set(["\n", "&", "&&", "|", "||", ";"])
const assignmentPattern = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u
const variablePattern =
  /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/gu
const unresolvedVariablePattern =
  /\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/u
const literalDollar = "\u0000"
const dynamicDollarSuffixes = new Set(["'", '"', "("])
const unquotedExpansionCharacters = new Set(["(", ")", "{", "}", "*", "?", "["])
const dynamicInterpreterOptions = new Set([
  "-c",
  "-e",
  "-p",
  "--eval",
  "--print",
])
const redirectTokens = new Set(["<", "<<"])
const shellWrappers = new Set([
  "command",
  "env",
  "exec",
  "nice",
  "nohup",
  "sudo",
])

type Quote = "'" | '"' | null

const simpleParameterEnd = (source: string, index: number) => {
  if (source[index + 1] !== "{") return null
  const closingIndex = source.indexOf("}", index + 2)
  if (closingIndex < 0) return -1
  const parameter = source.slice(index + 2, closingIndex)
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(parameter) ? closingIndex : -1
}

const hasUnsupportedShellSyntax = (source: string) => {
  let quote: Quote = null
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const next = source[index + 1]
    if (!character) continue
    if (escaped) {
      if (character === "\n") return true
      escaped = false
      continue
    }
    if (character === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote === "'") {
      if (character === "'") quote = null
      continue
    }
    if (character === "'" && quote === null) {
      quote = "'"
      continue
    }
    if (character === '"') {
      quote = quote === '"' ? null : '"'
      continue
    }
    if (character === "`") return true
    if (character === "$" && next && dynamicDollarSuffixes.has(next)) {
      return true
    }
    if (character === "$" && next === "{") {
      const parameterEnd = simpleParameterEnd(source, index)
      if (parameterEnd === -1) return true
      if (parameterEnd !== null) index = parameterEnd
      continue
    }
    if (quote === null && unquotedExpansionCharacters.has(character)) {
      return true
    }
  }
  return escaped || quote !== null
}

export const shellTokens = (source: string) => {
  const tokens: string[] = []
  let current = ""
  let quote: Quote = null
  let escaped = false
  const flush = () => {
    if (current !== "") tokens.push(current)
    current = ""
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (!character) continue
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else {
        current +=
          quote === "'" && character === "$" ? literalDollar : character
      }
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    if (character === "\n") {
      flush()
      tokens.push("\n")
      continue
    }
    if (/\s/u.test(character)) {
      flush()
      continue
    }
    if (";&|<>".includes(character)) {
      flush()
      const next = source[index + 1]
      if (
        next === character &&
        (character === "&" ||
          character === "|" ||
          character === "<" ||
          character === ">")
      ) {
        tokens.push(`${character}${next}`)
        index += 1
      } else {
        tokens.push(character)
      }
      continue
    }
    current += character
  }
  if (escaped) current += "\\"
  flush()
  return tokens
}

const resolveVariables = (value: string, variables: Map<string, string>) => {
  let resolved = value
  for (let depth = 0; depth < 4; depth += 1) {
    const next = resolved.replace(
      variablePattern,
      (match, braced: string | undefined, plain: string | undefined) =>
        variables.get(braced ?? plain ?? "") ?? match
    )
    if (next === resolved) return resolved
    resolved = next
  }
  return resolved
}

export type ShellAnalysis = {
  segments: string[][]
  unsafeDynamicExecution: boolean
  words: string[]
}

const nestedCommandSources = (segments: readonly string[][]) => {
  const sources: string[] = []
  let unsafe = false
  for (const candidate of segments) {
    const interpreterIndex = candidate.findIndex((word) =>
      /^(?:ba|da|k|z)?sh$/u.test(word.split("/").at(-1) ?? "")
    )
    const commandIndex =
      interpreterIndex < 0
        ? -1
        : candidate.findIndex(
            (word, index) =>
              index > interpreterIndex &&
              (word === "--command" || /^-[A-Za-z]*c[A-Za-z]*$/u.test(word))
          )
    if (commandIndex >= 0) {
      const nestedSource = candidate[commandIndex + 1]
      if (nestedSource) sources.push(nestedSource)
      else unsafe = true
    } else if (
      interpreterIndex === 0 ||
      (interpreterIndex > 0 &&
        shellWrappers.has(candidate[0]?.split("/").at(-1) ?? ""))
    ) {
      unsafe = true
    }
    const evalIndex = candidate.findIndex(
      (word) => (word.split("/").at(-1) ?? word) === "eval"
    )
    if (evalIndex >= 0) {
      const nestedSource = candidate.slice(evalIndex + 1).join(" ")
      if (nestedSource) sources.push(nestedSource)
      else unsafe = true
    }
  }
  return { sources, unsafe }
}

const hasDynamicInterpreter = (segments: readonly string[][]) =>
  segments.some((segment) => {
    const interpreterIndex = segment.findIndex((word) =>
      /^(?:bun|node|perl|python[23]?|ruby)$/u.test(word.split("/").at(-1) ?? "")
    )
    if (interpreterIndex < 0) return false
    const tail = segment.slice(interpreterIndex + 1)
    const hasDynamicOption = tail.some(
      (word) =>
        dynamicInterpreterOptions.has(word) ||
        /^-[A-Za-z]*[cep](?:.+)?$/u.test(word) ||
        /^--(?:eval|print)=/u.test(word)
    )
    if (hasDynamicOption) return true
    const firstPositional = tail.find((word) => !word.startsWith("-"))
    return (
      tail.length === 0 ||
      firstPositional === undefined ||
      firstPositional === "-" ||
      redirectTokens.has(firstPositional)
    )
  })

export const analyzeShell = (source: string, depth = 0): ShellAnalysis => {
  const variables = new Map<string, string>()
  const segments: string[][] = []
  const words: string[] = []
  let segment: string[] = []
  let unsafeDynamicExecution = hasUnsupportedShellSyntax(source)
  let acceptsAssignments = true

  const flush = () => {
    if (segment.length > 0) segments.push(segment)
    segment = []
    acceptsAssignments = true
  }

  for (const token of shellTokens(source)) {
    if (shellOperators.has(token)) {
      flush()
      continue
    }
    const resolved = resolveVariables(token, variables)
    if (unresolvedVariablePattern.test(resolved)) {
      unsafeDynamicExecution = true
    }
    const assignment = acceptsAssignments
      ? resolved.match(assignmentPattern)
      : null
    if (assignment?.[1] !== undefined) {
      variables.set(
        assignment[1],
        resolveVariables(assignment[2] ?? "", variables)
      )
      words.push(resolved)
      continue
    }
    if (resolved !== "export" && resolved !== "readonly") {
      acceptsAssignments = false
    }
    segment.push(resolved)
    words.push(resolved)
  }
  flush()

  const nestedCommands = nestedCommandSources(segments)
  unsafeDynamicExecution ||= nestedCommands.unsafe
  unsafeDynamicExecution ||= hasDynamicInterpreter(segments)
  for (const nestedSource of nestedCommands.sources) {
    if (depth >= 2 || /\$(?:\(|\{|[A-Za-z_])|`|[<>]\(/u.test(nestedSource)) {
      unsafeDynamicExecution = true
      continue
    }
    const nested = analyzeShell(nestedSource, depth + 1)
    segments.push(...nested.segments)
    words.push(...nested.words)
    unsafeDynamicExecution ||= nested.unsafeDynamicExecution
  }
  return { segments, unsafeDynamicExecution, words }
}
