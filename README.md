# Review Responder

> Plataforma SaaS para gestión automatizada de reseñas de Google My Business con IA

## 📋 Tabla de Contenidos

- [Descripción](#-descripción)
- [Stack Tecnológico](#-stack-tecnológico)
- [Arquitectura del Proyecto](#-arquitectura-del-proyecto)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Variables de Entorno](#-variables-de-entorno)
- [Desarrollo](#-desarrollo)
- [Estructura de Carpetas](#-estructura-de-carpetas)
- [Cursor Rules](#-cursor-rules)
- [Funcionalidades Principales](#-funcionalidades-principales)
- [Base de Datos](#-base-de-datos)
- [API Routes](#-api-routes)
- [Internacionalización](#-internacionalización)
- [Despliegue](#-despliegue)
- [Contribución](#-contribución)

---

## 🎯 Descripción

**Review Responder** es una plataforma SaaS que permite a empresas gestionar y responder automáticamente a reseñas de Google My Business utilizando Inteligencia Artificial. La aplicación:

- 🤖 **Genera respuestas personalizadas** con OpenAI basadas en el contexto del negocio
- 📊 **Dashboard completo** para gestionar múltiples ubicaciones y organizaciones
- 💬 **Integración con WhatsApp** para notificaciones y gestión conversacional
- 🔄 **Sincronización automática** con Google My Business mediante Pub/Sub
- 💳 **Sistema de suscripciones** integrado con Stripe
- 🌍 **Multiidioma** (Español/Inglés) con Next-Intl 5
- 👥 **Sistema multiorganización** con roles y permisos

---

## 🛠 Stack Tecnológico

### Frontend
- **Next.js 16** (App Router, React Server Components, Turbopack)
- **React 19** (con nuevas características de server components)
- **TypeScript 5**
- **Tailwind CSS 4** + **shadcn/ui** (sistema de diseño)
- **TanStack Table v8** (tablas de datos avanzadas)
- **Motion** (animaciones)
- **Next-Intl 5** (internacionalización)
- **Next Themes** (dark mode)

### Backend
- **Next.js API Routes** (endpoints REST)
- **Server Actions** (mutaciones server-side)
- **Prisma 6** (ORM con PostgreSQL)
- **PostgreSQL** (Supabase)
- **OpenAI API** (generación de respuestas)
- **Google Cloud Pub/Sub** (sincronización de reseñas)

### Autenticación & Pagos
- **Clerk** (autenticación y gestión de usuarios)
- **Stripe** (suscripciones y pagos)

### Integraciones
- **Google My Business API** (gestión de ubicaciones y reseñas)
- **WhatsApp Business API** (notificaciones y chat)
- **Supabase** (base de datos PostgreSQL)

### DevTools
- **ESLint 9** (linting)
- **next-devtools-mcp** (herramientas de desarrollo)
- **Vercel** (hosting y despliegue)

---

## 🏗 Arquitectura del Proyecto

El proyecto sigue una arquitectura modular basada en **Next.js App Router** con separación clara de responsabilidades:

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (RSC)                       │
│  /app/[locale]/(website|auth|dashboard|onboarding)     │
│  /components/ui (shadcn) + /components/[section]       │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│              SERVER LAYER (Next.js)                     │
│  ┌──────────────────┐    ┌──────────────────┐          │
│  │  Server Actions  │◄───┤   API Routes     │          │
│  │  /server/actions │    │   /app/api       │          │
│  └────────┬─────────┘    └──────────────────┘          │
│           │                                              │
│  ┌────────▼─────────┐                                   │
│  │  Server Models   │                                   │
│  │  /server/models  │                                   │
│  └────────┬─────────┘                                   │
└───────────┼──────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────┐
│                 DATA LAYER (Prisma)                      │
│  PostgreSQL (Supabase) + Prisma Client                  │
└──────────────────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────┐
│              EXTERNAL SERVICES                           │
│  Clerk | Stripe | OpenAI | GMB | WhatsApp | Pub/Sub     │
└──────────────────────────────────────────────────────────┘
```

### Principios de Arquitectura

1. **Server Actions**: Orquestación, validaciones (Zod), llamadas a modelos
2. **Server Models**: ÚNICO lugar donde se usa Prisma, acceso puro a datos
3. **API Routes**: Endpoints para webhooks y servicios externos
4. **Components**: UI pura, sin lógica de negocio
5. **Separation of Concerns**: Cada capa tiene responsabilidades bien definidas

---

## ✅ Requisitos Previos

- **Node.js** 18+ (recomendado 20+)
- **npm** / **pnpm** / **yarn** / **bun**
- **PostgreSQL** (o cuenta de Supabase)
- **Cuenta de Clerk** (autenticación)
- **Cuenta de Stripe** (pagos)
- **Cuenta de OpenAI** (API key)
- **Proyecto de Google Cloud** (GMB API + Pub/Sub)
- **WhatsApp Business API** (opcional)

---

## 📦 Instalación

```bash
# Clonar el repositorio
git clone <repository-url>
cd review-responder

# Instalar dependencias
npm install

# Generar Prisma Client
npx prisma generate

# Configurar variables de entorno (ver sección siguiente)
cp .env.example .env.local

# Ejecutar migraciones de base de datos
npx prisma migrate dev

# Iniciar servidor de desarrollo
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

---

## 🔐 Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto con las siguientes variables (copia el contenido de `.env.example` y reemplaza los valores placeholder):

```bash
# URL de la aplicación
NEXT_PUBLIC_APP_URL=http://localhost:3000

# PRISMA ORM CREDENTIALS - Conexión a Supabase via connection pooling
DATABASE_URL="postgresql://your_username:your_password@your_host:5432/your_database?pgbouncer=true"
NEXT_PUBLIC_SUPABASE_URL=https://your_project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Conexión directa a la base de datos (usada para migraciones)
DIRECT_URL="postgresql://your_username:your_password@your_host:5432/your_database"

# Clerk (Autenticación)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
N8N_WEBHOOK_URL=https://your_n8n_instance/webhook/your_webhook_id
CLERK_BILLING_WEBHOOK_SECRET=whsec_your_clerk_billing_webhook_secret

# Google Service Account (para GMB y Pub/Sub)
GOOGLE_SERVICE_ACCOUNT_PROJECT_ID=your_google_project_id
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----\n"
GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL=your_service_account@your_project.iam.gserviceaccount.com

# Google Pub Sub
GOOGLE_SERVICE_PROJECT_ID=your_google_project_id
GOOGLE_SERVICE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----\n"
GOOGLE_SERVICE_CLIENT_EMAIL=your_service_account@your_project.iam.gserviceaccount.com
GOOGLE_PUBSUB_TOPIC_NAME=your_pubsub_topic
GOOGLE_PUBSUB_PROJECT_ID=your_google_project_id

# OpenAI
OPENAI_API_KEY=sk-your_openai_api_key

# WhatsApp Business API
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id
WHATSAPP_CLIENT_ID=your_whatsapp_client_id
WHATSAPP_CLIENT_SECRET=your_whatsapp_client_secret
WHATSAPP_API_VERSION=v24.0

# Cron secret para tareas programadas
CRON_SECRET=your_cron_secret

# Paddle (Pagos alternativos)
PADDLE_API_KEY=pdl_your_paddle_api_key
PADDLE_PRICE_ID=pri_your_paddle_price_id
PADDLE_WEBHOOK_SECRET=pdl_ntfset_your_paddle_webhook_secret
PADDLE_ENVIRONMENT=sandbox
NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_your_paddle_client_token
NEXT_PUBLIC_PADDLE_PRICE_ID=pri_your_paddle_price_id

# Stripe (Pagos)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
```

### Cómo obtener las claves API

1. **Supabase**: Crea un proyecto en [supabase.com](https://supabase.com) y obtén las credenciales de la base de datos
2. **Clerk**: Regístrate en [clerk.com](https://clerk.com) y crea una aplicación
3. **Stripe**: Crea una cuenta en [stripe.com](https://stripe.com) y obtén las claves de API
4. **OpenAI**: Obtén una API key en [platform.openai.com](https://platform.openai.com)
5. **Google Cloud**: Crea un proyecto en Google Cloud Console y configura service accounts para GMB y Pub/Sub
6. **WhatsApp Business API**: Configura la API de WhatsApp Business en Facebook Developers
7. **Paddle**: Regístrate en [paddle.com](https://paddle.com) para pagos alternativos

> ⚠️ **Importante**: Nunca commits el archivo `.env.local` con valores reales al repositorio. El archivo `.env.example` contiene placeholders para que otros desarrolladores sepan qué variables configurar.

---

## 🚀 Desarrollo

### Scripts Disponibles

```bash
# Desarrollo con Turbopack
npm run dev

# Build de producción
npm run build

# Iniciar servidor de producción
npm start

# Linting
npm run lint

# Regenerar Prisma Client (automático en postinstall)
npm run postinstall
```

### Flujo de Desarrollo

1. **Crear rama feature**: `git checkout -b feature/nombre-feature`
2. **Desarrollar siguiendo las Cursor Rules** (ver sección siguiente)
3. **Probar localmente**: `npm run dev`
4. **Lint**: `npm run lint`
5. **Commit**: `git commit -m "feat: descripción"`
6. **Push y PR**: `git push origin feature/nombre-feature`

---

## 📁 Estructura de Carpetas

```
review-responder/
├── app/
│   ├── [locale]/              # Rutas internacionalizadas
│   │   ├── (auth)/            # Páginas de autenticación
│   │   ├── (dashboard)/       # Dashboard (backoffice)
│   │   ├── (onboarding)/      # Flujo de onboarding
│   │   ├── (user)/            # Área de usuario
│   │   └── (website)/         # Landing page
│   ├── api/                   # API Routes (REST endpoints)
│   │   ├── gmb/               # Google My Business
│   │   ├── stripe/            # Webhooks de Stripe
│   │   ├── responder/         # Cron jobs de respuestas
│   │   └── whatsapp/          # Webhooks de WhatsApp
│   ├── generated/prisma/      # Prisma Client generado
│   └── globals.css            # Estilos globales + variables CSS
│
├── components/
│   ├── ui/                    # shadcn/ui base (❌ NO EDITAR)
│   ├── auth/                  # Componentes de autenticación
│   ├── common/                # Componentes compartidos
│   ├── dashboard/             # Componentes del dashboard
│   │   ├── shared/table/      # Infraestructura TanStack Table
│   │   ├── conversations/
│   │   ├── home/
│   │   ├── locations/
│   │   ├── organizations/
│   │   ├── settings/
│   │   ├── system/
│   │   └── users/
│   ├── onboarding/            # Componentes de onboarding
│   ├── user/                  # Componentes de área usuario
│   └── website/               # Componentes de landing
│
├── server/
│   ├── actions/               # Server Actions (orquestación)
│   │   ├── clerk/             # Gestión de usuarios
│   │   ├── gmb/               # Google My Business
│   │   ├── stripe/            # Pagos y suscripciones
│   │   ├── supabase/          # Operaciones DB (vía models)
│   │   └── whatsapp/          # Mensajería WhatsApp
│   └── models/                # Server Models (acceso DB con Prisma)
│       ├── clerk/
│       ├── gmb/
│       ├── openAI/
│       ├── stripe/
│       ├── supabase/
│       └── whatsapp/
│
├── lib/                       # Utilidades y helpers
│   ├── api-helpers.ts
│   ├── auth-helpers.ts
│   ├── constants.ts
│   ├── logger.ts
│   ├── prisma.ts              # Cliente Prisma singleton
│   └── utils.ts               # Funciones helper generales
│
├── i18n/                      # Configuración Next-Intl
│   ├── navigation.ts
│   ├── request.ts
│   └── routing.ts
│
├── messages/                  # Traducciones
│   ├── en.json                # Inglés
│   └── es.json                # Español
│
├── hooks/                     # Custom React Hooks
│   ├── use-debounce.ts
│   └── use-mobile.ts
│
├── prisma/
│   └── schema.prisma          # Esquema de base de datos
│
├── public/                    # Assets estáticos
│   ├── logo.svg
│   └── whatsapp.svg
│
├── .cursor/rules/             # Cursor AI Rules (ver sección siguiente)
│   ├── general.rules.mdc
│   ├── next-intl.rules.mdc
│   ├── server.rules.mdc
│   └── tables.rules.mdc
│
├── next.config.ts             # Configuración Next.js
├── tsconfig.json              # Configuración TypeScript
├── tailwind.config.ts         # Configuración Tailwind
├── components.json            # Configuración shadcn/ui
├── vercel.json                # Configuración Vercel (cron jobs)
└── package.json               # Dependencias y scripts
```

---

## 🎯 Cursor Rules

Este proyecto utiliza **Cursor AI Rules** para mantener consistencia y calidad en el desarrollo. Las reglas están ubicadas en `.cursor/rules/` y se aplican automáticamente al trabajar con Cursor AI.

### 📋 Reglas Generales (`general.rules.mdc`)

**Aplicación**: Siempre activa en todos los archivos `.ts` y `.tsx`

#### 🧠 MCP & Context7 (Obligatorio)
- Ejecutar `next-devtools-mcp:init` al iniciar sesión
- Usar **next-devtools MCP** para documentación de Next.js/App Router
- Usar **Context7 MCP** para documentación de:
  - Next-Intl 5
  - shadcn/ui
  - TanStack Table
  - Prisma
  - Clerk
  - Stripe

#### 🗂 Estructura del Proyecto
- **NO alterar** la estructura de carpetas sin aprobación
- Respetar la separación de responsabilidades
- Mantener coherencia en imports y rutas

#### 🎨 shadcn/ui - Regla CRÍTICA
**🚫 PROHIBIDO editar `/components/ui`**

Si necesitas personalización:
1. Crear wrapper en `/components/common` o carpeta de sección
2. Extender el componente desde client/server component
3. Pasar props, classes o slots desde fuera
4. **Mantener componentes shadcn originales intactos**

#### 🌓 Dark Mode
- Usar exclusivamente el `ThemeProvider` existente
- Utilizar variables CSS de `globals.css`
- No crear toggles nuevos

#### 🌍 Next-Intl
- **Nunca hardcodear textos** de interfaz
- Usar mensajes desde `/messages/<locale>.json`
- Respetar namespaces existentes
- No duplicar namespaces

#### 🗃 Server Actions + Server Models
**Server Models** (`/server/models`):
- ÚNICO lugar donde se usa Prisma
- Solo acceso a datos
- Sin validaciones ni lógica de negocio

**Server Actions** (`/server/actions`):
- Orquestación de flujos
- Validaciones (Zod)
- Llamar a modelos para DB
- **Nunca usar Prisma directamente**

**🚫 Si necesitas tocar action/model crítico → proponer cambio primero**

#### 🌐 API Routes
- Mantener endpoints en `/app/api/**`
- No duplicar rutas existentes
- Seguir estructura estándar: `/gmb`, `/stripe`, `/responder`, `/whatsapp`

#### 👤 Clerk (Auth)
- Toda lógica debe pasar por `/server/actions/clerk/**`
- No usar Clerk directo desde componentes sin necesidad
- Mantener separación UI ↔ lógica

#### 💳 Stripe (Suscripciones)
- Usar exclusivamente `/server/actions/stripe/**`
- No reimplementar pricing, checkout o webhooks fuera de esa carpeta

#### 📊 Data Tables
- Reutilizar infraestructura en `/components/dashboard/shared/table`
- No implementar lógica de tabla desde cero
- No duplicar paginación, filtrado o sorting

---

### 🌍 Reglas Next-Intl (`next-intl.rules.mdc`)

**Aplicación**: Archivos en `app/**` y `components/**`

#### ✔ Uso de Mensajes
- Todos los textos desde `/messages/<locale>.json`
- No hardcodear strings de interfaz
- Respetar namespaces existentes

#### ✔ Namespaces
- Si la sección/página ya tiene namespace → usar el mismo
- Si no existe → crear uno nuevo
- No crear namespaces duplicados

#### ✔ Carga de Traducciones
Utilizar APIs implementadas:
- `i18n/request.ts`
- `i18n/navigation.ts`
- `i18n/routing.ts`

#### 🚫 Prohibido
- Introducir loaders alternativos
- Mezclar idiomas en el código
- Crear JSON separados por componente

---

### 🗂 Reglas Server (`server.rules.mdc`)

**Aplicación**: Archivos en `server/**`

#### ✔ Server Models (Prisma)
**Obligatorio**:
- Prisma solo en `/server/models/**`
- Modelos = funciones puras de acceso a datos
- Sin validaciones
- Sin lógica de negocio

**🚫 Prohibido**:
- Usar Prisma en server/actions o componentes

#### ✔ Server Actions
**Obligatorio**:
- Validaciones con Zod
- Llamar a modelos para DB
- Orquestar flujos
- Mantener lógica existente si la action ya cubre funcionalidad

**🚫 Prohibido**:
- Reescribir actions críticas sin aprobación
- Crear nuevas actions si ya existe equivalente
- Implementar modelos dentro de actions

#### 🧠 MCP / Context7
En caso de editar lógica compleja (Stripe, Clerk, GMB, WhatsApp):
→ **Consultar documentación actualizada con Context7 antes de actuar**

---

### 📊 Reglas Data Tables (`tables.rules.mdc`)

**Aplicación**: Archivos `*table*.tsx` y `*columns*.tsx`

#### ✔ Estructura Obligatoria
Cada tabla debe seguir el patrón:
```
columns.tsx
<TableName>TableServer.tsx
<TableName>TableClient.tsx
/components/dashboard/shared/table/*
```

#### ✔ Reutilizar Siempre
- `data-table.tsx`
- `DataTableColumnHeader`
- `DataTablePagination`
- `DataTableViewOptions`
- `selection-bar`
- `table-toolbar`

#### 🚫 Prohibido
- Crear tablas completas desde cero
- Implementar sorting, filtering o pagination manualmente
- Editar infraestructura en `/shared/table` sin aprobación

#### ✔ Antes de Crear Tabla Nueva
1. Revisar si existe similar en otra sección
2. Reusar columnas o derivados si aplica
3. Consultar Context7 para cambios en TanStack Table o shadcn/ui

---

### 🎯 Reglas TypeScript (`next-typescript.rules.mdc`)

**Aplicación**: Todos los archivos `.ts` y `.tsx`

#### ✔ Principio Base
Escribir siempre TypeScript **estricto, elegante y seguro**:
- Reutilizar tipos generados por Prisma y los definidos en `/lib`
- Evitar cualquier forma de `any`, `unknown`, `as any`, `as unknown as`
- Evitar `!` salvo en casos muy controlados
- Tipos descriptivos y explícitos

#### 📌 Uso de Tipos Generados por Prisma (CRÍTICO)
**Siempre que sea posible**, importar tipos generados por Prisma:

```typescript
import type { assets, users, organizations } from '@/app/generated/prisma'
```

- Usar estos tipos para representar entidades base de BD
- **No redefinir manualmente** estos tipos
- Definir tipos nuevos solo cuando combines relaciones, `_count`, agregados, o selects/includes avanzados

#### 📌 Uso de Tipos Avanzados Existentes
Antes de crear un tipo nuevo:
1. Revisar si existe en `/lib/prisma-types.ts` o `/lib/api-types.ts`
2. Si existe → reutilizarlo
3. Si necesitas ampliación → extenderlo fuera del componente:

```typescript
type ExtendedUser = UserWithOrganization & { extra?: string }
```

#### 🚫 Prohibido
- `any`, `unknown`, `object` genérico
- Casts dobles: `as unknown as`
- Props sin tipado claro
- Tipar Server Actions como `Promise<any>`
- Tipos DOM en Server Components (`HTMLElement`, `Event`, etc.)
- `Record<string, any>`

#### 🧱 Server Components (Next.js 16)
- Props definidas con `interface Props`
- No usar hooks cliente dentro de RSC
- No retornar estructuras no serializables
- Para datos de BD → usar tipos generados por Prisma o tipos avanzados de `/lib/prisma-types.ts`

#### ⚙ Server Actions - Tipado Estricto
- Validación de inputs con **Zod**
- Retornos siempre 100% serializables
- Para respuestas tipo API:
  - `ApiResponse<T>`
  - `PaginatedApiResponse<T>`
- No retornar modelos Prisma directamente si contienen `Date` sin transformar

#### 🗃 Prisma + Tipos Avanzados
- Includes/selects complejos → usar `Prisma.validator` solo en modelos (`/server/models`)
- No repetir includes/selects dentro de Server Actions o componentes
- Para modelos extendidos, importar siempre tipos desde `/server/models` o `/lib/prisma-types.ts`

#### 📄 Componentes Cliente
- Props estrictamente tipadas
- Evitar `any`, `unknown`, `object`
- Para diccionarios, usar:
  - `Record<string, string>`
  - `Record<string, number>`
  - `Record<string, unknown>` (solo si es necesario)

#### 🔄 Narrowing y Control de Flujo
- Validar tipos antes de usarlos
- Usar early-return
- Narrowing explícito:

```typescript
if (!value) return null
if (typeof text !== "string") throw new Error("Invalid text")
```

#### 📦 Imports y Boundaries
- **No importar Server Actions** dentro de componentes cliente
- **No importar prisma** fuera de `/server/models`
- **No importar rutas** de `/app/api/**` dentro de componentes o actions
- Mantener estricto el boundary Server/Client de Next.js

#### ✨ Estilo de Tipado del Proyecto
- `interface` para objetos
- `type` para composición y utilidades
- Tipos descriptivos y explícitos
- Preferir `type` para merges avanzados
- Un único source of truth para cada tipo
- Consistencia con los tipos de `/lib`

---

### 📝 Resumen de Reglas Críticas

| ❌ NUNCA | ✅ SIEMPRE |
|---------|-----------|
| Editar `/components/ui` | Usar wrappers en `/components/common` |
| Usar Prisma fuera de `/server/models` | Llamar a modelos desde actions |
| Hardcodear textos | Usar `/messages/<locale>.json` |
| Crear tablas desde cero | Reutilizar `/dashboard/shared/table` |
| Duplicar actions existentes | Revisar actions antes de crear |
| Modificar estructura sin aprobación | Proponer cambios primero |
| Usar `any`, `unknown`, `as any` | Tipos explícitos de Prisma o `/lib` |
| Redefinir tipos de Prisma manualmente | Importar desde `@/app/generated/prisma` |
| Importar Server Actions en cliente | Mantener boundary Server/Client |
| Retornar `Date` sin transformar | Serializar datos en Server Actions |

---

## 🎨 Funcionalidades Principales

### 1. **Landing Page Multiidioma**
- Hero section con CTA a WhatsApp
- Sección "Cómo funciona"
- Features destacadas
- Pricing con integración Stripe
- FAQ
- Footer con links legales

### 2. **Autenticación (Clerk)**
- Sign In / Sign Up
- OAuth con Google
- Gestión de sesiones
- Protección de rutas

### 3. **Onboarding Multi-Step**
- **Paso 0**: Bienvenida
- **Paso 1**: Creación de organización
- **Paso 2**: Selección de ubicaciones
- **Paso 3**: Configuración de pagos (Stripe)
- **Paso 4**: Pantalla final y sincronización bd
- Validación y guardado progresivo

### 4. **Dashboard (Backoffice)**

#### 🏠 Home
- Estadísticas generales
- Reseñas recientes
- Actividad de ubicaciones

#### 📍 Locations
- Tabla con todas las ubicaciones
- Sincronización con GMB
- Configuración de respuestas automáticas
- Gestión de horarios
- Prompt context personalizado por ubicación

#### 🏢 Organizations
- CRUD de organizaciones
- Gestión de miembros
- Configuración fiscal

#### 👥 Users
- Tabla de usuarios
- Roles y permisos (USER, CLIENT, VISUALIZER, OWNER)
- Estados de onboarding
- Búsqueda y filtrado avanzado

#### 💬 Conversations (WhatsApp)
- Historial de conversaciones
- Chat en tiempo real
- Gestión de mensajes

#### ⚙️ Settings
- Configuración de cuenta
- Preferencias de idioma
- Configuración de notificaciones

#### 🔧 System (Admin)
- Global config (modelos OpenAI, instrucciones)
- Logs de Pub/Sub
- Métricas del sistema

### 5. **Gestión de Reseñas**

#### Flujo Automático
1. **Sincronización**: Google Pub/Sub notifica nueva reseña
2. **Procesamiento**: Endpoint `/api/gmb/fetch-reviews` obtiene detalles
3. **Generación IA**: OpenAI genera respuesta basada en:
   - Contexto del negocio
   - Ejemplos de reseñas anteriores
   - Configuración de tono y longitud
   - Instrucciones personalizadas
4. **Propuesta**: Se guarda en `proposed_responses`
5. **Notificación**: WhatsApp notifica al usuario
6. **Publicación**: Usuario aprueba/edita y publica

#### Configuración por Ubicación
- **Tono**: Formal, casual, amigable, etc.
- **Longitud**: Corta, media, larga
- **CTA**: Call-to-action personalizado
- **Emojis**: Activar/desactivar
- **Idioma**: Español, inglés, etc.
- **Acciones por rating**:
  - 5 estrellas: Responder automáticamente / Proponer / No gestionar
  - 4 estrellas: Responder / Proponer / No gestionar
  - 3 estrellas: Responder / Proponer / No gestionar
  - 2 estrellas: Responder / Proponer / No gestionar
  - 1 estrella: Responder / Proponer / No gestionar

### 6. **Sistema de Suscripciones (Stripe)**
- Planes de precios configurables
- Checkout integrado
- Webhooks para eventos de suscripción
- Gestión de pagos
- Logs de cambios de suscripción

### 7. **Integración WhatsApp**
- Notificaciones de nuevas reseñas
- Chat conversacional con IA
- Gestión de mensajes
- Historial de conversaciones

---

## 🗄 Base de Datos

### Modelos Principales

#### **users**
- Información de usuarios
- Roles: USER, CLIENT, VISUALIZER, OWNER
- Estados de onboarding
- Relación con organizaciones

#### **organizations**
- Datos fiscales y de negocio
- Relación con Clerk
- Múltiples usuarios

#### **connections**
- Conexiones con proveedores externos (Google)
- Tokens de acceso
- Estado de Pub/Sub

#### **locations**
- Ubicaciones de Google My Business
- Información de negocio
- Estado (activo/inactivo)
- Contador de reseñas procesadas

#### **prompt_context**
- Configuración de respuestas por ubicación
- Tono, longitud, CTA, emojis
- Instrucciones personalizadas
- Acciones por rating

#### **proposed_responses**
- Respuestas generadas por IA
- Pendientes de aprobación
- Historial de respuestas

#### **example_reviews**
- Ejemplos de reseñas para entrenamiento
- Usadas por OpenAI para contexto

#### **subscriptions**
- Suscripciones activas
- Relación con Stripe
- Logs de cambios

#### **sessions** & **messages**
- Conversaciones de WhatsApp
- Historial de chat
- Gestión de tokens

#### **global_config**
- Configuración global del sistema
- Modelos de OpenAI
- Instrucciones del responder
- Configuración de WhatsApp

---

## 🌐 API Routes

### `/api/gmb/fetch-reviews`
- **Método**: POST
- **Descripción**: Obtiene reseñas de GMB y genera respuestas
- **Trigger**: Pub/Sub o manual

### `/api/gmb/sync-accounts`
- **Método**: POST
- **Descripción**: Sincroniza cuentas y ubicaciones de GMB
- **Trigger**: Manual desde dashboard

### `/api/stripe/webhook`
- **Método**: POST
- **Descripción**: Recibe eventos de Stripe
- **Eventos**: Suscripción creada, actualizada, cancelada, pago

### `/api/responder/reviews`
- **Método**: GET
- **Descripción**: Cron job para procesar reseñas pendientes
- **Schedule**: Lunes a viernes 14:00 y 22:30 (ver `vercel.json`)

### `/api/whatsapp/chat`
- **Método**: POST
- **Descripción**: Webhook de WhatsApp Business API
- **Eventos**: Mensajes entrantes, estados de entrega

---

## 🌍 Internacionalización

El proyecto usa **Next-Intl 5** con soporte para:
- 🇬🇧 Inglés (`en`)
- 🇪🇸 Español (`es`)

### Estructura de Traducciones

```json
// messages/es.json
{
  "website": {
    "hero": {
      "title": "Gestiona tus reseñas con IA",
      "subtitle": "..."
    }
  },
  "dashboard": {
    "locations": {
      "title": "Ubicaciones",
      "table": { ... }
    }
  },
  "onboarding": { ... },
  "auth": { ... }
}
```

### Uso en Componentes

```tsx
// Server Component
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('website.hero');
  return <h1>{t('title')}</h1>;
}

// Client Component
'use client';
import { useTranslations } from 'next-intl';

export default function Component() {
  const t = useTranslations('dashboard.locations');
  return <h1>{t('title')}</h1>;
}
```

---

## 🚀 Despliegue

### Vercel

1. **Conectar repositorio** en Vercel
2. **Configurar variables de entorno** (ver sección anterior)
3. **Configurar base de datos**:
   - Ejecutar migraciones: `npx prisma migrate deploy`
4. **Deploy automático** en cada push a `main`

### Cron Jobs

Los cron jobs están configurados en `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/responder/reviews",
      "schedule": "0 14 * * 1-5"  // L-V 14:00
    },
    {
      "path": "/api/responder/reviews",
      "schedule": "30 22 * * 1-5"  // L-V 22:30
    }
  ]
}
```

### Configuración de Webhooks

**Stripe**:
- URL: `https://tu-dominio.com/api/stripe/webhook`
- Eventos: Todos los de suscripción y pago

**WhatsApp**:
- URL: `https://tu-dominio.com/api/whatsapp/chat`
- Verify Token: (configurado en `.env`)

**Google Pub/Sub**:
- Push endpoint: `https://tu-dominio.com/api/gmb/fetch-reviews`
- Autenticación: Service Account

---

## 🤝 Contribución

### Convenciones de Código

1. **TypeScript**: Todo el código debe estar tipado
2. **TSDoc**: Documentar funciones y componentes complejos
3. **Nombres en inglés**: Variables, funciones, tipos
4. **Comentarios funcionales**: Solo cuando sea necesario
5. **No meta-comentarios**: Evitar "cambié esto porque..."

### Convenciones de Commits

Seguir [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: añadir nueva funcionalidad
fix: corregir bug
docs: actualizar documentación
style: cambios de formato
refactor: refactorización de código
test: añadir tests
chore: tareas de mantenimiento
```

### Flujo de Trabajo

1. Crear issue describiendo el cambio
2. Crear rama desde `main`: `feature/nombre` o `fix/nombre`
3. Desarrollar siguiendo las **Cursor Rules**
4. Hacer commits atómicos con mensajes descriptivos
5. Abrir Pull Request
6. Revisión de código
7. Merge a `main`

### Checklist antes de PR

- [ ] Código sigue las Cursor Rules
- [ ] No hay errores de linting (`npm run lint`)
- [ ] Traducciones añadidas en `en.json` y `es.json`
- [ ] Componentes documentados con TSDoc
- [ ] No se editó `/components/ui` directamente
- [ ] Server Actions usan modelos (no Prisma directo)
- [ ] Probado localmente en ambos idiomas

---

## 📞 Soporte

Para dudas o problemas:
1. Revisar este README
2. Consultar las Cursor Rules en `.cursor/rules/`
3. Revisar documentación de las tecnologías usadas
4. Contactar al equipo

---

## 📄 Licencia

Este proyecto es privado y confidencial. Todos los derechos reservados.

---

**Desarrollado con ❤️ por el equipo de Review Responder**
