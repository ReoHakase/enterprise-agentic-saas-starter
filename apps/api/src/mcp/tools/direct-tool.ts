import { createTool } from "@mastra/core/tools"
import { toJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"

type DirectToolSchema<Output> = v.BaseSchema<
  unknown,
  Output,
  v.BaseIssue<unknown>
>

type DirectToolAnnotations = {
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
  readOnlyHint: boolean
}

const parseToolValue = <Output>(
  schema: DirectToolSchema<Output>,
  value: unknown
): Output => {
  const parsed = v.safeParse(schema, value)
  if (!parsed.success) throw new Error("MCP tool execution failed")
  return parsed.output
}

const toMcpJsonSchema = (schema: DirectToolSchema<unknown>) =>
  toJsonSchema(schema, {
    overrideAction: ({ jsonSchema, valibotAction }) =>
      valibotAction.type === "check_items"
        ? { ...jsonSchema, uniqueItems: true }
        : undefined,
  })

export const createMcpDirectTool = <Input, Output>(options: {
  annotations: DirectToolAnnotations
  description: string
  execute: (input: Input) => Promise<Output>
  id: string
  inputSchema: DirectToolSchema<Input>
  outputSchema: DirectToolSchema<Output>
}) =>
  createTool({
    id: options.id,
    description: options.description,
    inputSchema: toMcpJsonSchema(options.inputSchema),
    outputSchema: toMcpJsonSchema(options.outputSchema),
    strict: true,
    mcp: { annotations: options.annotations },
    execute: async (input) =>
      parseToolValue(
        options.outputSchema,
        await options.execute(parseToolValue(options.inputSchema, input))
      ),
  })
