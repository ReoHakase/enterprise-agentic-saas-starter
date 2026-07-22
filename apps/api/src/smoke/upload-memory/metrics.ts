export const UPLOAD_MEMORY_SMOKE_FILE_BYTES = 10_000_000
export const UPLOAD_MEMORY_SMOKE_DEFAULT_CONCURRENCY = 4
export const UPLOAD_MEMORY_SMOKE_MAX_CONCURRENCY = 32

export const LOCAL_WORKERD_RSS_LIMITATION =
  "local workerdのprocess RSSはnative runtime、allocator、local binding simulationを含み、productionのisolate memoryと同じ指標ではない。128 MB上限への適合を証明せず、同一環境での回帰検出にだけ使う。"

export type ProcessRow = {
  command: string
  pid: number
  ppid: number
  rssKiB: number
}

export type ProcessMemorySample = {
  processTreeRssKiB: number
  workerdPids: number[]
  workerdRssKiB: number
  workerdSingleProcessMaxRssKiB: number
}

export const parseProcessRows = (output: string): ProcessRow[] =>
  output
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/u))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rssKiB: Number(match[3]),
      command: match[4] ?? "",
    }))
    .filter(
      (row) =>
        Number.isInteger(row.pid) &&
        Number.isInteger(row.ppid) &&
        Number.isFinite(row.rssKiB)
    )

const descendantPids = (rows: ProcessRow[], rootPid: number) => {
  const descendants = new Set([rootPid])
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      if (descendants.has(row.ppid) && !descendants.has(row.pid)) {
        descendants.add(row.pid)
        changed = true
      }
    }
  }
  return descendants
}

const isWorkerd = (command: string) =>
  command.split("/").at(-1)?.toLowerCase().includes("workerd") === true

export const summarizeProcessMemory = (
  rows: ProcessRow[],
  rootPid: number
): ProcessMemorySample => {
  const processTree = descendantPids(rows, rootPid)
  const treeRows = rows.filter((row) => processTree.has(row.pid))
  const workerdRows = treeRows.filter((row) => isWorkerd(row.command))
  return {
    processTreeRssKiB: treeRows.reduce((total, row) => total + row.rssKiB, 0),
    workerdPids: workerdRows.map((row) => row.pid).toSorted((a, b) => a - b),
    workerdRssKiB: workerdRows.reduce((total, row) => total + row.rssKiB, 0),
    workerdSingleProcessMaxRssKiB: Math.max(
      0,
      ...workerdRows.map((row) => row.rssKiB)
    ),
  }
}

export const parseConcurrency = (
  args: string[],
  environmentValue = process.env.UPLOAD_MEMORY_SMOKE_CONCURRENCY
) => {
  const argument = args.find((value) => value.startsWith("--concurrency="))
  const raw = argument?.slice("--concurrency=".length) ?? environmentValue
  const concurrency = raw
    ? Number(raw)
    : UPLOAD_MEMORY_SMOKE_DEFAULT_CONCURRENCY
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 2 ||
    concurrency > UPLOAD_MEMORY_SMOKE_MAX_CONCURRENCY
  ) {
    throw new Error(
      `concurrency must be an integer from 2 to ${UPLOAD_MEMORY_SMOKE_MAX_CONCURRENCY.toString()}`
    )
  }
  return concurrency
}
