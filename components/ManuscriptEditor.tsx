"use client";

import { cn } from "@/lib/cn";

export function ManuscriptEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <section
      className={cn(
        "flex min-h-[60vh] flex-col rounded-3xl border border-white/50 bg-paper/80 p-2 shadow-paper backdrop-blur-sm",
      )}
    >
      <div className="flex items-center justify-between px-5 pt-4 text-xs uppercase tracking-[0.3em] text-ink/40">
        <span>稿纸</span>
        <span>{value.length} 字</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="在此落笔……文字是你的，墨笺只是陪你写的人。"
        aria-label="稿纸"
        className="h-full w-full flex-1 resize-none bg-transparent p-6 pt-4 text-[18px] leading-[2.0] text-ink outline-none placeholder:text-ink/30 md:p-10 md:text-[20px]"
      />
    </section>
  );
}
