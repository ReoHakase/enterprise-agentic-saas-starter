import type { ApiClient, Treaty } from "@enterprise-agentic-saas/api/client"
import * as v from "valibot"

export const organizationFormSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(2, "Use at least 2 characters."),
    v.maxLength(100, "Use 100 characters or fewer.")
  ),
  slug: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(3, "Use at least 3 characters."),
    v.maxLength(48, "Use 48 characters or fewer."),
    v.regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and single hyphens."
    )
  ),
})

export const createOrganizationDeletionFormSchema = (expectedSlug: string) =>
  v.object({
    slug: v.pipe(
      v.string(),
      v.trim(),
      v.check(
        (value) => value === expectedSlug,
        `Type ${expectedSlug} exactly.`
      )
    ),
    confirmation: v.literal("DELETE", "Type DELETE exactly."),
  })

type OrganizationRoutes = ReturnType<ApiClient["organizations"]>

export type OrganizationSummary = Treaty.Data<
  ApiClient["organizations"]["get"]
>[number]
export type OrganizationDetail = Treaty.Data<OrganizationRoutes["get"]>
export type OrganizationRole = OrganizationSummary["role"]

export const roleLabel = (role: OrganizationRole) => {
  if (role === "owner") {
    return "Owner"
  }

  if (role === "admin") {
    return "Admin"
  }

  return "Member"
}

export const toOrganizationSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
