"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MessageSquare, Bot, Archive } from "lucide-react"
import { SessionMessagesSheet } from "@/components/dashboard/shared/session-messages-sheet"
import { formatDate, formatRelativeTime } from "@/lib/utils"
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination"
import { useTranslations } from "next-intl"
import type { UserWithOrganization } from "@/lib/prisma-types"
import type { SessionWithMessageCount } from "@/server/actions/supabase/sessions.action"
import type { PaginationMeta } from "@/lib/api-types"

interface UserSessionsClientProps {
  sessions: SessionWithMessageCount[]
  pagination: PaginationMeta
  user: UserWithOrganization
}

/**
 * UserSessionsClient - Client Component
 * 
 * Displays WhatsApp conversation sessions for a user in table format.
 * Renders table with pagination support.
 * 
 * Architecture:
 * - Client Component: Receives data from UserSessionsServer
 * - Handles UI rendering and pagination
 * - Uses useTranslations for i18n (Client Component API)
 */
export function UserSessionsClient({ 
  sessions, 
  pagination, 
  user 
}: UserSessionsClientProps) {
  const t = useTranslations("backoffice.users.detail.sessions")
  const tTime = useTranslations("common.time")

  return (
    <div className="space-y-4">
      {/* Title outside - consistent with other tabs */}
      <div className="px-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          {t("title")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("subtitle", { count: pagination.total })}
        </p>
      </div>

      {/* Pure Data Table - no Card wrapper */}
      {sessions.length === 0 ? (
        <div className="flex items-center justify-center py-12 border rounded-md">
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">{t("messageCount")}</TableHead>
                  <TableHead className="text-center">{t("lastMessage")}</TableHead>
                  <TableHead>{t("createdAt")}</TableHead>
                  <TableHead className="text-center">{t("status")}</TableHead>
                  <TableHead className="text-center">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => {
                  // Get last message date (from messages array if available, otherwise fall back to updated_at)
                  const lastMessageDate = session.messages?.[0]?.created_at || session.updated_at
                  
                  // Determine status: archived if active is false, otherwise agent managed status
                  const isArchived = session.active === false
                  const agentManaged = session.agent_managed ?? true
                  
                  return (
                    <TableRow key={session.id} className="hover:bg-muted/50">
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono">
                          {session._count?.messages || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {lastMessageDate ? formatRelativeTime(lastMessageDate, tTime) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(session.created_at, { includeTime: true })}
                      </TableCell>
                      <TableCell className="text-center">
                        {isArchived ? (
                          <Badge 
                            variant="secondary"
                            className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          >
                            <div className="flex items-center gap-1.5">
                              <Archive className="h-3 w-3" />
                              {t("archived")}
                            </div>
                          </Badge>
                        ) : (
                          <Badge 
                            variant={agentManaged ? "default" : "outline"}
                            className={agentManaged ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""}
                          >
                            <div className="flex items-center gap-1.5">
                              <Bot className="h-3 w-3" />
                              {agentManaged ? t("agentConnected") : t("agentDisconnected")}
                            </div>
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <SessionMessagesSheet sessionId={session.id}>
                          <Button variant="outline" size="sm" className="hover:!bg-[var(--active)] hover:!text-[var(--active-foreground)] transition-colors">
                            {t("viewConversation")} »
                          </Button>
                        </SessionMessagesSheet>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <DataTablePagination 
            pagination={pagination}
            mode="server"
          />
        </>
      )}
    </div>
  )
}

