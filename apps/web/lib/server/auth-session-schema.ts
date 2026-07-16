import * as v from "valibot"

export const sessionSchema = v.object({
  session: v.object({
    id: v.string(),
    userId: v.string(),
    expiresAt: v.union([v.string(), v.date()]),
  }),
  user: v.object({
    id: v.string(),
    email: v.pipe(v.string(), v.email()),
    name: v.optional(v.nullable(v.string())),
    image: v.optional(v.nullable(v.string())),
  }),
})

export type Session = v.InferOutput<typeof sessionSchema>

export const parseSession = (value: unknown): Session | null => {
  const result = v.safeParse(sessionSchema, value)
  return result.success ? result.output : null
}
