"use client";

import { cn } from "@/lib/cn";

export type CompanionKind = "continue" | "polish" | "foreshadow";

const ACTIONS: [CompanionKind, string, string][] = [
  ["continue", "让墨笺续写", "接着你最后一句，往下写一段"],
  ["polish", "替你润色", "不替你改意思，只理顺节奏"],
  ["foreshadow", "找伏笔", "看看哪里藏着能回响的意象"],
];

export function CompanionPanel({
  open,
  onClose,
  onAction,
  streaming,
  response,
  notice,
}: {
  open: boolean;
  onClose: () => void;
  onAction: (kind: CompanionKind) => void;
  streaming: boolean;
  response: string;
  notice: string | null;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 max-h-[82vh] overflow-y-auto rounded-t-3xl border border-white/60 bg-paper/90 p-6 shadow-paper backdrop-blur-xl transition-transform duration-300",
        "lg:static lg:max-h-none lg:rounded-3xl lg:translate-y-0 lg:overflow-visible",
        open ? "translate-y-0" : "translate-y-full lg:translate-y-0",
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-ink/50">搭档</p>
          <h2 className="font-display text-lg text-ink">墨笺</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-full px-3 py-1 text-ink/50 transition hover:bg-ink/5 lg:hidden"
          aria-label="收起搭档面板"
        >
          收起
        </button>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink/60">
        我不是工具，是坐在你身旁、陪你往下写的那个人。
      </p>

      <div className="mt-5 grid gap-2">
        {ACTIONS.map(([kind, label, hint]) => (
          <button
            key={kind}
            disabled={streaming}
            onClick={() => onAction(kind)}
            className="group flex items-center justify-between rounded-2xl border border-ink/10 bg-white/40 px-4 py-3 text-left transition hover:border-ochre/50 hover:bg-ochre/5 disabled:opacity-50"
          >
            <span>
              <span className="block text-ink">{label}</span>
              <span className="block text-xs text-ink/45">{hint}</span>
            </span>
            <span className="text-ink/30 transition group-hover:translate-x-1">→</span>
          </button>
        ))}
      </div>

      {(streaming || response) && (
        <div className="mt-5 min-h-[3rem] rounded-2xl bg-ink/5 p-4 text-[15px] leading-relaxed text-ink/80">
          {streaming && !response ? (
            <span className="inline-flex gap-1.5" aria-label="墨笺思考中">
              <Dot delay="0s" />
              <Dot delay="0.2s" />
              <Dot delay="0.4s" />
            </span>
          ) : (
            response
          )}
        </div>
      )}

      {notice && <p className="mt-4 text-sm text-ochre">{notice}</p>}
    </aside>
  );
}

function Dot({ delay = "0s" }: { delay?: string }) {
  return (
    <span
      className="h-2 w-2 animate-breath rounded-full bg-ochre"
      style={{ animationDelay: delay }}
    />
  );
}
