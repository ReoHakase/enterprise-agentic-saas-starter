import type { Issue } from "./schema"

const normalizedLabelKey = (label: string) =>
  label.trim().toLocaleLowerCase("en-US")

export const deriveIssueLabelSuggestions = (issues: Issue[]) => {
  const labelsByKey = new Map<string, string>()

  for (const issue of issues) {
    for (const label of issue.labels) {
      const trimmedLabel = label.trim()
      if (!trimmedLabel) continue

      const key = normalizedLabelKey(trimmedLabel)
      const existing = labelsByKey.get(key)
      if (!existing || trimmedLabel.localeCompare(existing, "en") < 0) {
        labelsByKey.set(key, trimmedLabel)
      }
    }
  }

  return [...labelsByKey.values()].toSorted((left, right) =>
    left.localeCompare(right, "en", { sensitivity: "base" })
  )
}
