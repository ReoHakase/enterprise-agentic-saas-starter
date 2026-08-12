import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import {
  Table as UiTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@enterprise-agentic-saas/ui/components/table"
import type { ReactNode } from "react"

type TypeProperty = {
  default?: ReactNode
  deprecated?: boolean | string
  description?: ReactNode
  required?: boolean
  type: ReactNode
}

export const TypeTable = ({ type }: { type: Record<string, TypeProperty> }) => (
  <UiTable
    className="min-w-2xl"
    containerClassName="my-6 rounded-2xl border"
    scrollLabel="Type properties"
    data-docs-type-table
  >
    <TableHeader>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <TableHead>Property</TableHead>
        <TableHead>Type</TableHead>
        <TableHead>Default</TableHead>
        <TableHead>Description</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {Object.entries(type).map(([name, property]) => (
        <TableRow key={name}>
          <TableCell>
            <span className="flex items-center gap-2">
              <code>{name}</code>
              {property.required ? (
                <Badge variant="outline">Required</Badge>
              ) : null}
              {property.deprecated ? (
                <Badge variant="secondary">Deprecated</Badge>
              ) : null}
            </span>
          </TableCell>
          <TableCell>
            <code>{property.type}</code>
          </TableCell>
          <TableCell>
            {property.default === undefined ? (
              "—"
            ) : (
              <code>{property.default}</code>
            )}
          </TableCell>
          <TableCell className="min-w-72 whitespace-normal text-muted-foreground">
            {property.description}
            {typeof property.deprecated === "string" ? (
              <span className="mt-1 block text-xs">{property.deprecated}</span>
            ) : null}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </UiTable>
)
