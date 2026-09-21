"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULTS,
  STORAGE_KEY,
  type EnabledMap,
  type FeatureId,
} from "@/lib/settings-config";
import { SettingsPanel } from "@/components/SettingsPanel";

interface SettingsCtx {
  enabled: EnabledMap;
  setEnabled: (id: FeatureId, v: boolean) => void;
  isEnabled: (id: FeatureId) => boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function useSettings(): SettingsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSettings 必须在 <SettingsProvider> 内使用");
  return c;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<EnabledMap>(DEFAULTS);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<EnabledMap>;
        setEnabledState({ ...DEFAULTS, ...parsed });
      }
    } catch {
      /* 忽略损坏的本地设置 */
    }
    setHydrated(true);
  }, []);

  function setEnabled(id: FeatureId, v: boolean) {
    setEnabledState((prev) => {
      const nextMap: EnabledMap = { ...prev, [id]: v };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMap));
      } catch {
        /* 隐私模式等无法写入时静默 */
      }
      return nextMap;
    });
  }

  return (
    <Ctx.Provider
      value={{
        enabled,
        setEnabled,
        isEnabled: (id) => enabled[id],
        open,
        setOpen,
      }}
    >
      {children}
      <SettingsGear onOpen={() => setOpen(true)} />
      <SettingsPanel
        open={open}
        onClose={() => setOpen(false)}
        enabled={enabled}
        onToggle={setEnabled}
        hydrated={hydrated}
      />
    </Ctx.Provider>
  );
}

function SettingsGear({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="系统设置"
      aria-haspopup="dialog"
      className="fixed bottom-6 left-6 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-ink/10 bg-paper/80 text-ink/60 shadow-paper backdrop-blur transition hover:border-ochre/40 hover:text-ochre"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}
