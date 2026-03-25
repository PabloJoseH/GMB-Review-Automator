"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";

/**
 * Review Impact Section
 * Dark-accent section with large statistics and gradient text.
 * High-contrast design to create visual rhythm between sections.
 */
export function ReviewImpactSection() {
  const t = useTranslations("website.reviewImpact");

  const stats = [
    { value: t("stat1.value"), description: t("stat1.description") },
    { value: t("stat2.value"), description: t("stat2.description") },
    { value: t("stat3.value"), description: t("stat3.description") },
  ];

  return (
    <section className="relative w-full overflow-hidden bg-foreground py-20 sm:py-28 lg:py-36 dark:bg-card">
      {/* Decorative gradient orb */}
      <div className="pointer-events-none absolute -right-40 -top-40 h-80 w-80 rounded-full bg-primary/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/15 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-background sm:text-4xl lg:text-5xl dark:text-foreground">
            {t("title")}
          </h2>
          <p className="text-base text-background/70 sm:text-lg dark:text-muted-foreground">{t("subtitle")}</p>
        </motion.div>

        {/* Stats */}
        <div className="mx-auto mt-16 grid max-w-5xl gap-8 md:grid-cols-3">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className="rounded-2xl border border-background/10 bg-background/5 p-8 text-center backdrop-blur-sm dark:border-border/30 dark:bg-muted/30"
            >
              <p className="mb-3 bg-linear-to-br from-primary to-emerald-400 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent sm:text-6xl">
                {stat.value}
              </p>
              <p className="text-sm leading-relaxed text-background/70 sm:text-base dark:text-muted-foreground">
                {stat.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Source */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-8 text-center text-xs text-background/40 dark:text-muted-foreground/50"
        >
          {t("source")}
        </motion.p>
      </div>
    </section>
  );
}
