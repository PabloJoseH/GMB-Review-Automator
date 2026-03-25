import type { ReactNode } from "react";
import { FooterControls } from "@/components/common/footer-controls";
import { getCurrentYear } from "@/server/actions/supabase/global-config.action";

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Auth layout providing centered card layout for authentication pages (SSR).
 * Includes gradient background and footer controls.
 */
export default async function AuthLayout({ children }: AuthLayoutProps) {
  const currentYear = await getCurrentYear();
  
  return (
    <div className="min-h-screen w-full flex flex-col bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md pt-24 pb-8">
          {children}
        </div>
      </div>
      <FooterControls currentYear={currentYear} />
    </div>
  );
}

