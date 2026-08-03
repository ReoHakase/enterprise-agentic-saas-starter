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

const toMcpInputJsonSchema = (schema: DirectToolSchema<unknown>) => {
  const jsonSchema = toMcpJsonSchema(schema)
  return jsonSchema.type === "object"
    ? jsonSchema
    : { ...jsonSchema, type: "object" as const }
}

const toMcpOutput = (schema: DirectToolSchema<unknown>) => {
  const jsonSchema = toMcpJsonSchema(schema)
  if (jsonSchema.type === "object") {
    return { jsonSchema, wrap: (value: unknown) => value }
  }
  if (jsonSchema.type !== "array") {
    throw new Error("MCP tool output schema must describe an object or array")
  }
  const { $schema, ...items } = jsonSchema
  return {
    jsonSchema: {
      $schema,
      type: "object" as const,
      properties: { items },
      required: ["items"],
      additionalProperties: false,
    },
    wrap: (value: unknown) => ({ items: value }),
  }
}

export const createMcpDirectTool = <Input, Output>(options: {
  annotations: DirectToolAnnotations
  description: string
  execute: (input: Input) => Promise<Output>
  id: string
  inputSchema: DirectToolSchema<Input>
  outputSchema: DirectToolSchema<Output>
}) => {
  const output = toMcpOutput(options.outputSchema)
  return createTool({
    id: options.id,
    description: options.description,
    inputSchema: toMcpInputJsonSchema(options.inputSchema),
    outputSchema: output.jsonSchema,
    strict: true,
    mcp: { annotations: options.annotations },
    execute: async (input) =>
      output.wrap(
        parseToolValue(
          options.outputSchema,
          await options.execute(parseToolValue(options.inputSchema, input))
        )
      ),
  })
}
