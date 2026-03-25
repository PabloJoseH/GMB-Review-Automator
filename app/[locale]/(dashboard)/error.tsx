'use client'

import { useEffect } from 'react'
import { Link } from "@/i18n/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createLogger } from "@/lib/logger"

const logger = createLogger('DASHBOARD-ERROR')

/**
 * Error Boundary for Dashboard Routes
 * 
 * Catches errors in the (dashboard) route group, including:
 * - Staff permission errors (thrown by requireStaff)
 * - Other runtime errors in dashboard pages
 * 
 * Next.js 15 Error Boundaries:
 * - Must be Client Components ('use client')
 * - Automatically wrap the layout/page where they're defined
 * - Receive error and reset function as props
 * - Can recover from errors using reset()
 * 
 * Error types handled:
 * - STAFF_REQUIRED: User not in CLERK_INTERNAL_ORG_SLUG
 * - Other errors: Generic error fallback
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string; code?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to error reporting service
    logger.error('Dashboard error', error instanceof Error ? error : new Error(String(error)))
  }, [error])

  // Check if it's a staff permission error
  const isStaffError = error.message === 'STAFF_REQUIRED' || 
                       error.code === 'STAFF_REQUIRED'

  if (isStaffError) {
    // Staff permission denied
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-3 text-center">
            {/* Lock Icon */}
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-8 h-8 text-destructive"
              >
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <CardTitle className="text-2xl font-bold">Access Denied</CardTitle>
            <CardDescription className="text-base">
              You don&apos;t have permission to access this area
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Explanation */}
            <div className="rounded-lg border border-muted bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                This section is restricted to staff members only. If you believe you should have access, 
                please contact your administrator.
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button asChild className="w-full">
                <Link href="/">
                  Go to Home
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/staff-sign-in">
                  Sign In with Different Account
                </Link>
              </Button>
            </div>

            {/* Contact Info */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Need help?{" "}
                <a 
                  href="mailto:support@example.com" 
                  className="font-medium text-primary hover:underline"
                >
                  Contact Support
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Generic error fallback
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-3 text-center">
          {/* Error Icon */}
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-8 h-8 text-destructive"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold">Something went wrong</CardTitle>
          <CardDescription className="text-base">
            An error occurred while loading this page
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Error details (only in development) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <p className="text-sm font-mono text-destructive break-all">
                {error.message}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <Button onClick={reset} className="w-full">
              Try Again
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/">
                Go to Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

