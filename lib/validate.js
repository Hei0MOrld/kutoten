import { parse, PUNCT } from "./problems";

// 難易度ごとに使ってよい句読点
const ALLOWED_BY_DIFF = {
  easy: new Set(["、", "。"]),
  normal: new Set(["、", "。"]),
  hard: new Set(["、", "。", "！", "？"]),
};

// 文に混ざっていたらNGにする文字（空白・英数字・かっこ・欧文記号など）
const BANNED = /[\s0-9A-Za-zＡ-Ｚａ-ｚ０-９,\.!\?，．：；「」『』（）\(\)【】…—・]/;

// 生成された1文を検品。OKなら問題オブジェクト、NGなら null。
export function validateGenerated(text, difficulty = "normal") {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (t.length < 4 || t.length > 60) return null;
  if (BANNED.test(t)) return null;

  const allowed = ALLOWED_BY_DIFF[difficulty] ?? ALLOWED_BY_DIFF.normal;
  // 難易度で許していない句読点が入っていたら弾く
  for (const ch of t) {
    if (PUNCT.has(ch) && !allowed.has(ch)) return null;
  }

  const { base, total } = parse(t);
  if (total < 1) return null;               // 句読点ゼロは問題にならない
  if (base.length < 3) return null;          // 短すぎ
  if (base.some((c) => PUNCT.has(c))) return null; // 念のため

  return {
    id: "gen-" + Math.random().toString(36).slice(2, 8),
    text: t,
    source: "generated",
  };
}
