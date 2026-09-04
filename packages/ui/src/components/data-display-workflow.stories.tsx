import preview from "#storybook/preview"

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "./avatar/avatar"
import { Badge } from "./badge/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card/card"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table/table"

const issues = [
  {
    id: "ENG-1042",
    title: "Review production access",
    owner: "Avery Stone",
    status: "In progress",
  },
  {
    id: "ENG-1051",
    title: "Rotate staging credentials",
    owner: "Jordan Lee",
    status: "Ready",
  },
] as const

const IssueOverview = () => (
  <Card className="w-[min(48rem,calc(100vw-2rem))]">
    <CardHeader>
      <CardTitle>Security review</CardTitle>
      <CardDescription>
        Acme Cloud issues due by 2026-07-31T17:00:00Z.
      </CardDescription>
    </CardHeader>
    <CardContent className="grid gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Reviewers</p>
          <AvatarGroup aria-label="Security reviewers" role="group">
            <Avatar>
              <AvatarFallback>AS</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>JL</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+2</AvatarGroupCount>
          </AvatarGroup>
        </div>
        <Badge variant="outline">2 of 4 complete</Badge>
      </div>
      <Table>
        <TableCaption>Open security review issues</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Issue</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow key={issue.id}>
              <TableCell>
                <span className="font-medium">{issue.id}</span>
                <span className="ml-2">{issue.title}</span>
              </TableCell>
              <TableCell>{issue.owner}</TableCell>
              <TableCell>
                <Badge
                  variant={issue.status === "Ready" ? "secondary" : "outline"}
                >
                  {issue.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
)

const meta = preview.meta({
  title: "Workflows/Data Display",
  component: IssueOverview,
  tags: ["autodocs"],
})

export const SecurityReview = meta.story({
  tags: ["theme-sensitive"],
})
