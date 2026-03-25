"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { updateProposedResponse } from "@/server/actions/supabase/proposed-responses.action"
import type { ProposedResponseWithLocation } from "@/lib/prisma-types"
import { createLogger } from "@/lib/logger"

const logger = createLogger('EDIT_RESPONSE_DIALOG')

interface EditResponseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  response: ProposedResponseWithLocation
}

/**
 * EditResponseDialog - Client Component
 * 
 * Dialog for editing a proposed response using shadcn Form components.
 * Follows shadcn best practices for form handling.
 * Allows editing the response text and saving to Supabase.
 */
export function EditResponseDialog({ open, onOpenChange, response }: EditResponseDialogProps) {
  const t = useTranslations("user.proposedResponses.editDialog")
  const router = useRouter()

  // Create schema with translated messages
  const editResponseSchema = z.object({
    response: z.string().min(1, t("validation.responseRequired")),
  })

  type EditResponseFormData = z.infer<typeof editResponseSchema>

  const form = useForm<EditResponseFormData>({
    resolver: zodResolver(editResponseSchema),
    defaultValues: {
      response: response.response || "",
    },
  })

  // Reset form when dialog opens/closes or response changes
  useEffect(() => {
    if (open) {
      form.reset({
        response: response.response || "",
      })
    }
  }, [open, response.response, form])

  const onSubmit = async (data: EditResponseFormData) => {
    try {
      const result = await updateProposedResponse(response.id, {
        response: data.response,
      })

      if (!result.success) {
        throw new Error(result.error || t("error.updateFailed"))
      }

      // Refresh the page to show updated data
      router.refresh()
      onOpenChange(false)
      form.reset()
    } catch (error) {
      logger.error("Error updating response", error, {
        responseId: response.id
      })
      // Show error in form
      form.setError("root", {
        message: error instanceof Error ? error.message : t("error.updateFailed"),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="response"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.response.label")}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      className="min-h-[200px]"
                      placeholder={t("fields.response.placeholder")}
                      disabled={form.formState.isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("fields.response.description")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.formState.errors.root && (
              <p className="text-sm text-destructive">
                {form.formState.errors.root.message}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}
              >
                {t("actions.cancel")}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t("actions.saving") : t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

