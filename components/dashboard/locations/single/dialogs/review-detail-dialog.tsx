"use client"

import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Star, MessageSquare, User, Calendar } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useTranslations } from "next-intl"
import type { example_reviews } from "@/app/generated/prisma"

interface ReviewDetailDialogProps {
  review: example_reviews
  children: React.ReactNode
}

/**
 * ReviewDetailDialog - Client Component
 * 
 * Dialog for viewing full review details in read-only mode.
 */
export function ReviewDetailDialog({ review, children }: ReviewDetailDialogProps) {
  const t = useTranslations("backoffice.locations.detail.reviews.dialog")

  const getRatingBadge = (rating: number | null) => {
    if (!rating) return null
    const variant = rating >= 4 ? "default" : rating >= 3 ? "secondary" : "destructive"
    return (
      <Badge variant={variant} className="flex items-center gap-1 w-fit">
        <Star className="h-4 w-4 fill-current" />
        {rating}/5
      </Badge>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Author and Rating */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {review.author_name || t("anonymous")}
              </span>
            </div>
            {getRatingBadge(review.rating)}
          </div>

          <Separator />

          {/* Review Date */}
          {review.review_time && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("reviewDate")}:</span>
              <span className="font-medium">{formatDate(review.review_time)}</span>
            </div>
          )}

          {/* Comment */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {t("comment")}
            </h4>
            <div className="bg-muted/50 p-4 rounded-md border">
              <p className="text-sm whitespace-pre-wrap">
                {review.comment || t("noComment")}
              </p>
            </div>
          </div>

          {/* Response */}
          {review.response && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[var(--active)]" />
                {t("response")}
              </h4>
              <div className="bg-[var(--active)]/10 p-4 rounded-md border border-[var(--active)]/20">
                <p className="text-sm whitespace-pre-wrap">
                  {review.response}
                </p>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <Separator />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t("createdAt")}:</span>
              <p className="font-medium">{formatDate(review.created_at)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t("updatedAt")}:</span>
              <p className="font-medium">{formatDate(review.updated_at)}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

