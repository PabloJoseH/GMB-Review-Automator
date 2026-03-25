"use client"

import { useTranslations } from "next-intl"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination"
import type { PaginationMeta } from "@/lib/api-types"

interface SystemLog {
  id: string
  time: Date
  process: number
  reject: number
  errors: number
  asked: number
  not_manage: number
  error_types: string[]
}

interface SystemLogsTableClientProps {
  logs: SystemLog[]
  pagination: PaginationMeta
}

export function SystemLogsTableClient({ logs, pagination }: SystemLogsTableClientProps) {
  const t = useTranslations("backoffice.system.logs.table.columns")
  const tTable = useTranslations("backoffice.system.logs.table")

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("time")}</TableHead>
              <TableHead className="text-center">{t("reject")}</TableHead>
              <TableHead className="text-center">{t("process")}</TableHead>
              <TableHead className="text-center">{t("asked")}</TableHead>
              <TableHead className="text-center">{t("notManage")}</TableHead>
              <TableHead className="text-center">{t("errors")}</TableHead>
              <TableHead className="text-center">{t("total")}</TableHead>
              <TableHead>{t("errorTypes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  {tTable("noResults")}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const total = log.process + log.reject + log.errors + log.asked + log.not_manage
                return (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {new Date(log.time).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">{log.reject}</TableCell>
                    <TableCell className="text-center">{log.process}</TableCell>
                    <TableCell className="text-center">{log.asked}</TableCell>
                    <TableCell className="text-center">{log.not_manage}</TableCell>
                    <TableCell className="text-center">{log.errors}</TableCell>
                    <TableCell className="text-center font-semibold">{total}</TableCell>
                    <TableCell>
                      {log.error_types && log.error_types.length > 0 
                        ? log.error_types.join(", ") 
                        : "—"
                      }
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination 
        mode="server" 
        pagination={pagination} 
      />
    </div>
  )
}

