// 系统设置 · 功能注册表（纯配置，不依赖 React）
// 后续功能只需在此追加一项 FeatureDef，即自动出现在「系统设置」，
// 并自带「是否启用」开关 + 可扩展的子配置表单（支持条件显示 showIf）。

export type FeatureId = "ai" | "data" | "mood";

export type FieldType =
  | "url"
  | "password"
  | "text"
  | "number"
  | "slider"
  | "select"
  | "toggle";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  default: string | number | boolean;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  // 仅当依赖字段等于某值时才显示（用于按保存方式/云端开关展开子配置）
  showIf?: { key: string; value: string | number | boolean };
}

export interface FeatureDef {
  id: FeatureId;
  title: string;
  desc: string;
  group: string;
  defaultEnabled: boolean;
  // 为 false 时不渲染启用开关，功能始终开启（如数据保存是核心能力）
  showToggle?: boolean;
  fields?: FieldDef[];
}

// ---- 各功能的子配置类型 ----

export type SaveMode = "md" | "sqlite" | "mysql";
export type CloudFormat = "md" | "sqlite" | "mysql";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface DataConfig {
  saveMode: SaveMode;
  // Markdown 文件
  mdPath: string;
  // SQLite 文件
  sqlitePath: string;
  // MySQL
  mysqlHost: string;
  mysqlPort: number;
  mysqlUser: string;
  mysqlPassword: string;
  mysqlDatabase: string;
  // 云端 WebDAV
  cloudEnabled: boolean;
  webdavUrl: string;
  webdavUser: string;
  webdavPassword: string;
  webdavFormat: CloudFormat;
  webdavRemoteDir: string;
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
    desc: "稿子保存方式：Markdown 文件 / 本地 SQLite / MySQL（自动建库建表）；并可开启 WebDAV 云端压缩同步。所有存储都在你的部署服务器上完成。",
    group: "数据与同步",
    defaultEnabled: true,
    showToggle: false,
    fields: [
      {
        key: "saveMode",
        label: "保存方式",
        type: "select",
        default: "md",
        options: [
          { value: "md", label: "Markdown 文件（服务器本地）" },
          { value: "sqlite", label: "本地 SQLite 数据库" },
          { value: "mysql", label: "MySQL 数据库（自动建库建表）" },
        ],
        hint: "凭据仅发往你自己的服务，不会离开服务器",
      },
      {
        key: "mdPath",
        label: "Markdown 文件路径",
        type: "text",
        default: "/opt/novel-ai-next/data/novel.md",
        placeholder: "/opt/novel-ai-next/data/novel.md",
        showIf: { key: "saveMode", value: "md" },
      },
      {
        key: "sqlitePath",
        label: "SQLite 文件路径",
        type: "text",
        default: "/opt/novel-ai-next/data/novel.db",
        placeholder: "/opt/novel-ai-next/data/novel.db",
        showIf: { key: "saveMode", value: "sqlite" },
      },
      {
        key: "mysqlHost",
        label: "MySQL 主机",
        type: "text",
        default: "127.0.0.1",
        showIf: { key: "saveMode", value: "mysql" },
      },
      {
        key: "mysqlPort",
        label: "MySQL 端口",
        type: "number",
        default: 3306,
        min: 1,
        max: 65535,
        showIf: { key: "saveMode", value: "mysql" },
      },
      {
        key: "mysqlUser",
        label: "MySQL 用户",
        type: "text",
        default: "root",
        showIf: { key: "saveMode", value: "mysql" },
      },
      {
        key: "mysqlPassword",
        label: "MySQL 密码",
        type: "password",
        default: "",
        showIf: { key: "saveMode", value: "mysql" },
      },
      {
        key: "mysqlDatabase",
        label: "数据库名（连接成功自动创建）",
        type: "text",
        default: "novel",
        showIf: { key: "saveMode", value: "mysql" },
      },
      {
        key: "cloudEnabled",
        label: "开启 WebDAV 云端同步",
        type: "toggle",
        default: false,
      },
      {
        key: "webdavUrl",
        label: "WebDAV 地址",
        type: "url",
        default: "",
        placeholder: "https://dav.example.com/remote.php/dav/files/me/",
        showIf: { key: "cloudEnabled", value: true },
        hint: "末尾带 / 的完整目录地址",
      },
      {
        key: "webdavUser",
        label: "WebDAV 用户名",
        type: "text",
        default: "",
        showIf: { key: "cloudEnabled", value: true },
      },
      {
        key: "webdavPassword",
        label: "WebDAV 密码",
        type: "password",
        default: "",
        showIf: { key: "cloudEnabled", value: true },
      },
      {
        key: "webdavFormat",
        label: "云端备份格式",
        type: "select",
        default: "md",
        options: [
          { value: "md", label: "Markdown 压缩" },
          { value: "sqlite", label: "SQLite 数据文本压缩" },
          { value: "mysql", label: "MySQL 导出 SQL 压缩" },
        ],
        showIf: { key: "cloudEnabled", value: true },
      },
      {
        key: "webdavRemoteDir",
        label: "云端目录",
        type: "text",
        default: "/novel-ai",
        placeholder: "/novel-ai",
        showIf: { key: "cloudEnabled", value: true },
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
  config: Record<FeatureId, Record<string, string | number | boolean>>;
}

export const STORAGE_KEY = "mojian.settings.v2";

export function defaultSettings(): SettingsState {
  const enabled = {} as Record<FeatureId, boolean>;
  const config = {} as Record<FeatureId, Record<string, string | number | boolean>>;
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
): Record<string, string | number | boolean> {
  const def = FEATURES.find((f) => f.id === id);
  const base: Record<string, string | number | boolean> = {};
  for (const field of def?.fields ?? []) base[field.key] = field.default;
  return { ...base, ...(state.config[id] ?? {}) };
}
