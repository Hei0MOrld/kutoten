import { PROBLEMS, PUNCT, parse } from "./problems";
import twochoiceGen from "./twochoice-generated.json";

// 二択モード用のクイズを1問つくる。
// 既存の正しい文から、句読点1つに注目させ「要る/要らない」を問う。
// - needed(要る): 正しい文の実在する読点を指す
// - not needed(要らない): 「文節の切れ目」に余計な読点を1つ足し、その読点を指す
//   （単語の途中には入れない＝一目でバレないようにする）
//
// さらに、AI事前生成の引っかけ（twochoice-generated.json）があれば混ぜる。

const GEN = Array.isArray(twochoiceGen) ? twochoiceGen : [];

// 単一助詞（この直後は読点が入りうる文節境界）。ただし手前が漢字＝単語の終わりのときだけ採用。
const SINGLE_PARTICLE = new Set(["は", "が", "を", "に", "へ", "も", "と", "で"]);
// 接続語尾（2文字）。これらは単語途中に現れにくいので手前条件なしで採用。
const CONNECTORS = ["から", "ので", "けど", "のに", "たら", "なら", "ても", "でも", "だが", "つつ"];

const isKanji = (c) => !!c && /[\u4e00-\u9fff]/.test(c);

function pickProblem() {
  // 難易度を混ぜる：ふつう多め・やさしい/むずかしいをちょくちょく。
  // むずかしい文（！？や複雑な構造）が時々混ざることで単調さを防ぐ。
  const r = Math.random();
  const diff = r < 0.35 ? "easy" : r < 0.80 ? "normal" : "hard";
  const list = PROBLEMS[diff] && PROBLEMS[diff].length ? PROBLEMS[diff] : PROBLEMS.normal;
  return list[Math.floor(Math.random() * list.length)];
}
function toChars(text) { return [...text]; }

// 「文節の切れ目」＝ある文字の直後が境界になりうる位置を集める。
// chars[i-1] が助詞/接続語尾で、前後が句読点でない位置 i（i の前に挿入）。
function boundaryGaps(chars) {
  const gaps = [];
  for (let i = 1; i < chars.length; i++) {
    const prev = chars[i - 1], cur = chars[i];
    if (PUNCT.has(prev) || PUNCT.has(cur) || cur === "、") continue;
    const two = (chars[i - 2] || "") + prev;
    if (CONNECTORS.includes(two)) { gaps.push(i); continue; }
    // 単一助詞は「手前が漢字（＝直前が単語の終わり）」のときだけ採用し、単語途中を避ける
    if (SINGLE_PARTICLE.has(prev) && isKanji(chars[i - 2])) gaps.push(i);
  }
  return gaps;
}

function fromRuleNeeded() {
  for (let t = 0; t < 12; t++) {
    const p = pickProblem();
    const chars = toChars(p.text);
    const commas = [];
    for (let i = 0; i < chars.length; i++) if (chars[i] === "、") commas.push(i);
    if (!commas.length) continue;
    const focus = commas[Math.floor(Math.random() * commas.length)];
    return { chars, focus, mark: "、", needed: true };
  }
  return null;
}

function fromRuleNotNeeded() {
  for (let t = 0; t < 16; t++) {
    const p = pickProblem();
    const chars = toChars(p.text);
    const gaps = boundaryGaps(chars);
    if (!gaps.length) continue;
    const at = gaps[Math.floor(Math.random() * gaps.length)];
    const withExtra = [...chars.slice(0, at), "、", ...chars.slice(at)];
    return { chars: withExtra, focus: at, mark: "、", needed: false };
  }
  return null;
}

// AI事前生成の引っかけ（{text, focusChar? } ではなく {sentence, insertAt} 形式）を使う
function fromGenerated() {
  const src = GEN;
  if (!src.length) return null;
  const g = src[Math.floor(Math.random() * src.length)];
  const chars = toChars(g.text);
  // g.focus は「、」の index。念のため範囲チェック。
  if (typeof g.focus !== "number" || g.focus < 0 || g.focus >= chars.length) return null;
  return { chars, focus: g.focus, mark: chars[g.focus] || "、", needed: !!g.needed };
}

export function makeTwoChoice(diff, wantNeeded) {
  // 30%の確率でAI生成プールから引く（あれば）
  if (GEN.length && Math.random() < 0.3) {
    const g = fromGenerated();
    if (g) return g;
  }
  const q = wantNeeded ? fromRuleNeeded() : fromRuleNotNeeded();
  if (q) return q;
  // 保険
  const alt = wantNeeded ? fromRuleNotNeeded() : fromRuleNeeded();
  if (alt) return alt;
  const p = pickProblem();
  const chars = toChars(p.text);
  const fp = chars.findIndex((c) => PUNCT.has(c));
  return { chars, focus: fp >= 0 ? fp : 0, mark: chars[fp] || "、", needed: true };
}
