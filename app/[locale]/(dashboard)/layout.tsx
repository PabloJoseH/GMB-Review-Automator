import type { ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * Dashboard layout for staff-only routes (SSR).
 * 
 * Authentication andAuthorization is handled in middleware (proxy.ts) before rendering.
 * Locale is set in root layout (app/[locale]/layout.tsx).
 */
export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  return <>{children}</>;
}

