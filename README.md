# Review Responder

> SaaS Platform for Automated Google My Business Review Management with AI

## 📌 About This Project

This is a **personal project developed as a portfolio** that was built in late 2025. The objective has been to create a platform that demonstrates skills and knowledge in system architecture, full-stack development, external API integration, and real-time data management.

Through the development of **Review Responder**, I have integrated multiple technologies and services to build a complete system:
- Robust backend with authentication and authorization
- Complex database management
- Integrations with external APIs (Google Cloud, OpenAI, Stripe, WhatsApp)
- Payment and subscription system
- Interactive dashboard with type-safe TypeScript
- Multi-language internationalization
- Production publishing and deployment

---

## 📋 Table of Contents

- [About This Project](#-about-this-project)
- [Description](#-description)
- [Tech Stack](#-tech-stack)
- [Project Architecture](#-project-architecture)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Environment Variables](#-environment-variables)
- [Development](#-development)
- [Folder Structure](#-folder-structure)
- [Cursor Rules](#-cursor-rules)
- [Main Features](#-main-features)
- [Database](#-database)
- [API Routes](#-api-routes)
- [Internationalization](#-internationalization)
- [Deployment](#-deployment)
- [Contributing](#-contributing)

---

## 🎯 Description

**Review Responder** is a SaaS platform that allows businesses to manage and automatically respond to Google My Business reviews using Artificial Intelligence. The application:

- 🤖 **Generates personalized responses** with OpenAI based on business context
- 📊 **Complete dashboard** to manage multiple locations and organizations
- 💬 **WhatsApp integration** for notifications and conversational management
- 🔄 **Automatic synchronization** with Google My Business via Pub/Sub
- 💳 **Integrated subscription system** with Stripe
- 🌍 **Multi-language support** (Spanish/English) with Next-Intl 5
- 👥 **Multi-organization system** with roles and permissions

---

## 🛠 Tech Stack

### Frontend
- **Next.js 16** (App Router, React Server Components, Turbopack)
- **React 19** (with new server components features)
- **TypeScript 5**
- **Tailwind CSS 4** + **shadcn/ui** (design system)
- **TanStack Table v8** (advanced data tables)
- **Motion** (animations)
- **Next-Intl 5** (internationalization)
- **Next Themes** (dark mode)

### Backend
- **Next.js API Routes** (REST endpoints)
- **Server Actions** (server-side mutations)
- **Prisma 6** (ORM with PostgreSQL)
- **PostgreSQL** (Supabase)
- **OpenAI API** (response generation)
- **Google Cloud Pub/Sub** (review synchronization)

### Authentication & Payments
- **Clerk** (authentication and user management)
- **Stripe** (subscriptions and payments)

### Integrations
- **Google My Business API** (location and review management)
- **WhatsApp Business API** (notifications and chat)
- **Supabase** (PostgreSQL database)

### DevTools
- **ESLint 9** (linting)
- **next-devtools-mcp** (development tools)
- **Vercel** (hosting and deployment)

---

## 🏗 Project Architecture

The project follows a modular architecture based on **Next.js App Router** with clear separation of concerns:

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

### Architecture Principles

1. **Server Actions**: Orchestration, validations (Zod), model calls
2. **Server Models**: ONLY place where Prisma is used, pure data access
3. **API Routes**: Endpoints for webhooks and external services
4. **Components**: Pure UI, no business logic
5. **Separation of Concerns**: Each layer has well-defined responsibilities

---

## ✅ Prerequisites

- **Node.js** 18+ (recommended 20+)
- **npm** / **pnpm** / **yarn** / **bun**
- **PostgreSQL** (or Supabase account)
- **Clerk account** (authentication)
- **Stripe account** (payments)
- **OpenAI account** (API key)
- **Google Cloud project** (GMB API + Pub/Sub)
- **WhatsApp Business API** (optional)

---

## 📦 Installation

```bash
# Clone the repository
git clone <repository-url>
cd review-responder

# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Set up environment variables (see next section)
cp .env.example .env.local

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`

---

## 🔐 Environment Variables

Create a `.env.local` file in the project root with the following variables (copy the content from `.env.example` and replace the placeholder values):

```bash
# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# PRISMA ORM CREDENTIALS - Supabase connection via connection pooling
DATABASE_URL="postgresql://your_username:your_password@your_host:5432/your_database?pgbouncer=true"
NEXT_PUBLIC_SUPABASE_URL=https://your_project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Direct database connection (used for migrations)
DIRECT_URL="postgresql://your_username:your_password@your_host:5432/your_database"

# Clerk (Authentication)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
N8N_WEBHOOK_URL=https://your_n8n_instance/webhook/your_webhook_id
CLERK_BILLING_WEBHOOK_SECRET=whsec_your_clerk_billing_webhook_secret

# Google Service Account (for GMB and Pub/Sub)
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

# Cron secret for scheduled tasks
CRON_SECRET=your_cron_secret

# Stripe (Payments)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
```

### How to Get API Keys

1. **Supabase**: Create a project at [supabase.com](https://supabase.com) and obtain database credentials
2. **Clerk**: Register at [clerk.com](https://clerk.com) and create an application
3. **Stripe**: Create an account at [stripe.com](https://stripe.com) and obtain API keys
4. **OpenAI**: Get an API key at [platform.openai.com](https://platform.openai.com)
5. **Google Cloud**: Create a project in Google Cloud Console and configure service accounts for GMB and Pub/Sub
6. **WhatsApp Business API**: Set up WhatsApp Business API in Facebook Developers

> ⚠️ **Important**: Never commit the `.env.local` file with real values to the repository. The `.env.example` file contains placeholders so other developers know what variables to configure.

---

## 🚀 Development

### Available Scripts

```bash
# Development with Turbopack
npm run dev

# Production build
npm run build

# Start production server
npm start

# Linting
npm run lint

# Regenerate Prisma Client (automatic on postinstall)
npm run postinstall
```

### Development Workflow

1. **Create feature branch**: `git checkout -b feature/feature-name`
2. **Develop following Cursor Rules** (see next section)
3. **Test locally**: `npm run dev`
4. **Lint**: `npm run lint`
5. **Commit**: `git commit -m "feat: description"`
6. **Push and PR**: `git push origin feature/feature-name`

---

## 📁 Folder Structure

```
review-responder/
├── app/
│   ├── [locale]/              # Internationalized routes
│   │   ├── (auth)/            # Authentication pages
│   │   ├── (dashboard)/       # Dashboard (backoffice)
│   │   ├── (onboarding)/      # Onboarding flow
│   │   ├── (user)/            # User area
│   │   └── (website)/         # Landing page
│   ├── api/                   # API Routes (REST endpoints)
│   │   ├── gmb/               # Google My Business
│   │   ├── stripe/            # Stripe webhooks
│   │   ├── responder/         # Response cron jobs
│   │   └── whatsapp/          # WhatsApp webhooks
│   ├── generated/prisma/      # Generated Prisma Client
│   └── globals.css            # Global styles + CSS variables
│
├── components/
│   ├── ui/                    # shadcn/ui base (❌ DO NOT EDIT)
│   ├── auth/                  # Authentication components
│   ├── common/                # Shared components
│   ├── dashboard/             # Dashboard components
│   │   ├── shared/table/      # TanStack Table infrastructure
│   │   ├── conversations/
│   │   ├── home/
│   │   ├── locations/
│   │   ├── organizations/
│   │   ├── settings/
│   │   ├── system/
│   │   └── users/
│   ├── onboarding/            # Onboarding components
│   ├── user/                  # User area components
│   └── website/               # Landing page components
│
├── server/
│   ├── actions/               # Server Actions (orchestration)
│   │   ├── clerk/             # User management
│   │   ├── gmb/               # Google My Business
│   │   ├── stripe/            # Payments and subscriptions
│   │   ├── supabase/          # DB operations (via models)
│   │   └── whatsapp/          # WhatsApp messaging
│   └── models/                # Server Models (DB access with Prisma)
│       ├── clerk/
│       ├── gmb/
│       ├── openAI/
│       ├── stripe/
│       ├── supabase/
│       └── whatsapp/
│
├── lib/                       # Utilities and helpers
│   ├── api-helpers.ts
│   ├── auth-helpers.ts
│   ├── constants.ts
│   ├── logger.ts
│   ├── prisma.ts              # Prisma Client singleton
│   └── utils.ts               # General helper functions
│
├── i18n/                      # Next-Intl configuration
│   ├── navigation.ts
│   ├── request.ts
│   └── routing.ts
│
├── messages/                  # Translations
│   ├── en.json                # English
│   └── es.json                # Spanish
│
├── hooks/                     # Custom React Hooks
│   ├── use-debounce.ts
│   └── use-mobile.ts
│
├── prisma/
│   └── schema.prisma          # Database schema
│
├── public/                    # Static assets
│   ├── logo.svg
│   └── whatsapp.svg
│
├── next.config.ts             # Next.js configuration
├── tsconfig.json              # TypeScript configuration
├── tailwind.config.ts         # Tailwind configuration
├── components.json            # shadcn/ui configuration
├── vercel.json                # Vercel configuration (cron jobs)
└── package.json               # Dependencies and scripts
```

---

## 🎯 Main Features

### 1. **Multi-language Landing Page**
- Hero section with WhatsApp CTA
- "How it works" section
- Featured features
- Pricing with Stripe integration
- FAQ
- Footer with legal links

### 2. **Authentication (Clerk)**
- Sign In / Sign Up
- Google OAuth
- Session management
- Route protection

### 3. **Multi-Step Onboarding**
- **Step 0**: Welcome
- **Step 1**: Organization creation
- **Step 2**: Location selection
- **Step 3**: Payment setup (Stripe)
- **Step 4**: Final screen and database synchronization
- Progressive validation and saving

### 4. **Dashboard (Backoffice)**

#### 🏠 Home
- General statistics
- Recent reviews
- Location activity

#### 📍 Locations
- Table with all locations
- GMB synchronization
- Automatic response settings
- Schedule management
- Custom prompt context per location

#### 🏢 Organizations
- Organization CRUD
- Member management
- Tax configuration

#### 👥 Users
- Users table
- Roles and permissions (USER, CLIENT, VISUALIZER, OWNER)
- Onboarding status
- Advanced search and filtering

#### 💬 Conversations (WhatsApp)
- Conversation history
- Real-time chat
- Message management

#### ⚙️ Settings
- Account settings
- Language preferences
- Notification settings

#### 🔧 System (Admin)
- Global configuration (OpenAI models, instructions)
- Pub/Sub logs
- System metrics

### 5. **Review Management**

#### Automatic Flow
1. **Synchronization**: Google Pub/Sub notifies of new review
2. **Processing**: `/api/gmb/fetch-reviews` endpoint gets details
3. **AI Generation**: OpenAI generates response based on:
   - Business context
   - Previous review examples
   - Tone and length settings
   - Custom instructions
4. **Proposal**: Saved as proposed_response
5. **Notification**: WhatsApp notifies the user
6. **Publishing**: User approves/edits and publishes

#### Location-specific Configuration
- **Tone**: Formal, casual, friendly, etc.
- **Length**: Short, medium, long
- **CTA**: Custom call-to-action
- **Emojis**: Enable/disable
- **Language**: Spanish, English, etc.
- **Actions by rating**:
  - 5 stars: Auto-respond / Propose / Don't manage
  - 4 stars: Respond / Propose / Don't manage
  - 3 stars: Respond / Propose / Don't manage
  - 2 stars: Respond / Propose / Don't manage
  - 1 star: Respond / Propose / Don't manage

### 6. **Subscription System (Stripe)**
- Configurable pricing plans
- Integrated checkout
- Webhooks for subscription events
- Payment management
- Subscription change logs

### 7. **WhatsApp Integration**
- New review notifications
- Conversational AI chat
- Message management
- Conversation history

---

## 🗄 Database

### Main Models

#### **users**
- User information
- Roles: USER, CLIENT, VISUALIZER, OWNER
- Onboarding status
- Organization relationship

#### **organizations**
- Business and tax data
- Clerk relationship
- Multiple users

#### **connections**
- External provider connections (Google)
- Access tokens
- Pub/Sub status

#### **locations**
- Google My Business locations
- Business information
- Status (active/inactive)
- Processed reviews counter

#### **prompt_context**
- Response settings per location
- Tone, length, CTA, emojis
- Custom instructions
- Actions per rating

#### **proposed_responses**
- AI-generated responses
- Pending approval
- Response history

#### **example_reviews**
- Example reviews for training
- Used by OpenAI for context

#### **subscriptions**
- Active subscriptions
- Stripe relationship
- Change logs

#### **sessions** & **messages**
- WhatsApp conversations
- Chat history
- Token management

#### **global_config**
- System-wide configuration
- OpenAI models
- Responder instructions
- WhatsApp settings

---

## 🌐 API Routes

### `/api/gmb/fetch-reviews`
- **Method**: POST
- **Description**: Gets GMB reviews and generates responses
- **Trigger**: Pub/Sub or manual

### `/api/gmb/sync-accounts`
- **Method**: POST
- **Description**: Synchronizes GMB accounts and locations
- **Trigger**: Manual from dashboard

### `/api/stripe/webhook`
- **Method**: POST
- **Description**: Receives Stripe events
- **Events**: Subscription created, updated, cancelled, payment

### `/api/responder/reviews`
- **Method**: GET
- **Description**: Cron job to process pending reviews
- **Schedule**: Monday-Friday 14:00 and 22:30 (see `vercel.json`)

### `/api/whatsapp/chat`
- **Method**: POST
- **Description**: WhatsApp Business API webhook
- **Events**: Incoming messages, delivery status

---

## 🌍 Internationalization

The project uses **Next-Intl 5** with support for:
- 🇬🇧 English (`en`)
- 🇪🇸 Spanish (`es`)

### Translation Structure

```json
// messages/en.json
{
  "website": {
    "hero": {
      "title": "Manage your reviews with AI",
      "subtitle": "..."
    }
  },
  "dashboard": {
    "locations": {
      "title": "Locations",
      "table": { ... }
    }
  },
  "onboarding": { ... },
  "auth": { ... }
}
```

### Usage in Components

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

## 🚀 Deployment

### Vercel

1. **Connect repository** in Vercel
2. **Configure environment variables** (see previous section)
3. **Configure database**:
   - Run migrations: `npx prisma migrate deploy`
4. **Automatic deployment** on each push to `main`

### Cron Jobs

Cron jobs are configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/responder/reviews",
      "schedule": "0 14 * * 1-5"  // Mon-Fri 14:00
    },
    {
      "path": "/api/responder/reviews",
      "schedule": "30 22 * * 1-5"  // Mon-Fri 22:30
    }
  ]
}
```

### Webhook Configuration

**Stripe**:
- URL: `https://yourdomain.com/api/stripe/webhook`
- Events: All subscription and payment events

**WhatsApp**:
- URL: `https://yourdomain.com/api/whatsapp/chat`
- Verify Token: (set in `.env`)

**Google Pub/Sub**:
- Push endpoint: `https://yourdomain.com/api/gmb/fetch-reviews`
- Authentication: Service Account

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: your feature description"`
4. Push to the branch: `git push origin feature/your-feature`
5. Submit a pull request

---

## 📄 License

This project is private and is shared for portfolio purposes only.

---

## 📧 Contact

For inquiries about this project, please reach out through GitHub.

---

**Built with ❤️ using Next.js 16, React 19, TypeScript, and modern web technologies.**
