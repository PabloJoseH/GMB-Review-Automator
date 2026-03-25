"use client"

/**
 * ReviewDetailSheet - Client Component
 * 
 * Sheet for viewing full review details in read-only mode.
 * Displays all review information including author, rating, comment, response, AI configuration, and timestamps.
 */

import { useState } from "react"
import { 
  Sheet, 
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle,
} from "@/components/ui/sheet"
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Star, MessageSquare, User, Calendar, Clock, SquareArrowOutUpRight, Settings, MapPin } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useTranslations } from "next-intl"
import type { ReviewWithLocation } from "./columns"

interface ReviewDetailSheetProps {
  review: ReviewWithLocation
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReviewDetailSheet({ review, open, onOpenChange }: ReviewDetailSheetProps) {
  const t = useTranslations("backoffice.reviews.detail")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogContent, setDialogContent] = useState<{ title: string; content: string }>({ title: "", content: "" })

  const getRatingBadge = (rating: string | null) => {
    if (!rating) return null
    const numRating = parseInt(rating)
    const variant = numRating >= 4 ? "default" : numRating >= 3 ? "secondary" : "destructive"
    const bgColor = numRating >= 4 ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""
    return (
      <Badge variant={variant} className={`flex items-center gap-1 w-fit ${bgColor}`}>
        <Star className="h-4 w-4 fill-current" />
        {rating}/5
      </Badge>
    )
  }

  const openFullText = (title: string, content: string) => {
    setDialogContent({ title, content })
    setDialogOpen(true)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="pb-6">
            <SheetTitle className="text-2xl font-semibold tracking-tight flex items-center gap-3">
              <div className="rounded-lg bg-[var(--active)]/10 p-2">
                <MessageSquare className="h-5 w-5 text-[var(--active)]" />
              </div>
              {t("title")}
            </SheetTitle>
            <SheetDescription className="text-base">
              {t("description")}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-6 pb-8">
            {/* Review Information */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                {t("reviewInfo")}
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("author")}:</span>
                  <span className="font-medium">{review.reviewer_name || t("anonymous")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {t("location")}:
                  </span>
                  <span className="font-medium text-sm truncate max-w-[250px]" title={review.locations?.name || undefined}>
                    {review.locations?.name || (
                      <span className="italic text-muted-foreground">{t("unknownLocation")}</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("rating")}:</span>
                  {getRatingBadge(review.rating)}
                </div>
                {review.create_time && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {t("reviewDate")}:
                    </span>
                    <span className="font-medium text-sm">{formatDate(review.create_time, { includeTime: true })}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Comment */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                {t("comment")}
              </h3>
              {review.comment ? (
                <div className="relative group">
                  <div className="rounded-lg border overflow-hidden bg-muted/30" style={{ height: "150px" }}>
                    <ScrollArea className="h-full w-full">
                      <div className="p-4 text-sm whitespace-pre-wrap">
                        {review.comment}
                      </div>
                    </ScrollArea>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 hover:bg-muted/50 z-10 bg-background/80 backdrop-blur-sm border shadow-sm"
                    onClick={() => openFullText(t("comment"), review.comment!)}
                    title={t("viewFull")}
                  >
                    <SquareArrowOutUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic p-4 bg-muted/30 rounded-lg border">
                  {t("noComment")}
                </p>
              )}
            </div>

            <Separator />

            {/* Our Response */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[var(--active)]" />
                {t("ourResponse")}
              </h3>
              {review.response ? (
                <div className="relative group">
                  <div className="rounded-lg border overflow-hidden bg-[var(--active)]/5 border-[var(--active)]/20" style={{ height: "150px" }}>
                    <ScrollArea className="h-full w-full">
                      <div className="p-4 text-sm whitespace-pre-wrap">
                        {review.response}
                      </div>
                    </ScrollArea>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 hover:bg-muted/50 z-10 bg-background/80 backdrop-blur-sm border shadow-sm"
                    onClick={() => openFullText(t("response"), review.response!)}
                    title={t("viewFull")}
                  >
                    <SquareArrowOutUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic p-4 bg-muted/30 rounded-lg border">
                  {t("noResponse")}
                </p>
              )}
            </div>

            <Separator />

            {/* AI Configuration Used */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                {t("aiConfiguration")}
              </h3>
              <div className="space-y-4">
                {/* Model Instructions */}
                {review.instructions && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">{t("modelInstructions")}</h4>
                    <div className="relative group">
                      <div className="rounded-lg border overflow-hidden bg-blue-50/50 dark:bg-blue-950/20" style={{ height: "120px" }}>
                        <ScrollArea className="h-full w-full">
                          <div className="p-3 text-xs whitespace-pre-wrap font-mono">
                            {review.instructions}
                          </div>
                        </ScrollArea>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 hover:bg-muted/50 z-10 bg-background/80 backdrop-blur-sm border shadow-sm"
                        onClick={() => openFullText(t("modelInstructions"), review.instructions!)}
                        title={t("viewFull")}
                      >
                        <SquareArrowOutUpRight className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Prompt Tone */}
                {review.prompt_context_tone && (
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                    <span className="text-sm font-medium">{t("promptTone")}:</span>
                    <Badge variant="outline" className="font-normal">{review.prompt_context_tone}</Badge>
                  </div>
                )}

                {/* Prompt Instructions */}
                {review.prompt_context_instructions && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">{t("promptInstructions")}</h4>
                    <div className="relative group">
                      <div className="rounded-lg border overflow-hidden bg-purple-50/50 dark:bg-purple-950/20" style={{ height: "120px" }}>
                        <ScrollArea className="h-full w-full">
                          <div className="p-3 text-xs whitespace-pre-wrap">
                            {review.prompt_context_instructions}
                          </div>
                        </ScrollArea>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 hover:bg-muted/50 z-10 bg-background/80 backdrop-blur-sm border shadow-sm"
                        onClick={() => openFullText(t("promptInstructions"), review.prompt_context_instructions!)}
                        title={t("viewFull")}
                      >
                        <SquareArrowOutUpRight className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Handle One Star */}
                {review.prompt_context_handle_one_star && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">{t("handleOneStar")}</h4>
                    <div className="relative group">
                      <div className="rounded-lg border overflow-hidden bg-amber-50/50 dark:bg-amber-950/20" style={{ height: "120px" }}>
                        <ScrollArea className="h-full w-full">
                          <div className="p-3 text-xs whitespace-pre-wrap">
                            {review.prompt_context_handle_one_star}
                          </div>
                        </ScrollArea>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 hover:bg-muted/50 z-10 bg-background/80 backdrop-blur-sm border shadow-sm"
                        onClick={() => openFullText(t("handleOneStar"), review.prompt_context_handle_one_star!)}
                        title={t("viewFull")}
                      >
                        <SquareArrowOutUpRight className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                )}

                {!review.instructions && !review.prompt_context_tone && !review.prompt_context_instructions && !review.prompt_context_handle_one_star && (
                  <p className="text-sm text-muted-foreground italic p-4 bg-muted/30 rounded-lg border">
                    {t("noInstructions")}
                  </p>
                )}
              </div>
            </div>

            {/* Timestamps */}
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {t("timestamps")}
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block mb-1">{t("createdAt")}</span>
                  <p className="font-medium">{formatDate(review.created_at, { includeTime: true })}</p>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">{t("updatedAt")}</span>
                  <p className="font-medium">{formatDate(review.updated_at, { includeTime: true })}</p>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Full Text Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogContent.title}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
              <p className="text-sm whitespace-pre-wrap">{dialogContent.content}</p>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
