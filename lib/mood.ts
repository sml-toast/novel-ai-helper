export type Mood = "warm" | "calm" | "tense" | "pensive" | "neutral";

// 用中文关键词推断章节情绪（轻量、离线、可解释）
const LEXICON: Record<Mood, string[]> = {
  warm: ["笑", "光", "暖", "家", "爱", "春", "温柔", "希望", "暖阳", "甜", "拥抱", "花"],
  calm: ["夜", "雨", "眠", "深", "静", "海", "慢", "安", "星", "风", "湖", "雾"],
  tense: ["逃", "战", "血", "暗", "杀", "惧", "危", "雷", "火", "痛", "慌", "裂"],
  pensive: ["想", "忆", "旧", "梦", "思", "忧", "念", "逝", "孤", "沉默", "远方", "从前"],
  neutral: ["的", "了", "是", "在", "他", "她", "我", "你", "说", "看", "走", "去"],
};

const HUE: Record<Mood, number> = {
  warm: 28,
  calm: 205,
  tense: 6,
  pensive: 268,
  neutral: 38,
};

const LABEL: Record<Mood, string> = {
  warm: "暖",
  calm: "静",
  tense: "紧",
  pensive: "思",
  neutral: "平",
};

export function detectMood(text: string): Mood {
  let best: Mood = "neutral";
  let bestScore = 0;
  (Object.keys(LEXICON) as Mood[]).forEach((m) => {
    const score = LEXICON[m].reduce(
      (acc, w) => acc + (text.split(w).length - 1),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  });
  return best;
}

export const moodHue = (m: Mood) => HUE[m];
export const moodLabel = (m: Mood) => LABEL[m];
