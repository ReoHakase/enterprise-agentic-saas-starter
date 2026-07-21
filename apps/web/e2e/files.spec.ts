import type { BrowserContext, Page } from "@playwright/test"

import { expect, test } from "./fixtures/test"

const mockApiUrl = "http://127.0.0.1:3001"

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

const openOrganizationSwitcher = async (page: Page) => {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeVisible()
  }

  await page
    .locator('[data-slot="dropdown-menu-trigger"][data-sidebar="menu-button"]')
    .filter({ hasText: /alpha operations|beta support/i })
    .click()
}

test.beforeEach(async () => {
  await resetMockApi()
})

test("Issueのmodal/pageで複数fileをupload・cancel・deleteできる", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto("/organization/alpha-operations/issues")
  await page
    .getByRole("link", { name: "Review tenant audit log", exact: true })
    .evaluate((element: HTMLAnchorElement) => element.click())

  const issueDialog = page.getByRole("dialog", { name: "Issue details" })
  const modalAttachments = issueDialog.getByRole("region", {
    name: "Attachments",
  })
  await expect(modalAttachments).toBeVisible({ timeout: 15_000 })
  await expect(
    modalAttachments.getByText("tenant-boundary-notes.txt", { exact: true })
  ).toBeVisible()
  await expect(
    modalAttachments.getByRole("link", {
      name: "Download tenant-boundary-notes.txt",
    })
  ).toHaveAttribute(
    "href",
    /\/files\/organizations\/org-a\/file-a-seed\/download$/u
  )

  const modalTextTrigger = modalAttachments.getByRole("button", {
    name: "tenant-boundary-notes.txt",
    exact: true,
  })
  const modalImageTrigger = modalAttachments.getByRole("button", {
    name: "Preview image architecture-preview.png",
  })
  const imageCard = modalAttachments
    .getByRole("group", {
      name: "File details for architecture-preview.png",
    })
    .locator("..")
  const cardBoxBefore = await imageCard.boundingBox()
  const thumbnailBoxBefore = await modalImageTrigger.boundingBox()
  if (!cardBoxBefore || !thumbnailBoxBefore) {
    throw new Error("Expected attachment card geometry")
  }
  expect(thumbnailBoxBefore.height).toBeGreaterThanOrEqual(143)
  expect(thumbnailBoxBefore.height).toBeLessThanOrEqual(289)
  expect(
    await modalAttachments.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1
    )
  ).toBe(true)

  await modalTextTrigger.click()
  let filePreview = page.getByRole("dialog", {
    name: "tenant-boundary-notes.txt",
  })
  await expect(filePreview).toContainText(
    "Tenant boundary fixture for browser tests."
  )
  const previewBox = await filePreview.boundingBox()
  const viewport = page.viewportSize()
  if (!previewBox || !viewport) throw new Error("Expected preview geometry")
  expect(Math.abs(previewBox.width - viewport.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(previewBox.height - viewport.height)).toBeLessThanOrEqual(1)

  await filePreview
    .getByRole("button", { name: "Preview previous file" })
    .click()
  filePreview = page.getByRole("dialog", { name: "architecture-preview.png" })
  await expect(
    filePreview.getByRole("img", { name: "architecture-preview.png" })
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(filePreview).toHaveCount(0)
  await expect(issueDialog).toBeVisible()
  await expect(modalTextTrigger).toBeFocused()
  const cardBoxAfter = await imageCard.boundingBox()
  const thumbnailBoxAfter = await modalImageTrigger.boundingBox()
  if (!cardBoxAfter || !thumbnailBoxAfter) {
    throw new Error("Expected attachment card geometry after preview")
  }
  expect(
    Math.abs(cardBoxAfter.width - cardBoxBefore.width)
  ).toBeLessThanOrEqual(4)
  expect(
    Math.abs(thumbnailBoxAfter.height - thumbnailBoxBefore.height)
  ).toBeLessThanOrEqual(4)

  await issueDialog.getByRole("button", { name: "Open full page" }).click()
  await expect(page).toHaveURL(/\/organization\/alpha-operations\/issues\/1$/u)
  await expect(page.getByRole("dialog", { name: "Issue details" })).toHaveCount(
    0
  )
  const attachments = page.getByRole("region", { name: "Attachments" })
  await expect(
    attachments.getByText("tenant-boundary-notes.txt", { exact: true })
  ).toBeVisible()
  const pageImageTrigger = attachments.getByRole("button", {
    name: "Preview image architecture-preview.png",
  })
  await pageImageTrigger.click()
  await expect(
    page
      .getByRole("dialog", { name: "architecture-preview.png" })
      .getByRole("img", { name: "architecture-preview.png" })
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(pageImageTrigger).toBeFocused()

  const pageTextTrigger = attachments.getByRole("button", {
    name: "tenant-boundary-notes.txt",
    exact: true,
  })
  await pageTextTrigger.click()
  const pageTextPreview = page.getByRole("dialog", {
    name: "tenant-boundary-notes.txt",
  })
  await expect(pageTextPreview).toContainText(
    "Tenant boundary fixture for browser tests."
  )
  await page.keyboard.press("Escape")
  await expect(pageTextPreview).toHaveCount(0)
  await expect(pageTextTrigger).toBeFocused()
  expect(
    await attachments.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1
    )
  ).toBe(true)

  const fileInput = attachments.getByLabel("Choose files to upload")
  await fileInput.setInputFiles([
    {
      name: "release-notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("release notes"),
    },
    {
      name: "acceptance-checklist.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("acceptance checklist"),
    },
  ])
  await expect(
    attachments.getByText("release-notes.txt", { exact: true })
  ).toBeVisible()
  await expect(
    attachments.getByText("acceptance-checklist.txt", { exact: true })
  ).toBeVisible()
  const discussion = page.getByRole("region", { name: "Discussion" })
  await expect(discussion).toContainText("attached release-notes.txt")
  await expect(discussion).toContainText("attached acceptance-checklist.txt")

  await fileInput.setInputFiles({
    name: "cancel-later.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("cancel this upload"),
  })
  const cancelUpload = attachments.getByRole("button", {
    name: "Cancel upload for cancel-later.txt",
  })
  await expect(cancelUpload).toBeVisible()
  await cancelUpload.click()
  await expect(
    attachments.getByText("cancel-later.txt", { exact: true })
  ).toHaveCount(0)

  const deleteResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/files/organizations/org-a/file-") &&
      response.request().method() === "DELETE"
  )
  await attachments
    .getByRole("button", { name: "Delete release-notes.txt" })
    .click()
  const confirmDelete = page.getByRole("alertdialog", {
    name: "Delete this file?",
  })
  await expect(confirmDelete).toBeVisible()
  await confirmDelete.getByRole("button", { name: "Delete file" }).click()
  expect((await deleteResponse).status()).toBe(204)
  await expect(
    attachments.getByText("release-notes.txt", { exact: true })
  ).toHaveCount(0)
  await expect(discussion).toContainText("deleted release-notes.txt")
  await expect(
    attachments.getByText("acceptance-checklist.txt", { exact: true })
  ).toBeVisible()
})

test("tenant切替で旧file queryとuploadを破棄し別tenantへ漏らさない", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto("/organization/alpha-operations/issues/1")

  const alphaAttachments = page.getByRole("region", { name: "Attachments" })
  await expect(
    alphaAttachments.getByText("tenant-boundary-notes.txt", { exact: true })
  ).toBeVisible()

  const alphaUploadRequest = page.waitForRequest(
    (request) =>
      request
        .url()
        .endsWith("/files/organizations/org-a/owners/issue/issue-a-1") &&
      request.method() === "POST"
  )
  await alphaAttachments.getByLabel("Choose files to upload").setInputFiles({
    name: "cancel-switch.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("abort on tenant switch"),
  })
  await alphaUploadRequest
  await expect(
    alphaAttachments.getByRole("button", {
      name: "Cancel upload for cancel-switch.txt",
    })
  ).toBeVisible()

  await openOrganizationSwitcher(page)
  const activateBetaResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-b/activate") &&
      response.request().method() === "POST"
  )
  await page.getByRole("menuitem", { name: "Beta Support" }).click()
  expect((await activateBetaResponse).ok()).toBeTruthy()

  await expect(page).toHaveURL(/\/organization\/beta-support\/issues$/u)
  await expect(
    page.getByText("Private Beta issue", { exact: true })
  ).toBeVisible()
  await page
    .getByRole("link", { name: "Private Beta issue", exact: true })
    .click()

  const betaDialog = page.getByRole("dialog", { name: "Issue details" })
  const betaAttachments = betaDialog.getByRole("region", {
    name: "Attachments",
  })
  await expect(
    betaAttachments.getByText("beta-support-only.txt", { exact: true })
  ).toBeVisible()
  await expect(
    betaAttachments.getByText("tenant-boundary-notes.txt", { exact: true })
  ).toHaveCount(0)
  await expect(
    betaAttachments.getByText("cancel-switch.txt", { exact: true })
  ).toHaveCount(0)
})
