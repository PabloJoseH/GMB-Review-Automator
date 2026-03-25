"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Star, Edit, Send, MapPin } from "lucide-react"
import { useTranslations } from "next-intl"
import { formatRelativeTime } from "@/lib/utils"
import type { ProposedResponseWithLocation } from "@/lib/prisma-types"
import { useState } from "react"
import { EditResponseDialog } from "./edit-response-dialog"
import { createLogger } from "@/lib/logger"
import { useRouter } from "next/navigation"

const logger = createLogger('PROPOSED_RESPONSE_CARD')

interface ProposedResponseCardProps {
  response: ProposedResponseWithLocation
  selected: boolean
  onSelect: () => void
  now: Date
  clerkUserId?: string
}

/**
 * ProposedResponseCard - Client Component
 * 
 * Displays a single proposed response as a card with:
 * - Checkbox (as avatar) + Reviewer name (top)
 * - Rating stars + Relative date (below name)
 * - Location badge (right, larger)
 * - Review comment (rounded background, no blue border)
 * - Proposed response (blue border, different background, pending badge)
 * - Actions (edit, send)
 * 
 * Uses selection pattern from location-selection.tsx
 */
export function ProposedResponseCard({ response, selected, onSelect, clerkUserId, now }: ProposedResponseCardProps) {
  const t = useTranslations("user.proposedResponses")
  const tTime = useTranslations("common.time")
  const router = useRouter()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const rating = parseInt(response.rating) || 0
  const locationName = response.location?.name || t("unnamedLocation")
  const reviewerName = response.reviewer_name || t("anonymousReviewer")
  const relativeDate = formatRelativeTime(response.create_time, tTime, now)

  const handleSend = async (e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!clerkUserId) {
      logger.error('Cannot send response: clerkUserId is missing')
      return
    }

    if (!response.reply_url || !response.response) {
      logger.warn('Cannot send response: missing reply_url or response', {
        responseId: response.id,
        hasReplyUrl: !!response.reply_url,
        hasResponse: !!response.response
      })
      return
    }

    setIsSending(true)
    try {
      const { sendProposedResponsesToGmb } = await import('@/server/actions/supabase/proposed-responses.action')
      
      logger.debug('Sending response', {
        responseId: response.id,
        locationId: response.location_id
      })
      
      const result = await sendProposedResponsesToGmb(clerkUserId, [response.id])
      
      if (result.success) {
        // Refresh the page to show updated status
        router.refresh()
      } else {
        logger.error('Failed to send response', { error: result.error })
        // Show error message to user (you could use a toast here)
        alert(result.message) // Replace with toast notification
      }
    } catch (error) {
      logger.error('Error sending response', error)
      alert('Error sending response') // Replace with toast notification
    } finally {
      setIsSending(false)
    }
  }

  return (
    <>
      <Card 
        className={`cursor-pointer transition-all ${
          selected 
            ? 'ring-2 ring-[var(--active)] bg-[var(--active)]/5' 
            : 'hover:shadow-md hover:ring-1 hover:ring-border'
        }`}
        onClick={() => onSelect()}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onSelect()}
              aria-label="Select response"
              className="mt-1.5 size-8 border-2 dark:data-[state=checked]:bg-[var(--active)] dark:data-[state=checked]:border-[var(--active)] dark:data-[state=checked]:text-[var(--active-foreground)]"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex-1 space-y-2">
              {/* Reviewer Name */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                <div className="flex-1 space-y-2.5">
                  <span className="text-base font-medium">{reviewerName}</span>
                  {/* Rating Stars + Relative Date */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 ${
                            i < rating
                              ? "fill-yellow-400 text-yellow-400"
                              : "fill-none text-muted-foreground"
                          }`}
                        />
                      ))}
                    </div>
                    {relativeDate && (
                      <span className="text-xs text-muted-foreground">
                        {relativeDate}
                      </span>
                    )}
                  </div>
                  {/* Location Badge - Mobile: below stars+date, Desktop: right */}
                  <Badge 
                    variant="outline" 
                    className="gap-2 h-fit py-1.5 w-fit sm:hidden mt-1 bg-card border-border"
                  >
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{locationName}</span>
                  </Badge>
                </div>
                {/* Location Badge - Desktop: right */}
                <Badge 
                  variant="outline" 
                  className="gap-2 h-fit py-1.5 hidden sm:flex bg-card border-border"
                >
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{locationName}</span>
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Review Comment - Rounded background */}
          {response.comment && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{t("reviewComment")}</p>
              <div className="rounded-md bg-muted/50 p-4">
                <p className="text-base text-foreground whitespace-pre-wrap leading-relaxed">
                  {response.comment}
                </p>
              </div>
            </div>
          )}

          {/* Proposed Response - Blue border, different background, pending badge */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{t("proposedResponse")}</p>
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-500 p-4 relative">
              {/* Pending Badge - Top Right with margin */}
              <Badge 
                variant="outline" 
                className="absolute top-4 right-4 text-xs bg-background"
              >
                {t("pending")}
              </Badge>
              <p className="text-base font-medium whitespace-pre-wrap pr-20 pt-0.5 leading-relaxed">
                {response.response || t("noResponseYet")}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation()
                setEditDialogOpen(true)
              }}
            >
              <Edit className="h-4 w-4 mr-2" />
              {t("actions.edit")}
            </Button>
            <Button
              variant="default"
              size="sm"
              className="flex-1 bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90"
              onClick={handleSend}
              disabled={!response.reply_url || !response.response || isSending || !clerkUserId}
            >
              <Send className="h-4 w-4 mr-2" />
              {isSending ? t("actions.sending") : t("actions.send")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <EditResponseDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        response={response}
      />
    </>
  )
}

