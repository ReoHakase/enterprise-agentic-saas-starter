import { z } from "zod"

export const renameThreadInputSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
  })
  .strict()
