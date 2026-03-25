"use client";

import { MessageCircle, Link2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";

/**
 * How It Works Section
 * Three-step process with numbered cards, dot pattern accent background.
 */
export function HowItWorksSection() {
  const t = useTranslations("website.howItWorks");

  const steps = [
    { icon: MessageCircle, title: t("step1.title"), description: t("step1.description") },
    { icon: Link2, title: t("step2.title"), description: t("step2.description") },
    { icon: Sparkles, title: t("step3.title"), description: t("step3.description") },
  ];

  return (
    <section id="how-it-works" className="bg-dot-pattern relative w-full py-20 sm:py-28 lg:py-36">
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

        {/* Steps */}
        <div className="mx-auto mt-16 grid max-w-5xl gap-8 md:grid-cols-3 lg:mt-20 lg:gap-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className="relative"
              >
                {/* Number Badge */}
                <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-linear-to-br from-primary to-primary/80 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20">
                  {index + 1}
                </div>

                {/* Card */}
                <div className="group rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-md">
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-300 group-hover:scale-110">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>

                {/* Connector */}
                {index < steps.length - 1 && (
                  <div className="absolute -right-4 top-6 hidden h-0.5 w-8 bg-linear-to-r from-primary/40 to-transparent md:block lg:-right-6 lg:w-12" />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
