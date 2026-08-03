import { Buffer } from "node:buffer"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  Page,
  TestInfo,
} from "@playwright/test"

import { expect, test } from "../fixtures/test"

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const requiredString = (record: JsonRecord, key: string) => {
  const value = Reflect.get(record, key)
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`MCP OAuth E1 ${key} is missing`)
  }
  return value
}

const requiredNumber = (record: JsonRecord, key: string) => {
  const value = Reflect.get(record, key)
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`MCP OAuth E1 ${key} is missing`)
  }
  return value
}

const parseRecordResponse = async (
  response: Awaited<ReturnType<APIRequestContext["post"]>>,
  label: string
) => {
  expect(response.status(), `${label} status`).toBeGreaterThanOrEqual(200)
  expect(response.status(), `${label} status`).toBeLessThan(300)
  const body: unknown = await response.json()
  if (!isRecord(body)) throw new Error(`MCP OAuth E1 ${label} is invalid`)
  return body
}

const metadataString = (testInfo: TestInfo, key: string) => {
  const value = Reflect.get(testInfo.config.metadata, key)
  if (typeof value !== "string" || !value.startsWith("http://")) {
    throw new Error(`MCP OAuth E1 ${key} metadata is invalid`)
  }
  return value
}

const runNamespace = (testInfo: TestInfo) => {
  const runId = Reflect.get(testInfo.config.metadata, "agentE2ERunId")
  if (typeof runId !== "number" || !Number.isSafeInteger(runId)) {
    throw new Error("MCP OAuth E1 run metadata is invalid")
  }
  return `mcp-e1-${runId}-${testInfo.retry}-${testInfo.repeatEachIndex}`
}

const cookieHeader = async (context: BrowserContext) =>
  (await context.cookies())
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ")

const signInWithLocalGitHub = async (page: Page) => {
  await page.getByRole("button", { name: "GitHub" }).click()
  await page.getByRole("button", { name: /oauth-carol/u }).click()
}

const provisionOrganization = async (input: {
  apiOrigin: string
  browser: Browser
  name: string
  slug: string
  webOrigin: string
}) => {
  const context = await input.browser.newContext({ baseURL: input.webOrigin })
  try {
    const page = await context.newPage()
    await page.goto("/auth/sign-in?redirectTo=%2Fsettings%2Forganizations")
    await signInWithLocalGitHub(page)
    await expect(page).toHaveURL(/\/settings\/organizations$/u)
    const response = await context.request.post(
      `${input.apiOrigin}/organizations`,
      {
        headers: {
          cookie: await cookieHeader(context),
          origin: input.webOrigin,
        },
        data: { name: input.name, slug: input.slug },
      }
    )
    const organization = await parseRecordResponse(
      response,
      "organization creation"
    )
    const organizationId = requiredString(organization, "id")
    const secondaryResponse = await context.request.post(
      `${input.apiOrigin}/organizations`,
      {
        headers: {
          cookie: await cookieHeader(context),
          origin: input.webOrigin,
        },
        data: {
          keepCurrentActiveOrganization: true,
          name: `${input.name} Secondary`,
          slug: `${input.slug}-secondary`,
        },
      }
    )
    await parseRecordResponse(
      secondaryResponse,
      "secondary organization creation"
    )
    const signOutResponse = await context.request.post(
      `${input.apiOrigin}/auth/sign-out`,
      {
        data: {},
        headers: {
          cookie: await cookieHeader(context),
          origin: input.webOrigin,
        },
      }
    )
    expect(signOutResponse.status(), "fixture sign out status").toBe(200)
    return organizationId
  } finally {
    await context.close()
  }
}

const base64Url = (value: Uint8Array | ArrayBuffer) =>
  Buffer.from(
    value instanceof Uint8Array ? value : new Uint8Array(value)
  ).toString("base64url")

const createPkce = async () => {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = base64Url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  )
  return { challenge, verifier }
}

const registerClient = async (input: {
  apiOrigin: string
  clientName: string
  redirectUri: string
  request: APIRequestContext
  scope: string
}) => {
  const response = await input.request.post(
    `${input.apiOrigin}/auth/oauth2/register`,
    {
      data: {
        client_name: input.clientName,
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: [input.redirectUri],
        response_types: ["code"],
        scope: input.scope,
        token_endpoint_auth_method: "none",
      },
    }
  )
  const client = await parseRecordResponse(response, "client registration")
  expect(client).not.toHaveProperty("client_secret")
  return requiredString(client, "client_id")
}

const authorizeClient = async (input: {
  apiPublicOrigin: string
  challenge: string
  clientId: string
  organizationName: string
  page: Page
  redirectUri: string
  resource: string
  scope: string
  state: string
}) => {
  const authorizationUrl = new URL(
    "/auth/oauth2/authorize",
    input.apiPublicOrigin
  )
  authorizationUrl.search = new URLSearchParams({
    client_id: input.clientId,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    redirect_uri: input.redirectUri,
    resource: input.resource,
    response_type: "code",
    scope: input.scope,
    state: input.state,
  }).toString()

  const callbackPattern = `${input.redirectUri}*`
  await input.page.route(callbackPattern, (route) =>
    route.fulfill({
      body: "<!doctype html><title>MCP OAuth callback</title>",
      contentType: "text/html",
      status: 200,
    })
  )
  await input.page.goto(authorizationUrl.toString())
  await expect(input.page).toHaveURL(/\/auth\/sign-in/u)
  await signInWithLocalGitHub(input.page)
  await expect(input.page).toHaveURL(/\/oauth\/organization/u)
  const continuation = input.page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/auth/oauth2/continue" &&
      response.request().method() === "POST",
    { timeout: 30_000 }
  )
  await input.page
    .getByRole("button")
    .filter({
      has: input.page.getByText(input.organizationName, { exact: true }),
    })
    .click()
  const continuationResponse = await continuation
  if (continuationResponse.status() !== 200) {
    const body: unknown = await continuationResponse.json()
    const code = isRecord(body) ? Reflect.get(body, "code") : undefined
    throw new Error(
      `MCP OAuth E1 organization continuation failed${
        typeof code === "string" ? ` (${code})` : ""
      }`
    )
  }
  await expect(input.page).toHaveURL(/\/oauth\/consent/u)
  await expect(
    input.page.getByRole("list", { name: "Requested access" })
  ).toBeVisible()
  const consent = input.page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/auth/oauth2/consent" &&
      response.request().method() === "POST",
    { timeout: 30_000 }
  )
  await input.page.getByRole("button", { name: "Allow" }).click()
  const consentResponse = await consent
  if (consentResponse.status() !== 200) {
    const body: unknown = await consentResponse.json()
    const code = isRecord(body)
      ? (Reflect.get(body, "code") ?? Reflect.get(body, "error"))
      : undefined
    throw new Error(
      `MCP OAuth E1 consent failed${
        typeof code === "string" ? ` (${code})` : ""
      }`
    )
  }
  await expect
    .poll(() => new URL(input.page.url()).searchParams.has("code"))
    .toBe(true)

  const callback = new URL(input.page.url())
  expect(`${callback.origin}${callback.pathname}`).toBe(input.redirectUri)
  expect(callback.searchParams.get("state")).toBe(input.state)
  const code = callback.searchParams.get("code")
  if (!code) throw new Error("MCP OAuth E1 authorization code is missing")
  await input.page.unroute(callbackPattern)
  await input.page.goto("/")
  return code
}

const exchangeCode = async (input: {
  apiOrigin: string
  clientId: string
  code: string
  redirectUri: string
  request: APIRequestContext
  resource: string
  verifier: string
}) => {
  const response = await input.request.post(
    `${input.apiOrigin}/auth/oauth2/token`,
    {
      form: {
        client_id: input.clientId,
        code: input.code,
        code_verifier: input.verifier,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
        resource: input.resource,
      },
    }
  )
  if (!response.ok()) {
    const body: unknown = await response.json()
    const code = isRecord(body)
      ? (Reflect.get(body, "code") ?? Reflect.get(body, "error"))
      : undefined
    throw new Error(
      `MCP OAuth E1 token exchange failed${
        typeof code === "string" ? ` (${code})` : ""
      }`
    )
  }
  const token = await parseRecordResponse(response, "token exchange")
  expect(token).toHaveProperty("refresh_token")
  return requiredString(token, "access_token")
}

const connectMcpClient = async (mcpUrl: string, accessToken: string) => {
  const client = new Client(
    { name: "enterprise-agentic-saas-e1", version: "1.0.0" },
    { capabilities: {} }
  )
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: {
      headers: { authorization: `Bearer ${accessToken}` },
    },
  })
  await client.connect(transport)
  return client
}

const callStructuredTool = async (
  client: Client,
  name: string,
  args: JsonRecord
) => {
  const result = await client.callTool({ arguments: args, name })
  expect(result.isError).not.toBe(true)
  if (!isRecord(result.structuredContent)) {
    throw new Error(`MCP OAuth E1 ${name} result is invalid`)
  }
  return result.structuredContent
}

const issueFromReceipt = (receipt: JsonRecord) => {
  const issue = Reflect.get(receipt, "issue")
  if (!isRecord(issue)) throw new Error("MCP OAuth E1 receipt is invalid")
  return issue
}

const rejectMcpMethod = async (input: {
  accessToken: string
  apiOrigin: string
  message: JsonRecord
  request: APIRequestContext
}) => {
  const response = await input.request.post(`${input.apiOrigin}/mcp`, {
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
    },
    data: input.message,
  })
  expect(response.status()).toBe(401)
}

test("OAuth MCPで公開contextとIssue attachment lifecycleを認可できる", async ({
  browser,
  context,
  page,
}, testInfo) => {
  const apiOrigin = metadataString(testInfo, "agentE2EApiOrigin")
  const apiPublicOrigin = metadataString(testInfo, "mcpE2EApiPublicOrigin")
  const webOrigin = String(testInfo.project.use.baseURL)
  const namespace = runNamespace(testInfo)
  const organizationName = `MCP E1 ${namespace}`
  const organizationSlug = namespace
  const organizationId = await provisionOrganization({
    apiOrigin,
    browser,
    name: organizationName,
    slug: organizationSlug,
    webOrigin,
  })
  const redirectUri = new URL("/oauth/client-callback", webOrigin).toString()
  const resource = new URL("/mcp", apiPublicOrigin).toString()
  const scope = [
    "offline_access",
    "account:read",
    "organization:read",
    "members:read",
    "issues:read",
    "issues:create",
    "issues:update",
    "issues:delete",
    "files:read",
    "files:write",
  ].join(" ")
  const clientId = await registerClient({
    apiOrigin,
    clientName: `MCP E1 client ${namespace}`,
    redirectUri,
    request: context.request,
    scope,
  })
  const pkce = await createPkce()
  const state = crypto.randomUUID()
  const code = await authorizeClient({
    apiPublicOrigin,
    challenge: pkce.challenge,
    clientId,
    organizationName,
    page,
    redirectUri,
    resource,
    scope,
    state,
  })
  const organizationAdminCookie = await cookieHeader(context)
  await context.clearCookies()
  const accessToken = await exchangeCode({
    apiOrigin,
    clientId,
    code,
    redirectUri,
    request: context.request,
    resource,
    verifier: pkce.verifier,
  })

  const client = await connectMcpClient(`${apiOrigin}/mcp`, accessToken)
  expect(client.getServerVersion()).toMatchObject({
    name: "Enterprise Agentic SaaS",
    version: "0.0.1",
  })

  const prompts = await client.listPrompts()
  expect(prompts.prompts.map(({ name }) => name)).toEqual(["triage_issue"])
  const prompt = await client.getPrompt({
    name: "triage_issue",
    arguments: { request: `Create the ${namespace} Issue.` },
  })
  expect(prompt.messages).toHaveLength(1)
  const resources = await client.listResources()
  expect(resources.resources.map(({ uri }) => uri)).toEqual([
    "guide://enterprise-agentic-saas/issues",
    "guide://enterprise-agentic-saas/attachments",
  ])
  const guide = await client.readResource({
    uri: "guide://enterprise-agentic-saas/issues",
  })
  expect(guide.contents).toEqual([
    expect.objectContaining({
      text: expect.stringContaining("Issue workflow"),
    }),
  ])

  const tools = await client.listTools()
  const toolNames = tools.tools.map(({ name }) => name)
  expect(toolNames).toEqual(
    expect.arrayContaining([
      "read_active_organization",
      "search_issues",
      "get_issue",
      "create_issue",
      "update_issue",
      "delete_issue",
      "create_attachment_upload_session",
      "add_issue_attachments",
      "remove_issue_attachments",
    ])
  )
  expect(toolNames).not.toContain("get_skill")
  expect(toolNames.every((name) => !/^(?:ask_|run_|ui_)/u.test(name))).toBe(
    true
  )

  const organization = await callStructuredTool(
    client,
    "read_active_organization",
    {}
  )
  expect(organization).toMatchObject({ name: organizationName, role: "owner" })

  const created = issueFromReceipt(
    await callStructuredTool(client, "create_issue", {
      description: "Created through the deterministic OAuth MCP E1.",
      idempotencyKey: `${namespace}.create.issue`,
      priority: "high",
      title: `OAuth MCP ${namespace}`,
    })
  )
  const issueId = requiredString(created, "id")
  let revision = requiredNumber(created, "revision")

  const read = await callStructuredTool(client, "get_issue", {
    id: issueId,
    lookup: "id",
  })
  expect(read).toMatchObject({ id: issueId, revision })

  const updated = issueFromReceipt(
    await callStructuredTool(client, "update_issue", {
      description: "Updated through the deterministic OAuth MCP E1.",
      expectedRevision: revision,
      idempotencyKey: `${namespace}.update.issue`,
      issueId,
    })
  )
  revision = requiredNumber(updated, "revision")

  const attachmentBytes = Buffer.from(`MCP E1 attachment ${namespace}\n`)
  const upload = await callStructuredTool(
    client,
    "create_attachment_upload_session",
    {
      declaredContentType: "text/plain",
      filename: `${namespace}.txt`,
      idempotencyKey: `${namespace}.upload.session`,
      sizeBytes: attachmentBytes.byteLength,
    }
  )
  const uploadId = requiredString(upload, "uploadId")
  const uploadResponse = await context.request.put(
    requiredString(upload, "uploadUrl"),
    {
      data: attachmentBytes,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-length": String(attachmentBytes.byteLength),
        "content-type": "text/plain",
      },
    }
  )
  expect(uploadResponse.status()).toBe(204)
  const uploadStatus = await callStructuredTool(
    client,
    "get_attachment_upload_status",
    { uploadId }
  )
  expect(uploadStatus).toMatchObject({ status: "ready", uploadId })
  const assetId = requiredString(uploadStatus, "assetId")

  const attached = issueFromReceipt(
    await callStructuredTool(client, "add_issue_attachments", {
      assetIds: [assetId],
      expectedRevision: revision,
      idempotencyKey: `${namespace}.add.attachment`,
      issueId,
    })
  )
  revision = requiredNumber(attached, "revision")
  const attachmentMutation = Reflect.get(attached, "attachmentMutation")
  if (!isRecord(attachmentMutation)) {
    throw new Error("MCP OAuth E1 attachment receipt is invalid")
  }
  const fileIds = Reflect.get(attachmentMutation, "fileIds")
  if (
    !Array.isArray(fileIds) ||
    fileIds.length !== 1 ||
    typeof fileIds[0] !== "string"
  ) {
    throw new Error("MCP OAuth E1 file id is missing")
  }

  const removed = issueFromReceipt(
    await callStructuredTool(client, "remove_issue_attachments", {
      expectedRevision: revision,
      fileIds,
      idempotencyKey: `${namespace}.remove.attachment`,
      issueId,
    })
  )
  revision = requiredNumber(removed, "revision")

  const deleted = issueFromReceipt(
    await callStructuredTool(client, "delete_issue", {
      expectedRevision: revision,
      idempotencyKey: `${namespace}.delete.issue`,
      issueId,
    })
  )
  expect(deleted).toMatchObject({ deleted: true, id: issueId })
  await client.close()

  const removal = await context.request.delete(
    `${apiOrigin}/organizations/${organizationId}`,
    {
      data: {
        confirmation: "DELETE",
        idempotencyKey: `${namespace}.delete.organization`,
        slug: organizationSlug,
      },
      headers: {
        cookie: organizationAdminCookie,
        origin: webOrigin,
      },
    }
  )
  expect(removal.status()).toBe(200)

  await rejectMcpMethod({
    accessToken,
    apiOrigin,
    message: { jsonrpc: "2.0", id: 91, method: "tools/list", params: {} },
    request: context.request,
  })
  await rejectMcpMethod({
    accessToken,
    apiOrigin,
    message: {
      jsonrpc: "2.0",
      id: 92,
      method: "tools/call",
      params: { name: "read_active_organization", arguments: {} },
    },
    request: context.request,
  })

  const revocation = await context.request.post(
    `${apiOrigin}/auth/oauth2/revoke`,
    {
      form: {
        client_id: clientId,
        token: accessToken,
        token_type_hint: "access_token",
      },
    }
  )
  expect(revocation.status()).toBe(200)
  await rejectMcpMethod({
    accessToken,
    apiOrigin,
    message: {
      jsonrpc: "2.0",
      id: 93,
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "revoked-e1", version: "1.0.0" },
        protocolVersion: "2025-06-18",
      },
    },
    request: context.request,
  })
})
