"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

/**
 * CTA Section
 * Final call-to-action banner with gradient background and decorative elements.
 */
export function CtaSection({ whatsappUrl }: { whatsappUrl: string }) {
  const t = useTranslations("website.cta");

  return (
    <section className="relative w-full py-20 sm:py-28 lg:py-36">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl bg-linear-to-br from-primary via-emerald-600 to-emerald-700 px-8 py-16 text-center shadow-2xl sm:px-16 sm:py-20"
        >
          <div className="relative z-10 mx-auto max-w-2xl">
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl lg:text-5xl">
              {t("title")}
            </h2>
            <p className="mb-8 text-base text-primary-foreground/85 sm:text-lg">
              {t("subtitle")}
            </p>

            <Button asChild size="lg" variant="secondary" className="h-14 px-8 text-base font-semibold shadow-xl">
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
                />
                {t("button")}
              </a>
            </Button>
          </div>

          {/* Decorative Elements */}
          <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 rounded-full bg-white/5 blur-3xl" />
        </motion.div>
      </div>
    </section>
  );
}
