"use client";

import { Check, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

/**
 * Pricing Section
 * Single-tier pricing card with feature list and CTA.
 */
export function PricingSection({ whatsappUrl }: { whatsappUrl: string }) {
  const t = useTranslations("website.pricing");

  const features = [
    t("feature1"),
    t("feature2"),
    t("feature3"),
    t("feature4"),
    t("feature5"),
    t("feature6"),
  ];

  return (
    <section id="pricing" className="w-full py-20 sm:py-28 lg:py-36">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            {t("title")}
          </h2>
          <p className="text-base text-muted-foreground sm:text-lg">{t("subtitle")}</p>
        </motion.div>

        {/* Pricing Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mx-auto mt-16 max-w-lg"
        >
          <div className="relative overflow-hidden rounded-3xl border-2 border-primary/40 bg-linear-to-br from-background to-muted/20 p-8 shadow-2xl shadow-primary/5 sm:p-10">
            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-primary/15 px-4 py-2 text-sm font-semibold text-primary">
              <MessageCircle className="h-4 w-4" />
              {t("badge")}
            </div>

            {/* Price */}
            <div className="mb-8">
              <div className="flex items-baseline gap-1">
                <span className="bg-linear-to-br from-foreground to-foreground/60 bg-clip-text text-6xl font-extrabold tracking-tight text-transparent sm:text-7xl">
                  {t("price")}
                </span>
              </div>
              <p className="mt-2 text-base text-muted-foreground">{t("period")}</p>
            </div>

            {/* Features */}
            <ul className="mb-8 space-y-3.5">
              {features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Button asChild size="lg" className="h-14 w-full text-base shadow-lg shadow-primary/20">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2"
              >
                <Image
                  src="/whatsapp.svg"
                  alt="WhatsApp"
                  width={20}
                  height={20}
                  className="brightness-0 invert"
                />
                {t("cta")}
              </a>
            </Button>

            {/* Guarantee */}
            <p className="mt-4 text-center text-xs text-muted-foreground/70">
              {t("guarantee")}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
