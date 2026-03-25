import { prisma } from '@/lib/prisma'
import type { global_config } from '@/app/generated/prisma'

export interface Paginated<T> {
  rows: T[]
  total: number
}

export const GlobalConfigModel = {
  findActive: async (): Promise<global_config | null> => {
    return prisma.global_config.findFirst({ where: { active: true } })
  },

  /**
   * Get WhatsApp phone number from active global config
   * Returns only the whatsapp_phone_number field
   */
  findActiveWhatsAppPhoneNumber: async (): Promise<string | null> => {
    const config = await prisma.global_config.findFirst({
      where: { active: true },
      select: { whatsapp_phone_number: true }
    })
    return config?.whatsapp_phone_number || null
  },

  findById: async (id: string): Promise<global_config | null> => {
    return prisma.global_config.findUnique({ where: { id } })
  },

  paginate: async (
    page: number,
    limit: number,
    sortBy: keyof global_config = 'created_at',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<Paginated<global_config>> => {
    const skip = (page - 1) * limit
    const [rows, total] = await Promise.all([
      prisma.global_config.findMany({ orderBy: { [sortBy]: sortOrder }, skip, take: limit }),
      prisma.global_config.count()
    ])
    return { rows: rows || [] as global_config[], total: total as number }
  },

  createDraft: async (data: Omit<global_config, 'id' | 'created_at' | 'updated_at' | 'active'> & Partial<Pick<global_config, 'active'>>): Promise<global_config> => {
    return prisma.global_config.create({ 
      data: { 
        ...data, 
        active: false 
      } as Omit<global_config, 'id' | 'created_at' | 'updated_at'>
    })
  },

  activate: async (id: string): Promise<void> => {
    await prisma.$transaction(async (tx) => {
      await tx.global_config.updateMany({ data: { active: false }, where: { active: true } })
      await tx.global_config.update({ where: { id }, data: { active: true } })
    })
  },
}





