"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * Mode Toggle Component
 * Visual toggle with three theme options: light, dark, and system.
 * Displays as a segmented control similar to iOS style.
 */
export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("common.theme");
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="inline-flex h-10 items-center rounded-full border border-border bg-muted/50 p-1">
        <div className="h-8 w-24" />
      </div>
    );
  }

  const options = [
    { value: "light", icon: Sun, label: t("light") },
    { value: "dark", icon: Moon, label: t("dark") },
    { value: "system", icon: Monitor, label: t("system") },
  ] as const;

  return (
    <div className="inline-flex h-10 items-center gap-0.5 rounded-full border border-border bg-muted/50 p-1">
      {options.map(({ value, icon: Icon, label }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={`
              relative inline-flex h-8 items-center justify-center rounded-full px-3 text-sm font-medium transition-all
              ${
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }
            `}
            aria-label={label}
            title={label}
          >
            <Icon className="h-4 w-4" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
