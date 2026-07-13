import { parse } from "./problems";

// 難易度スコア倍率（難しいほど大きく）
export const DIFF_MULT = { easy: 1.0, normal: 1.5, hard: 2.2 };

// コンボ倍率：連続ノーミス数に応じて 1.0 → 0.2刻み、上限3.0（連続11で頭打ち）
export function comboMultiplier(streak) {
  if (streak <= 1) return 1.0;
  return Math.min(1 + 0.2 * (streak - 1), 3.0);
}

// 採点。variants がある問題は各正解で採点し最高を採用。
// opts: { difficulty, combo }（combo = 直前までの連続ノーミス数）
export function grade(problem, marks, seconds, { difficulty = "normal", combo = 0 } = {}) {
  const texts = [problem.text, ...(problem.variants || [])];
  let best = null;

  for (const t of texts) {
    const { base, answer, total } = parse(t);
    let correct = 0, wrong = 0, missed = 0;
    const detail = {};
    const L = base.length;
    for (let g = 0; g <= L; g++) {
      const a = answer[g], u = marks[g];
      if (a && u === a) { correct++; detail[g] = "ok"; }
      else if (a && u && u !== a) { wrong++; detail[g] = "wrongmark"; }
      else if (a && !u) { missed++; detail[g] = "missed"; }
      else if (!a && u) { wrong++; detail[g] = "extra"; }
    }
    const placed = Object.keys(marks).length;
    const acc = total ? correct / total : (placed ? 0 : 1);
    const timePenalty = Math.min(seconds * 5, 300);
    const baseScore = Math.max(0, Math.round(acc * 1000) - wrong * 80 - timePenalty);
    const stars = acc === 1 && wrong === 0 ? 3 : acc >= 0.99 ? 2 : acc >= 0.5 ? 1 : 0;
    const cand = { correct, wrong, missed, total, acc, baseScore, stars, detail, answerMap: answer, seconds };
    if (!best || cand.baseScore > best.baseScore) best = cand;
  }

  const isPerfect = best.acc === 1 && best.wrong === 0;
  const newStreak = isPerfect ? combo + 1 : 0;
  const comboMult = isPerfect ? comboMultiplier(newStreak) : 1.0;
  const diffMult = DIFF_MULT[difficulty] ?? 1.0;
  const finalScore = Math.round(best.baseScore * diffMult * comboMult);

  return { ...best, isPerfect, newStreak, comboMult, diffMult, finalScore };
}
