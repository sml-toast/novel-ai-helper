import { NextRequest, NextResponse } from "next/server";
import { saveDoc, loadDoc } from "@/lib/server/storage-backends";
import type { ManuscriptDoc } from "@/lib/storage";
import type { DataConfig } from "@/lib/settings-config";

// 存储后端需要读写文件系统 / 连数据库，必须在 Node 运行时执行
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  action: "save" | "load";
  config: DataConfig;
  doc?: ManuscriptDoc;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const { action, config, doc } = body;
    if (!config || !config.saveMode) {
      return NextResponse.json({ ok: false, error: "缺少存储配置" }, { status: 400 });
    }
    if (action === "save") {
      if (!doc) return NextResponse.json({ ok: false, error: "缺少稿件内容" }, { status: 400 });
      const r = await saveDoc(config, doc);
      return NextResponse.json(r);
    }
    if (action === "load") {
      const d = await loadDoc(config);
      return NextResponse.json({ ok: true, doc: d });
    }
    return NextResponse.json({ ok: false, error: "未知 action" }, { status: 400 });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
