// タイムアタックの自己ベストをブラウザ(localStorage)に保存する。
// キーは 難易度×秒数 ごと。サーバー不要・そのブラウザ内に残る。

const KEY = "kutoten_ta_best_v1";

function readAll() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeAll(obj) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(obj)); } catch {}
}
function slot(diff, secs) { return `${diff}:${secs}`; }

// その難易度×秒数のベスト上位を返す
export function getBest(diff, secs, top = 5) {
  const all = readAll();
  return (all[slot(diff, secs)] || []).slice(0, top);
}

// スコアを記録し、{ best(上位5), rank(1始まり/圏外は0), isTop } を返す
export function submitScore(diff, secs, entry) {
  const all = readAll();
  const k = slot(diff, secs);
  const mine = { ...entry, at: Date.now() };
  const merged = [...(all[k] || []), mine].sort((a, b) => b.score - a.score);
  const top10 = merged.slice(0, 10);
  all[k] = top10;
  writeAll(all);
  const idx = merged.findIndex((e) => e.at === mine.at);
  const rank = idx >= 0 && idx < 10 ? idx + 1 : 0; // 上位10圏内のみ順位を返す
  return { best: top10.slice(0, 5), rank, isTop: rank === 1, mineAt: mine.at };
}
