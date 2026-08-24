import preview from "#storybook/preview"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card"

const meta = preview.meta({
  title: "Components/Card",
  component: Card,
  tags: ["autodocs"],
})

export const OrganizationSummary = meta.story({
  tags: ["theme-sensitive"],
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Acme Cloud</CardTitle>
        <CardDescription>Production workspace</CardDescription>
        <CardAction>Active</CardAction>
      </CardHeader>
      <CardContent>
        24 members collaborated across 8 projects in the last 30 days.
      </CardContent>
      <CardFooter>Updated July 26, 2026</CardFooter>
    </Card>
  ),
})

export const LongContent = meta.story({
  render: () => (
    <Card className="w-72">
      <CardHeader>
        <CardTitle>Quarterly security review</CardTitle>
      </CardHeader>
      <CardContent className="wrap-break-word">
        Avery Stone documented the complete access review, including service
        accounts, external collaborators, expiring credentials, and follow-up
        owners for every production environment.
      </CardContent>
    </Card>
  ),
})
