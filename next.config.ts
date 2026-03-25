/**
 * Next.js Configuration File
 * 
 * This file configures Next.js behavior including:
 * - Internationalization (i18n) via next-intl plugin
 * - Image optimization settings for external domains
 */

import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
      {
        protocol: 'https',
        hostname: 'images.clerk.dev',
      },
    ],
  },
  // Increase timeout for server actions to support OpenAI web search operations
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};
 
const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);