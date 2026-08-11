import { HttpError } from "../../errors/http-error"

export const normalizeIssueRequiredText = (value: string, field: string) => {
  const normalized = value.trim()
  if (!normalized) {
    const message = `${field} is required.`
    throw new HttpError({
      code: "validation_error",
      fieldErrors: { [field]: [message] },
      publicMessage: message,
    })
  }
  return normalized
}

export const normalizeIssueLabels = (labels: readonly string[]) => {
  const distinct = new Map<string, string>()
  for (const label of labels) {
    const trimmed = label.trim()
    const key = trimmed.toLocaleLowerCase("en-US")
    if (trimmed && !distinct.has(key)) distinct.set(key, trimmed)
  }
  return [...distinct.values()]
}

export const parseIssueDueDate = (value: string | null | undefined) => {
  if (value === undefined) return undefined
  if (value === null) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new HttpError({
      code: "validation_error",
      fieldErrors: { dueDate: ["Enter a valid date and time."] },
      publicMessage: "Enter a valid due date and time.",
    })
  }
  return date
}
