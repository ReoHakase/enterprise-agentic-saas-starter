"use client"

import { toast } from "sonner"

import { presentConsoleApiError } from "./error"

export const showConsoleApiErrorToast = (error: unknown, fallback: string) => {
  const { description, message } = presentConsoleApiError(error, fallback)
  toast.error(message, description ? { description } : undefined)
}
