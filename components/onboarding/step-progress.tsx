"use client";

import { cn } from "@/lib/utils";

interface StepProgressProps {
  current: number; // 1-based
  total: number;
  title: string;
  subtitle?: string;
}

export function StepProgress({ current, total, title, subtitle }: StepProgressProps) {
  const clampedCurrent = Math.min(Math.max(current, 1), total);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
      </div>
      
      {/* Progress dots */}
      <div className="flex items-center justify-center space-x-4">
        {Array.from({ length: total }, (_, i) => {
          const stepNumber = i + 1;
          const isActive = stepNumber === clampedCurrent;
          const isCompleted = stepNumber < clampedCurrent;
          
          return (
            <div key={stepNumber} className="flex items-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  isActive && "bg-[var(--active)] text-[var(--active-foreground)]",
                  isCompleted && "bg-[var(--active)]/20 text-[var(--active)]",
                  !isActive && !isCompleted && "bg-muted text-muted-foreground"
                )}
              >
                {stepNumber}
              </div>
              {stepNumber < total && (
                <div
                  className={cn(
                    "mx-2 h-0.5 w-8 transition-colors",
                    isCompleted ? "bg-[var(--active)]" : "bg-muted"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      
      {subtitle && (
        <p className="text-center text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}


