"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Eye, MessageSquare, Check, CircleDashed } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTableColumnHeader } from "@/components/dashboard/shared/table/data-table-column-header"
import { SessionMessagesSheet } from "@/components/dashboard/shared/session-messages-sheet"
import type { UserWithLocationsCount } from "@/lib/prisma-types"

/**
 * Get icon representation for onboarding status
 */
const getStatusIcon = (status: string): React.ReactElement => {
  return status === "done"
    ? <Check className="h-4 w-4 text-muted-foreground" />
    : <CircleDashed className="h-4 w-4 text-muted-foreground" />
}

interface ColumnsProps {
  t: (key: string) => string
  mode?: "client" | "server"
  onToggleSort?: (columnId: string, direction: "asc" | "desc") => void
}

export function createUsersColumns({ t, mode = "client", onToggleSort }: ColumnsProps): ColumnDef<UserWithLocationsCount>[] {
  return [
    // Row selection (shadcn pattern)
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          className="dark:data-[state=checked]:bg-[var(--active)] dark:data-[state=checked]:border-[var(--active)]"
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          className="dark:data-[state=checked]:bg-[var(--active)] dark:data-[state=checked]:border-[var(--active)]"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
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
      accessorFn: (row) => {
        const { name, lastname, username } = row
        return name && lastname ? `${name} ${lastname}` : name || lastname || username
      },
      id: "name",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("table.name")}
          mode={mode}
          onToggleSort={onToggleSort}
        />
      ),
      cell: ({ getValue }) => (
        <div className="font-medium">{getValue() as string}</div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "wa_id",
      id: "phone",
      header: () => t("table.phone"),
      cell: ({ getValue }) => (
        <div className="font-medium">{getValue() as string || "—"}</div>
      ),
      enableSorting: false,
    },
    {
      accessorFn: (row) => row.organizations_users_organization_idToorganizations,
      id: "organization",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("table.organization")}
          mode={mode}
          onToggleSort={onToggleSort}
        />
      ),
      cell: ({ getValue }) => {
        const org = getValue() as UserWithLocationsCount["organizations_users_organization_idToorganizations"]
        return (
          <div className="text-sm">{org?.business_name || "—"}</div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "onboarding_status",
      id: "status",
      header: () => <div className="text-center">{t("table.status")}</div>,
      cell: ({ getValue }) => {
        const status = getValue() as string
        const icon = getStatusIcon(status)
        const label = t(`status.onboarding.${status}`)

        return (
          <div className="flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">
                  {icon}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{label}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      id: "locations",
      header: () => <div className="text-center">{t("table.locations")}</div>,
      cell: ({ row }) => {
        const activeCount = row.original._count?.activeLocations ?? 0
        const totalCount = row.original._count?.locations ?? 0

        if (totalCount === 0) {
          return (
            <div className="text-sm text-center text-muted-foreground">
              —
            </div>
          )
        }

        return (
          <div className="flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="font-mono cursor-help">
                  {activeCount}/{totalCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{(t as unknown as (key: string, values?: Record<string, string | number | Date>) => string)(
                  "locations.activeTooltip",
                  { active: activeCount, total: totalCount }
                )}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )
      },
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
        return (
          <div className="text-sm text-muted-foreground text-center">
            {date ? new Date(date).toLocaleDateString('es-ES') : "—"}
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
                <Link href={`/backoffice/users/${row.original.id}`}>
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("actions.view")}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              {row.original.latestSession ? (
                <SessionMessagesSheet sessionId={row.original.latestSession.id}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </SessionMessagesSheet>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              )}
            </TooltipTrigger>
            <TooltipContent>
              <p>{row.original.latestSession ? t("actions.viewWhatsApp") : t("actions.noWhatsApp")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ]
}
