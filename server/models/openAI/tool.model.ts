/**
 * OpenAI Tools Model
 *
 * Overview:
 * - Exposes the tool catalog used by the AI (AVAILABLE_FUNCTIONS)
 * - Implements handler functions for each tool
 * - Exposes a single executeFunction(entry) that dispatches to the correct handler
 *
 * Notes:
 * - This file is server-side only. It uses external services (Supabase, WhatsApp, Google APIs).
 * - Update operations (update_prompt_context, update_proposed_response, update_location_status)
 *   return `accepted: true` immediately and process updates asynchronously in the background.
 */

// Note: This is a library module, not a Server Action; no 'use server' directive here.

import { createLogger } from '@/lib/logger';
import { APP_CONSTANTS } from '@/lib/constants';
import { UsersModel } from '@/server/models/supabase/users.model';
import { LocationsModel } from '@/server/models/supabase/locations.model';
import { ProposedResponsesModel } from '@/server/models/supabase/proposed-responses.model';
import { getGoogleAccessToken } from '@/server/actions/clerk/users.action';
import { locations, opening_hours, connections, organizations, subscriptions, prompt_context } from '@/app/generated/prisma';
import type { Prisma } from '@/app/generated/prisma';
import { sendReviewsToGmb } from '@/server/actions/gmb/reviews.action';
import { updateMultipleLocationsStatusByIdsForUser } from '@/server/actions/supabase/locations.action';
import { sendWhatsAppTemplateAction } from '@/server/actions/whatsapp/sendMessage.action';
import { PromptContextModel } from '@/server/models/supabase/prompt-context.model';

const logger = createLogger('OpenAIToolsModel');

// Types used by tools and the dispatcher. Kept minimal for structural compatibility.
export interface FunctionCall {
  name: string;
  arguments: string;
  callId?: string;
}

export interface FunctionDefinition {
  type: string;
  name?: string;
  description?: string;
  parameters?: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Execution context provided to tool handlers.
 */
export interface FunctionContext {
  userId: string;
  onboarding_status: string;
}

/**
 * @internal Shared type for prompt context updates applicable across multiple locations.
 */
type PromptContextUpdatableFields = Partial<
  Omit<prompt_context, 'id' | 'location_id' | 'created_at' | 'updated_at'>
>;

type PromptContextStarAction = Exclude<prompt_context['on_1_star'], null>;

const VALID_STAR_ACTIONS: readonly PromptContextStarAction[] = ['reply', 'propose', 'do_not_manage'];
const DEFAULT_TEMPLATE_LOCALE = 'es';
const SUPPORTED_LOCALE_PATTERN = /^[a-z]{2}(?:[_-][a-z0-9]{2,4})?$/;

function normalizeStarAction(action: string): PromptContextStarAction {
  const normalized = action.trim().toLowerCase() as PromptContextStarAction;
  return VALID_STAR_ACTIONS.includes(normalized) ? normalized : 'reply';
}

/**
 * Normalizes locale values received from tool calls to prevent malformed URLs.
 * @param rawLocale - Locale value supplied by the AI agent.
 * @returns Sanitized locale constrained to supported patterns.
 */
function normalizeTemplateLocale(rawLocale?: string): string {
  const fallback = DEFAULT_TEMPLATE_LOCALE;
  if (!rawLocale) {
    return fallback;
  }

  let candidate = rawLocale.trim();
  if (!candidate) {
    return fallback;
  }

  candidate = candidate.replace(/^https:\//i, 'https://').replace(/^http:\//i, 'http://');

  if (/^https?:\/\//i.test(candidate)) {
    try {
      const parsedUrl = new URL(candidate);
      const pathSegment = parsedUrl.pathname.split('/').filter(Boolean)[0];
      candidate = pathSegment ?? '';
    } catch {
      candidate = '';
    }
  } else {
    candidate = candidate.replace(/^\/+/, '');
    candidate = candidate.split('/')[0];
  }

  candidate = candidate.split('?')[0];
  candidate = candidate.split('#')[0];
  candidate = candidate.toLowerCase();

  if (!candidate || !SUPPORTED_LOCALE_PATTERN.test(candidate)) {
    return fallback;
  }

  return candidate;
}

// Public: Catalog of tools available to the AI agent
export const AVAILABLE_FUNCTIONS: FunctionDefinition[] = [
  { type: 'web_search' },
  {
    type: 'function',
    name: 'query_client_data',
    description:
      'Devuelve la ficha del usuario autenticado y su organización asociada. El usuario se resuelve por contexto.',
    parameters: {
      type: 'object',
      properties: {
        include: {
          type: 'array',
          description: 'Secciones opcionales a incluir',
          items: { type: 'string', enum: ['user', 'organization', 'subscription'] }
        }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'query_locations_data',
    description:
      'Devuelve connections del usuario autenticado y sus locations con opening_hours, categoría, idioma y estado. El usuario se resuelve por contexto. Disponible solo si el proceso de onboarding se ha completado.',
    parameters: {
      type: 'object',
      properties: {
        include_hours: { type: 'boolean', default: true },
        show_active: { type: 'boolean', default: true, description: 'Si true, muestra solo locations activas. Si false, muestra solo las inactivas.' }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'get_google_reviews',
    description:
      'Obtiene reseñas en vivo desde la API de Google Business (GMB) para una location. Disponible solo si el proceso de onboarding se ha completado.',
    parameters: {
      type: 'object',
      properties: {
        reference: {
          type: 'integer',
          description: 'Número de referencia de la location (número entero legible, no UUID)',
          minimum: 1
        },
        google_location_id: {
          type: 'string',
          description: 'ID de la location en GMB, con la forma locations/[id]'
        },
        page_size: { type: 'integer', minimum: 1, maximum: APP_CONSTANTS.openAi.tools.googleReviewsMaxPageSize, default: APP_CONSTANTS.openAi.tools.googleReviewsDefaultPageSize },
        min_rating: { type: 'integer', minimum: 1, maximum: 5, description: 'Filtra por rating mínimo' },
        order: { type: 'string', enum: ['newest', 'highest_rating', 'lowest_rating'], default: 'newest' }
      },
      required: ['reference'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'send_whatsapp_template',
    description:
      'Envía una plantilla de WhatsApp con CTA de registro/login/respuestas propuestas a la microapp. El user_id se resuelve en el workflow; no se acepta por parámetros.',
    parameters: {
      type: 'object',
      properties: {
        template_type: { 
          type: 'string', 
          enum: ['sign_in', 'account_creation', 'proposed_responses'],
          description: 'Tipo de plantilla a enviar: sign_in para login, account_creation para registro, proposed_responses para respuestas propuestas',
          default: 'sign_in'
        },
        locale: { type: 'string', description: 'Locale de la plantilla, es para español, en para el resto de idiomas', default: 'es' },
        reauth: { type: 'boolean', description: 'Incluye flag de reautenticación en la URL (solo aplica para sign_in y account_creation)', default: false }
      },
      required: ['template_type'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'update_prompt_context',
    description:
      'Actualiza el contexto de respuesta para múltiples locations (tono, instrucciones, manejo de 1★). Devuelve `accepted: true` inmediatamente y procesa la actualización de forma asíncrona. Disponible solo si el proceso de onboarding se ha completado.',
    parameters: {
      type: 'object',
      properties: {
        references: {
          type: 'array',
          description: 'Array de números de referencia de las locations (números enteros legibles, no UUIDs)',
          items: {
            type: 'integer',
            minimum: 1
          },
          minItems: 1
        },
        tone: { type: 'string', description: 'Tono deseado. Puede ser un tono común a todos los casos (reseñas positivas, negativas y neutras) o un tono específico para cada caso (para reseñas positivas, negativas o neutras).' },
        response_length: { type: 'string', enum: ['short', 'medium', 'long'], description: 'Longitud de la respuesta' },
        cta: { type: 'string', description: 'Llamada a la acción de la respuesta. Ejemplo: "Contacta con nostros en el correo electrónico support@mybusiness.com", "Mándanos un mensaje privado en Instagram @mybusiness", "Contacta con nosotros en el Whastapp del teléfono de nuestra ficha de Google My Business", etc.' },
        use_emojis: { type: 'boolean', description: 'Si true, incluye emojis en la respuesta' },
        language: { type: 'string', description: 'Idioma de la respuesta. Por defecto es auto: se contesta en el idioma del cliente, pero puede ser un idioma específico como "español de Argentina" para español con acento, "español de España" para español sin acento, "inglés de Estados Unidos" para inglés americano, etc.' },
        handle_one_star: { type: 'string', enum: ['reply', 'propose', 'do_not_manage'], description: 'Forma de gestionar las reseñas de 1★. Reply: gestionamos y contestamos directamente; Propose: proponemos una respuesta y la guardamos para revisión; Do not manage: no gestionamos las reseñas de 1★.' },
        handle_two_star: { type: 'string', enum: ['reply', 'propose', 'do_not_manage'], description: 'Forma de gestionar las reseñas de 2★. Reply: gestionamos y contestamos directamente; Propose: proponemos una respuesta y la guardamos para revisión; Do not manage: no gestionamos las reseñas de 2★.' },
        handle_three_star: { type: 'string', enum: ['reply', 'propose', 'do_not_manage'], description: 'Forma de gestionar las reseñas de 3★. Reply: gestionamos y contestamos directamente; Propose: proponemos una respuesta y la guardamos para revisión; Do not manage: no gestionamos las reseñas de 3★.' },
        handle_four_star: { type: 'string', enum: ['reply', 'propose', 'do_not_manage'], description: 'Forma de gestionar las reseñas de 4★. Reply: gestionamos y contestamos directamente; Propose: proponemos una respuesta y la guardamos para revisión; Do not manage: no gestionamos las reseñas de 4★.' },
        handle_five_star: { type: 'string', enum: ['reply', 'propose', 'do_not_manage'], description: 'Forma de gestionar las reseñas de 5★. Reply: gestionamos y contestamos directamente; Propose: proponemos una respuesta y la guardamos para revisión; Do not manage: no gestionamos las reseñas de 5★.' },
        custom_instruction: { type: 'string', description: 'Instrucciones específicas y singulares del negocio que no estén parametrizadas en los campos anteriores. Ejemplo: Si la reseña habla de problemas de aparcamiento, la respuesta debe ser X. Si la reseña habla de quemaduras en la piel (en una clínica de depilación), se debe actuar de forma Y. Si la reseña habla de intoxicación, se debe actuar de forma Z.' }
      },
      required: ['references'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'query_prompt_context',
    description:
      'Obtiene el contexto de respuesta (prompt_context) para una location específica. El usuario se resuelve por contexto y se verifica que la location pertenezca al usuario autenticado. Incluye un summary de las reseñas si hay reseñas disponibles; si no hay reseñas, el summary no estará presente. Disponible solo si el proceso de onboarding se ha completado.',
    parameters: {
      type: 'object',
      properties: {
        reference: {
          type: 'integer',
          description: 'Número de referencia de la location (número entero legible, no UUID)',
          minimum: 1
        }
      },
      required: ['reference'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'get_proposed_responses',
    description:
      'Obtiene respuestas propuestas del usuario autenticado filtradas por ID, reference, o sin filtros. El user_id se resuelve por contexto. Devuelve hasta 100 resultados. Disponible solo si el proceso de onboarding se ha completado.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'UUID de la respuesta propuesta específica',
          pattern: '^[0-9a-fA-F-]{36}$'
        },
        reference: {
          type: 'integer',
          description: 'Número de referencia de la location para filtrar respuestas propuestas',
          minimum: 1
        },
        rating: { type: 'string', description: 'Filtrar por rating específico' },
        reviewer_name: { type: 'string', description: 'Filtrar por nombre del revisor' },
        limit: { type: 'integer', minimum: 1, maximum: APP_CONSTANTS.openAi.tools.proposedResponsesMaxLimit, default: APP_CONSTANTS.openAi.tools.proposedResponsesDefaultLimit, description: 'Número máximo de resultados' },
        sortBy: {
          type: 'string',
          enum: ['created_at', 'updated_at', 'create_time'],
          default: 'created_at',
          description: 'Campo por el que ordenar'
        },
        sortOrder: {
          type: 'string',
          enum: ['asc', 'desc'],
          default: 'desc',
          description: 'Orden de clasificación'
        }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'update_proposed_response',
    description:
      'Actualiza una respuesta propuesta existente del usuario autenticado por ID. El user_id se resuelve por contexto. Solo se actualizan los campos proporcionados. Devuelve `accepted: true` inmediatamente y procesa la actualización de forma asíncrona. Disponible solo si el proceso de onboarding se ha completado.',
    parameters: {
      type: 'object',
      properties: {
        response: { type: 'string', description: 'Respuesta propuesta editada por el usuario y el modelo.' },
      },
      required: ['id'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'send_proposed_responses',
    description:
      'Envía respuestas propuestas seleccionadas a Google My Business. Acepta un array de IDs o sendAll=true para enviar todas las pendientes del usuario autenticado. Disponible solo si el proceso de onboarding se ha completado.',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          description: 'IDs de proposed_responses a enviar',
          items: {
            type: 'string',
            pattern: '^[0-9a-fA-F-]{36}$'
          },
          minItems: 1
        },
        sendAll: {
          type: 'boolean',
          description: 'Enviar todas las respuestas propuestas del usuario autenticado',
          default: false
        }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'update_location_status',
    description:
      'Actualiza el estado de una location específica por su reference. El usuario se resuelve por contexto. Devuelve `accepted: true` inmediatamente y procesa la actualización de forma asíncrona. La suscripción se recalcula con el nuevo número de locations activas, pero el periodo de prueba (trial) se mantiene si la suscripción está en estado trialing. Disponible solo si el proceso de onboarding se ha completado.',
    parameters: {
      type: 'object',
      properties: {
        reference: {
          type: 'integer',
          description: 'Número de referencia de la location a actualizar',
          minimum: 1
        },
        status: {
          type: 'string',
          enum: ['active', 'inactive'],
          description: 'Nuevo estado de la location: active para activar, inactive para desactivar'
        }
      },
      required: ['reference', 'status'],
      additionalProperties: false
    }
  }
];

/**
 * Ensures the current user has completed onboarding before using restricted tools.
 */
function validateOnboardingStatus(context: FunctionContext): { error: string } | null {
  if (context.onboarding_status !== 'done') {
    return { error: 'Unauthorized: onboarding incomplete' };
  }
  return null;
}

/**
 * Resolves a location reference to its UUID ensuring ownership.
 * @param reference - Human readable location reference
 * @param context - Execution context with authenticated user ID
 * @returns Location ID or error result
 */
async function getLocationIdByReference(
  reference: number,
  context: FunctionContext
): Promise<{ locationId: string } | { error: string }> {
  const locationId = await LocationsModel.findLocationIdByReferenceForUser(reference, context.userId);

  if (!locationId) {
    return { error: `Location with reference ${reference} not found or access denied` };
  }

  return { locationId };
}

/**
 * Resolves a location reference to a location that includes connections.
 * @param reference - Human readable location reference
 * @param context - Execution context with authenticated user ID
 * @returns Location with connections or error result
 */
async function getLocationWithConnectionsByReference(
  reference: number,
  context: FunctionContext
): Promise<{ location: locations & { connections: connections } } | { error: string }> {
  const location = await LocationsModel.findByReferenceWithConnectionsForUser(reference, context.userId);

  if (!location || !location.connections) {
    return { error: `Location with reference ${reference} not found or access denied` };
  }

  return { location };
}

/**
 * Retrieves the prompt context associated with a location reference.
 * @param reference - Human readable location reference
 * @param context - Execution context with authenticated user ID
 * @returns Prompt context or error result
 */
async function getPromptContextByReference(
  reference: number,
  context: FunctionContext
): Promise<{ promptContext: prompt_context } | { error: string }> {
  const location = await LocationsModel.findByReferenceWithPromptContextForUser(reference, context.userId);

  if (!location) {
    return { error: `Location with reference ${reference} not found or access denied` };
  }

  if (!location.prompt_context) {
    return { error: 'Prompt context not configured for this location' };
  }

  return { promptContext: location.prompt_context };
}

// Handlers
async function handleQueryClientData(args: { include?: string[] }, context: FunctionContext) {
  const include = args.include || ['user', 'organization', 'subscription'];
  const userData = await UsersModel.findUserById(context.userId);
  if (!userData) return { error: 'User not found' };

  const result: Record<string, unknown> = {};
  if (include.includes('user')) {
    result.user = {
      username: userData.username,
      name: userData.name,
      lastname: userData.lastname,
      email: userData.email,
      role: userData.role,
      onboarding_status: userData.onboarding_status,
      wa_id: userData.wa_id
    };
  }

  const userDataWithIncludes = userData as unknown as {
    organizations_users_organization_idToorganizations?: {
      id: string;
      business_name: string;
      business_address?: string | null;
      first_line_of_address?: string | null;
      city?: string | null;
      region?: string | null;
      zip_code?: string | null;
      country?: string | null;
      tax_identifier?: string | null;
      primary_phone: string;
      email: string;
      business_id: string;
      subscriptions?: {
        status: string;
        periodStart?: Date | null;
        periodEnd?: Date | null;
        current_period_start?: Date | null;
        current_period_end?: Date | null;
        plan_id: string | null;
      };
    };
  };

  if (include.includes('organization') && userDataWithIncludes.organizations_users_organization_idToorganizations) {
    const org = userDataWithIncludes.organizations_users_organization_idToorganizations;
    // Build business_address from individual fields if available, otherwise use legacy field
    const business_address = org.first_line_of_address && org.city && org.zip_code && org.country
      ? `${org.first_line_of_address}, ${org.city}${org.region ? `, ${org.region}` : ''}, ${org.country} ${org.zip_code}`
      : org.business_address || '';
    
    result.organization = {
      business_name: org.business_name,
      business_address: business_address,
      primary_phone: org.primary_phone,
      email: org.email,
      business_id: org.business_id
    };
  }

  if (include.includes('subscription') && userDataWithIncludes.organizations_users_organization_idToorganizations?.subscriptions) {
    const sub = userDataWithIncludes.organizations_users_organization_idToorganizations.subscriptions;
    const normalizedPeriodStart = sub.periodStart ?? sub.current_period_start ?? null;
    const normalizedPeriodEnd = sub.periodEnd ?? sub.current_period_end ?? null;
    result.subscription = {
      status: sub.status,
      periodStart: normalizedPeriodStart,
      periodEnd: normalizedPeriodEnd,
      current_period_start: normalizedPeriodStart,
      current_period_end: normalizedPeriodEnd,
      plan_id: sub.plan_id
    };
  }

  logger.debug('Query client data result', { keys: Object.keys(result) });
  return result;
}

async function handleQueryLocationsData(args: { include_hours?: boolean; show_active?: boolean }, context: FunctionContext) {
  const onboardingCheck = validateOnboardingStatus(context);
  if (onboardingCheck) return onboardingCheck;

  const includeHours = args.include_hours !== false;
  const showActive = args.show_active !== false;
  
  const statusFilter = showActive ? 'active' : 'inactive';
  
  const result = await LocationsModel.findManyWithRelations(
    { created_by: context.userId, status: statusFilter },
    'created_at',
    'desc',
    0,
    1000,
    false
  );

  const locs = Array.isArray(result) ? result : result.locations;
  return locs.map(
    (
      loc: locations & {
        opening_hours: opening_hours[];
        connections: connections & { organizations?: organizations & { subscriptions: subscriptions | null } };
      }
    ) => {
      const locationOpeningHours = includeHours
        ? loc.opening_hours.map(hour => ({
            weekday: hour.weekday,
            open_time: hour.open_time,
            close_time: hour.close_time
          }))
        : undefined;

      return {
        reference: loc.reference ?? null,
        name: loc.name,
        address: {
          line1: loc.address_line1,
          line2: loc.address_line2,
          city: loc.city,
          postal_code: loc.postal_code,
          region: loc.region,
          country: loc.country
        },
        primary_category: loc.primary_category,
        phone: loc.phone,
        website: loc.website,
        status: loc.status,
        verified: loc.verified,
        opening_hours: locationOpeningHours
      };
    }
  );
}

async function handleGetGoogleReviews(args: {
  reference: number;
  google_location_id?: string;
  page_size?: number;
  min_rating?: number;
  order?: 'newest' | 'highest_rating' | 'lowest_rating';
}, context: FunctionContext) {
  const onboardingCheck = validateOnboardingStatus(context);
  if (onboardingCheck) return onboardingCheck;

  const locationResult = await getLocationWithConnectionsByReference(args.reference, context);
  if ('error' in locationResult) {
    return locationResult;
  }

  const pageSize = args.page_size || APP_CONSTANTS.openAi.tools.googleReviewsDefaultPageSize;
  const minRating = args.min_rating;
  const order = args.order || 'newest';
  const location = locationResult.location;

  const googleLocationId = args.google_location_id || location.google_location_id;
  if (!googleLocationId) return { error: 'Google location ID not found' };

  const dbUser = await UsersModel.findUserById(context.userId);
  if (!dbUser?.clerk_id) {
    return { error: 'User has no Clerk link; cannot get Google access token' };
  }

  const tokenResult = await getGoogleAccessToken(dbUser.clerk_id);
  if (!tokenResult.success || !tokenResult.token) {
    return { error: 'Failed to get Google access token' };
  }

  let reviewsUrl: string;
  if (googleLocationId.startsWith('accounts/')) {
    reviewsUrl = `https://mybusiness.googleapis.com/v4/${googleLocationId}/reviews`;
  } else {
    reviewsUrl = `https://mybusiness.googleapis.com/v4/${location.connections.external_account_id}/${googleLocationId}/reviews`;
  }

  const searchParams = new URLSearchParams({
    pageSize: pageSize.toString(),
    orderBy: `${order === 'newest' ? 'updateTime desc' : order === 'highest_rating' ? 'rating desc' : 'rating asc'}`
  });

  const response = await fetch(`${reviewsUrl}?${searchParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${tokenResult.token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) return { error: `Failed to fetch Google reviews: ${response.status}` };

  const data = await response.json();
  let reviews = data.reviews || [];
  const ratingMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 } as const;

  if (minRating) {
    reviews = reviews.filter((r: { starRating: keyof typeof ratingMap }) => ratingMap[r.starRating] >= minRating);
  }

  return reviews.map(
    (r: {
      name: string;
      reviewId: string;
      reviewer: unknown;
      starRating: keyof typeof ratingMap;
      comment: string;
      createTime: string;
      reviewReply?: unknown;
    }) => ({
      reviewer: r.reviewer,
      starRating: r.starRating,
      rating: ratingMap[r.starRating],
      comment: r.comment,
      reviewReply: r.reviewReply
    })
  );
}
async function handleUpdatePromptContext(args: {
  references: number[];
  tone?: string;
  response_length?: 'short' | 'medium' | 'long';
  cta?: string;
  use_emojis?: boolean;
  language?: string;
  handle_one_star?: 'reply' | 'propose' | 'do_not_manage';
  handle_two_star?: 'reply' | 'propose' | 'do_not_manage';
  handle_three_star?: 'reply' | 'propose' | 'do_not_manage';
  handle_four_star?: 'reply' | 'propose' | 'do_not_manage';
  handle_five_star?: 'reply' | 'propose' | 'do_not_manage';
  custom_instruction?: string;
}, context: FunctionContext) {
  const onboardingCheck = validateOnboardingStatus(context);
  if (onboardingCheck) return onboardingCheck;

  if (!Array.isArray(args.references) || args.references.length === 0) {
    return { error: 'At least one reference is required' };
  }

  const locationIds: string[] = [];
  const invalidReferences: number[] = [];

  for (const reference of args.references) {
    const locationId = await LocationsModel.findLocationIdByReferenceForUser(reference, context.userId);
    if (locationId) {
      locationIds.push(locationId);
    } else {
      invalidReferences.push(reference);
    }
  }

  if (locationIds.length === 0) {
    return {
      error: 'No valid locations found or access denied',
      invalidReferences
    };
  }

  const updateData: PromptContextUpdatableFields = {};

  if (args.tone !== undefined) {
    updateData.tone = args.tone;
  }

  if (args.custom_instruction !== undefined) {
    updateData.custom_instruction = args.custom_instruction;
  }

  if (args.handle_one_star !== undefined) {
    updateData.on_1_star = normalizeStarAction(args.handle_one_star);
  }
  if (args.handle_two_star !== undefined) {
    updateData.on_2_star = normalizeStarAction(args.handle_two_star);
  }
  if (args.handle_three_star !== undefined) {
    updateData.on_3_star = normalizeStarAction(args.handle_three_star);
  }
  if (args.handle_four_star !== undefined) {
    updateData.on_4_star = normalizeStarAction(args.handle_four_star);
  }
  if (args.handle_five_star !== undefined) {
    updateData.on_5_star = normalizeStarAction(args.handle_five_star);
  }
  if (args.response_length !== undefined) {
    updateData.response_length = args.response_length;
  }
  if (args.cta !== undefined) {
    updateData.cta = args.cta;
  }
  if (args.use_emojis !== undefined) {
    updateData.use_emojis = args.use_emojis;
  }
  if (args.language !== undefined) {
    updateData.language = args.language;
  }
  if (Object.keys(updateData).length === 0) {
    return {
      error: 'No fields provided to update'
    };
  }

  // Return accepted immediately and process update asynchronously.
  // Uses model directly so it works in flows without Clerk session (e.g. WhatsApp); locationIds are already validated for context.userId.
  PromptContextModel.updateMany(locationIds, updateData)
    .then(result => {
      logger.debug('Prompt contexts updated asynchronously', {
        updatedCount: result.count,
        locationIds,
        userId: context.userId
      });
    })
    .catch(error => {
      logger.error('Error updating prompt contexts asynchronously', {
        error: error instanceof Error ? error.message : 'Unknown error',
        locationIds,
        userId: context.userId
      });
    });

  return {
    accepted: true,
    requestedReferences: args.references.length,
    validReferences: locationIds.length,
    invalidReferences: invalidReferences.length ? invalidReferences : undefined,
    message: 'Update request accepted and will be processed asynchronously'
  };
}

async function handleQueryPromptContext(args: { reference: number }, context: FunctionContext) {
  const onboardingCheck = validateOnboardingStatus(context);
  if (onboardingCheck) return onboardingCheck;

  try {
    const promptContextResult = await getPromptContextByReference(args.reference, context);
    if ('error' in promptContextResult) {
      return promptContextResult;
    }

    const promptContext = promptContextResult.promptContext;

    return {
      success: true,
      prompt_context: {
        tone: promptContext.tone,
        response_length: promptContext.response_length,
        cta: promptContext.cta,
        language: promptContext.language,
        use_emojis: promptContext.use_emojis,
        on_5_star: promptContext.on_5_star,
        on_4_star: promptContext.on_4_star,
        on_3_star: promptContext.on_3_star,
        on_2_star: promptContext.on_2_star,
        on_1_star: promptContext.on_1_star,
        custom_instruction: promptContext.custom_instruction,
        summary: promptContext.responses_summary
      }
    };
  } catch (error) {
    logger.error('Error in handleQueryPromptContext', {
      error: error instanceof Error ? error.message : 'Unknown error',
      reference: args.reference,
      userId: context.userId
    });
    return { error: 'Failed to get prompt context' };
  }
}

async function handleSendLoginTemplate(
  args: { template_type: 'sign_in' | 'account_creation' | 'proposed_responses'; locale?: string; reauth?: boolean },
  context?: FunctionContext
) {
  try {
    if (!context?.userId) return { error: 'Missing user context' };

    const sanitizedArgs = {
      ...args,
      locale: normalizeTemplateLocale(args.locale)
    };

    const result = await sendWhatsAppTemplateAction(context.userId, sanitizedArgs);
    
    if ('error' in result) {
      return result;
    }

    return result;
  } catch (error) {
    logger.error('Error in handleSendLoginTemplate', { error: error instanceof Error ? error.message : 'Unknown error' });
    return { error: 'send_template failed' };
  }
}

async function handleGetProposedResponses(args: {
  id?: string;
  reference?: number;
  rating?: string;
  reviewer_name?: string;
  limit?: number;
  sortBy?: 'created_at' | 'updated_at' | 'create_time';
  sortOrder?: 'asc' | 'desc';
}, context: FunctionContext) {
  const onboardingCheck = validateOnboardingStatus(context);
  if (onboardingCheck) return onboardingCheck;

  try {
    const limit = args.limit && args.limit > 0 && args.limit <= APP_CONSTANTS.openAi.tools.proposedResponsesMaxLimit ? args.limit : APP_CONSTANTS.openAi.tools.proposedResponsesDefaultLimit;
    const sortBy = args.sortBy || 'created_at';
    const sortOrder = args.sortOrder || 'desc';

    // If ID is provided, get single response and verify ownership
    if (args.id) {
      const response = await ProposedResponsesModel.findById(args.id);
      if (!response) return { error: 'Proposed response not found' };
      
      // Security check: ensure the response belongs to the authenticated user
      if (response.user_id !== context.userId) {
        return { error: 'Unauthorized: You can only access your own proposed responses' };
      }
      
      // Return response without reply_url and google_review_id
      return {
        success: true,
        count: 1,
        responses: [{
          id: response.id,
          reviewer_name: response.reviewer_name,
          rating: response.rating,
          comment: response.comment,
          response: response.response
        }]
      };
    }

    // Filter by reference (always filtered by user_id from context)
    if (args.reference) {
      const locationResult = await getLocationIdByReference(args.reference, context);
      if ('error' in locationResult) {
        return locationResult;
      }

      const responses = await ProposedResponsesModel.findByLocationId(locationResult.locationId, sortBy, sortOrder);
      
      // Filter by user_id from context (security: only show user's own responses)
      let filtered = responses.filter(r => r.user_id === context.userId);
      
      // Apply additional filters
      if (args.rating) {
        filtered = filtered.filter(r => r.rating === args.rating);
      }
      if (args.reviewer_name) {
        filtered = filtered.filter(r => 
          r.reviewer_name?.toLowerCase().includes(args.reviewer_name!.toLowerCase())
        );
      }
      
      return {
        success: true,
        count: filtered.slice(0, limit).length,
        total: filtered.length,
        responses: filtered.slice(0, limit).map(r => ({
          id: r.id,
          reviewer_name: r.reviewer_name,
          rating: r.rating,
          comment: r.comment,
          response: r.response
        }))
      };
    }

    // Get all responses for the authenticated user (always filtered by user_id from context)
    const where: Prisma.proposed_responsesWhereInput = {
      user_id: context.userId
    };
    
    if (args.rating) where.rating = args.rating;
    if (args.reviewer_name) {
      where.reviewer_name = { contains: args.reviewer_name, mode: 'insensitive' };
    }

    const responses = await ProposedResponsesModel.findMany(
      where,
      sortBy,
      sortOrder,
      0,
      limit
    );

    return {
      success: true,
      count: responses.length,
      responses: responses.map(r => ({
        id: r.id,
        reviewer_name: r.reviewer_name,
        rating: r.rating,
        comment: r.comment,
        response: r.response
      }))
    };
  } catch (error) {
    logger.error('Error in handleGetProposedResponses', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { error: 'Failed to get proposed responses' };
  }
}

async function handleUpdateProposedResponse(args: {
  id: string;
  response: string;
}, context: FunctionContext) {
  const onboardingCheck = validateOnboardingStatus(context);
  if (onboardingCheck) return onboardingCheck;

  try {
    // Check if response exists and belongs to the authenticated user
    const existing = await ProposedResponsesModel.findById(args.id);
    if (!existing) {
      return { error: 'Proposed response not found' };
    }

    // Security check: ensure the response belongs to the authenticated user
    if (existing.user_id !== context.userId) {
      return { error: 'Unauthorized: You can only update your own proposed responses' };
    }

    if (typeof args.response !== 'string' || !args.response.trim()) {
      return { error: 'Response text is required' };
    }

    const updateData = { response: args.response };

    // Return accepted immediately and process update asynchronously
    ProposedResponsesModel.update(args.id, updateData)
      .then(updated => {
        logger.debug('Proposed response updated asynchronously', {
          id: updated.id,
          userId: context.userId,
          updatedFields: ['response']
        });
      })
      .catch(error => {
        logger.error('Error updating proposed response asynchronously', {
          error: error instanceof Error ? error.message : 'Unknown error',
          id: args.id,
          userId: context.userId
        });
      });

    return {
      accepted: true,
      id: args.id,
      message: 'Update request accepted and will be processed asynchronously'
    };
  } catch (error) {
    logger.error('Error in handleUpdateProposedResponse', {
      error: error instanceof Error ? error.message : 'Unknown error',
      id: args.id,
      userId: context.userId
    });
    return { error: 'Failed to validate update request' };
  }
}

async function handleSendProposedResponses(args: { ids?: string[]; sendAll?: boolean }, context: FunctionContext) {
  const onboardingCheck = validateOnboardingStatus(context);
  if (onboardingCheck) return onboardingCheck;

  try {
    const ids = Array.isArray(args.ids) ? args.ids.filter(id => typeof id === 'string' && id.length > 0) : [];
    const sendAll = args.sendAll === true;

    if (!sendAll && ids.length === 0) {
      return { error: 'Debe proporcionar ids o sendAll=true' };
    }

    const where: Prisma.proposed_responsesWhereInput = {
      user_id: context.userId
    };

    if (!sendAll) {
      where.id = { in: ids };
    }

    const proposedResponses = await ProposedResponsesModel.findMany(
      where,
      'created_at',
      'desc',
      undefined,
      undefined
    );

    if (!proposedResponses.length) {
      return { error: 'No se encontraron respuestas propuestas para enviar' };
    }

    let token = '';
    const dbUser = await UsersModel.findUserById(context.userId);
    if (dbUser?.clerk_id) {
      const tokenResult = await getGoogleAccessToken(dbUser.clerk_id);
      if (tokenResult.success && tokenResult.token) {
        token = tokenResult.token as string;
      } else {
        logger.warn('Google token unavailable in send_proposed_responses; continuing without Clerk token', {
          userId: context.userId
        });
      }
    } else {
      logger.warn('User has no clerk_id in send_proposed_responses; continuing without Clerk token', {
        userId: context.userId
      });
    }

    const validForSend = proposedResponses.filter(response => response.response && response.reply_url);
    const invalidResponses = proposedResponses
      .filter(response => !response.response || !response.reply_url)
      .map(response => ({
        reviewer_name: response.reviewer_name ?? null,
        rating: response.rating ?? null,
        reason: 'La respuesta o reply_url está vacía'
      }));

    if (validForSend.length === 0) {
      return {
        error: 'No hay respuestas con datos suficientes para enviar',
        failed: invalidResponses,
        failedCount: invalidResponses.length
      };
    }

    const payload = validForSend.map(response => ({
      review_url: response.reply_url!,
      response: response.response!,
      token,
      reviewer_name: response.reviewer_name ?? 'anonymous',
      rating: response.rating ?? '0',
      comment: response.comment ?? null,
      create_time: response.create_time ?? null
    }));

    const sendResult = await sendReviewsToGmb(payload);

    const sentIds: string[] = [];
    const failed: Array<{ reviewer_name: string | null; rating: string | null; reason: string }> = [
      ...invalidResponses
    ];

    if (sendResult.success) {
      sentIds.push(...validForSend.map(response => response.id));
    } else {
      failed.push(
        ...validForSend.map(response => ({
          reviewer_name: response.reviewer_name ?? null,
          rating: response.rating ?? null,
          reason: sendResult.message || 'Fallo al enviar la respuesta'
        }))
      );
    }

    if (sentIds.length > 0) {
      await ProposedResponsesModel.deleteMany({ id: { in: sentIds } });
    }

    return {
      success: failed.length === 0,
      sentCount: sentIds.length,
      failedCount: failed.length,
      failed
    };
  } catch (error) {
    logger.error('Error in handleSendProposedResponses', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { error: 'Failed to send proposed responses' };
  }
}

async function handleUpdateLocationStatus(
  args: { reference: number; status: 'active' | 'inactive' },
  context: FunctionContext
) {
  const onboardingCheck = validateOnboardingStatus(context);
  if (onboardingCheck) return onboardingCheck;

  try {
    const locationResult = await getLocationIdByReference(args.reference, context);
    if ('error' in locationResult) {
      return locationResult;
    }

    if (!args.status || !['active', 'inactive'].includes(args.status)) {
      return { error: 'Invalid status: must be "active" or "inactive"' };
    }

    // Return accepted immediately and process update asynchronously (for-user path: no Clerk session required)
    updateMultipleLocationsStatusByIdsForUser([locationResult.locationId], args.status, context.userId)
      .then(result => {
        if (!result.success) {
          logger.error('Failed to update location status asynchronously', {
            error: result.error,
            reference: args.reference,
            location_id: locationResult.locationId,
            status: args.status,
            userId: context.userId
          });
        } else {
          logger.debug('Location status updated asynchronously', {
            reference: args.reference,
            location_id: locationResult.locationId,
            status: args.status,
            userId: context.userId,
            updated: result.data?.updated
          });
        }
      })
      .catch(error => {
        logger.error('Error updating location status asynchronously', {
          error: error instanceof Error ? error.message : 'Unknown error',
          reference: args.reference,
          status: args.status,
          userId: context.userId
        });
      });

    return {
      accepted: true,
      reference: args.reference,
      status: args.status,
      locationsUpdated: 1,
      message:
        'Update request accepted and will be processed asynchronously. Subscription (Stripe and Supabase) will be recalculated with the new active location count.'
    };
  } catch (error) {
    logger.error('Error in handleUpdateLocationStatus', {
      error: error instanceof Error ? error.message : 'Unknown error',
      reference: args.reference,
      status: args.status,
      userId: context.userId
    });
    return { error: 'Failed to validate update request' };
  }
}

// Public: Execute a function call by name
export async function executeFunction(functionCall: FunctionCall, context: FunctionContext) {
  try {
    const args = JSON.parse(functionCall.arguments);
    switch (functionCall.name) {
      case 'query_client_data':
        return await handleQueryClientData(args, context);
      case 'query_locations_data':
        return await handleQueryLocationsData(args, context);
      case 'get_google_reviews':
        return await handleGetGoogleReviews(args, context);
      case 'update_prompt_context':
        return await handleUpdatePromptContext(args, context);
      case 'query_prompt_context':
        return await handleQueryPromptContext(args, context);
      case 'send_whatsapp_template':
        return await handleSendLoginTemplate(args, context);
      case 'get_proposed_responses':
        return await handleGetProposedResponses(args, context);
      case 'update_proposed_response':
        return await handleUpdateProposedResponse(args, context);
      case 'send_proposed_responses':
        return await handleSendProposedResponses(args, context);
      case 'update_location_status':
        return await handleUpdateLocationStatus(args, context);
      default:
        return `Unknown function call: ${functionCall.name} with arguments: ${functionCall.arguments}`;
    }
  } catch (error) {
    logger.error('Error executing function', {
      functionName: functionCall.name,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { error: 'Function execution failed' };
  }
}


