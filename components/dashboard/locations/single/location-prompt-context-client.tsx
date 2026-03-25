"use client"

import { Sparkles, Edit, Star, MessageSquare, Clock } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"
import { LocationPromptContextSheet } from "@/components/dashboard/users/single/dialogs/location-prompt-context-sheet"
import { formatDate } from "@/lib/utils"
import type { SerializedLocationWithFullRelations } from "@/lib/prisma-types"

interface LocationPromptContextClientProps {
  location: SerializedLocationWithFullRelations
}

/**
 * LocationPromptContextClient - Client Component
 * 
 * Displays comprehensive prompt context information and provides edit functionality.
 * Shows all configuration fields from the prompt_context schema in a clear, organized layout.
 * Uses LocationPromptContextSheet from users/single/dialogs for editing.
 */
export function LocationPromptContextClient({ 
  location
}: LocationPromptContextClientProps) {
  const t = useTranslations("backoffice.locations.detail.promptContext")

  const promptContext = location.prompt_context

  const getStarActionLabel = (action: string | null) => {
    if (!action) return "—"
    return t(`starActions.${action}`)
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {t("title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <LocationPromptContextSheet locationId={location.id}>
          <Button variant="outline" size="sm">
            <Edit className="mr-2 h-4 w-4" />
            {t("edit")}
          </Button>
        </LocationPromptContextSheet>
      </div>

      {/* Prompt Context Cards */}
      {promptContext ? (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
          {/* Left Column: Tone & Style Configuration */}
          <Card className="flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-[var(--active)]" />
                {t("tone.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              {/* Tone */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">{t("tone.title")}</div>
                <div className="bg-muted/50 p-4 rounded-md border min-h-[80px]">
                  <p className="text-sm whitespace-pre-wrap">{promptContext.tone || "—"}</p>
                </div>
              </div>

              {/* Style Configuration in Three Columns */}
              <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                {/* Response Length */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{t("responseLength.title")}</div>
                  <Badge variant="outline" className="text-xs">
                    {promptContext.response_length ? t(`responseLength.${promptContext.response_length}`) : "—"}
                  </Badge>
                </div>

                {/* Use Emojis */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{t("style.useEmojis")}</div>
                  <Badge variant={promptContext.use_emojis ? "default" : "outline"} className="text-xs">
                    {promptContext.use_emojis ? t("yes") : t("no")}
                  </Badge>
                </div>

                {/* Language */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{t("style.language")}</div>
                  <Badge variant="outline" className="text-xs">{promptContext.language || "—"}</Badge>
                </div>
              </div>

              {/* CTA */}
              {promptContext.cta && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="text-sm font-medium text-muted-foreground">{t("cta.title")}</div>
                  <div className="bg-muted/50 p-4 rounded-md border min-h-[60px]">
                    <p className="text-sm whitespace-pre-wrap">{promptContext.cta}</p>
                  </div>
                </div>
              )}

              {/* Custom Instructions */}
              {promptContext.custom_instruction && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="text-sm font-medium text-muted-foreground">{t("customInstructions.title")}</div>
                  <div className="bg-muted/50 p-4 rounded-md border min-h-[80px]">
                    <p className="text-sm whitespace-pre-wrap">{promptContext.custom_instruction}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column: Star Actions + Metadata stacked vertically */}
          <div className="flex flex-col gap-4">
            {/* Star Rating Actions */}
            <Card className="flex-1">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Star className="h-5 w-5 text-[var(--active)]" />
                  {t("starActions.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { rating: 5, key: 'on_5_star', label: '5⭐' },
                  { rating: 4, key: 'on_4_star', label: '4⭐' },
                  { rating: 3, key: 'on_3_star', label: '3⭐' },
                  { rating: 2, key: 'on_2_star', label: '2⭐' },
                  { rating: 1, key: 'on_1_star', label: '1⭐' }
                ].map(({ rating, key, label }) => (
                  <div key={rating} className="flex items-center justify-between p-2 bg-muted/30 rounded border">
                    <span className="text-sm">{label}</span>
                    <Badge variant="outline" className="text-xs">
                      {getStarActionLabel(promptContext[key as keyof typeof promptContext] as string | null)}
                    </Badge>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-2">{t("starActions.description")}</p>
              </CardContent>
            </Card>

            {/* Metadata */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {t("timestamps.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("timestamps.created")}</span>
                  <span className="font-medium">{formatDate(promptContext.created_at, { includeTime: true })}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("timestamps.updated")}</span>
                  <span className="font-medium">{formatDate(promptContext.updated_at, { includeTime: true })}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("notConfigured")}</CardTitle>
            <CardDescription>
              {t("description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LocationPromptContextSheet locationId={location.id}>
              <Button variant="default">
                <Sparkles className="mr-2 h-4 w-4" />
                {t("configure")}
              </Button>
            </LocationPromptContextSheet>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

