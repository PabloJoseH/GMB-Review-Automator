"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Eye } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTableColumnHeader } from "@/components/dashboard/shared/table/data-table-column-header"
import { formatCountryName, formatRelativeTime } from "@/lib/utils"
import type { SerializedLocationWithConnection } from "@/lib/prisma-types"

interface ColumnsProps {
  t: (key: string) => string
  tTime?: (key: string, values?: Record<string, number>) => string
  locale: string
  mode?: "client" | "server"
  onToggleSort?: (columnId: string, direction: "asc" | "desc") => void
}

export function createLocationsColumns({ t, tTime, locale, mode = "client", onToggleSort }: ColumnsProps): ColumnDef<SerializedLocationWithConnection>[] {
  return [
    // Row selection (shadcn pattern)
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="dark:data-[state=checked]:bg-[var(--active)] dark:data-[state=checked]:border-[var(--active)]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
          className="dark:data-[state=checked]:bg-[var(--active)] dark:data-[state=checked]:border-[var(--active)]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "reference",
      id: "reference",
      header: ({ column }) => (
        <div className="text-center">
          <DataTableColumnHeader
            column={column}
            title={t("table.reference")}
            mode={mode}
            onToggleSort={onToggleSort}
          />
        </div>
      ),
      cell: ({ getValue }) => {
        const reference = getValue() as number | null
        return (
          <div className="text-sm font-mono text-center">
            {reference ?? "—"}
          </div>
        )
      },
      sortingFn: "basic",
      enableSorting: true,
    },
    {
      accessorKey: "name",
      id: "name",
      header: () => t("table.name"),
      cell: ({ getValue }) => {
        const name = getValue() as string
        return (
          <div className="font-medium">{name || "—"}</div>
        )
      },
      enableSorting: false,
    },
    {
      id: "location",
      header: () => t("table.location"),
      cell: ({ row }) => {
        const { city, country } = row.original
        if (!city && !country) return <div className="text-sm">—</div>
        
        // Format country code to localized country name
        const countryName = country ? formatCountryName(country, locale) : null
        const parts = [city, countryName].filter(Boolean)
        
        return (
          <div className="text-sm">
            {parts.length > 0 ? parts.join(", ") : "—"}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      id: "organization",
      header: () => t("table.organization"),
      cell: ({ row }) => {
        const connection = row.original.connections
        const organizationName = connection?.organizations?.business_name || "—"
        
        return (
          <div className="text-sm">{organizationName}</div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "status",
      id: "status",
      header: () => <div className="text-center">{t("table.status")}</div>,
      cell: ({ getValue }) => {
        const status = getValue() as SerializedLocationWithConnection['status']
        const statusKey = `status.${status}` as const
        
        const variant = status === "active" ? "default" : 
                      status === "inactive" ? "secondary" : "outline"
        
        return (
          <div className="flex justify-center">
            <Badge variant={variant} className={status === "active" ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""}>
              {t(statusKey)}
            </Badge>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => (
        <div className="text-center">
          <DataTableColumnHeader
            column={column}
            title={t("table.createdAt")}
            mode={mode}
            onToggleSort={onToggleSort}
          />
        </div>
      ),
      cell: ({ getValue }) => {
        const date = getValue() as Date | string | null
        if (!tTime) {
          return <div className="text-sm text-muted-foreground text-center">—</div>
        }
        return (
          <div className="text-sm text-muted-foreground text-center">
            {formatRelativeTime(date, tTime)}
          </div>
        )
      },
      sortingFn: "datetime",
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => <div className="text-center">{t("table.actions")}</div>,
      cell: ({ row }) => (
        <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                <Link href={`/backoffice/locations/${row.original.id}`}>
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("actions.view")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ]
}
