"use client";

import Image from "next/image";
import { ArrowRight, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

/**
 * Hero Section
 * Full-viewport landing with animated mesh gradient background,
 * floating star accents, headline, CTAs, and trial notice.
 */
export function HeroSection({ whatsappUrl }: { whatsappUrl: string }) {
  const t = useTranslations("website.hero");

  return (
    <section className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-background">
      {/* Animated mesh gradient background */}
      <div className="pointer-events-none absolute inset-0">
        {/* Radial center glow */}
        <div
          className="absolute left-1/2 top-1/2 h-[80vh] w-[80vh] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.65 0.2 150 / 0.12) 0%, oklch(0.6 0.15 170 / 0.06) 40%, transparent 70%)",
          }}
        />

        {/* Blob 1 - Large emerald, top-left */}
        <div
          className="hero-blob-1 absolute -left-[10%] -top-[10%] h-[55vh] w-[55vh] rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.65 0.22 150 / 0.30) 0%, oklch(0.65 0.22 150 / 0.10) 50%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />

        {/* Blob 2 - Teal, right side */}
        <div
          className="hero-blob-2 absolute -right-[5%] top-[15%] h-[50vh] w-[50vh] rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.55 0.15 180 / 0.25) 0%, oklch(0.55 0.15 180 / 0.08) 50%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />

        {/* Blob 3 - Warm green, bottom-center */}
        <div
          className="hero-blob-3 absolute bottom-[5%] left-[25%] h-[45vh] w-[45vh] rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.70 0.18 140 / 0.22) 0%, oklch(0.70 0.18 140 / 0.06) 50%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />

        {/* Floating star accents */}
        <div
          className="hero-float-1 absolute left-[12%] top-[18%] text-primary/20"
        >
          <Star className="h-6 w-6 fill-current" />
        </div>
        <div
          className="hero-float-2 absolute right-[18%] top-[25%] text-primary/15"
        >
          <Star className="h-4 w-4 fill-current" />
        </div>
        <div
          className="hero-float-3 absolute bottom-[22%] left-[8%] text-primary/10"
        >
          <Star className="h-5 w-5 fill-current" />
        </div>
        <div
          className="hero-float-1 absolute bottom-[30%] right-[12%] text-primary/15"
        >
          <Star className="h-3.5 w-3.5 fill-current" />
        </div>
        <div
          className="hero-float-2 absolute right-[30%] top-[12%] text-primary/10"
        >
          <Star className="h-5 w-5 fill-current" />
        </div>

        {/* Pulse rings */}
        <div
          className="hero-pulse-ring absolute left-1/2 top-1/2 h-[50vh] w-[50vh] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15"
        />
        <div
          className="hero-pulse-ring-delayed absolute left-1/2 top-1/2 h-[70vh] w-[70vh] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/8"
        />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(0.5 0.02 270 / 0.5) 1px, transparent 1px), linear-gradient(90deg, oklch(0.5 0.02 270 / 0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Bottom fade to background */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-background to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary backdrop-blur-sm"
          >
            <Star className="h-3.5 w-3.5 fill-primary" />
            <span>{t("badge")}</span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6 bg-linear-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl lg:text-7xl"
          >
            {t("title")}
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg lg:text-xl"
          >
            {t("description")}
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <Button asChild size="lg" className="h-14 px-8 text-base shadow-lg shadow-primary/25">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2"
              >
                <Image
                  src="/whatsapp.svg"
                  alt="WhatsApp"
                  width={22}
                  height={22}
                  className="brightness-0 invert"
                />
                {t("cta")}
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-14 px-8 text-base backdrop-blur-sm">
              <a href="#how-it-works" className="inline-flex items-center gap-2">
                {t("ctaSecondary")}
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </motion.div>

          {/* Trial notice */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-5 text-sm font-medium text-primary/80"
          >
            {t("trial")}
          </motion.p>
        </div>
      </div>
    </section>
  );
}
