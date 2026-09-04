import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table"

const members = [
  {
    id: "member_01K1AVERY",
    name: "Avery Stone",
    email: "avery@example.test",
    role: "Owner",
  },
  {
    id: "member_01K1JORDAN",
    name: "Jordan Lee",
    email: "jordan@example.test",
    role: "Member",
  },
] as const

const meta = preview.meta({
  title: "Components/Table",
  component: Table,
  tags: ["autodocs"],
})

export const Members = meta.story({
  render: () => (
    <div className="w-2xl">
      <Table>
        <TableCaption>Acme Cloud members as of July 26, 2026</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>{member.name}</TableCell>
              <TableCell>{member.email}</TableCell>
              <TableCell>{member.role}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
})

export const Empty = meta.story({
  render: () => (
    <Table>
      <TableCaption>No pending invitations</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={2}>Invite a teammate to get started.</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
})

export const HorizontalOverflow = meta.story({
  render: () => (
    <div className="w-72 overflow-auto">
      <Table className="min-w-3xl" scrollLabel="Audit requests">
        <TableHeader>
          <TableRow>
            <TableHead>Request</TableHead>
            <TableHead>Organization</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Timestamp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>request_01K1ACME000000000000000000</TableCell>
            <TableCell>organization_01K1ACME000000</TableCell>
            <TableCell>avery@example.test</TableCell>
            <TableCell>2026-07-26T09:30:00Z</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    await step("横overflow領域へTabキーでフォーカスする", async () => {
      const region = await canvas.findByRole("region", {
        name: "Audit requests",
      })
      canvasElement.ownerDocument.body.focus()
      await userEvent.tab()
      await expect(region).toHaveFocus()
    })
  },
})
