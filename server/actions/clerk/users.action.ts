'use server'

import type { User } from "@clerk/nextjs/server";
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/i18n/navigation'
import { createLogger } from '@/lib/logger'
import { APP_CONSTANTS } from '@/lib/constants'
import { previewString } from '@/lib/utils'

const logger = createLogger('CLERK')

export interface GoogleAuthResult {
  success: boolean
  token?: string
  scopes?: string[]
  error?: string
  isExpired?: boolean
}


/**
 * Obtiene el token de acceso de Google desde Clerk
 */
export async function getGoogleAccessToken(userIdOrUser: string | User): Promise<GoogleAuthResult> {
  try {
    const userId = typeof userIdOrUser === 'string' ? userIdOrUser : userIdOrUser.id
    logger.debug('Iniciando obtención de token de Google', { userId })
    
    const url = `${APP_CONSTANTS.clerk.api.baseUrl}/users/${userId}/oauth_access_tokens/oauth_google`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Error obteniendo token de Clerk', null, { 
        status: response.status, 
        statusText: response.statusText,
        error: errorText 
      })
      
      // Check whether the error corresponds to an expired token
      if (response.status === APP_CONSTANTS.clerk.token.expiredStatusCode && errorText.includes(APP_CONSTANTS.clerk.token.missingRefreshTokenPattern)) {
        logger.debug('Token expirado detectado', { refreshToken: response.headers.get('refresh_token') })
        return { success: false, error: 'TOKEN_EXPIRED', isExpired: true }
      }
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const tokenData = await response.json()
    
    // The endpoint returns an array, so use the first element
    const tokenInfo = Array.isArray(tokenData) ? tokenData[0] : tokenData
    const token = tokenInfo?.token || tokenInfo?.access_token || tokenInfo?.accessToken
    const scopes = tokenInfo?.scopes || []
    
    if (token) {
      logger.debug('Token de Google obtenido exitosamente desde Clerk', { refreshToken: response.headers.get('refresh_token'), tokenData })
      for (const scope of scopes) {
        logger.debug('Scope obtenido', { scope })
      }
      logger.debug('Token de Google obtenido exitosamente desde Clerk', { 
        tokenPreview: previewString(token, APP_CONSTANTS.clerk.token.previewLength),
        scopesCount: scopes.length
      })
      return { success: true, token, scopes }
    }

    logger.error('No se encontró token en la respuesta de Clerk', null, { tokenData })
    return { success: false, error: 'No se encontró token en la respuesta' }

  } catch (error) {
    logger.error('Error obteniendo token de Google desde Clerk', error)
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' }
  }
}

/**
 * Signs out the current user by revoking their session.
 * Uses Clerk's official server API to properly invalidate the session.
 * This function is called from client components via form action.
 * 
 * After revoking the session, redirects to sign-in page using next-intl's
 * localized redirect to maintain the user's language preference.
 * The redirect() function throws a NEXT_REDIRECT error which is handled by Next.js.
 */
export async function signOutAction() {
  // Get current session from request
  const { sessionId } = await auth()
  
  if (sessionId) {
    try {
      logger.debug('Revoking session', { sessionId })
      
      // Revoke session using Clerk's official API
      const client = await clerkClient()
      await client.sessions.revokeSession(sessionId)
      
      logger.debug('Session revoked successfully', { sessionId })
    } catch (error) {
      // Log error but continue with redirect
      logger.debug('Error revoking session, but redirecting anyway', { 
        error: error instanceof Error ? error.message : String(error) 
      })
    }
  } else {
    logger.debug('No active session found during sign out')
  }
  
  // Get current locale to maintain language preference after sign out
  const locale = await getLocale()
  
  // Redirect to sign-in page with locale
  // This throws a NEXT_REDIRECT error which is handled by Next.js
  redirect({ href: '/sign-in', locale })
}
