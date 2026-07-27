import * as v from "valibot"

export const parseToolValue = <
  const TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema,
  value: unknown
): v.InferOutput<TSchema> => {
  const parsed = v.safeParse(schema, value)
  if (!parsed.success) throw new Error("Agent tool execution failed")
  return parsed.output
}
