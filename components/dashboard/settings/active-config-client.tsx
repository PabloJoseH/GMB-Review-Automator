"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { EditableInstructionsField } from "./shared/editable-instructions-field"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { createGlobalConfigDraft } from "@/server/actions/supabase/global-config.action"
import { Save, Settings, Info } from "lucide-react"
import { APP_CONSTANTS } from "@/lib/constants"
import { Alert, AlertDescription } from "@/components/ui/alert"

type GlobalConfig = {
  id: string
  responder_instructions: string
  responder_model: string
  responder_response_format: string
  responder_max_tokens: number
  responder_production: boolean
  onboarding_instructions: string
  onboarding_model: string
  onboarding_response_format: string
  onboarding_max_tokens: number
  threshold_tokens: number
  whatsapp_phone_number_id?: string | null
  whatsapp_phone_number?: string | null
  created_at: string | null
  updated_at: string | null
}

interface ActiveConfigClientProps {
  config: GlobalConfig
}

export function ActiveConfigClient({ config }: ActiveConfigClientProps) {
  const t = useTranslations("backoffice.settings.active")
  const [cfg, setCfg] = useState<GlobalConfig>(config)
  const [isPending, startTransition] = useTransition()
  const [showProductionDialog, setShowProductionDialog] = useState(false)
  const [pendingProduction, setPendingProduction] = useState<boolean | null>(null)

  const saveDraft = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, ...rest } = cfg
    startTransition(async () => {
      const res = await createGlobalConfigDraft(rest as Omit<GlobalConfig, 'id' | 'created_at' | 'updated_at'>)
      if (res?.success) {
        toast.success(t("savedDraft"))
        window.location.reload()
      } else {
        toast.error(t("saveError"))
      }
    })
  }

  const handleProductionToggle = (checked: boolean) => {
    setPendingProduction(checked)
    setShowProductionDialog(true)
  }

  const confirmProductionToggle = () => {
    if (pendingProduction !== null && cfg) {
      setCfg({ ...cfg, responder_production: pendingProduction })
      setShowProductionDialog(false)
      setPendingProduction(null)
      toast.success(
        pendingProduction 
          ? t("productionEnabled") 
          : t("productionDisabled")
      )
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—"
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t("title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("subtitleDate", { 
                date: formatDate(cfg.created_at) 
              })}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">{t("tabs.general")}</TabsTrigger>
              <TabsTrigger value="responder">{t("tabs.responder", { companyName: APP_CONSTANTS.brand.companyName })}</TabsTrigger>
              <TabsTrigger value="onboarding">{t("tabs.onboarding")}</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-6 mt-6">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm space-y-2">
                  <p className="font-medium">{t("general.info.title")}</p>
                  <p>{t("general.info.description")}</p>
                  <ul className="list-disc list-inside space-y-1 mt-2 ml-2">
                    <li>{t("general.info.step1")}</li>
                    <li>{t("general.info.step2")}</li>
                    <li>{t("general.info.step3")}</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </TabsContent>

            <TabsContent value="responder" className="space-y-6 mt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold">{t("fields.responderProduction")}</Label>
                    <p className="text-sm text-muted-foreground">{t("fields.responderProductionDescription")}</p>
                  </div>
                  <Switch
                    checked={cfg.responder_production}
                    onCheckedChange={handleProductionToggle}
                  />
                </div>
              </div>

              <div className="pt-4">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("fields.responderModel")}</Label>
                    <Input 
                      value={cfg.responder_model || ""} 
                      onChange={(e) => setCfg({ ...cfg, responder_model: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("fields.responderMaxTokens")}</Label>
                    <Input 
                      type="number" 
                      value={cfg.responder_max_tokens ?? 0} 
                      onChange={(e) => setCfg({ ...cfg, responder_max_tokens: Number(e.target.value || 0) })} 
                    />
                  </div>
                </div>
              </div>
              
              <Separator />

              <div className="grid gap-6 md:grid-cols-2">
                <EditableInstructionsField
                  label={t("fields.responderResponseFormat")}
                  value={cfg.responder_response_format || ""}
                  onChange={(value) => setCfg({ ...cfg, responder_response_format: value })}
                  height="350px"
                  placeholder='{"type": "object", "properties": {...}}'
                />
                <EditableInstructionsField
                  label={t("fields.responderInstructions")}
                  value={cfg.responder_instructions || ""}
                  onChange={(value) => setCfg({ ...cfg, responder_instructions: value })}
                  height="350px"
                />
              </div>


              <Button 
                onClick={saveDraft} 
                disabled={isPending}
                className="w-full bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90"
              >
                <Save className="mr-2 h-4 w-4" />
                {t("saveDraft")}
              </Button>
            </TabsContent>

            <TabsContent value="onboarding" className="space-y-6 mt-6">
              <div className="grid gap-8 grid-cols-1 md:grid-cols-2">
                {/* Columna izquierda: ID WhatsApp, Teléfono WhatsApp, Formato respuesta WhatsApp */}
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>{t("fields.whatsappPhoneNumberId")}</Label>
                    <Input 
                      value={cfg.whatsapp_phone_number_id || ""} 
                      onChange={(e) => setCfg({ ...cfg, whatsapp_phone_number_id: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("fields.whatsappPhoneNumber")}</Label>
                    <Input 
                      value={cfg.whatsapp_phone_number || ""} 
                      onChange={(e) => setCfg({ ...cfg, whatsapp_phone_number: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("fields.onboardingResponseFormat")}</Label>
                    <Input 
                      value={cfg.onboarding_response_format || ""} 
                      onChange={(e) => setCfg({ ...cfg, onboarding_response_format: e.target.value })} 
                    />
                  </div>
                </div>

                {/* Columna derecha: Modelo, Max tokens, Umbral tokens */}
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>{t("fields.onboardingModel")}</Label>
                    <Input 
                      value={cfg.onboarding_model || ""} 
                      onChange={(e) => setCfg({ ...cfg, onboarding_model: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("fields.onboardingMaxTokens")}</Label>
                    <Input 
                      type="number" 
                      value={cfg.onboarding_max_tokens ?? 0} 
                      onChange={(e) => setCfg({ ...cfg, onboarding_max_tokens: Number(e.target.value || 0) })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("fields.thresholdTokens")}</Label>
                    <Input 
                      type="number" 
                      value={cfg.threshold_tokens ?? 400000} 
                      onChange={(e) => setCfg({ ...cfg, threshold_tokens: Number(e.target.value || 400000) })} 
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("fields.thresholdTokensDescription")}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <EditableInstructionsField
                label={t("fields.onboardingInstructions")}
                value={cfg.onboarding_instructions || ""}
                onChange={(value) => setCfg({ ...cfg, onboarding_instructions: value })}
                height="300px"
              />

              <Separator />

              <Button 
                onClick={saveDraft} 
                disabled={isPending}
                className="w-full bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90"
              >
                <Save className="mr-2 h-4 w-4" />
                {t("saveDraft")}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AlertDialog open={showProductionDialog} onOpenChange={setShowProductionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingProduction ? t("production.enableTitle") : t("production.disableTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingProduction ? t("production.enableDescription") : t("production.disableDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingProduction(null)}>
              {t("production.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmProductionToggle}
              className="bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90"
            >
              {pendingProduction ? t("production.enableConfirm") : t("production.disableConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}