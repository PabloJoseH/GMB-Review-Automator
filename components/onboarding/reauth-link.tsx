"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { APP_CONSTANTS } from "@/lib/constants";

interface ReauthLinkProps {
  userId: string;
  className?: string;
  align?: "left" | "center";
}

export function ReauthLink({ userId, className = "", align = "center" }: ReauthLinkProps) {
  const router = useRouter();
  const t = useTranslations("onboarding.reauthLink");
  const [open, setOpen] = useState(false);

  const handleContinue = () => {
    setOpen(false);
    router.push(`/sign-up?u=${encodeURIComponent(userId)}&reauth=true`);
  };

  const containerClass = align === "left" ? "flex justify-start" : "flex justify-center";

  return (
    <>
      <div className={`${containerClass} ${className}`}>
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{t("question")}</span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[var(--active)] hover:text-[var(--active)]/80 underline decoration-1 underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            {t("linkText")}
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader className="space-y-4">
            <DialogTitle>{t("dialog.title")}</DialogTitle>
            <div className="space-y-3">
              <DialogDescription>
                {t("dialog.description", { companyName: APP_CONSTANTS.brand.companyName })}
              </DialogDescription>
              <p className="text-sm font-medium text-foreground">
                {t("dialog.warning")}
              </p>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("dialog.cancel")}
            </Button>
            <Button
              onClick={handleContinue}
              className="bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90"
            >
              {t("dialog.continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

