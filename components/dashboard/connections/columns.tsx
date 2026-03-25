"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Settings, RefreshCw, Link as LinkIcon } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTableColumnHeader } from "@/components/dashboard/shared/table/data-table-column-header"
import { ConnectionConfigDialog } from "@/components/dashboard/users/single/dialogs/connection-config-dialog"
import { Link } from "@/i18n/navigation"
import { formatDate } from "@/lib/utils"
import type { connections, users, organizations, locations } from "@/app/generated/prisma"

export type ConnectionWithRelations = connections & {
  users_connections_user_idTousers: Pick<users, 'id' | 'name' | 'lastname' | 'username' | 'email'>
  organizations: Pick<organizations, 'id' | 'business_name'>
  locations?: Pick<locations, 'id' | 'name' | 'status'>[]
  _count?: {
    locations: number
  }
}

interface ColumnsProps {
  t: (key: string) => string
  mode?: "client" | "server"
  onToggleSort?: (columnId: string, direction: "asc" | "desc") => void
  onRefresh?: (externalAccountId: string, userId: string) => Promise<void>
}

export function createConnectionsColumns({ t, mode = "client", onToggleSort, onRefresh }: ColumnsProps): ColumnDef<ConnectionWithRelations>[] {
  return [
    // Row selection (shadcn pattern)
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          className="dark:data-[state=checked]:bg-active dark:data-[state=checked]:border-active"
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          className="dark:data-[state=checked]:bg-active dark:data-[state=checked]:border-active"
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
      accessorKey: "external_account_id",
      id: "externalAccountId",
      header: () => t("table.externalAccountId"),
      cell: ({ getValue }) => (
        <div className="font-medium">{getValue() as string || "—"}</div>
      ),
      enableSorting: false,
    },
    {
      accessorFn: (row) => {
        const user = row.users_connections_user_idTousers
        const { name, lastname, username } = user
        return name && lastname ? `${name} ${lastname}` : name || lastname || username
      },
      id: "user",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("table.user")}
          mode={mode}
          onToggleSort={onToggleSort}
        />
      ),
      cell: ({ row, getValue }) => {
        const userName = getValue() as string
        const userId = row.original.users_connections_user_idTousers.id
        return (
          <Link
            href={`/backoffice/users/${userId}`}
            className="group/user-link inline-flex items-center gap-1.5 font-medium hover:text-active transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <span>{userName}</span>
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/user-link:opacity-100 transition-opacity dark:text-gray-400" />
          </Link>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "type",
      id: "type",
      header: () => <div className="text-center">{t("table.type")}</div>,
      cell: ({ getValue }) => {
        const type = getValue() as string | null
        return (
          <div className="text-sm text-center">
            {type ? (
              <Badge variant="outline" className="font-normal">
                {type}
              </Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      id: "locationCount",
      header: () => <div className="text-center">{t("table.locationCount")}</div>,
      cell: ({ row }) => {
        const count = row.original._count?.locations ?? 0
        return (
          <div className="text-sm text-center">
            {count === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <Badge variant="outline" className="font-mono">
                {count}
              </Badge>
            )}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "pub_sub",
      id: "pubSub",
      header: () => <div className="text-center">{t("table.pubSub")}</div>,
      cell: ({ getValue }) => {
        const pubSub = getValue() as boolean | null
        return (
          <div className="flex justify-center">
            <Badge 
              variant={pubSub ? "default" : "secondary"}
              className={pubSub ? "bg-active text-active-foreground hover:bg-(--active)/90" : ""}
            >
              {pubSub ? t("table.active") : t("table.inactive")}
            </Badge>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "created_at",
      id: "createdAt",
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
            {formatDate(date, { includeTime: true })}
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
            <ConnectionConfigDialog
              connectionId={row.original.id}
              externalAccountId={row.original.external_account_id}
              userId={row.original.user_id}
              pubSub={row.original.pub_sub}
              locations={(row.original.locations || []).map((loc) => ({ 
                id: loc.id, 
                name: loc.name, 
                status: loc.status 
              }))}
              totalLocationsCount={row.original._count?.locations || 0}
            >
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
            </ConnectionConfigDialog>
            <TooltipContent>
              <p>{t("actions.configure")}</p>
            </TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={async () => {
                  if (onRefresh) {
                    await onRefresh(row.original.external_account_id, row.original.user_id)
                  }
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("actions.refresh")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ]
}
