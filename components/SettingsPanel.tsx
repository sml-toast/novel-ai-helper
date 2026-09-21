"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import {
  FEATURES,
  type FeatureId,
  type SettingsState,
} from "@/lib/settings-config";
import { Toggle } from "@/components/Toggle";
import { SettingsField } from "@/components/SettingsField";

export function SettingsPanel({
  open,
  onClose,
  state,
  onToggle,
  onConfigChange,
  hydrated,
}: {
  open: boolean;
  onClose: () => void;
  state: SettingsState;
  onToggle: (id: FeatureId, v: boolean) => void;
  onConfigChange: (id: FeatureId, key: string, value: string | number) => void;
  hydrated: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const groups = FEATURES.reduce<Record<string, typeof FEATURES>>((acc, f) => {
    (acc[f.group] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="系统设置"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "fixed inset-0 z-50",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          "absolute inset-0 bg-ink/30 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <aside
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col rounded-t-3xl border border-white/60 bg-paper/95 p-6 shadow-paper backdrop-blur-xl transition-transform duration-300",
          "md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-3xl",
          open ? "translate-y-0" : "translate-y-full md:translate-x-full md:translate-y-0",
        )}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ink/50">系统</p>
            <h2 className="font-display text-lg text-ink">设置</h2>
          </div>
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            className="rounded-full px-3 py-1 text-ink/50 transition hover:bg-ink/5"
            aria-label="关闭设置"
          >
            收起
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-6 overflow-y-auto">
          {Object.entries(groups).map(([group, items]) => (
            <section key={group}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-ink/40">
                {group}
              </h3>
              <div className="space-y-3">
                {items.map((f) => {
                  const on = hydrated ? state.enabled[f.id] : f.defaultEnabled;
                  const cfg = state.config[f.id] ?? {};
                  return (
                    <div
                      key={f.id}
                      className="rounded-2xl border border-ink/10 bg-white/40 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-ink">{f.title}</p>
                          <p className="text-xs text-ink/45">{f.desc}</p>
                        </div>
                        <Toggle
                          label={f.title}
                          checked={on}
                          onChange={(v) => onToggle(f.id, v)}
                        />
                      </div>

                      {on && f.fields && (
                        <div className="mt-4 space-y-4 border-t border-ink/10 pt-4">
                          {f.fields.map((field) => (
                            <SettingsField
                              key={field.key}
                              field={field}
                              value={cfg[field.key] ?? field.default}
                              onChange={(v) => onConfigChange(f.id, field.key, v)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-ink/40">
          设置自动保存在本机浏览器
        </p>
      </aside>
    </div>
  );
}
