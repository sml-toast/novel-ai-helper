// 稿子数据层：统一的 Store 接口。
// 默认实现 = 本机浏览器（默认数据定义：单篇稿子 标题+正文+时间戳）；
// 自定义后端 = 按用户给的地址做 GET/PUT /manuscript 的 REST 适配器。
// 写→存→刷新恢复 形成闭环，且不依赖任何被放弃的旧代码。

import type { DataConfig } from "@/lib/settings-config";

export interface ManuscriptDoc {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface Store {
  load(): Promise<ManuscriptDoc | null>;
  save(doc: ManuscriptDoc): Promise<void>;
}

const LOCAL_KEY = "mojian.manuscript.v1";

class LocalStore implements Store {
  async load(): Promise<ManuscriptDoc | null> {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? (JSON.parse(raw) as ManuscriptDoc) : null;
    } catch {
      return null;
    }
  }
  async save(doc: ManuscriptDoc): Promise<void> {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(doc));
    } catch {
      /* 隐私模式等无法写入时静默 */
    }
  }
}

class RemoteStore implements Store {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  private endpoint() {
    return this.baseUrl.replace(/\/+$/, "") + "/manuscript";
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.token) h["authorization"] = `Bearer ${this.token}`;
    return h;
  }

  async load(): Promise<ManuscriptDoc | null> {
    try {
      const res = await fetch(this.endpoint(), { headers: this.headers() });
      if (!res.ok) return null;
      return (await res.json()) as ManuscriptDoc;
    } catch {
      return null;
    }
  }

  async save(doc: ManuscriptDoc): Promise<void> {
    const res = await fetch(this.endpoint(), {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(doc),
    });
    if (!res.ok) throw new Error(`后端返回 ${res.status}`);
  }
}

export function getStore(cfg: DataConfig): Store {
  if (cfg.mode === "custom" && cfg.customUrl.trim()) {
    return new RemoteStore(cfg.customUrl.trim(), cfg.token.trim());
  }
  return new LocalStore();
}
