"use client";

import { Sparkles, MessageCircle, Zap, Shield, Settings, DollarSign } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";

/**
 * Features Section
 * Six feature cards in a responsive grid highlighting product capabilities.
 */
export function FeaturesSection() {
  const t = useTranslations("website.features");

  const features = [
    { icon: Sparkles, title: t("feature1.title"), description: t("feature1.description") },
    { icon: MessageCircle, title: t("feature2.title"), description: t("feature2.description") },
    { icon: Zap, title: t("feature3.title"), description: t("feature3.description") },
    { icon: Settings, title: t("feature4.title"), description: t("feature4.description") },
    { icon: DollarSign, title: t("feature5.title"), description: t("feature5.description") },
    { icon: Shield, title: t("feature6.title"), description: t("feature6.description") },
  ];

  return (
    <section id="features" className="w-full py-20 sm:py-28 lg:py-36">
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

        {/* Features Grid */}
        <div className="mx-auto mt-16 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-7 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-lg"
              >
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-bold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
