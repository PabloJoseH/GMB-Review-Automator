import type { ReactNode } from "react";
import { FooterControls } from "@/components/common/footer-controls";
import { getCurrentYear } from "@/server/actions/supabase/global-config.action";

interface OnboardingLayoutProps {
  children: ReactNode;
}

/**
 * Onboarding layout for user onboarding flow.
 * Locale is set in root layout (app/[locale]/layout.tsx).
 */
export default async function OnboardingLayout({ children }: OnboardingLayoutProps) {
  const currentYear = await getCurrentYear();

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        {children}
      </div>
      <FooterControls currentYear={currentYear} />
    </div>
  );
}

