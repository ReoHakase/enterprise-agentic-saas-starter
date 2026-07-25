import { useForm } from "@tanstack/react-form"

import preview from "#storybook/preview"
import type { Me } from "@/features/account"

import { ConsoleShell } from "../console-shell/console-shell"
import { FormTextField } from "../form-text-field/form-text-field"
import { IssuesDashboard } from "../issues-dashboard/issues-dashboard"
import { Providers } from "../providers/providers"

const catalogueMe = {
  user: {
    id: "user-catalogue",
    name: "Avery Stone",
    email: "avery@example.test",
    profileImage: null,
  },
  activeOrganizationId: "organization-acme",
  organizations: [
    {
      id: "organization-acme",
      name: "Acme Cloud",
      slug: "acme",
      role: "super_admin",
      active: true,
      profileImage: null,
      memberCount: 8,
      memberProfileImages: [],
      permissions: {
        canEditOrganization: true,
        canInviteMembers: true,
        canManageMembers: true,
        canManageAdmins: true,
        canTransferSuperAdmin: true,
      },
    },
  ],
} satisfies Me

const CatalogueTextField = () => {
  const form = useForm({
    defaultValues: { title: "Prepare the release checklist" },
  })

  return (
    <form.Field name="title">
      {(field) => (
        <FormTextField
          description="Use a short, actionable title."
          field={field}
          id="catalogue-title"
          label="Issue title"
          placeholder="What needs to happen?"
        />
      )}
    </form.Field>
  )
}

const meta = preview.meta({
  title: "Web/Application Components",
  component: IssuesDashboard,
  decorators: [
    (Story) => (
      <Providers>
        <Story />
      </Providers>
    ),
  ],
  args: {
    organizationId: "",
    organizationSlug: "acme",
  },
})

export const EmptyIssuesDashboard = meta.story({})

export const ConsoleWorkspace = meta.story({
  render: () => (
    <ConsoleShell me={catalogueMe}>
      <section
        className="grid gap-2 p-6"
        aria-labelledby="catalogue-dashboard-heading"
      >
        <h1 id="catalogue-dashboard-heading" className="text-2xl font-semibold">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Review tenant activity and open work.
        </p>
      </section>
    </ConsoleShell>
  ),
})

export const ReusableFormField = meta.story({
  render: () => <CatalogueTextField />,
})
