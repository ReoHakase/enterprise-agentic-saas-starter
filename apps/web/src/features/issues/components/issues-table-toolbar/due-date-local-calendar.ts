export const formatLocalDate = (date: Date) =>
  [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("-")

export const parseLocalDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (!match) return undefined
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
}

export const getLocalBoundaryOffset = (value: string, days = 0) => {
  const date = parseLocalDate(value)
  if (!date) return 0
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.getTimezoneOffset()
}
