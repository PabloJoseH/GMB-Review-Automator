/**
 * @fileoverview Prisma CLI configuration.
 *
 * @remarks
 * Defines schema and migrations paths and provides the datasource URL
 * for Prisma CLI operations.
 *
 * @exports default
 */
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})

