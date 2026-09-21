"use client";

import { cn } from "@/lib/cn";
import { Toggle } from "@/components/Toggle";
import type { FieldDef } from "@/lib/settings-config";

export function SettingsField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  const id = `field-${field.key}`;

  if (field.type === "toggle") {
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-sm text-ink">{field.label}</span>
          {field.hint && <p className="mt-0.5 text-xs text-ink/40">{field.hint}</p>}
        </div>
        <Toggle
          label={field.label}
          checked={Boolean(value)}
          onChange={(v) => onChange(v)}
        />
      </div>
    );
  }

  return (
    <label htmlFor={id} className="block">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink">{field.label}</span>
        {field.type === "slider" && (
          <span className="text-xs tabular-nums text-ink/45">
            {typeof value === "number" ? value.toFixed(2) : value}
          </span>
        )}
      </div>
      <div className="mt-1.5">
        {field.type === "slider" ? (
          <input
            id={id}
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 1}
            step={field.step ?? 0.1}
            value={Number(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink/15 accent-ochre"
          />
        ) : field.type === "select" ? (
          <select
            id={id}
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-xl border border-ink/15 bg-white/60 px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ochre/50"
          >
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
            inputMode={field.type === "url" ? "url" : field.type === "number" ? "numeric" : "text"}
            value={String(value)}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(e) =>
              onChange(
                field.type === "number" ? Number(e.target.value) : e.target.value,
              )
            }
            className={cn(
              "w-full rounded-xl border border-ink/15 bg-white/60 px-3 py-2 text-sm text-ink outline-none",
              "focus-visible:ring-2 focus-visible:ring-ochre/50",
              field.type === "password" && "font-mono",
            )}
          />
        )}
      </div>
      {field.hint && <p className="mt-1 text-xs text-ink/40">{field.hint}</p>}
    </label>
  );
}
