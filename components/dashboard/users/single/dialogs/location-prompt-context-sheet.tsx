"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Sparkles, Star, AlertCircle, MessageSquare, Zap, Clock, Save } from "lucide-react"
import { 
  Sheet, 
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { getPromptContextByLocation, updatePromptContext } from "@/server/actions/supabase/prompt-context.action"
import { formatDate } from "@/lib/utils"
import { toast } from "sonner"
import type { prompt_context } from "@/app/generated/prisma"
import { createLogger } from "@/lib/logger"

const logger = createLogger('LOCATION-PROMPT-CONTEXT')

interface LocationPromptContextSheetProps {
  locationId: string
  children: React.ReactNode
}

/**
 * LocationPromptContextSheet - Client Component
 * 
 * Sheet for configuring AI prompt context settings for a location.
 */
export function LocationPromptContextSheet({ locationId, children }: LocationPromptContextSheetProps) {
  const router = useRouter()
  const t = useTranslations("backoffice.users.detail.promptContext")
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [promptContext, setPromptContext] = useState<prompt_context | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Form state for editing
  const [formData, setFormData] = useState({
    tone: "amigable",
    response_length: "medium",
    cta: "",
    use_emojis: false,
    language: "spanish",
    custom_instruction: "",
    on_5_star: "reply",
    on_4_star: "reply",
    on_3_star: "reply",
    on_2_star: "reply",
    on_1_star: "reply"
  })

  const fetchPromptContext = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await getPromptContextByLocation(locationId)
      
      if (result.success && result.data) {
        setPromptContext(result.data)
        // Initialize form with fetched data
        setFormData({
          tone: result.data.tone || "amigable",
          response_length: result.data.response_length || "medium",
          cta: result.data.cta || "",
          use_emojis: result.data.use_emojis || false,
          language: result.data.language || "spanish",
          custom_instruction: result.data.custom_instruction || "",
          on_5_star: result.data.on_5_star || "reply",
          on_4_star: result.data.on_4_star || "reply",
          on_3_star: result.data.on_3_star || "reply",
          on_2_star: result.data.on_2_star || "reply",
          on_1_star: result.data.on_1_star || "reply"
        })
      } else {
        setError(result.error || 'Failed to load prompt context')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [locationId])

  // Fetch prompt context when sheet opens
  useEffect(() => {
    if (open && locationId) {
      fetchPromptContext()
    }
  }, [open, locationId, fetchPromptContext])

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    
    try {
      const result = await updatePromptContext(locationId, {
        tone: formData.tone,
        response_length: formData.response_length as 'short' | 'medium' | 'long',
        cta: formData.cta,
        use_emojis: formData.use_emojis,
        language: formData.language,
        custom_instruction: formData.custom_instruction,
        on_5_star: formData.on_5_star as 'reply' | 'propose' | 'do_not_manage',
        on_4_star: formData.on_4_star as 'reply' | 'propose' | 'do_not_manage',
        on_3_star: formData.on_3_star as 'reply' | 'propose' | 'do_not_manage',
        on_2_star: formData.on_2_star as 'reply' | 'propose' | 'do_not_manage',
        on_1_star: formData.on_1_star as 'reply' | 'propose' | 'do_not_manage'
      })

      if (result.success && result.data) {
        setPromptContext(result.data)
        toast.success(t("saveSuccess"))
        // Close sheet to return to parent page
        setOpen(false)
        // Revalidate Server Components to show updated prompt context
        router.refresh()
      } else {
        setError(result.error || t("saveError"))
        toast.error(result.error || t("saveError"))
      }
    } catch (error) {
      logger.error('Error saving prompt context', error instanceof Error ? error : new Error(String(error)))
      setError('An unexpected error occurred while saving')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {/* Professional Header */}
        <SheetHeader className="pb-6">
          <SheetTitle className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            <div className="rounded-lg bg-[var(--active)]/10 p-2">
              <Sparkles className="h-5 w-5 text-[var(--active)]" />
            </div>
            {t("title")}
          </SheetTitle>
          <SheetDescription className="text-base text-muted-foreground">
            {t("description")}
          </SheetDescription>
        </SheetHeader>

        {/* Main Content */}
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
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Response Configuration */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-[var(--active)]" />
                    {t("tone.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Tone Selection */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t("tone.title")}</Label>
                    <Textarea
                      placeholder="Ej: Amigable y profesional, manteniendo un tono cercano pero respetuoso"
                      value={formData.tone}
                      onChange={(e) => setFormData(prev => ({ ...prev, tone: e.target.value }))}
                      className="min-h-[80px]"
                    />
                    <p className="text-xs text-muted-foreground">{t("tone.description")}</p>
                  </div>

                  {/* Response Length */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t("responseLength.title")}</Label>
                    <Select 
                      value={formData.response_length} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, response_length: value }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">{t("responseLength.short")}</SelectItem>
                        <SelectItem value="medium">{t("responseLength.medium")}</SelectItem>
                        <SelectItem value="long">{t("responseLength.long")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t("responseLength.description")}</p>
                  </div>

                  {/* Call to Action */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t("cta.title")}</Label>
                    <Textarea
                      placeholder={t("cta.noCta")}
                      value={formData.cta}
                      onChange={(e) => setFormData(prev => ({ ...prev, cta: e.target.value }))}
                      className="min-h-[80px]"
                    />
                    <p className="text-xs text-muted-foreground">{t("cta.description")}</p>
                  </div>

                  {/* Custom Instructions */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t("customInstructions.title")}</Label>
                    <Textarea
                      placeholder={t("customInstructions.placeholder")}
                      value={formData.custom_instruction}
                      onChange={(e) => setFormData(prev => ({ ...prev, custom_instruction: e.target.value }))}
                      className="min-h-[120px]"
                    />
                    <p className="text-xs text-muted-foreground">{t("customInstructions.description")}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Style Configuration */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Zap className="h-5 w-5 text-[var(--active)]" />
                    {t("style.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Emojis Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">{t("style.useEmojis")}</Label>
                      <p className="text-xs text-muted-foreground">{t("style.useEmojisDescription")}</p>
                    </div>
                    <Switch
                      checked={formData.use_emojis}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, use_emojis: checked }))}
                    />
                  </div>

                  {/* Language Selection */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t("style.language")}</Label>
                    <Input
                      placeholder="Ej: español, inglés, automático"
                      value={formData.language}
                      onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value }))}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Star Rating Actions */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Star className="h-5 w-5 text-[var(--active)]" />
                    {t("starActions.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {[
                      { rating: 5, key: 'on_5_star', label: '5⭐' },
                      { rating: 4, key: 'on_4_star', label: '4⭐' },
                      { rating: 3, key: 'on_3_star', label: '3⭐' },
                      { rating: 2, key: 'on_2_star', label: '2⭐' },
                      { rating: 1, key: 'on_1_star', label: '1⭐' }
                    ].map(({ rating, key, label }) => (
                      <div key={rating} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{label}</span>
                        </div>
                        <Select 
                          value={formData[key as keyof typeof formData] as string}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, [key]: value }))}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="reply">{t("starActions.reply")}</SelectItem>
                            <SelectItem value="propose">{t("starActions.propose")}</SelectItem>
                            <SelectItem value="do_not_manage">{t("starActions.do_not_manage")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{t("starActions.description")}</p>
                </CardContent>
              </Card>

              {/* Metadata */}
              {promptContext && (
                <Card>
                  <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    {t("timestamps.title")}
                  </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("timestamps.created")}</span>
                      <span className="font-medium">{formatDate(promptContext.created_at, { includeTime: true })}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("timestamps.updated")}</span>
                      <span className="font-medium">{formatDate(promptContext.updated_at, { includeTime: true })}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Save Button */}
              <div className="pt-4">
                <Button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90"
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      {t("saving")}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {t("save")}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
