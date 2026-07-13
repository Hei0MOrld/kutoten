import { validateGenerated } from "../../../lib/validate";

// 使うモデル。速くて安いhaikuを既定に。品質を上げたければ "claude-sonnet-5" などに差し替え。
const MODEL = "claude-haiku-4-5-20251001";

const SPEC = {
  easy: "8〜16文字程度の、日常会話のやさしい文。読点「、」を1つと句点「。」を含める。",
  normal: "16〜30文字程度の、少し長めの文。読点「、」を1〜2つと句点「。」を含める。",
  hard: "15〜35文字程度。「！」か「？」を使うか、二文に分けるなど、やや複雑な文。",
};

function buildPrompt(difficulty, count) {
  return [
    "あなたは日本語の「句読点を打ち直すパズル」の問題文を作る出題者です。",
    `難易度: ${difficulty}`,
    SPEC[difficulty] ?? SPEC.normal,
    "制約:",
    "- 句読点は「、」「。」" + (difficulty === "hard" ? "「！」「？」" : "") + " だけを使う。",
    "- かっこ（「」『』（）【】）・空白・英数字・欧文記号・三点リーダ・中黒は使わない。",
    "- 各文には最低1つの「、」または「。」を、句読点の位置が明確に決まる形で入れる。",
    "- 自然で読みやすい文にする。同じような文の繰り返しは避ける。",
    `${count}文を作り、JSON配列だけを出力してください。前後の説明やコードフェンスは不要です。`,
    '形式: [{"text":"今日は、いい天気ですね。"},{"text":"はい、わかりました。"}]',
  ].join("\n");
}

function extractJsonArray(s) {
  const cleaned = s.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json(
      { error: "NO_KEY", message: "ANTHROPIC_API_KEY が未設定です。.env.local に設定してください。" },
      { status: 500 }
    );
  }

  let body = {};
  try { body = await req.json(); } catch {}
  const difficulty = ["easy", "normal", "hard"].includes(body.difficulty) ? body.difficulty : "normal";
  const count = Math.min(Math.max(Number(body.count) || 6, 1), 10);

  let data;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        // 多めに頼んで検品で落ちる分を吸収
        messages: [{ role: "user", content: buildPrompt(difficulty, count + 3) }],
      }),
    });
    data = await res.json();
    if (!res.ok) {
      return Response.json({ error: "API_ERROR", detail: data }, { status: 502 });
    }
  } catch (e) {
    return Response.json({ error: "FETCH_FAILED", message: String(e) }, { status: 502 });
  }

  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const arr = extractJsonArray(text);
  if (!Array.isArray(arr)) {
    return Response.json({ error: "PARSE_FAILED", raw: text }, { status: 502 });
  }

  const problems = [];
  const seen = new Set();
  for (const item of arr) {
    const p = validateGenerated(item && item.text, difficulty);
    if (p && !seen.has(p.text)) {
      seen.add(p.text);
      problems.push(p);
    }
    if (problems.length >= count) break;
  }

  return Response.json({ problems, difficulty });
}
