import {clerkMiddleware, createRouteMatcher, clerkClient} from '@clerk/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import {routing} from './i18n/routing';
import {NextResponse} from 'next/server';
import { createLogger } from '@/lib/logger';

const logger = createLogger('PROXY');

const intlMiddleware = createMiddleware(routing);
 
const isProtectedRoute = createRouteMatcher([
  '/:locale/backoffice(.*)',
  '/:locale/proposed-responses(.*)'
]);

const isBackofficeRoute = createRouteMatcher([
  '/:locale/backoffice(.*)'
]);

const STAFF_ORG_ID = process.env.CLERK_INTERNAL_ORG_ID!;

/**
 * Authentication and authorization middleware.
 * 
 * Handles:
 * - Basic authentication for protected routes (redirects to sign-in if unauthenticated)
 * - Staff membership verification for backoffice routes (returns 404 if not staff)
 * - Internationalization routing
 * 
 * Authorization is enforced server-side before rendering, ensuring security
 * and compatibility with cacheComponents: true.
 */
export default clerkMiddleware(
  async (auth, req) => {
    if (isProtectedRoute(req)) {
      const { userId } = await auth();
      
      if (!userId) {
        const currentPath = req.nextUrl.pathname;
        const signInUrl = new URL('/sign-in', req.url);
        signInUrl.searchParams.set('redirect_url', currentPath);
        return NextResponse.redirect(signInUrl);
      }

      if (isBackofficeRoute(req)) {
        try {
          const client = await clerkClient();
          const { data: memberships } = await client.users.getOrganizationMembershipList({ userId });
          const isStaff = memberships.some(m => m.organization?.id === STAFF_ORG_ID);
          
          if (!isStaff) {
            return new NextResponse(null, { status: 404 });
          }
        } catch (error) {
          logger.error('Error verifying staff membership:', error instanceof Error ? error : new Error(String(error)));
          return new NextResponse(null, { status: 404 });
        }
      }
    }
    
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return;
    }
    
    return intlMiddleware(req);
  },
  {
    signInUrl: '/sign-in'
  }
);
 
export const config = {
  // Match all routes including API routes, but exclude static files and Next.js internals
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};