"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Send, Loader2, LogIn, RefreshCw, MessageSquare, UserPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  sendSignInLinkMessage,
  sendSignUpMessage,
  sendReauthMessage,
  sendProposedResponsesMessage,
} from "@/server/actions/whatsapp/user-messages.action";

interface WhatsAppMessageMenuProps {
  userId: string;
  disabled?: boolean;
}

type MessageType = "signIn" | "signUp" | "reauth" | "proposedResponses";

/**
 * WhatsAppMessageMenu Component
 * 
 * Reusable dropdown menu for sending WhatsApp messages to users.
 * Supports four message types:
 * - Sign In: Sends text message with sign-in link
 * - Sign Up: Sends WhatsApp template for account creation
 * - Reauth: Sends WhatsApp template with re-authentication link
 * - Proposed Responses: Sends text message with link to proposed responses page
 */
export function WhatsAppMessageMenu({ 
  userId, 
  disabled = false 
}: WhatsAppMessageMenuProps) {
  const t = useTranslations("backoffice.users.detail.header.whatsappMenu");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const handleSendMessage = (messageType: MessageType) => {
    if (isPending) return;

    startTransition(async () => {
      let result;
      
      switch (messageType) {
        case "signIn":
          result = await sendSignInLinkMessage(userId, locale);
          break;
        case "signUp":
          result = await sendSignUpMessage(userId, locale);
          break;
        case "reauth":
          result = await sendReauthMessage(userId, locale);
          break;
        case "proposedResponses":
          result = await sendProposedResponsesMessage(userId, locale);
          break;
        default:
          result = { success: false, error: "Unknown message type" };
      }

      if (result.success) {
        toast.success(t("success"));
        setOpen(false);
      } else {
        const errorMessage = result.error === "User not found or missing WhatsApp id"
          ? t("errorNoPhone")
          : t("error");
        toast.error(errorMessage);
      }
    });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          disabled={disabled || isPending}
          className="gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("label")}</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              <span>{t("label")}</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleSendMessage("signIn")}
          disabled={isPending}
        >
          <LogIn className="mr-2 h-4 w-4" />
          {t("sendSignIn")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSendMessage("signUp")}
          disabled={isPending}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          {t("sendSignUp")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSendMessage("reauth")}
          disabled={isPending}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("sendReauth")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSendMessage("proposedResponses")}
          disabled={isPending}
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          {t("sendProposedResponses")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

