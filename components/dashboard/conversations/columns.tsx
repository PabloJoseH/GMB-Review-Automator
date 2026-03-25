"use client"

import { ColumnDef } from "@tanstack/react-table"
import { MessageSquare, Bot, Archive, Link as LinkIcon } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTableColumnHeader } from "@/components/dashboard/shared/table/data-table-column-header"
import { SessionMessagesSheet } from "@/components/dashboard/shared/session-messages-sheet"
import { formatRelativeTime, formatNumber } from "@/lib/utils"
import { Link } from "@/i18n/navigation"
import type { SessionWithUserAndLastMessage } from "@/lib/prisma-types"

export type SessionWithUser = SessionWithUserAndLastMessage

interface ColumnsProps {
  t: (key: string) => string
  tTime?: (key: string, values?: Record<string, number>) => string
  mode?: "client" | "server"
  onToggleSort?: (columnId: string, direction: "asc" | "desc") => void
  thresholdTokens: number
}

const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return "—"
  return new Date(date).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function createConversationsColumns({ t, tTime, mode = "client", onToggleSort, thresholdTokens }: ColumnsProps): ColumnDef<SessionWithUser>[] {
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
      accessorFn: (row) => {
        const { name, lastname, username } = row.users
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
        const userId = row.original.users.id
        return (
          <Link
            href={`/backoffice/users/${userId}`}
            className="group/user-link inline-flex items-center gap-1.5 font-medium hover:text-[var(--active)] transition-colors"
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
      accessorKey: "users.wa_id",
      id: "phone",
      header: () => t("table.phone"),
      cell: ({ getValue }) => (
        <div className="font-medium">{getValue() as string || "—"}</div>
      ),
      enableSorting: false,
    },
    {
      id: "messageCount",
      header: () => <div className="text-center">{t("table.messageCount")}</div>,
      cell: ({ row }) => {
        const count = row.original._count?.messages ?? 0
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
      id: "tokens",
      header: () => <div className="text-center">{t("table.tokens")}</div>,
      cell: ({ row }) => {
        const tokens = row.original.tokens ?? 0
        const percentage = thresholdTokens > 0 ? Math.round((tokens / thresholdTokens) * 100) : 0
        return (
          <div className="text-sm text-center">
            {tokens === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span>
                {formatNumber(tokens, 0)} ({percentage}%)
              </span>
            )}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "updated_at",
      id: "lastMessage",
      header: ({ column }) => (
        <div className="text-center">
          <DataTableColumnHeader
            column={column}
            title={t("table.lastMessage")}
            mode={mode}
            onToggleSort={onToggleSort}
          />
        </div>
      ),
      cell: ({ row }) => {
        // Use the last message's created_at if available, otherwise fall back to updated_at
        const lastMessageDate = row.original.messages?.[0]?.created_at || row.original.updated_at
        if (!tTime) {
          return <div className="text-sm text-muted-foreground text-center">—</div>
        }
        return (
          <div className="text-sm text-muted-foreground text-center">
            {formatRelativeTime(lastMessageDate, tTime)}
          </div>
        )
      },
      sortingFn: "datetime",
      enableSorting: true,
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
            {formatDate(date)}
          </div>
        )
      },
      sortingFn: "datetime",
      enableSorting: true,
    },
    {
      id: "status",
      header: () => <div className="text-center">{t("table.status")}</div>,
      cell: ({ row }) => {
        const agentManaged = row.original.agent_managed ?? true
        const active = row.original.active ?? false

        // Only show "Archived" if active is explicitly false
        if (active === false) {
          return (
            <div className="flex justify-center">
              <Badge 
                variant="secondary"
                className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              >
                <div className="flex items-center gap-1.5">
                  <Archive className="h-3 w-3" />
                  {t("table.archived")}
                </div>
              </Badge>
            </div>
          )
        }

        // If the session is active, show the agent status
        return (
          <div className="flex justify-center">
            <Badge 
              variant={agentManaged ? "default" : "outline"}
              className={agentManaged ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""}
            >
              <div className="flex items-center gap-1.5">
                <Bot className="h-3 w-3" />
                {agentManaged ? t("table.agentConnected") : t("table.agentDisconnected")}
              </div>
            </Badge>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => <div className="text-center">{t("table.actions")}</div>,
      cell: ({ row }) => (
        <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <SessionMessagesSheet sessionId={row.original.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("actions.view")}</p>
              </TooltipContent>
            </Tooltip>
          </SessionMessagesSheet>
        </div>
      ),
    },
  ]
}

