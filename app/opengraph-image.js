import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "句読点、— 句読点ひとつで、意味は変わる。";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#f7f4ea";
const PAPER_DK = "#efe9d6";
const INK = "#1a1a1a";
const SHU = "#d7003a";
const GRID = "#3a7d5c";

// 「今日は、いい天気」の原稿用紙マスを描くカード
export default async function Image() {
  const cells = ["今", "日", "は", "、", "い", "い", "天", "気"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: PAPER,
          color: INK,
          fontFamily: "serif",
        }}
      >
        {/* タイトル */}
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 16, color: GRID, marginBottom: 8 }}>
          げんこうようし
        </div>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 700, letterSpacing: 10, marginBottom: 34 }}>
          句読点、
        </div>

        {/* 原稿用紙のマス */}
        <div style={{ display: "flex", background: PAPER_DK, border: `2px solid ${GRID}`, padding: 20 }}>
          {cells.map((c, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                width: 84,
                height: 84,
                border: `2px solid ${GRID}`,
                alignItems: "center",
                justifyContent: "center",
                fontSize: 52,
                color: c === "、" ? SHU : INK,
                background: PAPER,
              }}
            >
              {c}
            </div>
          ))}
        </div>

        {/* キャッチコピー */}
        <div style={{ display: "flex", fontSize: 34, color: "#5b5b5b", marginTop: 38 }}>
          句読点ひとつで、意味は変わる。
        </div>
      </div>
    ),
    { ...size }
  );
}
