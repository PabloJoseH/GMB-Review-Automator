import { getTranslations } from "next-intl/server"
import { Card, CardContent } from "@/components/ui/card"
import { getActiveGlobalConfig } from "@/server/actions/supabase/global-config.action"
import { ActiveConfigClient } from "./active-config-client"

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

interface ActiveConfigServerProps {
  locale: string;
}

/**
 * Server component that fetches and displays active global configuration.
 * 
 * Fetches active config from database and renders editable form.
 * Must be wrapped in Suspense boundary in the page.
 */
export async function ActiveConfigServer({ locale }: ActiveConfigServerProps) {
  const t = await getTranslations({ locale, namespace: "backoffice.settings.active" })
  const res = await getActiveGlobalConfig()
  
  if (!res?.data) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">{t("loading")}</CardContent>
      </Card>
    )
  }

  const config: GlobalConfig = {
    ...res.data,
    created_at: res.data.created_at?.toISOString() ?? null,
    updated_at: res.data.updated_at?.toISOString() ?? null,
  }

  return <ActiveConfigClient config={config} />
}
