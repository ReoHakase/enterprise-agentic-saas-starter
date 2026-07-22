import type { BrowserContext, Page } from "@playwright/test"

import { expect, test } from "./fixtures/test"

const mockApiUrl = "http://127.0.0.1:3001"
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
)

const resetMockApi = async () => {
  const response = await fetch(`${mockApiUrl}/__e2e/reset`, { method: "POST" })
  expect(response.ok).toBeTruthy()
}

const useAdminSession = async (context: BrowserContext) => {
  await context.addCookies([
    {
      name: "e2e-session",
      value: "admin",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ])
}

const openOrganizationMenu = async (page: Page) => {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    const agentDialog = page.getByRole("dialog", { name: "Agent" })
    if (await agentDialog.isVisible()) {
      await agentDialog.getByRole("button", { name: "Close Agent" }).click()
    }
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeVisible()
  }
  await page
    .locator('[data-slot="dropdown-menu-trigger"][data-sidebar="menu-button"]')
    .filter({ hasText: "Alpha Operations" })
    .click()
}

const selectAgentThread = async (
  page: Page,
  name: string,
  expectedThreadId: string
) => {
  await page.getByRole("combobox", { name: "Agent thread" }).click()
  await page.getByRole("option").filter({ hasText: name }).click()
  const switchDialog = page.getByRole("alertdialog", {
    name: "Switch Agent threads?",
  })
  if (await switchDialog.isVisible()) {
    await switchDialog.getByRole("button", { name: "Stop and switch" }).click()
  }
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("agentThread") === expectedThreadId
  )
}

test.beforeEach(async () => {
  await resetMockApi()
})

test("Issue検索URLはreloadとback-forwardでcanonical stateを復元する", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto("/organization/alpha-operations/issues")

  await expect(page.getByText("12 issues")).toBeVisible()
  await page.getByRole("link", { name: "Next", exact: true }).click()
  await expect(page).toHaveURL((url) => url.searchParams.get("page") === "2")
  await expect(page.getByText("Backlog fixture 03")).toBeVisible()

  const search = page.getByRole("searchbox", { name: "Search issues" })
  await search.fill("Review tenant")
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === "Review tenant" &&
      !url.searchParams.has("page")
  )
  await expect(page.getByText("Review tenant audit log")).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL((url) => url.search === "")
  await expect(
    page.getByRole("searchbox", { name: "Search issues" })
  ).toHaveValue("")
  await expect(page.getByText("12 issues")).toBeVisible()

  await page.goForward()
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("q") === "Review tenant"
  )
  await expect(
    page.getByRole("searchbox", { name: "Search issues" })
  ).toHaveValue("Review tenant")

  await page.reload()
  await expect(
    page.getByRole("searchbox", { name: "Search issues" })
  ).toHaveValue("Review tenant")
  await expect(page.getByText("Review tenant audit log")).toBeVisible()
})

test("Agent shellはconsole内で永続化しmobileではfull-screenになる", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto(
    "/organization/alpha-operations/issues?agentThread=agent-thread-a-1"
  )
  await page.getByRole("button", { name: "Open Agent" }).click()

  const viewport = page.viewportSize()
  if (!viewport) throw new Error("Expected a configured viewport")

  if (viewport.width < 768) {
    const sheet = page.getByRole("dialog", { name: "Agent" })
    await expect(sheet).toBeVisible()
    const bounds = await sheet.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds?.width).toBe(viewport.width)
    expect(bounds?.height).toBe(viewport.height)
    await page.getByRole("button", { name: "Close Agent" }).click()
    await expect(sheet).toBeHidden()
    return
  }

  const pane = page.getByRole("complementary", { name: "Agent" })
  await expect(pane).toBeVisible()
  await expect.poll(async () => (await pane.boundingBox())?.width).toBe(460)

  const separator = page.getByRole("separator", {
    name: "Resize Agent pane",
  })
  await separator.focus()
  await separator.press("ArrowLeft")
  await expect.poll(async () => (await pane.boundingBox())?.width).toBe(480)

  await page.getByRole("link", { name: "Overview", exact: true }).click()
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/organization/alpha-operations/dashboard" &&
      url.searchParams.get("agentThread") === "agent-thread-a-1"
  )
  await expect(pane).toBeVisible()
  await expect.poll(async () => (await pane.boundingBox())?.width).toBe(480)
})

test("organization切替barrierはAgent draftを保持または明示破棄する", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto("/organization/alpha-operations/agent")
  await expect(
    page.getByRole("combobox", { name: "Agent thread" })
  ).toBeVisible({ timeout: 20_000 })
  await selectAgentThread(page, "Alpha triage", "agent-thread-a-1")

  const composer = page.getByPlaceholder(
    "Describe the issue, or attach screenshots for analysis."
  )
  await expect(composer).toBeVisible({ timeout: 20_000 })
  await composer.fill("Keep this Alpha draft")

  await openOrganizationMenu(page)
  await page.getByRole("menuitem", { name: "Beta Support" }).click()
  const barrier = page.getByRole("alertdialog", {
    name: "Discard local Agent work and switch?",
  })
  await expect(barrier).toBeVisible()
  await barrier.getByRole("button", { name: "Stay here" }).click()
  await expect(page).toHaveURL(/alpha-operations\/agent/u)
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole("button", { name: "Open Agent" }).click()
  }
  await expect(composer).toHaveValue("Keep this Alpha draft")

  await openOrganizationMenu(page)
  await page.getByRole("menuitem", { name: "Beta Support" }).click()
  await barrier
    .getByRole("button", { name: "Discard local draft and switch" })
    .click()
  await expect(page).toHaveURL(/\/organization\/beta-support\/agent$/u)
  await selectAgentThread(page, "Beta triage", "agent-thread-b-1")
  await expect(
    page.getByPlaceholder(
      "Describe the issue, or attach screenshots for analysis."
    )
  ).toHaveValue("")
})

test("Agent threadはdraftと画像を分離しarchive時に一時画像を削除する", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto("/organization/alpha-operations/agent")
  await expect(
    page.getByRole("combobox", { name: "Agent thread" })
  ).toBeVisible({ timeout: 20_000 })
  await selectAgentThread(page, "Alpha triage", "agent-thread-a-1")

  const composer = page.getByPlaceholder(
    "Describe the issue, or attach screenshots for analysis."
  )
  await expect(composer).toBeVisible({ timeout: 20_000 })
  await composer.fill("Thread A draft")
  await page.locator('input[type="file"]').setInputFiles({
    name: "thread-a.png",
    mimeType: "image/png",
    buffer: tinyPng,
  })
  await expect(page.getByRole("img", { name: "thread-a.png" })).toBeVisible()

  await selectAgentThread(page, "Alpha follow-up", "agent-thread-a-2")
  await expect(
    page.getByPlaceholder(
      "Describe the issue, or attach screenshots for analysis."
    )
  ).toHaveValue("")
  await expect(page.getByRole("img", { name: "thread-a.png" })).toHaveCount(0)

  await selectAgentThread(page, "Alpha triage", "agent-thread-a-1")
  await expect(composer).toHaveValue("Thread A draft")
  await expect(page.getByRole("img", { name: "thread-a.png" })).toBeVisible()

  await page.getByRole("button", { name: "Archive Alpha triage" }).click()
  const archiveDialog = page.getByRole("alertdialog", {
    name: "Archive this Agent thread?",
  })
  await archiveDialog
    .getByRole("button", { name: "Archive and discard" })
    .click()
  await expect(page).toHaveURL(/\/organization\/alpha-operations\/agent$/u)
  await expect(page.getByText("Alpha triage", { exact: true })).toHaveCount(0)

  await expect
    .poll(async () => {
      const response = await context.request.get(
        `${mockApiUrl}/__e2e/agent-assets`
      )
      return response.json()
    })
    .toEqual([])
})

test("画像解析から承認付きIssue作成と恒久添付まで完了する", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto(
    "/organization/alpha-operations/issues?agentThread=agent-thread-a-1"
  )
  await page.getByRole("button", { name: "Open Agent" }).click()

  const agent =
    (page.viewportSize()?.width ?? 1280) < 768
      ? page.getByRole("dialog", { name: "Agent" })
      : page.getByRole("complementary", { name: "Agent" })
  await expect(agent).toBeVisible()
  const composer = agent.getByPlaceholder(
    "Describe the issue, or attach screenshots for analysis."
  )
  await expect(composer).toBeVisible()
  await agent.locator('input[type="file"]').setInputFiles({
    name: "screenshot-regression.png",
    mimeType: "image/png",
    buffer: tinyPng,
  })
  await expect(
    agent.getByRole("img", { name: "screenshot-regression.png" })
  ).toBeVisible()
  await composer.fill(
    "Describe this screenshot and create a high-priority Issue with labels, due date, assignee, and this image attached."
  )
  await agent.getByRole("button", { name: "Send" }).click()

  await expect(
    agent.getByText(
      "I analyzed the screenshot and prepared an Issue with labels, due date, assignee, and attachment."
    )
  ).toBeVisible()
  const approvalAttachments = agent.getByRole("region", {
    name: "Issue attachments awaiting approval",
  })
  await expect(approvalAttachments).toContainText(
    "These images will become permanent Issue attachments"
  )
  await expect(
    approvalAttachments.getByRole("img", {
      name: "Attachment preview: screenshot-regression.png",
    })
  ).toBeVisible()

  await expect(
    agent.getByText("Approve Issue change?", { exact: true })
  ).toBeVisible()
  await expect(agent).toContainText("Screenshot layout regression")
  await expect(agent).toContainText("ui, regression")
  await expect(agent).toContainText("Jordan Lee")
  await agent.getByRole("button", { name: "Yes" }).click()
  await expect(agent.getByText("succeeded", { exact: true })).toBeVisible()

  const promotedChatImage = agent
    .locator("article")
    .getByRole("img", { name: "screenshot-regression.png", exact: true })
  await expect(promotedChatImage).toBeVisible()
  await expect
    .poll(() =>
      promotedChatImage.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
      )
    )
    .toBe(true)

  await page.goto(
    "/organization/alpha-operations/issues?q=Screenshot%20layout%20regression"
  )
  const issueLink = page.getByRole("link", {
    name: "Screenshot layout regression",
    exact: true,
  })
  await expect(issueLink).toBeVisible()
  await issueLink.click()
  const issueDialog = page.getByRole("dialog", { name: "Issue details" })
  await expect(issueDialog).toBeVisible({ timeout: 20_000 })
  const attachments = issueDialog.getByRole("region", { name: "Attachments" })
  await expect(
    attachments.getByText("screenshot-regression.png", { exact: true })
  ).toBeVisible()
  await expect(
    attachments.getByRole("button", {
      name: "Preview image screenshot-regression.png",
    })
  ).toBeVisible()
})
