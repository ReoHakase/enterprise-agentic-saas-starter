"use client"

import { useEffect, useState } from "react"

const dateFormatterOptions: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
}
const dateTimeFormatterOptions: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
}
const localDateFormatter = new Intl.DateTimeFormat("en", dateFormatterOptions)
const localDateTimeFormatter = new Intl.DateTimeFormat(
  "en",
  dateTimeFormatterOptions
)
const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

const formatUtcDate = (date: Date, includeTime: boolean) => {
  const month = monthNames[date.getUTCMonth()]
  if (!month) return "Unknown"

  const dateText = `${month} ${date.getUTCDate().toString()}, ${date.getUTCFullYear().toString()}`
  if (!includeTime) return dateText

  const hours = date.getUTCHours()
  const displayHours = hours % 12 || 12
  const minutes = date.getUTCMinutes().toString().padStart(2, "0")
  return `${dateText}, ${displayHours.toString()}:${minutes} ${hours < 12 ? "AM" : "PM"}`
}

const formatDate = (
  value: string,
  options: { includeTime: boolean; local: boolean }
) => {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return "Unknown"

  const date = new Date(timestamp)
  if (!options.local) return formatUtcDate(date, options.includeTime)
  if (options.includeTime) {
    return localDateTimeFormatter.format(date)
  }
  return localDateFormatter.format(date)
}

export const LocalDate = ({
  includeTime = false,
  value,
}: {
  includeTime?: boolean
  value: string
}) => {
  const [formatted, setFormatted] = useState(() =>
    formatDate(value, { includeTime, local: false })
  )

  useEffect(() => {
    setFormatted(formatDate(value, { includeTime, local: true }))
  }, [includeTime, value])

  return <time dateTime={value}>{formatted}</time>
}
