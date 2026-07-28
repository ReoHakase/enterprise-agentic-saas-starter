export type DataTableColumnMeta = {
  label?: string
  headerClassName?: string
  cellClassName?: string
}

export const getDataTableColumnMeta = (value: unknown): DataTableColumnMeta => {
  if (!value || typeof value !== "object") return {}
  const label = Reflect.get(value, "label")
  const headerClassName = Reflect.get(value, "headerClassName")
  const cellClassName = Reflect.get(value, "cellClassName")
  return {
    label: typeof label === "string" ? label : undefined,
    headerClassName:
      typeof headerClassName === "string" ? headerClassName : undefined,
    cellClassName:
      typeof cellClassName === "string" ? cellClassName : undefined,
  }
}
