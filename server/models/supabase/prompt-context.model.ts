import { prisma } from '../../../lib/prisma'
import type { prompt_context } from '../../../app/generated/prisma'

/**
 * Overview: Prompt Context model for Prisma (Supabase)
 * - CRUD helpers for `prompt_context` table
 * - Manages tone, response instructions, and review handling preferences
 */

export const PromptContextModel = {
  /**
   * Find prompt context by location ID
   */
  findByLocationId: async (locationId: string): Promise<prompt_context | null> => {
    return prisma.prompt_context.findUnique({
      where: { location_id: locationId }
    })
  },

  /**
   * Create new prompt context
   */
  create: async (data: {
    location_id: string;
    tone?: string | null;
    response_length?: 'short' | 'medium' | 'long';
    cta?: string | null;
    use_emojis?: boolean;
    language?: string;
    on_5_star?: 'reply' | 'propose' | 'do_not_manage';
    on_4_star?: 'reply' | 'propose' | 'do_not_manage';
    on_3_star?: 'reply' | 'propose' | 'do_not_manage';
    on_2_star?: 'reply' | 'propose' | 'do_not_manage';
    on_1_star?: 'reply' | 'propose' | 'do_not_manage';
  }): Promise<prompt_context> => {
    return prisma.prompt_context.create({
      data: {
        ...data,
        id: crypto.randomUUID()
      }
    })
  },

  /**
   * Update prompt context
   */
  update: async (locationId: string, data: Partial<Omit<prompt_context, 'id' | 'location_id' | 'created_at' | 'updated_at'>>): Promise<prompt_context> => {
    return prisma.prompt_context.update({
      where: { location_id: locationId },
      data
    })
  },

  /**
   * Upsert prompt context (create or update)
   */
  upsert: async (locationId: string, data: {
    tone?: string | null;
    response_length?: 'short' | 'medium' | 'long';
    cta?: string | null;
    use_emojis?: boolean;
    language?: string;
    on_5_star?: 'reply' | 'propose' | 'do_not_manage';
    on_4_star?: 'reply' | 'propose' | 'do_not_manage';
    on_3_star?: 'reply' | 'propose' | 'do_not_manage';
    on_2_star?: 'reply' | 'propose' | 'do_not_manage';
    on_1_star?: 'reply' | 'propose' | 'do_not_manage';
  }): Promise<prompt_context> => {
    return prisma.prompt_context.upsert({
      where: { location_id: locationId },
      update: data,
      create: {
        id: crypto.randomUUID(),
        location_id: locationId,
        ...data
      }
    })
  },

  /**
   * Updates multiple prompt contexts identified by location IDs.
   * @param locationIds List of location IDs to update.
   * @param data Fields to update for each prompt context.
   */
  updateMany: async (
    locationIds: string[],
    data: Partial<Omit<prompt_context, 'id' | 'location_id' | 'created_at' | 'updated_at'>>
  ): Promise<{ count: number }> => {
    return prisma.prompt_context.updateMany({
      where: {
        location_id: { in: locationIds }
      },
      data: {
        ...data,
        updated_at: new Date()
      }
    })
  },

  /**
   * Upserts prompt contexts for the provided locations using a single transaction.
   * Ensures every location has a prompt context with the latest responses summary.
   */
  upsertSummaries: async (
    summaries: Array<{ locationId: string; summary: string | null }>
  ): Promise<void> => {
    if (!summaries || summaries.length === 0) {
      return
    }

    await prisma.$transaction(
      summaries.map(({ locationId, summary }) =>
        prisma.prompt_context.upsert({
          where: { location_id: locationId },
          update: {
            responses_summary: summary ?? null
          },
          create: {
            id: crypto.randomUUID(),
            location_id: locationId,
            tone: 'neutral',
            response_length: 'medium',
            use_emojis: false,
            language: 'auto',
            on_5_star: 'do_not_manage',
            on_4_star: 'do_not_manage',
            on_3_star: 'do_not_manage',
            on_2_star: 'do_not_manage',
            on_1_star: 'do_not_manage',
            responses_summary: summary ?? null
          }
        })
      )
    )
  },

  /**
   * Checks if any of the provided locations already has a prompt context
   * @param locationIds - Array of location IDs to check
   * @returns true if at least one location has a prompt context, false otherwise
   */
  existsForAnyLocation: async (locationIds: string[]): Promise<boolean> => {
    if (!locationIds || locationIds.length === 0) {
      return false
    }

    const count = await prisma.prompt_context.count({
      where: {
        location_id: { in: locationIds }
      }
    })

    return count > 0
  }
}

