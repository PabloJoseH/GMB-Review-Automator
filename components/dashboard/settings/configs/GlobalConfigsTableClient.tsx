"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useReactTable, getCoreRowModel, getPaginationRowModel, flexRender, ColumnDef } from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination"
import { getGlobalConfigColumns, type GlobalConfigRow } from "./columns"
import { activateGlobalConfig, getGlobalConfigById } from "@/server/actions/supabase/global-config.action"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { 
  Sheet, 
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle 
} from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EditableInstructionsField } from "../shared/editable-instructions-field"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Settings as SettingsIcon, MessageSquare, Zap } from "lucide-react"
import type { PaginationMeta } from "@/lib/api-types"
import type { global_config } from "@/app/generated/prisma"

export function GlobalConfigsTableClient({ rows, pagination }: { rows: GlobalConfigRow[]; pagination: PaginationMeta }) {
  const t = useTranslations("backoffice.settings.configs")
  const tCols = useTranslations("backoffice.settings.configs.table.columns")
  const tFields = useTranslations("backoffice.settings.active.fields")
  const [isPending, setIsPending] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<global_config | null>(null)

  const fetchConfig = useCallback(async (id: string) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const res = await getGlobalConfigById(id)
      if (res?.data) {
        setDetail(res.data)
      } else {
        setError(t("loadError") || "Failed to load configuration")
      }
    } catch {
      setError(t("loadError") || "An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (open && selectedId) {
      fetchConfig(selectedId)
    } else if (!open) {
      setDetail(null)
      setError(null)
      setSelectedId(null)
    }
  }, [open, selectedId, fetchConfig])

  const onView = (id: string) => {
    setSelectedId(id)
    setOpen(true)
  }

  const handleActivate = () => {
    if (!selectedId) return
    setIsPending(true)
    activateGlobalConfig(selectedId).then((res) => {
      if (res?.success) {
        toast.success(t("activated"))
        setOpen(false)
        window.location.reload()
      } else {
        toast.error(t("activateError"))
      }
    }).finally(() => {
      setIsPending(false)
    })
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

  const columns: ColumnDef<GlobalConfigRow>[] = getGlobalConfigColumns(
    (key: string, values?: Record<string, string | number | Date>) => tCols(key, values),
    onView
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(pagination.total / pagination.limit),
    state: { pagination: { pageIndex: pagination.page - 1, pageSize: pagination.limit } },
  })

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    {t("empty")}
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DataTablePagination 
          mode="server" 
          pagination={pagination} 
        />
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-6">
            <SheetTitle className="text-2xl font-semibold tracking-tight flex items-center gap-3">
              <div className="rounded-lg bg-[var(--active)]/10 p-2">
                <SettingsIcon className="h-5 w-5 text-[var(--active)]" />
              </div>
              {t("configTitle")}
            </SheetTitle>
            <SheetDescription className="text-base text-muted-foreground">
              {t("viewDescription")}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-6 pb-8">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : detail ? (
              <>
                {/* General Information */}
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <SettingsIcon className="h-5 w-5 text-[var(--active)]" />
                      {t("generalInfo")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">{tFields("createdAt")}</Label>
                      <div className="text-base">{detail.created_at ? formatDate(detail.created_at) : "—"}</div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">{tFields("responderProduction")}</Label>
                      <div className="text-base">{detail.responder_production ? t("enabled") : t("disabled")}</div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">{tFields("whatsappPhoneNumberId")}</Label>
                      <div className="text-base">{detail.whatsapp_phone_number_id || t("notConfigured")}</div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">{tFields("whatsappPhoneNumber")}</Label>
                      <div className="text-base">{detail.whatsapp_phone_number || t("notConfigured")}</div>
                    </div>
                  </CardContent>
                </Card>

                {/* Responder Instructions */}
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-[var(--active)]" />
                      {tFields("responderInstructions")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">{tFields("responderModel")}</Label>
                      <div className="text-base">{detail.responder_model} · {detail.responder_max_tokens} {t("tokens")}</div>
                    </div>
                    <EditableInstructionsField
                      label={tFields("responderResponseFormat")}
                      value={detail.responder_response_format || ""}
                      readOnly
                      height="120px"
                    />
                    <EditableInstructionsField
                      label={tFields("responderInstructions")}
                      value={detail.responder_instructions || t("noInstructions")}
                      readOnly
                      height="200px"
                    />
                  </CardContent>
                </Card>

                {/* Onboarding Instructions */}
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <Zap className="h-5 w-5 text-[var(--active)]" />
                      {tFields("onboardingInstructions")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">{tFields("onboardingModel")}</Label>
                      <div className="text-base">{detail.onboarding_model} · {detail.onboarding_max_tokens} {t("tokens")}</div>
                    </div>
                    <EditableInstructionsField
                      label={tFields("onboardingInstructions")}
                      value={detail.onboarding_instructions || t("noInstructions")}
                      readOnly
                      height="200px"
                    />
                  </CardContent>
                </Card>

                {/* Activate Button */}
                <div className="pt-4">
                  <Button 
                    onClick={handleActivate}
                    disabled={isPending}
                    className="w-full bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90"
                  >
                    {isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        {t("activating")}...
                      </>
                    ) : (
                      t("activate")
                    )}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}