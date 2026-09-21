// 系统设置 · 功能注册表（纯配置，不依赖 React）
// 后续功能只需在此追加一项 FeatureDef，即自动出现在「系统设置」，
// 并自带「是否启用」开关 + 可扩展的子配置表单。

export type FeatureId = "ai" | "data" | "mood";

export type FieldType = "url" | "password" | "text" | "number" | "slider" | "select";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  default: string | number;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
}

export interface FeatureDef {
  id: FeatureId;
  title: string;
  desc: string;
  group: string;
  defaultEnabled: boolean;
  fields?: FieldDef[];
}

// 各功能的子配置默认值集合（供 getConfig 合并 + 类型提示）
export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface DataConfig {
  mode: "local" | "custom";
  customUrl: string;
  token: string;
}

export interface MoodConfig {
  intensity: number;
}

export const FEATURES: FeatureDef[] = [
  {
    id: "ai",
    title: "AI 设置",
    desc: "墨笺的 AI 能力：续写、润色、找伏笔。需填写你自己的模型服务。",
    group: "创作伴侣",
    defaultEnabled: false,
    fields: [
      {
        key: "baseUrl",
        label: "API 地址",
        type: "url",
        default: "https://api.openai.com/v1",
        placeholder: "https://api.openai.com/v1",
        hint: "任何 OpenAI 兼容的 /v1 端点，例如 DeepSeek、通义、本地 Ollama",
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        default: "",
        placeholder: "sk-...",
        hint: "保存在本机浏览器，仅从你的浏览器直连模型服务",
      },
      {
        key: "model",
        label: "模型",
        type: "text",
        default: "gpt-4o-mini",
        placeholder: "gpt-4o-mini",
      },
      {
        key: "temperature",
        label: "温度",
        type: "slider",
        default: 0.8,
        min: 0,
        max: 1,
        step: 0.1,
        hint: "越低越稳，越高越发散",
      },
      {
        key: "maxTokens",
        label: "最大篇幅",
        type: "number",
        default: 800,
        min: 100,
        max: 4000,
        step: 100,
      },
    ],
  },
  {
    id: "data",
    title: "数据保存",
    desc: "稿子的存放方式：默认存本机浏览器，或指向你自己的后端。",
    group: "数据与同步",
    defaultEnabled: true,
    fields: [
      {
        key: "mode",
        label: "存储模式",
        type: "select",
        default: "local",
        options: [
          { value: "local", label: "默认（本机浏览器）" },
          { value: "custom", label: "自定义后端" },
        ],
        hint: "默认数据定义：单篇稿子（标题+正文）存于本机；自定义时按你给的地址存取",
      },
      {
        key: "customUrl",
        label: "后端地址",
        type: "url",
        default: "",
        placeholder: "https://your-backend.example.com",
        hint: "需实现 GET/PUT /manuscript 接口（见文档），留空则用默认",
      },
      {
        key: "token",
        label: "访问令牌",
        type: "password",
        default: "",
        placeholder: "可选",
        hint: "自定义后端鉴权用的 Bearer Token（可选）",
      },
    ],
  },
  {
    id: "mood",
    title: "情绪氛围光",
    desc: "稿纸背景随正文情绪渐变的氛围光（记忆点）。",
    group: "阅读体验",
    defaultEnabled: true,
    fields: [
      {
        key: "intensity",
        label: "光晕强度",
        type: "slider",
        default: 0.4,
        min: 0,
        max: 0.8,
        step: 0.05,
        hint: "0 即关闭氛围光，越往上调越明显",
      },
    ],
  },
];

export interface SettingsState {
  enabled: Record<FeatureId, boolean>;
  config: Record<FeatureId, Record<string, string | number>>;
}

export const STORAGE_KEY = "mojian.settings.v2";

export function defaultSettings(): SettingsState {
  const enabled = {} as Record<FeatureId, boolean>;
  const config = {} as Record<FeatureId, Record<string, string | number>>;
  for (const f of FEATURES) {
    enabled[f.id] = f.defaultEnabled;
    config[f.id] = {};
    for (const field of f.fields ?? []) {
      config[f.id][field.key] = field.default;
    }
  }
  return { enabled, config };
}

// 合并默认值，保证缺失字段也有值（用于读取）
export function mergedConfig(
  state: SettingsState,
  id: FeatureId,
): Record<string, string | number> {
  const def = FEATURES.find((f) => f.id === id);
  const base: Record<string, string | number> = {};
  for (const field of def?.fields ?? []) base[field.key] = field.default;
  return { ...base, ...(state.config[id] ?? {}) };
}
