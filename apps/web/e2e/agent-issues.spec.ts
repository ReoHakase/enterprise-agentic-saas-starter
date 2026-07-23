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

const seedAgentConversation = async (threadId: string) => {
  const response = await fetch(`${mockApiUrl}/__e2e/agent-conversation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId }),
  })
  expect(response.status).toBe(201)
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

test("未選択のAgent paneは権限とmentionを保った新規conversationから送信する", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto("/organization/alpha-operations/issues")
  await page.getByRole("button", { name: "Open Agent" }).click()

  const agent =
    (page.viewportSize()?.width ?? 1280) < 768
      ? page.getByRole("dialog", { name: "Agent" })
      : page.getByRole("complementary", { name: "Agent" })
  await expect(
    agent.getByRole("combobox", { name: "Agent thread" })
  ).toContainText("New conversation")
  await expect(
    agent.getByRole("region", { name: "Sample prompts" })
  ).toBeVisible()
  await expect(
    agent.getByText("Choose an Agent thread", { exact: true })
  ).toHaveCount(0)

  const permission = agent
    .getByRole("combobox")
    .filter({ hasText: /Ask always|Full access/u })
  await permission.click()
  await page.getByRole("option", { name: /Full access/u }).click()
  await expect(permission).toContainText("Full access")

  const composer = agent.getByRole("textbox", { name: "Agent message" })
  await composer.fill("Compare @")
  await page
    .getByRole("button", { name: /Issue #1: Review tenant audit log/u })
    .click()
  await composer.press("End")
  await composer.pressSequentially("today")

  const createRequestPromise = page.waitForRequest(
    (request) =>
      request.url().endsWith("/agent/threads") && request.method() === "POST"
  )
  const chatRequestPromise = page.waitForRequest(
    (request) =>
      request.url().endsWith("/agent/chat") && request.method() === "POST"
  )
  await agent.getByRole("button", { name: "Send", exact: true }).click()
  const [createRequest, chatRequest] = await Promise.all([
    createRequestPromise,
    chatRequestPromise,
  ])

  expect(createRequest.postDataJSON()).toMatchObject({
    permissionMode: "full_access",
  })
  expect(chatRequest.postDataJSON()).toMatchObject({
    contentSegments: [
      { type: "text", text: "Compare " },
      {
        type: "context_reference",
        reference: { kind: "issue", id: "issue-a-1" },
      },
      { type: "text", text: " today" },
    ],
  })
  await expect(page).toHaveURL(/[?&]agentThread=[^&]+/u)
  await expect(
    agent.getByRole("combobox").filter({ hasText: "Full access" })
  ).toBeVisible()
})

test("staleなAgent thread URLは新規conversationへ正規化する", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto(
    "/organization/alpha-operations/issues?agentThread=missing-agent-thread"
  )
  await page.getByRole("button", { name: "Open Agent" }).click()

  const agent =
    (page.viewportSize()?.width ?? 1280) < 768
      ? page.getByRole("dialog", { name: "Agent" })
      : page.getByRole("complementary", { name: "Agent" })
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/organization/alpha-operations/issues" &&
      !url.searchParams.has("agentThread")
  )
  await expect(
    agent.getByRole("combobox", { name: "Agent thread" })
  ).toContainText("New conversation")
  await expect(
    agent.getByRole("region", { name: "Sample prompts" })
  ).toBeVisible()
  await expect(
    agent.getByRole("textbox", { name: "Agent message" })
  ).toBeVisible()
  await expect(
    agent.getByRole("combobox").filter({ hasText: "Ask always" })
  ).toBeVisible()
})

test("Agent paneは末尾付近を追従し右側minimapからturnへ移動できる", async ({
  context,
  page,
}, testInfo) => {
  await seedAgentConversation("agent-thread-a-2")
  await useAdminSession(context)
  await page.goto(
    "/organization/alpha-operations/issues?agentThread=agent-thread-a-2"
  )
  await page.getByRole("button", { name: "Open Agent" }).click()

  const agent =
    (page.viewportSize()?.width ?? 1280) < 768
      ? page.getByRole("dialog", { name: "Agent" })
      : page.getByRole("complementary", { name: "Agent" })
  const conversation = agent.getByRole("log", { name: "Agent conversation" })
  const minimap = agent.getByRole("navigation", {
    name: "Conversation turns",
  })
  await expect(conversation).toBeVisible()
  await expect(minimap).toBeVisible()

  const markers = minimap.getByRole("button", { name: /^Jump to turn/u })
  await expect(markers).toHaveCount(6)
  await expect(markers.nth(5)).toHaveAttribute("aria-current", "location")
  await expect
    .poll(() =>
      conversation.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight
      )
    )
    .toBeLessThanOrEqual(1)

  const conversationBox = await conversation.boundingBox()
  const minimapBox = await minimap.boundingBox()
  expect(conversationBox).not.toBeNull()
  expect(minimapBox).not.toBeNull()
  expect(minimapBox?.x).toBeGreaterThan(
    (conversationBox?.x ?? 0) + (conversationBox?.width ?? 0) - 80
  )
  expect((minimapBox?.x ?? 0) + (minimapBox?.width ?? 0)).toBeLessThanOrEqual(
    (conversationBox?.x ?? 0) + (conversationBox?.width ?? 0)
  )
  expect(minimapBox?.width).toBeLessThanOrEqual(24)
  expect(
    Math.abs(
      (minimapBox?.y ?? 0) +
        (minimapBox?.height ?? 0) / 2 -
        ((conversationBox?.y ?? 0) + (conversationBox?.height ?? 0) / 2)
    )
  ).toBeLessThanOrEqual(1)
  await expect
    .poll(() =>
      conversation.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingRight)
      )
    )
    .toBe(0)

  const markerCenters = await markers.evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.y + bounds.height / 2
    })
  )
  const markerGaps = markerCenters.slice(1).map((center, index) => {
    const previousCenter = markerCenters[index]
    return previousCenter === undefined ? 0 : center - previousCenter
  })
  expect(Math.max(...markerGaps) - Math.min(...markerGaps)).toBeLessThanOrEqual(
    1
  )
  const activeMarkerLine = markers.nth(5).locator("span[aria-hidden=true]")
  const inactiveMarkerLine = markers.nth(4).locator("span[aria-hidden=true]")
  await expect
    .poll(async () => {
      const [activeWidth, inactiveWidth] = await Promise.all([
        activeMarkerLine.evaluate(
          (element) => element.getBoundingClientRect().width
        ),
        inactiveMarkerLine.evaluate(
          (element) => element.getBoundingClientRect().width
        ),
      ])
      return activeWidth / inactiveWidth
    })
    .toBeCloseTo(1.5, 1)
  await expect
    .poll(() =>
      inactiveMarkerLine.evaluate(
        (element) => getComputedStyle(element).transitionDuration
      )
    )
    .toBe("0.15s")

  const detachedScrollTop = await conversation.evaluate((element) => {
    element.scrollTop = Math.max(
      0,
      element.scrollHeight - element.clientHeight - 32
    )
    element.dispatchEvent(new Event("scroll"))
    return element.scrollTop
  })
  await expect
    .poll(() => conversation.evaluate((element) => element.scrollTop))
    .toBe(detachedScrollTop)

  const firstMarker = minimap.getByRole("button", {
    name: /Jump to turn 1: Investigate fixture turn 1/u,
  })
  const supportsHardwareKeyboardFocus =
    testInfo.project.name !== "iphone-13-webkit"
  if (
    (page.viewportSize()?.width ?? 1280) < 768 &&
    supportsHardwareKeyboardFocus
  ) {
    await firstMarker.focus()
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Tab")
    await expect(firstMarker).toBeFocused()
  } else if (supportsHardwareKeyboardFocus) {
    await firstMarker.hover()
  } else {
    await firstMarker.focus()
  }
  if (supportsHardwareKeyboardFocus) {
    await expect(
      page.getByRole("tooltip").filter({ hasText: "Fixture response 1." })
    ).toBeVisible()
  }
  await firstMarker.press("Enter")
  await expect
    .poll(() => conversation.evaluate((element) => element.scrollTop))
    .toBe(0)
  await expect(firstMarker).toHaveAttribute("aria-current", "location")

  const composer = agent.getByPlaceholder(
    "Describe the issue, or attach screenshots for analysis."
  )
  await composer.fill("Keep my reading position while this response arrives.")
  await agent.getByRole("button", { name: "Send", exact: true }).click()
  await expect(
    agent
      .getByRole("article", { name: "Your message" })
      .filter({ hasText: "Keep my reading position" })
  ).toHaveCount(1)
  await expect(
    agent.getByRole("button", { name: "Send", exact: true })
  ).toBeEnabled()
  await expect
    .poll(() => conversation.evaluate((element) => element.scrollTop))
    .toBe(0)

  await conversation.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event("scroll"))
  })
  await expect
    .poll(() =>
      conversation.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight
      )
    )
    .toBeLessThanOrEqual(1)

  await composer.fill("Follow this new response because I returned to the end.")
  await agent.getByRole("button", { name: "Send", exact: true }).click()
  await expect(
    agent
      .getByRole("article", { name: "Your message" })
      .filter({ hasText: "Follow this new response" })
  ).toHaveCount(1)
  await expect(
    agent.getByRole("button", { name: "Send", exact: true })
  ).toBeEnabled()
  await expect
    .poll(() =>
      conversation.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight
      )
    )
    .toBeLessThanOrEqual(1)
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
  await expect(composer).toHaveText("Keep this Alpha draft")

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
  ).toHaveText("")
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
  ).toHaveText("")
  await expect(page.getByRole("img", { name: "thread-a.png" })).toHaveCount(0)

  await selectAgentThread(page, "Alpha triage", "agent-thread-a-1")
  await expect(composer).toHaveText("Thread A draft")
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
  await expect(
    page.getByRole("region", { name: "Sample prompts" })
  ).toBeVisible()
  await expect(
    page.getByRole("textbox", { name: "Agent message" })
  ).toBeVisible()

  await expect
    .poll(async () => {
      const response = await context.request.get(
        `${mockApiUrl}/__e2e/agent-assets`
      )
      return response.json()
    })
    .toEqual([])
})

test("inline mentionは順序付きrequestと履歴へ残りthread名を手動変更できる", async ({
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

  await agent.getByRole("button", { name: "Rename thread" }).click()
  const titleInput = agent.getByRole("textbox", { name: "Thread title" })
  await titleInput.fill("Access review follow-up")
  await agent.getByRole("button", { name: "Save thread title" }).click()
  await expect(
    agent.getByRole("combobox", { name: "Agent thread" })
  ).toContainText("Access review follow-up")

  const composer = agent.getByRole("textbox", { name: "Agent message" })
  await composer.fill("Compare @")
  await page
    .getByRole("button", { name: /Issue #1: Review tenant audit log/u })
    .click()
  await composer.press("End")
  await composer.pressSequentially("today")
  await expect(composer).toContainText(
    "Compare @Issue #1: Review tenant audit log today"
  )
  await expect(
    composer.getByRole("button", {
      name: "Remove Issue #1: Review tenant audit log",
    })
  ).toBeVisible()

  const requestPromise = page.waitForRequest(
    (request) =>
      request.url().endsWith("/agent/chat") && request.method() === "POST"
  )
  await agent.getByRole("button", { name: "Send" }).click()
  const chatRequest = await requestPromise
  expect(chatRequest.postDataJSON()).toMatchObject({
    contentSegments: [
      { type: "text", text: "Compare " },
      {
        type: "context_reference",
        reference: { kind: "issue", id: "issue-a-1" },
      },
      { type: "text", text: " today" },
    ],
  })
  expect(JSON.stringify(chatRequest.postDataJSON())).not.toContain(
    "Review tenant audit log"
  )
  await expect(composer).toHaveText("")

  await page.reload()
  const reloaded =
    (page.viewportSize()?.width ?? 1280) < 768
      ? page.getByRole("dialog", { name: "Agent" })
      : page.getByRole("complementary", { name: "Agent" })
  await page.getByRole("button", { name: "Open Agent" }).click()
  await expect(reloaded).toBeVisible()
  await expect(
    reloaded.getByRole("article", { name: "Your message" })
  ).toContainText("@Issue #1: Review tenant audit log")

  const contextRing = reloaded.getByRole("button", {
    name: /^Estimated context \d+% used$/u,
  })
  await contextRing.hover()
  await expect(
    page.getByText("No provider result yet. Showing the preflight estimate.")
  ).toBeVisible()
  await expect(page.getByText("Estimated breakdown")).toBeVisible()
  const tooltip = page.locator('[data-slot="tooltip-content"]')
  const viewportWidth = page.viewportSize()?.width
  if (!viewportWidth) throw new Error("Expected a configured viewport")
  const tooltipLayout = await tooltip.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      left: bounds.left,
      right: bounds.right,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }
  })
  expect(tooltipLayout.left).toBeGreaterThanOrEqual(0)
  expect(tooltipLayout.right).toBeLessThanOrEqual(viewportWidth)
  expect(tooltipLayout.scrollWidth).toBeLessThanOrEqual(
    tooltipLayout.clientWidth
  )
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
