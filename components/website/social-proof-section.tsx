"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";

/**
 * Social Proof Section
 * Horizontal stats bar providing trust indicators below the hero.
 */
export function SocialProofSection() {
  const t = useTranslations("website.socialProof");

  const stats = [
    { value: t("stat1.value"), label: t("stat1.label") },
    { value: t("stat2.value"), label: t("stat2.label") },
    { value: t("stat3.value"), label: t("stat3.label") },
    { value: t("stat4.value"), label: t("stat4.label") },
  ];

  return (
    <section className="w-full border-y border-border bg-muted py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-8"
        >
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <p className="text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">
                {stat.value}
              </p>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
