"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  defaultSettings,
  mergedConfig,
  STORAGE_KEY,
  type FeatureId,
  type SettingsState,
} from "@/lib/settings-config";
import { SettingsPanel } from "@/components/SettingsPanel";

interface SettingsCtx {
  enabled: Record<FeatureId, boolean>;
  isEnabled: (id: FeatureId) => boolean;
  setEnabled: (id: FeatureId, v: boolean) => void;
  getConfig: <T = Record<string, string | number>>(id: FeatureId) => T;
  setConfigValue: (id: FeatureId, key: string, value: string | number) => void;
  hydrated: boolean;
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
  const [state, setState] = useState<SettingsState>(defaultSettings);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SettingsState>;
        const base = defaultSettings();
        setState({
          enabled: { ...base.enabled, ...(parsed.enabled ?? {}) },
          config: { ...base.config, ...(parsed.config ?? {}) },
        });
      }
    } catch {
      /* 忽略损坏的本地设置 */
    }
    setHydrated(true);
  }, []);

  function persist(next: SettingsState) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式等无法写入时静默 */
    }
  }

  function setEnabled(id: FeatureId, v: boolean) {
    setState((prev) => {
      const next: SettingsState = {
        ...prev,
        enabled: { ...prev.enabled, [id]: v },
      };
      persist(next);
      return next;
    });
  }

  function setConfigValue(id: FeatureId, key: string, value: string | number) {
    setState((prev) => {
      const next: SettingsState = {
        ...prev,
        config: {
          ...prev.config,
          [id]: { ...prev.config[id], [key]: value },
        },
      };
      persist(next);
      return next;
    });
  }

  return (
    <Ctx.Provider
      value={{
        enabled: state.enabled,
        isEnabled: (id) => state.enabled[id],
        setEnabled,
        getConfig: (<T = Record<string, string | number>>(id: FeatureId) =>
          mergedConfig(state, id) as unknown as T),
        setConfigValue,
        hydrated,
        open,
        setOpen,
      }}
    >
      {children}
      <SettingsGear onOpen={() => setOpen(true)} />
      <SettingsPanel
        open={open}
        onClose={() => setOpen(false)}
        state={state}
        onToggle={setEnabled}
        onConfigChange={setConfigValue}
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
