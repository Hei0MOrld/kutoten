// 句読点の「理由」＋「あなたの誤答だとこう変わる」をオンデマンドで解説する。
// 結果画面の「なぜこの句読点？」を押したときだけ呼ばれる（押さなければ課金なし）。

const MODEL = "claude-haiku-4-5-20251001";

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json(
      { error: "NO_KEY", message: "ANTHROPIC_API_KEY が未設定です。解説機能にはAPIキーが必要です。" },
      { status: 500 }
    );
  }

  let body = {};
  try { body = await req.json(); } catch {}
  const text = typeof body.text === "string" ? body.text.slice(0, 200) : "";       // 正解文
  const userText = typeof body.userText === "string" ? body.userText.slice(0, 200) : ""; // ユーザーが打った文
  if (!text) return Response.json({ error: "NO_TEXT" }, { status: 400 });

  // ユーザーの答えが正解と違うときだけ、比較パートを頼む
  const differs = userText && userText !== text;

  const lines = [
    "次の日本語の文について、句読点（、。！？）が「なぜその位置に、なぜその記号で」打たれているのかを、",
    "中高生にも分かるやさしい言葉で説明してください。",
    "・箇条書きにせず、短い文章で。",
    "・読点「、」と句点「。」や「！」「？」の使い分けの理由に触れる。",
    "・前置きや繰り返しは書かず、説明だけを出力する。",
    "",
    `正解の文: ${text}`,
  ];

  if (differs) {
    lines.push(
      `あなたが打った文: ${userText}`,
      "",
      "後半で、あなたが打った文だと意味やニュアンスがどう変わってしまうかを、正解と比べて1〜2文で指摘してください。",
      "指摘は「そう打つと〜」のように、責めずにやさしく。全体で200字以内。"
    );
  } else {
    lines.push("", "全体で120字以内。");
  }

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
        max_tokens: 500,
        messages: [{ role: "user", content: lines.join("\n") }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return Response.json({ error: "API_ERROR", detail: data }, { status: 502 });
    const explanation = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!explanation) return Response.json({ error: "EMPTY" }, { status: 502 });
    return Response.json({ explanation });
  } catch (e) {
    return Response.json({ error: "FETCH_FAILED", message: String(e) }, { status: 502 });
  }
}
