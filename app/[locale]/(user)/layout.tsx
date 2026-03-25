import type { ReactNode } from "react";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { createLogger } from "@/lib/logger";
import { UsersModel } from "@/server/models/supabase/users.model";
import { UserHeader } from "@/components/user/user-header";
import { FooterControls } from "@/components/common/footer-controls";
import { getCurrentYear } from "@/server/actions/supabase/global-config.action";

const logger = createLogger('USER-LAYOUT');

interface UserLayoutProps {
  children: ReactNode;
}

/**
 * Fetches user data for header.
 * Authentication is validated by middleware (proxy.ts).
 */
async function UserHeaderWithData() {
  const { userId: clerkUserId } = await auth();
  
  if (!clerkUserId) {
    logger.warn('No userId found in layout (middleware should have caught this)');
    return <UserHeader />;
  }

  const user = await UsersModel.findUserByClerkId(clerkUserId);
  
  if (!user) {
    logger.warn('User not found in Supabase', { clerkUserId });
    return <UserHeader />;
  }

  const userName = user.name && user.lastname 
    ? `${user.name} ${user.lastname}` 
    : user.name || user.lastname || user.username;

  return (
    <UserHeader 
      userName={userName}
      userEmail={user.email || undefined}
    />
  );
}

/**
 * Skeleton for user header while data loads.
 */
function UserHeaderSkeleton() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full border-b border-border/40 bg-background h-16">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-end gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-2 mr-auto">
          <div className="h-10 w-10 rounded-xl bg-muted animate-pulse" />
          <div className="h-6 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-10 w-24 bg-muted animate-pulse rounded" />
      </div>
    </header>
  );
}

/**
 * User layout for authenticated user routes (SSR).
 * Provides header with user data and footer controls.
 * Uses Suspense for progressive rendering of user data.
 * Locale is set in root layout (app/[locale]/layout.tsx).
 */
export default async function UserLayout({ children }: UserLayoutProps) {
  const currentYear = await getCurrentYear();
  
  return (
    <main className="min-h-screen flex flex-col">
      <Suspense fallback={<UserHeaderSkeleton />}>
        <UserHeaderWithData />
      </Suspense>
      
      <div className="flex-1 flex flex-col">
        {children}
        <div className="mt-auto flex justify-center w-full">
          <FooterControls currentYear={currentYear} />
        </div>
      </div>
    </main>
  );
}
