import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { UsersModel } from "@/server/models/supabase/users.model";
import { AppSidebar } from "@/components/dashboard/shared/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface BackofficeLayoutProps {
  children: ReactNode;
}

/**
 * Backoffice Layout
 * 
 * Clean layout with sidebar and main content area.
 * Fetches user data from Supabase and passes to AppSidebar.
 * - Removed breadcrumbs for simplicity (small internal dashboard)
 * - Larger, more visible sidebar trigger button
 * - Minimal header with just the toggle
 */
export default async function BackofficeLayout({ children }: BackofficeLayoutProps) {
  // Fetch user data from Supabase
  const { userId: clerkUserId } = await auth();
  let userData = null;
  
  if (clerkUserId) {
    const user = await UsersModel.findUserByClerkId(clerkUserId);
    if (user) {
      const displayName = user.name && user.lastname 
        ? `${user.name} ${user.lastname}` 
        : user.name || user.lastname || user.username;
      
      userData = {
        displayName,
        email: user.email || "No email"
      };
    }
  }
  
  return (
    <SidebarProvider>
      <AppSidebar userData={userData} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center px-4">
            <SidebarTrigger className="h-8 w-8" />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
