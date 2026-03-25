/**
 * Overview: Global config server actions
 * - Server-side actions for global_config data operations
 * - Staff-only access for configuration management
 * - Public helpers for WhatsApp phone number and current year
 */
'use server'

import { GlobalConfigModel } from '@/server/models/supabase/global-config.model'
import type { global_config } from '@/app/generated/prisma'
import { requireServerActionUser } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'

/**
 * Ensures the authenticated user has staff access.
 * @returns Standardized response with authorization status
 */
async function requireStaffAccess() {
  const { clerkUserId } = await requireServerActionUser()
  const isStaff = await checkIfStaff(clerkUserId)

  if (!isStaff) {
    return { success: false, error: 'Unauthorized access' }
  }

  return { success: true }
}

export async function getActiveGlobalConfig() {
  const data = await GlobalConfigModel.findActive()
  return { success: true, data }
}

/**
 * Get WhatsApp phone number from active global config
 * Returns formatted phone number for WhatsApp URL (digits only)
 * 
 * Cached with tag 'whatsapp-phone' for maximum performance.
 * Cache is invalidated only when global config is updated via updateTag.
 */
export async function getWhatsAppPhoneNumber() {

  const phoneNumber = await GlobalConfigModel.findActiveWhatsAppPhoneNumber()
  
  if (!phoneNumber) {
    return { success: false, data: null }
  }
  
  // Format phone number for WhatsApp URL (remove + and spaces, keep only digits)
  const formattedNumber = phoneNumber.replace(/\D/g, '')
  
  return { success: true, data: formattedNumber }
}

export async function getPaginatedGlobalConfigs(page: number, limit: number) {
  const staffAccess = await requireStaffAccess()
  if (!staffAccess.success) {
    return { success: false, error: staffAccess.error, data: null, pagination: null }
  }

  const { rows, total } = await GlobalConfigModel.paginate(page, limit)
  return { success: true, data: rows, pagination: { page, limit, total } }
}

export async function getGlobalConfigById(id: string) {
  const staffAccess = await requireStaffAccess()
  if (!staffAccess.success) {
    return { success: false, error: staffAccess.error, data: null }
  }

  const data = await GlobalConfigModel.findById(id)
  return { success: !!data, data }
}

export async function createGlobalConfigDraft(input: Record<string, unknown>) {
  const staffAccess = await requireStaffAccess()
  if (!staffAccess.success) {
    return { success: false, error: staffAccess.error, data: null }
  }

  // Persist only known fields; trusting backend to validate subset
  const configData = input as Omit<global_config, 'id' | 'created_at' | 'updated_at' | 'active'> & Partial<Pick<global_config, 'active'>>
  const created = await GlobalConfigModel.createDraft(configData)
  
  return { success: true, data: created }
}

export async function activateGlobalConfig(id: string) {
  const staffAccess = await requireStaffAccess()
  if (!staffAccess.success) {
    return { success: false, error: staffAccess.error }
  }

  await GlobalConfigModel.activate(id)

  return { success: true }
}

/**
 * Get current year for footer copyright
 * Cached with same tag as WhatsApp phone to invalidate together when global config changes.
 */
export async function getCurrentYear() {
  return new Date().getFullYear()
}


