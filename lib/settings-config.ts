// 系统设置 · 功能注册表（纯配置，不依赖 React）
// 后续功能只需在此追加一项，即自动出现在「系统设置」并自带「是否启用」开关。

export type FeatureId = "backend" | "ai";

export interface FeatureMeta {
  id: FeatureId;
  title: string;
  desc: string;
  group: string;
}

export const FEATURES: FeatureMeta[] = [
  {
    id: "ai",
    title: "AI 设置",
    desc: "启用墨笺的 AI 能力：续写、润色、找伏笔。",
    group: "创作伴侣",
  },
  {
    id: "backend",
    title: "启用后端",
    desc: "连接本地 node:http + SQLite 服务，开启持久化与同步。",
    group: "数据与同步",
  },
];

export type EnabledMap = Record<FeatureId, boolean>;

export const STORAGE_KEY = "mojian.settings.v1";

export const DEFAULTS: EnabledMap = { ai: false, backend: false };
