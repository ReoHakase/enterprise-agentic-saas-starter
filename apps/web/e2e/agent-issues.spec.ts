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

const allowUnavailableAgentWorker = (
  allowClientErrors: (...patterns: RegExp[]) => void
) => {
  // The E2E stack intentionally starts Web and the HTTP mock API only. A fake
  // Agents SDK WebSocket protocol would test the fake instead of the runtime.
  allowClientErrors(
    /WebSocket connection to .*127\.0\.0\.1:3002/u,
    /ERR_CONNECTION_REFUSED/u,
    /WebSocket.*closed/u
  )
}

const openOrganizationMenu = async (page: Page) => {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
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
  await page.getByRole("button", { name, exact: true }).click()
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
  await page.getByRole("button", { name: "Next", exact: true }).click()
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

// The default Playwright stack does not start the real Agent Worker. Keep these
// journeys explicit without replacing the Agents SDK HTTP/WebSocket protocol
// with a browser-side fake; enable them when that Worker joins the E2E stack.
test.fixme("organization切替barrierはAgent draftを保持または明示破棄する", async ({
  allowClientErrors,
  context,
  page,
}) => {
  allowUnavailableAgentWorker(allowClientErrors)
  await useAdminSession(context)
  await page.goto("/organization/alpha-operations/agent")
  await expect(
    page.getByRole("button", { name: "Alpha triage", exact: true })
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
  await expect(composer).toHaveValue("Keep this Alpha draft")

  await openOrganizationMenu(page)
  await page.getByRole("menuitem", { name: "Beta Support" }).click()
  await barrier
    .getByRole("button", { name: "Discard local draft and switch" })
    .click()
  await expect(page).toHaveURL(/\/organization\/beta-support\/agent$/u)
  await expect(page.getByText("Beta triage")).toBeVisible()
  await selectAgentThread(page, "Beta triage", "agent-thread-b-1")
  await expect(
    page.getByPlaceholder(
      "Describe the issue, or attach screenshots for analysis."
    )
  ).toHaveValue("")
})

test.fixme("Agent threadはdraftと画像を分離しarchive時に一時画像を削除する", async ({
  allowClientErrors,
  context,
  page,
}) => {
  allowUnavailableAgentWorker(allowClientErrors)
  await useAdminSession(context)
  await page.goto("/organization/alpha-operations/agent")
  await expect(
    page.getByRole("button", { name: "Alpha triage", exact: true })
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
