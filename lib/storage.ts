// 稿子数据层：统一的 Store 接口（浏览器侧）。
// 实际读写由服务端 /api/storage 完成（md / 本地 SQLite / MySQL / WebDAV 都在服务器上），
// 浏览器只把「配置 + 稿件」发给自己的服务。写→存→刷新恢复 形成闭环。

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

class ApiStore implements Store {
  constructor(private cfg: DataConfig) {}

  private async call(action: "save" | "load", doc?: ManuscriptDoc) {
    const res = await fetch("/api/storage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, config: this.cfg, doc }),
    });
    if (!res.ok) throw new Error(`存储服务返回 ${res.status}`);
    return (await res.json()) as { ok?: boolean; doc?: ManuscriptDoc; error?: string };
  }

  async load(): Promise<ManuscriptDoc | null> {
    const data = await this.call("load");
    return data.doc ?? null;
  }

  async save(doc: ManuscriptDoc): Promise<void> {
    const data = await this.call("save", doc);
    if (!data || data.ok === false) throw new Error(data?.error || "保存失败");
  }
}

export function getStore(cfg: DataConfig): Store {
  return new ApiStore(cfg);
}
