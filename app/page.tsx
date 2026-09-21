"use client";

import { useEffect, useRef, useState } from "react";
import { ManuscriptEditor } from "@/components/ManuscriptEditor";
import { CompanionPanel, type CompanionKind } from "@/components/CompanionPanel";
import { SaveToast } from "@/components/SaveToast";
import { useSettings } from "@/lib/settings";
import { detectMood, moodHue, moodLabel } from "@/lib/mood";
import { streamAi } from "@/lib/ai-client";
import { getStore, type ManuscriptDoc } from "@/lib/storage";
import type { AiConfig, DataConfig, MoodConfig } from "@/lib/settings-config";

const SEED =
  "雨落了一整夜。她坐在窗边，想起很多年前那个同样潮湿的春天——那时他们还相信，所有的离别都只是暂时的。";

const CONTINUATIONS = [
  "窗外的灯火一盏盏熄灭，只剩下她和他们之间，那句始终没有说出口的话。",
  "风穿过长廊，把旧照片吹得轻轻翻动，像在替谁翻找一段不愿遗忘的时光。",
  "他留下的那本书还摊在桌上，某一页被折了角，仿佛命运也曾在那里犹豫。",
];

export default function Page() {
  const [text, setText] = useState(SEED);
  const [title, setTitle] = useState("未命名");
  const [mood, setMood] = useState(detectMood(SEED));
  const [panelOpen, setPanelOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [response, setResponse] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const createdAtRef = useRef<number>(Date.now());

  const { isEnabled, getConfig, hydrated } = useSettings();
  const aiEnabled = isEnabled("ai");
  const moodEnabled = isEnabled("mood");
  const moodCfg = getConfig<MoodConfig>("mood");
  const moodIntensity = moodEnabled ? Number(moodCfg.intensity) : 0;
  const aiCfg = getConfig("ai") as AiConfig;
  const aiKeyMissing = aiEnabled && !String(aiCfg.apiKey).trim();

  // 情绪光：色相随正文关键词渐变；强度随设置
  useEffect(() => {
    const m = detectMood(text);
    setMood(m);
    document.documentElement.style.setProperty("--mood-h", String(moodHue(m)));
    document.documentElement.style.setProperty("--mood-intensity", String(moodIntensity));
  }, [text, moodIntensity]);

  // 初次加载（水合完成后），从数据层恢复上次稿子
  useEffect(() => {
    if (!hydrated || loaded) return;
    const cfg = getConfig<DataConfig>("data");
    getStore(cfg)
      .load()
      .then((doc: ManuscriptDoc | null) => {
        if (doc) {
          setText(doc.content);
          setTitle(doc.title || "未命名");
          createdAtRef.current = doc.createdAt ?? Date.now();
        }
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, loaded]);

  // 自动保存（防抖，静默）—— 写→存 闭环
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      const cfg = getConfig<DataConfig>("data");
      const doc: ManuscriptDoc = {
        id: "main",
        title,
        content: text,
        createdAt: createdAtRef.current,
        updatedAt: Date.now(),
      };
      getStore(cfg).save(doc).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, title, loaded]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (thinkTimer.current) clearTimeout(thinkTimer.current);
      if (tickTimer.current) clearInterval(tickTimer.current);
    };
  }, []);

  function triggerSave() {
    setSaved(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaved(false), 2000);
  }

  function onText(v: string) {
    setText(v);
  }

  function saveNow() {
    const cfg = getConfig<DataConfig>("data");
    const doc: ManuscriptDoc = {
      id: "main",
      title,
      content: text,
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
    };
    getStore(cfg)
      .save(doc)
      .then(() => triggerSave())
      .catch(() => triggerSave());
  }

  // 本地演示模式：无 AI Key 或调用失败时的兜底
  function localAction(kind: CompanionKind) {
    if (!text.trim()) {
      setNotice("先写几句，墨笺才知道该陪你往哪走。");
      return;
    }
    setNotice(null);
    setStreaming(true);
    setResponse("");

    const phrase =
      kind === "continue"
        ? CONTINUATIONS[Math.floor(Math.random() * CONTINUATIONS.length)]
        : kind === "polish"
          ? "这一段的气息已经很对了，我只替你把节奏理顺——把短句留白，让情绪有落地的空隙。"
          : "我注意到「春天」「离别」像一枚伏笔：若后面让同一个意象在风暴里重现，回响会更深。";

    thinkTimer.current = setTimeout(() => {
      let i = 0;
      tickTimer.current = setInterval(() => {
        i += 1;
        setResponse(phrase.slice(0, i));
        if (i >= phrase.length) {
          if (tickTimer.current) clearInterval(tickTimer.current);
          setStreaming(false);
          if (kind === "continue") setText((t) => t + phrase);
        }
      }, 28);
    }, 700);
  }

  // AI 模式：调用用户自己配置的 OpenAI 兼容服务（流式）
  async function callAi(kind: CompanionKind) {
    const cfg = getConfig<AiConfig>("ai");
    if (!String(cfg.apiKey).trim()) {
      setNotice(
        "墨笺还没有 AI 钥匙：到「系统设置 → AI 设置」填写 API Key 才能启用真实模型。已用本地演示代替。",
      );
      localAction(kind);
      return;
    }
    if (!text.trim()) {
      setNotice("先写几句，墨笺才知道该陪你往哪走。");
      return;
    }
    setNotice(null);
    setStreaming(true);
    setResponse("");
    let full = "";
    try {
      await streamAi(cfg, kind, text, (d) => {
        full += d;
        setResponse(full);
      });
      setStreaming(false);
      if (kind === "continue") setText((t) => t + full);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setNotice(`AI 调用失败（${msg}），已回退本地演示。`);
      localAction(kind);
    }
  }

  function handleAction(kind: CompanionKind) {
    if (streaming) return;
    if (aiEnabled) callAi(kind);
    else localAction(kind);
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 md:px-8">
      {/* 记忆点：随章节情绪渐变的氛围光 */}
      <div
        aria-hidden
        className="mood-glow pointer-events-none fixed inset-0 -z-10"
      />

      <header className="sticky top-0 z-20 -mx-4 mb-5 flex items-center justify-between rounded-2xl border border-white/40 bg-paper/60 px-4 py-3 backdrop-blur-md md:-mx-8 md:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-ink/50">墨笺</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="稿件标题"
            className="w-44 bg-transparent font-display text-xl text-ink outline-none placeholder:text-ink/30 md:w-72 md:text-2xl"
            placeholder="未命名"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-ink/5 px-3 py-1.5 text-sm text-ink/70">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: `hsl(var(--mood-h) 60% 55%)` }}
            />
            此刻 · {moodLabel(mood)}
          </span>
          <button
            onClick={saveNow}
            className="hidden rounded-full border border-ochre/50 px-4 py-1.5 text-sm text-ochre transition hover:bg-ochre/10 md:inline-flex"
          >
            保存
          </button>
          <button
            onClick={() => setPanelOpen(true)}
            className="hidden rounded-full bg-ochre px-4 py-1.5 text-sm font-medium text-paper shadow-paper transition hover:brightness-105 lg:inline-flex"
          >
            墨笺
          </button>
        </div>
      </header>

      <div className="grid flex-1 gap-5 lg:grid-cols-[1fr_340px]">
        <ManuscriptEditor value={text} onChange={onText} />
        <CompanionPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          onAction={handleAction}
          streaming={streaming}
          response={response}
          notice={notice}
          aiEnabled={aiEnabled}
          needsApiKey={!!aiKeyMissing}
        />
      </div>

      {/* 移动端浮动搭档入口 */}
      <button
        onClick={() => setPanelOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-ochre text-2xl text-paper shadow-paper lg:hidden"
        aria-label="打开墨笺"
      >
        墨
      </button>

      <SaveToast show={saved} />
    </main>
  );
}
