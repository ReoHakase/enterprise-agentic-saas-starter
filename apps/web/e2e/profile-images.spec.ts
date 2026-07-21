import type { BrowserContext, Page } from "@playwright/test"

import { expect, test } from "./fixtures/test"

const mockApiUrl = "http://127.0.0.1:3001"
const profilePng = Buffer.from(
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

const prepareFallback = async (
  page: Page,
  input:
    | { subject: "user" }
    | { subject: "organization"; organizationId: string }
) => {
  await page.route("https://api.dicebear.com/**", (route) =>
    route.fulfill({ body: profilePng, contentType: "image/png" })
  )
  const response = await fetch(`${mockApiUrl}/__e2e/profile-images/fallback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  expect(response.status).toBe(201)
  const result: unknown = await response.json()
  if (
    !result ||
    typeof result !== "object" ||
    !("profileImage" in result) ||
    typeof result.profileImage !== "string"
  ) {
    throw new Error("Profile image fallback setup returned an invalid response")
  }
  return result.profileImage
}

const uploadFromCropDialog = async (page: Page, endpoint: RegExp) => {
  const fileChooserPromise = page.waitForEvent("filechooser")
  await page
    .getByRole("button", { name: /^(?:Choose image|Replace)$/u })
    .click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles({
    name: "profile.png",
    mimeType: "image/png",
    buffer: profilePng,
  })

  const cropDialog = page.getByRole("dialog", { name: "Crop profile image" })
  await expect(cropDialog).toBeVisible()
  const uploadButton = cropDialog.getByRole("button", {
    name: "Upload image",
  })
  await expect(uploadButton).toBeEnabled()
  const responsePromise = page.waitForResponse(
    (response) =>
      endpoint.test(new URL(response.url()).pathname) &&
      response.request().method() === "POST"
  )
  await uploadButton.click()
  const response = await responsePromise
  expect(response.status()).toBe(201)
  await expect(page.getByText("Profile image updated")).toBeVisible()
}

test.beforeEach(async () => {
  await resetMockApi()
})

test("user profile imageをcrop・再ログイン表示・削除できる", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "画像処理を含む一連のjourneyはdesktopで固定する"
  )

  await useAdminSession(context)
  const fallbackProfileImage = await prepareFallback(page, { subject: "user" })
  await page.goto("/settings/account")

  const editor = page.getByLabel("Choose profile image").locator("..")
  await expect(editor.locator('[data-slot="avatar"]')).toHaveAttribute(
    "data-shape",
    "circle"
  )
  await expect(editor.getByRole("img", { name: "Admin User" })).toHaveAttribute(
    "src",
    fallbackProfileImage
  )

  await uploadFromCropDialog(page, /^\/files\/profile-images\/users\/me$/u)
  await expect(
    page
      .getByLabel("Choose profile image")
      .locator("..")
      .getByRole("img", { name: "Admin User" })
  ).toBeVisible()

  await context.clearCookies()
  await useAdminSession(context)
  await page.reload()
  const reloadedEditor = page.getByLabel("Choose profile image").locator("..")
  await expect(
    reloadedEditor.getByRole("img", { name: "Admin User" })
  ).toBeVisible()

  await reloadedEditor
    .getByRole("button", { name: "Remove", exact: true })
    .click()
  const removeDialog = page.getByRole("alertdialog", {
    name: "Remove profile image?",
  })
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/files/profile-images/users/me" &&
      response.request().method() === "DELETE"
  )
  await removeDialog.getByRole("button", { name: "Remove image" }).click()
  expect((await responsePromise).status()).toBe(204)
  await expect(page.getByText("Profile image removed")).toBeVisible()

  const fallbackEditor = page.getByLabel("Choose profile image").locator("..")
  await expect(
    fallbackEditor.getByRole("img", { name: "Admin User" })
  ).toHaveAttribute("src", fallbackProfileImage)
  await expect(
    fallbackEditor.getByRole("button", { name: "Remove", exact: true })
  ).toHaveCount(0)
})

test("organization profile imageを角丸四角でupload・削除できる", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "画像処理を含む一連のjourneyはdesktopで固定する"
  )

  await useAdminSession(context)
  const fallbackProfileImage = await prepareFallback(page, {
    subject: "organization",
    organizationId: "org-a",
  })
  await page.goto("/organization/alpha-operations/settings")

  const editor = page.getByLabel("Choose profile image").locator("..")
  await expect(editor.locator('[data-slot="avatar"]')).toHaveAttribute(
    "data-shape",
    "rounded"
  )
  await expect(
    editor.getByRole("img", { name: "Alpha Operations" })
  ).toHaveAttribute("src", fallbackProfileImage)

  await uploadFromCropDialog(
    page,
    /^\/files\/profile-images\/organizations\/org-a$/u
  )
  const updatedEditor = page.getByLabel("Choose profile image").locator("..")
  await expect(
    updatedEditor.getByRole("img", { name: "Alpha Operations" })
  ).toBeVisible()
  await expect(updatedEditor.locator('[data-slot="avatar"]')).toHaveAttribute(
    "data-shape",
    "rounded"
  )

  await updatedEditor
    .getByRole("button", { name: "Remove", exact: true })
    .click()
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        "/files/profile-images/organizations/org-a" &&
      response.request().method() === "DELETE"
  )
  await page
    .getByRole("alertdialog", { name: "Remove profile image?" })
    .getByRole("button", { name: "Remove image" })
    .click()
  expect((await responsePromise).status()).toBe(204)
  await expect(page.getByText("Profile image removed")).toBeVisible()
  await expect(
    page
      .getByLabel("Choose profile image")
      .locator("..")
      .getByRole("img", { name: "Alpha Operations" })
  ).toHaveAttribute("src", fallbackProfileImage)
})

test("organization profile image APIがactive organization・role・tenant境界を守る", async ({
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "API境界は一つのbrowser projectで固定する"
  )

  await useAdminSession(context)
  const multipart = {
    uploadId: "profile_image_e2e_permission_01",
    fileSize: String(profilePng.byteLength),
    file: {
      name: "profile.png",
      mimeType: "image/png",
      buffer: profilePng,
    },
  }

  const inactiveResponse = await context.request.post(
    `${mockApiUrl}/files/profile-images/organizations/org-b`,
    { multipart }
  )
  expect(inactiveResponse.status()).toBe(409)

  const missingResponse = await context.request.get(
    `${mockApiUrl}/files/profile-images/organizations/org-forbidden`
  )
  expect(missingResponse.status()).toBe(404)

  expect(
    (
      await context.request.post(`${mockApiUrl}/organizations/org-b/activate`)
    ).ok()
  ).toBeTruthy()
  const memberResponse = await context.request.post(
    `${mockApiUrl}/files/profile-images/organizations/org-b`,
    { multipart }
  )
  expect(memberResponse.status()).toBe(403)
})
