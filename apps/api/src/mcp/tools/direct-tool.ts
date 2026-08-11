import {
  createTool,
  type ToolAction,
  type ToolExecutionContext,
} from "@mastra/core/tools"
import { toJsonSchema, toStandardJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"

import { toMcpToolError } from "./write-application"

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

const withMcpJsonSchema = (
  schema: DirectToolSchema<unknown>,
  jsonSchema: ReturnType<typeof toJsonSchema>
) => {
  const standardSchema = toStandardJsonSchema(schema)
  return {
    "~standard": {
      ...standardSchema["~standard"],
      jsonSchema: {
        input: () => ({ ...jsonSchema }),
        output: () => ({ ...jsonSchema }),
      },
    },
  }
}

const toMcpInputJsonSchema = (schema: DirectToolSchema<unknown>) => {
  const jsonSchema = toMcpJsonSchema(schema)
  return withMcpJsonSchema(
    schema,
    jsonSchema.type === "object"
      ? jsonSchema
      : { ...jsonSchema, type: "object" as const }
  )
}

const toMcpOutput = (schema: DirectToolSchema<unknown>) => {
  const jsonSchema = toMcpJsonSchema(schema)
  if (jsonSchema.type === "object") {
    return {
      schema: withMcpJsonSchema(schema, jsonSchema),
      wrap: (value: unknown) => value,
    }
  }
  if (jsonSchema.type !== "array") {
    throw new Error("MCP tool output schema must describe an object or array")
  }
  const wrappedSchema = v.strictObject({ items: schema })
  return {
    schema: withMcpJsonSchema(wrappedSchema, toMcpJsonSchema(wrappedSchema)),
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
    outputSchema: output.schema,
    strict: true,
    mcp: { annotations: options.annotations },
    execute: async (input) =>
      output.wrap(
        await options.execute(parseToolValue(options.inputSchema, input))
      ),
  })
}

export const createMcpSharedTool = <
  Input,
  Output,
  Context extends ToolExecutionContext = ToolExecutionContext,
>(
  tool: ToolAction<Input, Output, unknown, unknown, Context>
) => {
  const execute = tool.execute
  if (!execute) throw new Error(`MCP tool ${tool.id} has no executor`)
  tool.execute = async (input, context) => {
    try {
      return await execute(input, context)
    } catch (cause) {
      throw toMcpToolError(cause)
    }
  }
  return tool
}
