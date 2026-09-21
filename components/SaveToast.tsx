"use client";

import { cn } from "@/lib/cn";

export function SaveToast({ show }: { show: boolean }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "fixed bottom-6 right-6 z-50 transition-all duration-500",
        show
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <div className="flex items-center gap-2 rounded-full bg-ink/90 px-4 py-2 text-sm text-paper shadow-paper">
        <span className="text-ochre-soft">✓</span>
        已存 · 草稿安然
      </div>
    </div>
  );
}
