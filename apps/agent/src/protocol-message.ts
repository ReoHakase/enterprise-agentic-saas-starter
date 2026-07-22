import type { WSMessage } from "agents"

import {
  parseAgentChatInput,
  parseStrictCurrentUserMessage,
} from "./chat-input"

const CHAT_REQUEST_TYPE = "cf_agent_use_chat_request"
const CHAT_MESSAGES_TYPE = "cf_agent_chat_messages"
const CHAT_CANCEL_TYPE = "cf_agent_chat_request_cancel"
const STREAM_RESUME_ACK_TYPE = "cf_agent_stream_resume_ack"
const STREAM_RESUME_REQUEST_TYPE = "cf_agent_stream_resume_request"
const TOOL_RESULT_TYPE = "cf_agent_tool_result"
const RPC_TYPE = "rpc"
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const TOOL_CALL_ID_PATTERN = /^[A-Za-z0-9._~-]{1,256}$/
const RESUME_TICKET_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/
const CLIENT_TOOL_NAMES = new Set([
  "ui_navigate",
  "ui_open_issue",
  "ui_patch_form_draft",
  "ui_read_form_draft",
  "ui_set_issue_query",
])
const CHAT_BODY_KEYS = new Set([
  "assetIds",
  "clientTools",
  "messages",
  "timezone",
  "trigger",
])
const textEncoder = new TextEncoder()

export const MAX_PROTOCOL_FRAME_BYTES = 1024 * 1024

export type ProtocolMessageInspection =
  | {
      accepted: true
      cancelRequestId?: string
      forwardMessage?: string
      requestId?: string
    }
  | {
      accepted: false
      closeCode: 1003 | 1008 | 1009
      reason:
        | "Invalid agent request"
        | "Message too large"
        | "Unsupported message"
    }

const invalidRequest = (): ProtocolMessageInspection => ({
  accepted: false,
  closeCode: 1008,
  reason: "Invalid agent request",
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const hasOnlyKeys = (
  value: Record<string, unknown>,
  keys: ReadonlySet<string>
): boolean => Object.keys(value).every((key) => keys.has(key))

const isBoundedFrame = (message: string): boolean =>
  message.length <= MAX_PROTOCOL_FRAME_BYTES &&
  textEncoder.encode(message).byteLength <= MAX_PROTOCOL_FRAME_BYTES

const hasAuthoritativeMessageId = (
  messages: readonly unknown[],
  messageId: string
): boolean =>
  messages.some((message) => isRecord(message) && message.id === messageId)

const inspectChatRequest = (
  frame: Record<string, unknown>,
  authoritativeMessages: readonly unknown[],
  now: number
): ProtocolMessageInspection => {
  const requestId = frame.id
  const init = frame.init
  if (
    typeof requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(requestId) ||
    !isRecord(init) ||
    init.method !== "POST" ||
    typeof init.body !== "string"
  ) {
    return invalidRequest()
  }

  let body: unknown
  try {
    body = JSON.parse(init.body)
  } catch {
    return invalidRequest()
  }
  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => !CHAT_BODY_KEYS.has(key))
  ) {
    return invalidRequest()
  }
  if (
    !Array.isArray(body.messages) ||
    (body.clientTools !== undefined && !Array.isArray(body.clientTools)) ||
    body.trigger !== "submit-message"
  ) {
    return invalidRequest()
  }

  const chatInput = parseAgentChatInput({
    assetIds: body.assetIds,
    timezone: body.timezone,
  })
  if (chatInput === undefined) return invalidRequest()
  const currentMessage = parseStrictCurrentUserMessage(
    body.messages.at(-1),
    chatInput.assetIds,
    now
  )
  if (
    currentMessage === undefined ||
    hasAuthoritativeMessageId(authoritativeMessages, currentMessage.id)
  ) {
    return invalidRequest()
  }

  let forwardMessage: string
  try {
    const canonicalBody = JSON.stringify({
      messages: [...authoritativeMessages, currentMessage],
      trigger: "submit-message",
      assetIds: chatInput.assetIds,
      timezone: chatInput.timezone,
    })
    forwardMessage = JSON.stringify({
      id: requestId,
      init: { body: canonicalBody, method: "POST" },
      type: CHAT_REQUEST_TYPE,
    })
  } catch {
    return invalidRequest()
  }
  if (!isBoundedFrame(forwardMessage)) {
    return {
      accepted: false,
      closeCode: 1009,
      reason: "Message too large",
    }
  }

  return { accepted: true, forwardMessage, requestId }
}

const inspectToolResult = (
  frame: Record<string, unknown>
): ProtocolMessageInspection => {
  const allowedKeys = new Set([
    "autoContinue",
    "clientTools",
    "errorText",
    "output",
    "state",
    "toolCallId",
    "toolName",
    "type",
  ])
  const { autoContinue, clientTools, errorText, output, state } = frame
  const toolCallId = frame.toolCallId
  const toolName = frame.toolName
  if (
    !hasOnlyKeys(frame, allowedKeys) ||
    typeof toolCallId !== "string" ||
    !TOOL_CALL_ID_PATTERN.test(toolCallId) ||
    typeof toolName !== "string" ||
    !CLIENT_TOOL_NAMES.has(toolName) ||
    (autoContinue !== undefined && typeof autoContinue !== "boolean") ||
    (clientTools !== undefined && !Array.isArray(clientTools))
  ) {
    return invalidRequest()
  }

  const outputError = state === "output-error"
  if (
    (state !== undefined && state !== "output-available" && !outputError) ||
    (outputError &&
      (typeof errorText !== "string" ||
        errorText.length < 1 ||
        errorText.length > 2_000)) ||
    (!outputError && !Object.hasOwn(frame, "output")) ||
    (!outputError && errorText !== undefined)
  ) {
    return invalidRequest()
  }

  const canonicalFrame = {
    type: TOOL_RESULT_TYPE,
    toolCallId,
    toolName,
    ...(outputError ? {} : { output }),
    ...(state === undefined ? {} : { state }),
    ...(outputError ? { errorText } : {}),
    ...(autoContinue === undefined
      ? {}
      : { autoContinue: outputError ? false : autoContinue }),
  }
  const forwardMessage = JSON.stringify(canonicalFrame)
  return isBoundedFrame(forwardMessage)
    ? { accepted: true, forwardMessage }
    : {
        accepted: false,
        closeCode: 1009,
        reason: "Message too large",
      }
}

const inspectRpcRequest = (
  frame: Record<string, unknown>
): ProtocolMessageInspection => {
  const id = frame.id
  const args = frame.args
  const input = Array.isArray(args) ? args[0] : undefined
  if (
    !hasOnlyKeys(frame, new Set(["args", "id", "method", "type"])) ||
    typeof id !== "string" ||
    !REQUEST_ID_PATTERN.test(id) ||
    frame.method !== "resumeIssueAction" ||
    !Array.isArray(args) ||
    args.length !== 1 ||
    !isRecord(input) ||
    !hasOnlyKeys(input, new Set(["actionId", "resumeTicket"])) ||
    typeof input.actionId !== "string" ||
    !REQUEST_ID_PATTERN.test(input.actionId) ||
    typeof input.resumeTicket !== "string" ||
    !RESUME_TICKET_PATTERN.test(input.resumeTicket)
  ) {
    return invalidRequest()
  }

  return {
    accepted: true,
    forwardMessage: JSON.stringify({
      args: [{ actionId: input.actionId, resumeTicket: input.resumeTicket }],
      id,
      method: "resumeIssueAction",
      type: RPC_TYPE,
    }),
  }
}

export const inspectProtocolMessage = (
  message: WSMessage,
  authoritativeMessages: readonly unknown[] = [],
  now = Date.now()
): ProtocolMessageInspection => {
  if (typeof message !== "string") {
    return {
      accepted: false,
      closeCode: 1003,
      reason: "Unsupported message",
    }
  }
  if (!isBoundedFrame(message)) {
    return {
      accepted: false,
      closeCode: 1009,
      reason: "Message too large",
    }
  }

  let frame: unknown
  try {
    frame = JSON.parse(message)
  } catch {
    return invalidRequest()
  }
  if (!isRecord(frame)) return invalidRequest()

  const type = frame.type
  if (typeof type !== "string") return invalidRequest()
  if (type === CHAT_REQUEST_TYPE) {
    return inspectChatRequest(frame, authoritativeMessages, now)
  }

  // This application keeps the Durable Object transcript authoritative. The
  // generic client history-replacement frame would otherwise bypass the
  // per-turn validation above and persist arbitrary UIMessage parts.
  if (type === CHAT_MESSAGES_TYPE) return invalidRequest()
  if (type === CHAT_CANCEL_TYPE) {
    const id = frame.id
    return hasOnlyKeys(frame, new Set(["id", "type"])) &&
      typeof id === "string" &&
      REQUEST_ID_PATTERN.test(id)
      ? { accepted: true, cancelRequestId: id }
      : invalidRequest()
  }
  if (type === STREAM_RESUME_REQUEST_TYPE) {
    return hasOnlyKeys(frame, new Set(["type"]))
      ? { accepted: true }
      : invalidRequest()
  }
  if (type === STREAM_RESUME_ACK_TYPE) {
    return hasOnlyKeys(frame, new Set(["id", "type"])) &&
      typeof frame.id === "string" &&
      REQUEST_ID_PATTERN.test(frame.id)
      ? { accepted: true }
      : invalidRequest()
  }
  if (type === TOOL_RESULT_TYPE) {
    // The SDK owns outstanding-call reconciliation because client results can
    // arrive while its private streaming message has not reached this.messages.
    // We fence and canonicalize the untrusted result before that reconciliation.
    return inspectToolResult(frame)
  }
  if (type === RPC_TYPE) return inspectRpcRequest(frame)

  return {
    accepted: false,
    closeCode: 1008,
    reason: "Unsupported message",
  }
}
