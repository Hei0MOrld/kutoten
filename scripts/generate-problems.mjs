// ============================================================
// 問題＋解説を一括生成して lib/problems-generated.json に凍結するスクリプト。
// KOが手元で1回だけ走らせる。公開版はこのJSONを読むだけ＝API代ゼロ・表示も一瞬。
//
// 使い方:
//   1) .env.local に ANTHROPIC_API_KEY があること（このスクリプトも読む）
//   2) ターミナルで:  node scripts/generate-problems.mjs
//   3) 完成すると lib/problems-generated.json ができる
//
// オプション（環境変数で調整可）:
//   TARGET=200     各難易度の目標問題数（既定200）
//   HENKA_RATIO=0.5 hardのうち「意味が変わる系」の割合（既定0.5）
//   MODEL=claude-haiku-4-5-20251001  使うモデル
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "lib", "problems-generated.json");

// ---- .env.local から APIキーを読む（依存なしの簡易パーサ）----
function loadEnv() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error("✗ ANTHROPIC_API_KEY が見つかりません。.env.local を確認してください。");
  process.exit(1);
}

const MODEL = process.env.MODEL || "claude-haiku-4-5-20251001";
const TARGET = Number(process.env.TARGET || 200);
const HENKA_RATIO = Number(process.env.HENKA_RATIO || 0.5);
const BATCH = 10; // 1回のAPIで作る問題数

// ---- 検品（lib/validate.js と同じ基準）----
const PUNCT = new Set(["、", "。", "！", "？"]);
const ALLOWED_BY_DIFF = {
  easy: new Set(["、", "。"]),
  normal: new Set(["、", "。"]),
  hard: new Set(["、", "。", "！", "？"]),
};
const BANNED = /[\s0-9A-Za-zＡ-Ｚａ-ｚ０-９,\.!\?，．：；「」『』（）\(\)【】…—・]/;

function parseCount(text) {
  let baseLen = 0, total = 0;
  for (const ch of text) { if (PUNCT.has(ch)) total++; else baseLen++; }
  return { baseLen, total };
}
function validate(text, difficulty) {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (t.length < 4 || t.length > 60) return null;
  if (BANNED.test(t)) return null;
  const allowed = ALLOWED_BY_DIFF[difficulty];
  for (const ch of t) if (PUNCT.has(ch) && !allowed.has(ch)) return null;
  const { baseLen, total } = parseCount(t);
  if (total < 1 || baseLen < 3) return null;
  return t;
}

// ---- プロンプト ----
const SPEC = {
  easy: "8〜16文字程度の、日常会話のやさしい文。読点「、」を1つと句点「。」を含める。",
  normal: "16〜30文字程度の少し長めの文。読点「、」を1〜2つと句点「。」を含める。",
  hard: "15〜35文字程度。「！」や「？」を使うか二文に分けるなど、やや複雑な文。",
};

function normalPrompt(difficulty, n) {
  return [
    "あなたは日本語の「句読点を打ち直すパズル」の問題を作る出題者です。",
    `難易度: ${difficulty}`,
    SPEC[difficulty],
    "各文について、句読点がなぜその位置・その記号なのかの短い解説（80字以内・やさしく）も付けてください。",
    "制約:",
    "- 句読点は「、」「。」" + (difficulty === "hard" ? "「！」「？」" : "") + " だけを使う。",
    "- かっこ・空白・英数字・欧文記号・三点リーダ・中黒は使わない。",
    "- 各文に最低1つの「、」または「。」を、位置が明確に決まる形で入れる。",
    "- バラエティ豊かに。似た文の繰り返しは避ける。",
    `${n}問を作り、JSON配列だけを出力。前後の説明やコードフェンスは不要。`,
    '形式: [{"text":"今日は、いい天気ですね。","why":"…"}]',
  ].join("\n");
}

function henkaPrompt(n) {
  return [
    "あなたは日本語の句読点パズルの出題者です。",
    "「読点(、)の位置で文の意味が変わる」文を作ってください。",
    "例:「ここではきものを脱いでください」→ 打ち方で意味が変わる。",
    "各問について、最も自然な正解の打ち方(text)と、別の意味になる打ち方(alt)、",
    "そして「なぜ意味が変わるのか」の短い解説(why・100字以内)を付けてください。",
    "制約: 句読点は「、」「。」だけ。かっこ・空白・英数字・欧文記号は使わない。",
    `${n}問、JSON配列だけ出力。コードフェンス不要。`,
    '形式: [{"text":"ここで、はきものを脱いでください。","alt":"ここでは、きものを脱いでください。","why":"…"}]',
  ].join("\n");
}

// ---- API呼び出し ----
async function callClaude(prompt, maxTokens = 2048) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("API_ERROR: " + JSON.stringify(data).slice(0, 300));
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}
function extractArray(s) {
  const c = s.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = c.indexOf("["), b = c.lastIndexOf("]");
  if (a === -1 || b === -1) return null;
  try { return JSON.parse(c.slice(a, b + 1)); } catch { return null; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 出力の読み書き（再開対応）----
function loadOut() {
  if (fs.existsSync(OUT)) { try { return JSON.parse(fs.readFileSync(OUT, "utf-8")); } catch {} }
  return { easy: [], normal: [], hard: [] };
}
function saveOut(o) { fs.writeFileSync(OUT, JSON.stringify(o, null, 2)); }

// ---- メイン ----
const out = loadOut();
const seen = new Set();
for (const d of ["easy", "normal", "hard"]) for (const p of out[d]) seen.add(p.text);
let counter = Object.values(out).reduce((s, a) => s + a.length, 0);

function makeId(d) { return d[0] + "g" + String(++counter).padStart(4, "0"); }

async function fillNormal(diff, target) {
  let fails = 0;
  while (out[diff].length < target && fails < 8) {
    const need = Math.min(BATCH, target - out[diff].length);
    let arr;
    try { arr = extractArray(await callClaude(normalPrompt(diff, need + 3))); }
    catch (e) { console.log(`  ! ${diff} 生成失敗: ${String(e).slice(0, 80)}`); fails++; await sleep(1500); continue; }
    if (!Array.isArray(arr)) { fails++; continue; }
    let added = 0;
    for (const it of arr) {
      const t = validate(it && it.text, diff);
      if (t && !seen.has(t)) {
        seen.add(t);
        out[diff].push({ id: makeId(diff), text: t, why: (it.why || "").slice(0, 120), source: "generated" });
        added++;
      }
    }
    if (added === 0) fails++; else fails = 0;
    saveOut(out);
    process.stdout.write(`\r  ${diff}: ${out[diff].length}/${target}   `);
    await sleep(600);
  }
  process.stdout.write("\n");
}

async function fillHenka(target) {
  // hard の target のうち HENKA_RATIO 分を「意味が変わる系」にする
  const henkaTarget = Math.round(target * HENKA_RATIO);
  const already = out.hard.filter((p) => p.tags && p.tags.includes("意味変化")).length;
  let fails = 0;
  while (out.hard.filter((p) => p.tags && p.tags.includes("意味変化")).length < henkaTarget && fails < 8) {
    let arr;
    try { arr = extractArray(await callClaude(henkaPrompt(6))); }
    catch (e) { console.log(`  ! 意味変化 生成失敗: ${String(e).slice(0, 80)}`); fails++; await sleep(1500); continue; }
    if (!Array.isArray(arr)) { fails++; continue; }
    let added = 0;
    for (const it of arr) {
      const t = validate(it && it.text, "hard");
      const alt = it && it.alt ? validate(it.alt, "hard") : null;
      if (t && !seen.has(t)) {
        seen.add(t);
        const obj = { id: makeId("hard"), text: t, why: (it.why || "").slice(0, 140), tags: ["意味変化"], source: "generated" };
        if (alt && alt !== t) obj.variants = [alt];
        out.hard.push(obj);
        added++;
      }
    }
    if (added === 0) fails++; else fails = 0;
    saveOut(out);
    const cur = out.hard.filter((p) => p.tags && p.tags.includes("意味変化")).length;
    process.stdout.write(`\r  意味変化: ${cur}/${henkaTarget}   `);
    await sleep(600);
  }
  process.stdout.write("\n");
}

console.log(`\n=== 問題生成開始 ===`);
console.log(`モデル: ${MODEL} / 目標: 各${TARGET}問 / 意味変化: hard の ${Math.round(HENKA_RATIO * 100)}%\n`);

console.log("[easy]");   await fillNormal("easy", TARGET);
console.log("[normal]"); await fillNormal("normal", TARGET);
console.log("[hard・意味が変わる系]"); await fillHenka(TARGET);
console.log("[hard・通常]"); await fillNormal("hard", TARGET);

const totals = { easy: out.easy.length, normal: out.normal.length, hard: out.hard.length };
console.log(`\n=== 完成 ===`);
console.log(`easy ${totals.easy} / normal ${totals.normal} / hard ${totals.hard}  合計 ${totals.easy + totals.normal + totals.hard} 問`);
console.log(`保存先: ${OUT}`);
