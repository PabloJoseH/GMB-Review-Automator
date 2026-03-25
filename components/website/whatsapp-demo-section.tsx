"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { MessageCircle } from "lucide-react";

/**
 * WhatsApp Demo Section
 * Simulated WhatsApp conversation showcasing the product experience.
 * Renders a phone-shaped container with styled chat bubbles.
 * Gradient accent background with visual depth.
 */
export function WhatsAppDemoSection() {
  const t = useTranslations("website.whatsappDemo");

  const messages: Array<{ text: string; isUser: boolean }> = [
    { text: t("msg1"), isUser: true },
    { text: t("msg2"), isUser: false },
    { text: t("msg3"), isUser: true },
    { text: t("msg4"), isUser: false },
    { text: t("msg5"), isUser: true },
    { text: t("msg6"), isUser: false },
  ];

  return (
    <section className="relative w-full overflow-hidden bg-muted py-20 sm:py-28 lg:py-36">
      {/* Decorative gradient accent */}
      <div className="pointer-events-none absolute -left-20 top-1/2 h-60 w-60 -translate-y-1/2 rounded-full bg-primary/8 blur-[100px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              {t("title")}
            </h2>
            <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("subtitle")}
            </p>
          </motion.div>

          {/* Phone Mockup */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex justify-center lg:justify-end"
          >
            <div className="w-full max-w-sm">
              {/* Phone Frame */}
              <div className="overflow-hidden rounded-3xl border border-border/60 bg-background shadow-2xl ring-1 ring-black/5 dark:ring-white/5">
                {/* Chat Header */}
                <div className="flex items-center gap-3 bg-linear-to-r from-emerald-600 to-emerald-500 px-4 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                    <MessageCircle className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t("ai")}</p>
                    <p className="text-xs text-white/70">Online</p>
                  </div>
                </div>

                {/* Chat Body */}
                <div className="flex flex-col gap-3 bg-[#efeae2] px-3 py-4 dark:bg-muted/40" style={{ minHeight: "420px" }}>
                  {messages.map((msg, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: 0.3 + index * 0.15 }}
                      className={`flex ${msg.isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                          msg.isUser
                            ? "rounded-br-md bg-emerald-100 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-50"
                            : "rounded-bl-md bg-white text-gray-900 dark:bg-card dark:text-card-foreground"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
