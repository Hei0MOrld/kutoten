"use client";

import React, { useState, useEffect, useRef } from "react";
import { PROBLEMS, CYCLE, DIFF_LABEL, parse, answerString } from "../lib/problems";
import { grade, comboMultiplier, DIFF_MULT } from "../lib/scoring";
import { makeTwoChoice } from "../lib/twochoice";
import { playTap, playPerfect, playMiss, playCombo, initAudio, setSoundEnabled } from "../lib/sound";
import { getBest, submitScore } from "../lib/storage";

// AI機能（リアルタイム生成・AI解説）を出すかどうか。
// 既定はオフ（公開版はAPI代ゼロ）。ローカルで使うときは .env.local に
//   NEXT_PUBLIC_ENABLE_AI=1
// を追加すると有効になる。
const AI_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AI === "1";

// base + ユーザーが打った marks から、ユーザーの「打った文」を組み立てる（解説の誤答比較用）
function buildUserText(base, marks) {
  let s = "";
  for (let g = 0; g <= base.length; g++) {
    if (marks[g]) s += marks[g];
    if (g < base.length) s += base[g];
  }
  return s;
}

// 原稿用紙 × 朱入れ
const INK = "#1a1a1a";
const SHU = "#d7003a";
const GRID = "#3a7d5c";
const PAPER = "#f7f4ea";
const PAPER_DK = "#efe9d6";
const OK_BG = "#eaf3ec";
const NG_BG = "#fceff2";
const MINCHO = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP",serif';
const GOTHIC = '"Hiragino Sans","Yu Gothic","YuGothic","Noto Sans JP",sans-serif';

// ---- 手描き添削エフェクト（一筆書き・毎回ゆらぐ）----
function rnd(seed) {
  const x = Math.sin(seed * 997.13) * 43758.5453;
  return x - Math.floor(x);
}
function circlePath(seed) {
  const cx = 20, cy = 20;
  const rx = 12 + (rnd(seed) * 4 - 2);        // 10〜14
  const ry = 12 + (rnd(seed + 1) * 4 - 2);
  const rot = (rnd(seed + 2) * 34 - 17) * Math.PI / 180; // 傾き±17°
  const start = rnd(seed + 3) * Math.PI * 2;             // 描き始めの角度
  const turns = 1.03 + rnd(seed + 4) * 0.14;             // 少し行き過ぎ（手描き感）
  const steps = 26;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const a = start + turns * 2 * Math.PI * (i / steps);
    const nr = 1 + (rnd(seed + 10 + i) * 0.07 - 0.035);  // 半径のゆらぎ
    const x = Math.cos(a) * rx * nr, y = Math.sin(a) * ry * nr;
    const xr = x * Math.cos(rot) - y * Math.sin(rot);
    const yr = x * Math.sin(rot) + y * Math.cos(rot);
    d += (i === 0 ? "M" : "L") + (cx + xr).toFixed(1) + " " + (cy + yr).toFixed(1) + " ";
  }
  const len = Math.round(Math.PI * (rx + ry) * turns * 1.15) + 8;
  return { d, len };
}
function crossPaths(seed) {
  const j = (s) => (rnd(s) * 2 - 1) * 2.5; // 端点のゆらぎ
  const a = `M ${9 + j(seed)} ${9 + j(seed + 1)} L ${31 + j(seed + 2)} ${31 + j(seed + 3)}`;
  const b = `M ${31 + j(seed + 4)} ${9 + j(seed + 5)} L ${9 + j(seed + 6)} ${31 + j(seed + 7)}`;
  return [a, b];
}
function HandCircle({ seed, delay }) {
  const { d, len } = circlePath(seed);
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
      <path className="ink-draw" d={d} fill="none" stroke={SHU} strokeWidth="2.2" strokeLinecap="round" style={{ "--len": len, "--delay": `${delay}s` }} />
    </svg>
  );
}
function HandCross({ seed, delay }) {
  const [a, b] = crossPaths(seed);
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
      <path className="ink-draw" d={a} fill="none" stroke={SHU} strokeWidth="2.4" strokeLinecap="round" style={{ "--len": 40, "--delay": `${delay}s` }} />
      <path className="ink-draw" d={b} fill="none" stroke={SHU} strokeWidth="2.4" strokeLinecap="round" style={{ "--len": 40, "--delay": `${delay + 0.14}s` }} />
    </svg>
  );
}

// セッション内で一周するまで同じ問題を出さない
function pickBuiltin(diff, used, excludeId) {
  const list = PROBLEMS[diff];
  let pool = list.filter((p) => !used.has(p.id));
  if (pool.length === 0) {
    used.clear();
    pool = list.filter((p) => p.id !== excludeId);
    if (pool.length === 0) pool = list;
  }
  const p = pool[Math.floor(Math.random() * pool.length)];
  used.add(p.id);
  return p;
}

async function fetchBatch(difficulty, count = 6) {
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ difficulty, count }),
    });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data.problems) || data.problems.length === 0) return null;
    return data.problems;
  } catch {
    return null;
  }
}

const EMPTY_SESSION = { total: 0, streak: 0, maxStreak: 0, played: 0, marks: 0 };
const TA_SECONDS = 60;

export default function Game() {
  const [screen, setScreen] = useState("title"); // title | loading | play | result | summary
  const [diff, setDiff] = useState("easy");
  const [mode, setMode] = useState("builtin"); // AI無効時は常にbuiltin // builtin | ai
  const [problem, setProblem] = useState(null);
  const [base, setBase] = useState([]);
  const [marks, setMarks] = useState({});
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState(null);
  const [session, setSession] = useState(EMPTY_SESSION);
  const [notice, setNotice] = useState(null);
  const [sound, setSound] = useState(true);
  const [gameMode, setGameMode] = useState("normal"); // normal | timeattack
  const [feedback, setFeedback] = useState(true);       // TA: ○✗を一瞬見せる(B) / 見せない(A)
  const [taSecs, setTaSecs] = useState(60);             // 30 | 60 | 120
  const [timeLeft, setTimeLeft] = useState(60);
  const [taFlash, setTaFlash] = useState(null);
  const [taResult, setTaResult] = useState(null);       // TA終了時の集計
  const [tcq, setTcq] = useState(null);                 // 二択モードの現在の問題
  const [tcMode, setTcMode] = useState("time");         // 二択の遊び方: time | survival
  const timerRef = useRef(null);
  const taTimerRef = useRef(null);
  const taOverRef = useRef(false);
  const taEndedRef = useRef(false);
  const taAcc = useRef({ score: 0, played: 0, marks: 0, maxCombo: 0, history: [] });
  const lastId = useRef(null);
  const queue = useRef([]);
  const usedIds = useRef(new Set());

  const cycle = CYCLE[diff];

  function load(p) {
    setProblem(p);
    setBase(parse(p.text).base);
    setMarks({});
    setSeconds(0);
    setResult(null);
    lastId.current = p.id;
    setScreen("play");
  }

  async function start(d) {
    initAudio();
    setDiff(d);
    setSession(EMPTY_SESSION);
    queue.current = [];
    usedIds.current = new Set();
    setNotice(null);
    setTimeLeft(taSecs);
    setTaFlash(null);
    setTaResult(null);
    taAcc.current = { score: 0, played: 0, marks: 0, maxCombo: 0, history: [] };
    if (gameMode === "twochoice") {
      taOverRef.current = false;
      taEndedRef.current = false;
      loadTC(d);
      if (tcMode === "time") startTAClock();
      return;
    }
    let first = null;
    if (mode === "ai") {
      setScreen("loading");
      const batch = await fetchBatch(d, 6);
      if (batch) { queue.current = batch.slice(1); first = batch[0]; }
      else setNotice("AI生成に失敗したため内蔵問題に切り替えました。APIキー（.env.local）を確認してください。");
    }
    if (!first) first = pickBuiltin(d, usedIds.current, null);
    load(first);
    if (gameMode === "timeattack") startTAClock();
  }

  function startTAClock() {
    taOverRef.current = false;
    taEndedRef.current = false;
    clearInterval(taTimerRef.current);
    taTimerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        const nt = t - 1;
        if (nt <= 0) { clearInterval(taTimerRef.current); taOverRef.current = true; setTimeout(endTA, 0); return 0; }
        return nt;
      });
    }, 1000);
  }

  function endTA() {
    if (taEndedRef.current) return;
    taEndedRef.current = true;
    taOverRef.current = true;
    clearInterval(taTimerRef.current);
    setTaFlash(null);
    const a = taAcc.current;
    const isTC = gameMode === "twochoice";
    const key = !isTC ? diff : (tcMode === "survival" ? "tc_sv" : "tc");
    const secsForSlot = (isTC && tcMode === "survival") ? 0 : taSecs;
    const saved = submitScore(key, secsForSlot, { score: a.score, played: a.played, marks: a.marks });
    setTaResult({
      mode: gameMode, tcMode, score: a.score, played: a.played, marks: a.marks, maxCombo: a.maxCombo,
      history: a.history.slice(), best: saved.best, rank: saved.rank, isTop: saved.isTop,
    });
    setScreen("summary");
  }

  function loadTC(d) {
    setTcq(makeTwoChoice(d || diff, Math.random() < 0.5));
    setScreen("play");
  }

  function nextTC() {
    if (taOverRef.current) return;
    loadTC(diff);
  }

  function answerTC(chosen) {
    if (taOverRef.current || !tcq) return;
    const ok = chosen === tcq.needed;
    const streak = ok ? session.streak + 1 : 0;
    const cMult = ok ? comboMultiplier(streak) : 1;
    const gain = ok ? Math.round(100 * 1.5 * cMult) : 0; // 二択は難易度なし＝固定倍率
    const a = taAcc.current;
    a.score += gain; a.played += 1; a.marks += ok ? 1 : 0;
    a.maxCombo = Math.max(a.maxCombo, streak);
    a.history.push({ chars: tcq.chars, focus: tcq.focus, needed: tcq.needed, chosen, ok });
    setSession((s) => ({
      total: s.total + gain, streak, maxStreak: Math.max(s.maxStreak, streak),
      played: s.played + 1, marks: (s.marks || 0) + (ok ? 1 : 0),
    }));
    if (ok) { playPerfect(); if (streak >= 2) playCombo(streak); } else playMiss();
    const survivalMiss = (tcMode === "survival" && !ok);
    const advance = () => { if (survivalMiss) endTA(); else nextTC(); };
    if (feedback) { setTaFlash({ isPerfect: ok }); setTimeout(() => { setTaFlash(null); advance(); }, 700); }
    else advance();
  }

  function nextTA() {
    if (taOverRef.current) return;
    if (mode === "ai" && queue.current.length > 0) { load(queue.current.shift()); return; }
    load(pickBuiltin(diff, usedIds.current, lastId.current));
  }

  function submitTA() {
    if (taOverRef.current) return;
    const r = grade(problem, marks, 0, { difficulty: diff, combo: session.streak });
    const a = taAcc.current;
    a.score += r.finalScore;
    a.played += 1;
    a.marks += r.correct;
    a.maxCombo = Math.max(a.maxCombo, r.newStreak);
    a.history.push({ text: answerString(problem), user: buildUserText(base, marks), ok: r.isPerfect, correct: r.correct, total: r.total });
    setSession((s) => ({
      total: s.total + r.finalScore,
      streak: r.newStreak,
      maxStreak: Math.max(s.maxStreak, r.newStreak),
      played: s.played + 1,
      marks: (s.marks || 0) + r.correct,
    }));
    if (r.isPerfect) { playPerfect(); if (r.newStreak >= 2) playCombo(r.newStreak); } else playMiss();
    if (feedback) {
      setTaFlash({ isPerfect: r.isPerfect });
      setTimeout(() => { setTaFlash(null); nextTA(); }, 700);
    } else {
      nextTA();
    }
  }

  async function next() {
    if (mode === "ai") {
      if (queue.current.length > 0) { load(queue.current.shift()); return; }
      setScreen("loading");
      const batch = await fetchBatch(diff, 6);
      if (batch) { queue.current = batch.slice(1); load(batch[0]); return; }
      setNotice("AI生成に失敗したため内蔵問題に切り替えました。");
    }
    load(pickBuiltin(diff, usedIds.current, lastId.current));
  }

  useEffect(() => () => { clearInterval(taTimerRef.current); clearInterval(timerRef.current); }, []);

  useEffect(() => {
    if (screen === "play" && gameMode === "normal") {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [screen, gameMode]);

  function tapGap(g) {
    initAudio();
    playTap();
    setMarks((prev) => {
      const cur = prev[g];
      const pos = cur ? cycle.indexOf(cur) : -1;
      const nm = { ...prev };
      if (pos === -1) nm[g] = cycle[0];
      else if (pos < cycle.length - 1) nm[g] = cycle[pos + 1];
      else delete nm[g];
      return nm;
    });
  }

  function submit() {
    clearInterval(timerRef.current);
    const r = grade(problem, marks, seconds, { difficulty: diff, combo: session.streak });
    setSession((s) => ({
      total: s.total + r.finalScore,
      streak: r.newStreak,
      maxStreak: Math.max(s.maxStreak, r.newStreak),
      played: s.played + 1,
    }));
    setResult(r);
    setScreen("result");
    if (r.isPerfect) {
      playPerfect();
      if (r.newStreak >= 2) playCombo(r.newStreak);
    } else {
      playMiss();
    }
  }

  return (
    <div style={{ background: PAPER, color: INK, fontFamily: GOTHIC, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px" }}>
      <div style={{ width: "100%", maxWidth: 1000 }}>
        {screen === "title" && <Title diff={diff} setDiff={setDiff} mode={mode} setMode={setMode} notice={notice} sound={sound} setSound={(v) => { setSound(v); setSoundEnabled(v); }} gameMode={gameMode} setGameMode={setGameMode} feedback={feedback} setFeedback={setFeedback} taSecs={taSecs} setTaSecs={setTaSecs} tcMode={tcMode} setTcMode={setTcMode} onStart={start} />}
        {screen === "loading" && <Loading />}
        {screen === "play" && gameMode === "twochoice" && tcq && (
          <PlayTwoChoice tcq={tcq} tcMode={tcMode} timeLeft={timeLeft} taFlash={taFlash} diff={diff} session={session} onAnswer={answerTC} onQuit={endTA} />
        )}
        {screen === "play" && gameMode !== "twochoice" && problem && (
          <Play base={base} marks={marks} onTap={tapGap} seconds={seconds} diff={diff} mode={mode} cycle={cycle} session={session} gameMode={gameMode} timeLeft={timeLeft} taFlash={taFlash} onSubmit={gameMode === "timeattack" ? submitTA : submit} onQuit={() => { if (gameMode === "timeattack") endTA(); else setScreen("summary"); }} />
        )}
        {screen === "result" && result && (
          <Result problem={problem} base={base} marks={marks} result={result} session={session} onNext={next} onEnd={() => setScreen("summary")} />
        )}
        {screen === "summary" && <Summary session={session} diff={diff} gameMode={gameMode} taSecs={taSecs} taResult={taResult} onAgain={() => start(diff)} onHome={() => setScreen("title")} />}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "80px 0", textAlign: "center" }}>
      <div className="pop" style={{ fontFamily: MINCHO, fontSize: 40, color: SHU }}>、</div>
      <div style={{ fontFamily: MINCHO, fontSize: 18, letterSpacing: 4, color: INK }}>問題を生成中…</div>
      <div style={{ fontSize: 12, color: "#9a9a9a" }}>Claudeが新しい文を考えています</div>
    </div>
  );
}

function Masu({ children }) {
  return (
    <div style={{ width: 40, height: 40, border: `1px solid ${GRID}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MINCHO, fontSize: 24, lineHeight: 1, color: INK, background: PAPER }}>
      {children}
    </div>
  );
}

// プレイ中のスキマ（タップして句読点を入れる）
function GapButton({ mark, onTap }) {
  const filled = !!mark;
  return (
    <button
      className="gap-btn"
      onClick={onTap}
      aria-label="句読点を入れる"
      style={{
        width: filled ? 40 : 20, height: 40,
        border: filled ? `1px solid ${GRID}` : `1px dashed ${GRID}`,
        background: filled ? PAPER_DK : "rgba(58,125,92,0.06)",
        color: SHU, fontFamily: MINCHO, fontSize: 24, lineHeight: 1,
        cursor: "pointer", transition: "width .12s ease, transform .08s ease", padding: 0,
      }}
    >
      {mark || ""}
    </button>
  );
}

// 結果表示のスキマ（○＝正解／✗＝誤り を手描きで添削）
function GapResult({ userMark, correctMark, verdict, seed, animDelay }) {
  const has = verdict === "ok" || verdict === "missed" || verdict === "wrongmark" || verdict === "extra";
  if (!has) return <span style={{ display: "inline-block", width: 12, height: 40 }} />;
  const delay = (animDelay || 0) / 1000;
  let bg = OK_BG, main = "", mainColor = INK, top = null, overlay = null;
  if (verdict === "ok") {
    bg = OK_BG; main = correctMark; mainColor = INK;
    overlay = <HandCircle seed={seed} delay={delay} />;
  } else if (verdict === "missed") {
    bg = NG_BG; main = correctMark; mainColor = GRID;
    top = <span style={{ color: GRID }}>ここ</span>;
  } else if (verdict === "wrongmark") {
    bg = NG_BG; main = userMark; mainColor = SHU;
    top = <span style={{ color: GRID }}>正<span style={{ fontFamily: MINCHO, fontSize: 17 }}>{correctMark}</span></span>;
    overlay = <HandCross seed={seed} delay={delay} />;
  } else if (verdict === "extra") {
    bg = NG_BG; main = userMark; mainColor = SHU;
    overlay = <HandCross seed={seed} delay={delay} />;
  }
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      {top && (
        <span style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)", fontSize: 13, fontFamily: GOTHIC, whiteSpace: "nowrap", zIndex: 2, background: PAPER_DK, padding: "0 4px", borderRadius: 3, lineHeight: 1.2 }}>{top}</span>
      )}
      <span style={{ width: 40, height: 40, border: `1px solid ${GRID}`, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MINCHO, fontSize: 24, lineHeight: 1, color: mainColor }}>{main}</span>
      {overlay}
    </span>
  );
}

function PlayRow({ base, marks, onTap }) {
  const cells = [];
  const L = base.length;
  for (let g = 0; g <= L; g++) {
    cells.push(<GapButton key={`g${g}`} mark={marks[g]} onTap={() => onTap(g)} />);
    if (g < L) cells.push(<Masu key={`c${g}`}>{base[g]}</Masu>);
  }
  return <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0, justifyContent: "center" }}>{cells}</div>;
}

function ResultRow({ base, marks, detail, answerMap }) {
  const cells = [];
  const L = base.length;
  let drawn = 0;
  for (let g = 0; g <= L; g++) {
    const v = detail[g];
    const isDrawn = v === "ok" || v === "wrongmark" || v === "extra";
    cells.push(
      <GapResult key={`g${g}`} userMark={marks[g]} correctMark={answerMap[g]} verdict={v} seed={g + 1} animDelay={isDrawn ? drawn++ * 130 : 0} />
    );
    if (g < L) cells.push(<Masu key={`c${g}`}>{base[g]}</Masu>);
  }
  return <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 0, rowGap: 22, justifyContent: "center", paddingTop: 18 }}>{cells}</div>;
}

function ComboBadge({ streak }) {
  if (streak < 2) return null;
  return (
    <span className="combo-badge" key={streak} style={{ fontFamily: MINCHO, fontSize: 13, color: SHU, border: `1.5px solid ${SHU}`, borderRadius: 999, padding: "2px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}>
      {streak}連続
    </span>
  );
}

function Toggle({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} style={{ padding: "8px 16px", fontSize: 14, fontFamily: GOTHIC, border: `1.5px solid ${value === v ? SHU : GRID}`, color: value === v ? "#fff" : INK, background: value === v ? SHU : "transparent", cursor: "pointer" }}>{label}</button>
      ))}
    </div>
  );
}

function Title({ diff, setDiff, mode, setMode, notice, sound, setSound, gameMode, setGameMode, feedback, setFeedback, taSecs, setTaSecs, tcMode, setTcMode, onStart }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 22, padding: "24px 0" }}>
      <div>
        <div style={{ fontFamily: MINCHO, fontSize: 15, letterSpacing: 6, color: GRID }}>げんこうようし</div>
        <h1 style={{ fontFamily: MINCHO, fontSize: 44, fontWeight: 700, letterSpacing: 4, margin: "4px 0" }}>句読点、</h1>
        <p style={{ color: "#6b6b6b", fontSize: 14 }}>抜けた「、」や「。」を、正しい場所に打ち直そう。</p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 0, padding: 12, background: PAPER_DK, border: `1px solid ${GRID}` }}>
        {["今", "日", "は", "、", "い", "い", "天", "気"].map((c, i) => (
          <div key={i} style={{ width: 34, height: 34, border: `1px solid ${GRID}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MINCHO, fontSize: 20, color: c === "、" ? SHU : INK, background: PAPER }}>{c}</div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#9a9a9a" }}>モード</span>
        <Toggle options={[["normal", "じっくり"], ["timeattack", "タイムアタック"], ["twochoice", "二択"]]} value={gameMode} onChange={setGameMode} />
        <span style={{ fontSize: 11, color: "#9a9a9a", maxWidth: 360, textAlign: "center" }}>
          {gameMode === "normal" ? "1問ずつ丁寧に。解説を読んで上達したい人向け。"
            : gameMode === "timeattack" ? "制限時間で何問さばけるか。スコアと自己ベストに挑戦。"
              : "この句読点は要る？要らない？を見抜く反射モード。制限時間制。"}
        </span>
        {gameMode === "twochoice" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "#9a9a9a" }}>遊び方</span>
            <Toggle options={[["time", "タイム"], ["survival", "サバイバル"]]} value={tcMode} onChange={setTcMode} />
            <span style={{ fontSize: 11, color: "#9a9a9a", maxWidth: 320, textAlign: "center" }}>
              {tcMode === "time" ? "制限時間で何問正解できるか。" : "1問でも間違えたら終了。何問連続できるか。"}
            </span>
          </div>
        )}

        {(gameMode === "timeattack" || (gameMode === "twochoice" && tcMode === "time")) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "#9a9a9a" }}>制限時間</span>
            <Toggle options={[["30", "30秒"], ["60", "60秒"], ["120", "120秒"]]} value={String(taSecs)} onChange={(v) => setTaSecs(Number(v))} />
          </div>
        )}
        {(gameMode === "timeattack" || gameMode === "twochoice") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "#9a9a9a" }}>フィードバック表示</span>
            <Toggle options={[["on", "あり（一瞬○✗）"], ["off", "なし（最速）"]]} value={feedback ? "on" : "off"} onChange={(v) => setFeedback(v === "on")} />
          </div>
        )}
      </div>

      {gameMode !== "twochoice" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#9a9a9a" }}>難易度</span>
          <Toggle options={[["easy", "やさしい"], ["normal", "ふつう"], ["hard", "むずかしい"]]} value={diff} onChange={setDiff} />
          <span style={{ fontSize: 11, color: "#9a9a9a", maxWidth: 360, textAlign: "center" }}>
            {diff === "easy" ? "短い文・「、」「。」のみ ・ スコア×1.0"
              : diff === "normal" ? "少し長い文・「、」「。」 ・ スコア×1.5"
                : "「！」「？」も登場・複雑な文 ・ スコア×2.2"}
          </span>
        </div>
      )}

      {AI_ENABLED && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#9a9a9a" }}>問題</span>
          <Toggle options={[["builtin", "内蔵"], ["ai", "AI生成"]]} value={mode} onChange={setMode} />
          {mode === "ai" && <span style={{ fontSize: 11, color: "#9a9a9a", maxWidth: 320 }}>Claudeが毎回あたらしい文を作ります（.env.local にAPIキーが必要）。</span>}
        </div>
      )}

      <button onClick={() => setSound(!sound)} style={{ fontSize: 12, fontFamily: GOTHIC, color: "#6b6b6b", background: "none", border: "none", cursor: "pointer" }}>
        音：{sound ? "オン 🔊" : "オフ 🔇"}
      </button>

      {notice && (
        <div style={{ fontSize: 12, color: SHU, background: NG_BG, border: `1px solid ${SHU}`, borderRadius: 6, padding: "8px 12px", maxWidth: 360 }}>{notice}</div>
      )}

      <button onClick={() => onStart(diff)} style={{ marginTop: 4, padding: "12px 40px", fontSize: 18, fontFamily: MINCHO, letterSpacing: 4, color: "#fff", background: INK, border: "none", cursor: "pointer" }}>はじめる</button>

      <p style={{ fontSize: 12, color: "#9a9a9a", maxWidth: 380 }}>
        点線のスキマをタップすると「、」→「。」{diff === "hard" ? "→「！」→「？」" : ""}→なし の順で切り替わります。ノーミスを続けるとコンボ倍率が上がります。
      </p>
    </div>
  );
}

function Play({ base, marks, onTap, seconds, diff, mode, cycle, session, gameMode, timeLeft, taFlash, onSubmit, onQuit }) {
  const placed = Object.keys(marks).length;
  const ta = gameMode === "timeattack";
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const low = ta && timeLeft <= 10;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: GOTHIC, fontSize: 13, color: "#6b6b6b" }}>
        <button onClick={onQuit} style={{ color: "#6b6b6b", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>← やめる</button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>{DIFF_LABEL[diff]}{mode === "ai" ? "・AI" : ""}{ta ? "・タイムアタック" : ""}</span>
          <ComboBadge streak={session.streak} />
        </div>
        {ta
          ? <span style={{ fontFamily: MINCHO, fontSize: 20, fontWeight: 700, color: low ? SHU : INK }}>残り {timeLeft}秒</span>
          : <span style={{ fontFamily: MINCHO, fontSize: 16, color: INK }}>{mm}:{ss}</span>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9a9a9a", marginTop: -12 }}>
        <span>累計 {session.total.toLocaleString()} 点</span>
        <span>{session.played} 問{ta ? "・○" + (session.marks || 0) : "クリア"}</span>
      </div>

      <div style={{ background: PAPER_DK, border: `1px solid ${GRID}`, padding: 16, position: "relative" }}>
        <PlayRow base={base} marks={marks} onTap={onTap} />
        {taFlash && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(247,244,234,0.82)" }}>
            <span className="pop" style={{ fontFamily: MINCHO, fontSize: 64, color: taFlash.isPerfect ? SHU : "#9a9a9a" }}>{taFlash.isPerfect ? "○" : "✗"}</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, color: "#6b6b6b" }}>打った数：{placed}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 22, fontFamily: MINCHO, color: SHU }}>
          {cycle.map((m) => <span key={m}>{m}</span>)}
        </div>
      </div>

      <button onClick={onSubmit} style={{ padding: 12, fontSize: 17, fontFamily: MINCHO, letterSpacing: 4, color: "#fff", background: SHU, border: "none", cursor: "pointer" }}>{ta ? "決定して次へ" : "採点する"}</button>
    </div>
  );
}

function PlayTwoChoice({ tcq, tcMode, timeLeft, taFlash, diff, session, onAnswer, onQuit }) {
  const survival = tcMode === "survival";
  const low = !survival && timeLeft <= 10;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: GOTHIC, fontSize: 13, color: "#6b6b6b" }}>
        <button onClick={onQuit} style={{ color: "#6b6b6b", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>← やめる</button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>二択・{survival ? "サバイバル" : "タイム"}</span>
          <ComboBadge streak={session.streak} />
        </div>
        {survival
          ? <span style={{ fontFamily: MINCHO, fontSize: 20, fontWeight: 700, color: INK }}>{session.streak} 問連続</span>
          : <span style={{ fontFamily: MINCHO, fontSize: 20, fontWeight: 700, color: low ? SHU : INK }}>残り {timeLeft}秒</span>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9a9a9a", marginTop: -12 }}>
        <span>累計 {session.total.toLocaleString()} 点</span>
        <span>{survival ? "1ミスで終了" : `${session.played} 問`}</span>
      </div>

      <div style={{ background: PAPER_DK, border: `1px solid ${GRID}`, padding: "28px 16px", position: "relative", minHeight: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: MINCHO, fontSize: 28, lineHeight: 1.7, textAlign: "center" }}>
          {tcq.chars.map((c, i) => (
            <span key={i} style={i === tcq.focus ? { color: SHU, background: "#fbe3ea", borderBottom: `2px solid ${SHU}`, padding: "0 2px", fontWeight: 700 } : undefined}>{c}</span>
          ))}
        </div>
        {taFlash && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(247,244,234,0.82)" }}>
            <span className="pop" style={{ fontFamily: MINCHO, fontSize: 64, color: taFlash.isPerfect ? SHU : "#9a9a9a" }}>{taFlash.isPerfect ? "○" : "✗"}</span>
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", fontFamily: GOTHIC, fontSize: 15, color: "#6b6b6b" }}>
        赤い「<span style={{ fontFamily: MINCHO, color: SHU, fontSize: 18 }}>{tcq.mark}</span>」は要る？要らない？
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={() => onAnswer(true)} style={{ flex: 1, padding: 18, fontSize: 20, fontFamily: MINCHO, letterSpacing: 4, color: "#fff", background: GRID, border: "none", cursor: "pointer" }}>要る</button>
        <button onClick={() => onAnswer(false)} style={{ flex: 1, padding: 18, fontSize: 20, fontFamily: MINCHO, letterSpacing: 4, color: "#fff", background: SHU, border: "none", cursor: "pointer" }}>要らない</button>
      </div>
    </div>
  );
}

function useCountUp(target, ms = 650) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf, startT;
    const step = (t) => {
      if (!startT) startT = t;
      const p = Math.min((t - startT) / ms, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

function ExplainBox({ text, userText, presetWhy, wrong }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [msg, setMsg] = useState("");
  async function run() {
    setState("loading");
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, userText }),
      });
      const data = await res.json();
      if (!res.ok || !data.explanation) {
        setState("error");
        setMsg(data.message || "解説を取得できませんでした。APIキー（.env.local）を確認してください。");
        return;
      }
      setMsg(data.explanation);
      setState("done");
    } catch {
      setState("error");
      setMsg("通信に失敗しました。");
    }
  }

  const box = (color, bg, border, content, key) => (
    <div key={key} className="float-up" style={{ fontSize: 13, lineHeight: 1.75, color, background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 14px" }}>{content}</div>
  );
  const btn = (label, onClick, filled) => (
    <button onClick={onClick} style={{ alignSelf: "center", padding: "8px 18px", fontFamily: GOTHIC, fontSize: 13, color: filled ? "#fff" : GRID, background: filled ? GRID : "transparent", border: `1.5px solid ${GRID}`, borderRadius: 6, cursor: "pointer" }}>{label}</button>
  );

  // 内蔵の解説(why)がある → 即表示（無料）。誤答時だけ「自分の答えと比べる」でAPI。
  if (presetWhy) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {box(INK, OK_BG, GRID, (<><span style={{ fontSize: 11, color: GRID, fontFamily: GOTHIC, display: "block", marginBottom: 2 }}>解説</span>{presetWhy}</>))}
        {AI_ENABLED && wrong && state === "idle" && btn("自分の答えと比べる（AI）", run)}
        {state === "loading" && <div style={{ textAlign: "center", fontSize: 13, color: "#9a9a9a" }}>あなたの答えと比べています…</div>}
        {state === "done" && box(INK, "#f3f7ff", "#8aa9d6", msg)}
        {state === "error" && box(SHU, NG_BG, SHU, msg)}
      </div>
    );
  }

  // why が無い（AI生成モード等）→ AIが有効ならボタンで解説
  if (!AI_ENABLED) return null;
  if (state === "idle") return btn("なぜこの句読点？", run);
  if (state === "loading") return <div style={{ textAlign: "center", fontSize: 13, color: "#9a9a9a" }}>解説を考えています…</div>;
  return box(state === "error" ? SHU : INK, state === "error" ? NG_BG : OK_BG, state === "error" ? SHU : GRID, (<>{state === "error" && <div style={{ fontFamily: GOTHIC, fontWeight: "bold", marginBottom: 4 }}>解説を取得できませんでした</div>}{msg}</>));
}

function Result({ problem, base, marks, result, session, onNext, onEnd }) {
  const { correct, wrong, missed, total, finalScore, baseScore, diffMult, comboMult, stars, detail, answerMap, seconds, isPerfect, newStreak } = result;
  const shown = useCountUp(finalScore);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ textAlign: "center", position: "relative" }}>
        <div className="pop" style={{ fontSize: 28, letterSpacing: 4, color: SHU, fontFamily: MINCHO }}>{"★★★".slice(0, stars) + "☆☆☆".slice(0, 3 - stars)}</div>
        <div style={{ fontFamily: MINCHO, fontSize: 44, fontWeight: 700, marginTop: 4 }}>{shown.toLocaleString()}<span style={{ fontSize: 16, color: "#6b6b6b" }}> 点</span></div>
        <div className="float-up" style={{ fontSize: 12, color: "#9a9a9a", marginTop: 2 }}>
          基礎 {baseScore} × 難易度 {diffMult}{comboMult > 1 ? ` × コンボ ${comboMult.toFixed(1)}` : ""}
        </div>
        {isPerfect && (
          <div className="hanko" style={{ position: "absolute", top: -6, right: 8, width: 56, height: 56, borderRadius: "50%", border: `3px solid ${SHU}`, color: SHU, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MINCHO, fontSize: 26, fontWeight: 700 }}>秀</div>
        )}
        {!isPerfect && (
          <div className="hanko" style={{ position: "absolute", top: -6, right: 8, width: 56, height: 56, borderRadius: "50%", border: `3px solid #9a9a9a`, color: "#9a9a9a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MINCHO, fontSize: 26, fontWeight: 700 }}>再</div>
        )}
        {isPerfect && newStreak >= 2 && (
          <div className="combo-badge" key={newStreak} style={{ marginTop: 8, display: "inline-block", fontFamily: MINCHO, color: SHU, fontSize: 15 }}>{newStreak}連続ノーミス！</div>
        )}
      </div>

      <div style={{ background: PAPER_DK, border: `1px solid ${GRID}`, padding: "16px 16px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontFamily: GOTHIC, marginBottom: 4 }}>
          <span style={{ color: SHU }}>答え合わせ</span>
          <span style={{ color: "#9a9a9a" }}><span style={{ color: SHU }}>○＝正解</span> ／ <span style={{ color: SHU }}>✗＝誤り</span> ／ <span style={{ color: GRID }}>ここ＝打ち忘れ</span></span>
        </div>
        <ResultRow base={base} marks={marks} detail={detail} answerMap={answerMap} />
      </div>

      <div style={{ textAlign: "center", fontFamily: MINCHO, fontSize: 24, lineHeight: 1.7 }}>
        <span style={{ fontSize: 11, color: "#9a9a9a", fontFamily: GOTHIC, display: "block", marginBottom: 4 }}>正解</span>
        {answerString(problem)}
      </div>

      <ExplainBox text={problem.text} userText={buildUserText(base, marks)} presetWhy={problem.why} wrong={!result.isPerfect} />

      <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center", fontFamily: GOTHIC, fontSize: 13 }}>
        <div><div style={{ fontSize: 22, fontFamily: MINCHO, color: GRID }}>{correct}/{total}</div><div style={{ color: "#6b6b6b" }}>正解</div></div>
        <div><div style={{ fontSize: 22, fontFamily: MINCHO, color: SHU }}>{wrong}</div><div style={{ color: "#6b6b6b" }}>まちがい</div></div>
        <div><div style={{ fontSize: 22, fontFamily: MINCHO, color: SHU }}>{missed}</div><div style={{ color: "#6b6b6b" }}>打ち忘れ</div></div>
        <div><div style={{ fontSize: 22, fontFamily: MINCHO, color: INK }}>{seconds}秒</div><div style={{ color: "#6b6b6b" }}>タイム</div></div>
      </div>

      <div style={{ textAlign: "center", fontSize: 13, color: "#6b6b6b" }}>累計 {session.total.toLocaleString()} 点 ・ {session.played} 問</div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onEnd} style={{ flex: 1, padding: 11, fontFamily: MINCHO, fontSize: 15, color: INK, background: "transparent", border: `1.5px solid ${GRID}`, cursor: "pointer" }}>やめる</button>
        <button onClick={onNext} style={{ flex: 1, padding: 11, fontFamily: MINCHO, fontSize: 15, color: "#fff", background: INK, border: "none", cursor: "pointer" }}>次の問題</button>
      </div>
    </div>
  );
}

function Summary({ session, diff, gameMode, taSecs, taResult, onAgain, onHome }) {
  const ta = (gameMode === "timeattack" || gameMode === "twochoice") && taResult;
  const isTC = ta && taResult.mode === "twochoice";
  const tcSurvival = isTC && taResult.tcMode === "survival";
  const shown = useCountUp(ta ? taResult.score : session.total);

  const buttons = (
    <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "center" }}>
      <button onClick={onHome} style={{ padding: "11px 24px", fontFamily: MINCHO, fontSize: 15, color: INK, background: "transparent", border: `1.5px solid ${GRID}`, cursor: "pointer" }}>タイトルへ</button>
      <button onClick={onAgain} style={{ padding: "11px 24px", fontFamily: MINCHO, fontSize: 15, color: "#fff", background: SHU, border: "none", cursor: "pointer" }}>もう一度</button>
    </div>
  );

  if (!ta) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 20, padding: "24px 0" }}>
        <div style={{ fontFamily: MINCHO, fontSize: 15, letterSpacing: 6, color: GRID }}>けっか</div>
        <div>
          <div style={{ fontFamily: MINCHO, fontSize: 48, fontWeight: 700 }}>{shown.toLocaleString()}<span style={{ fontSize: 16, color: "#6b6b6b" }}> 点</span></div>
          <div style={{ fontSize: 13, color: "#6b6b6b", marginTop: 4 }}>{DIFF_LABEL[diff]}</div>
        </div>
        <div style={{ display: "flex", gap: 32, fontFamily: GOTHIC }}>
          <div><div style={{ fontSize: 26, fontFamily: MINCHO, color: GRID }}>{session.played}</div><div style={{ fontSize: 12, color: "#6b6b6b" }}>解いた問題</div></div>
          <div><div style={{ fontSize: 26, fontFamily: MINCHO, color: SHU }}>{session.maxStreak}</div><div style={{ fontSize: 12, color: "#6b6b6b" }}>最大コンボ</div></div>
        </div>
        {buttons}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, padding: "16px 0" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: MINCHO, fontSize: 15, letterSpacing: 6, color: GRID }}>{isTC ? (tcSurvival ? "二択・サバイバル 結果" : "二択・タイム 結果") : "タイムアタック結果"}</div>
        <div style={{ fontFamily: MINCHO, fontSize: 48, fontWeight: 700, marginTop: 6 }}>{shown.toLocaleString()}<span style={{ fontSize: 16, color: "#6b6b6b" }}> 点</span></div>
        <div style={{ fontSize: 13, color: "#6b6b6b", marginTop: 2 }}>{isTC ? (tcSurvival ? "二択・サバイバル" : `二択・タイム ${taSecs}秒`) : `${DIFF_LABEL[diff]} ・ ${taSecs}秒`}</div>
        {taResult.rank > 0 && (
          <div className="combo-badge" style={{ marginTop: 8, display: "inline-block", fontFamily: MINCHO, fontSize: 15, color: SHU }}>
            {taResult.isTop ? "自己ベスト更新！" : `自己ベスト ${taResult.rank}位`}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 28, fontFamily: GOTHIC }}>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 24, fontFamily: MINCHO, color: GRID }}>{taResult.played}</div><div style={{ fontSize: 12, color: "#6b6b6b" }}>解いた問題</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 24, fontFamily: MINCHO, color: GRID }}>{taResult.marks}</div><div style={{ fontSize: 12, color: "#6b6b6b" }}>{tcSurvival ? "連続正解" : isTC ? "正解数" : "正解した句読点"}</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 24, fontFamily: MINCHO, color: SHU }}>{taResult.maxCombo}</div><div style={{ fontSize: 12, color: "#6b6b6b" }}>最大コンボ</div></div>
      </div>

      {/* 左：自己ベスト ／ 右：全国ランキング（近日公開） */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, width: "100%", justifyContent: "center" }}>
        <div style={{ flex: "1 1 260px", minWidth: 240, background: PAPER_DK, border: `1px solid ${GRID}`, borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: GRID, fontFamily: GOTHIC, marginBottom: 8 }}>自己ベスト（{isTC ? (tcSurvival ? "二択・サバイバル" : `二択・タイム ${taSecs}秒`) : `${DIFF_LABEL[diff]}・${taSecs}秒`}）</div>
          {taResult.best.map((b, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontFamily: MINCHO, fontSize: 14, color: (taResult.rank === i + 1) ? SHU : INK, fontWeight: (taResult.rank === i + 1) ? 700 : 400 }}>
              <span>{i + 1}位</span>
              <span>{b.score.toLocaleString()} 点</span>
              <span style={{ fontSize: 12, color: "#9a9a9a" }}>{b.played}問</span>
            </div>
          ))}
        </div>
        <div style={{ flex: "1 1 260px", minWidth: 240, background: "#fafafa", border: "1px dashed #ccc", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#b0b0b0" }}>
          <div style={{ fontSize: 13, fontFamily: GOTHIC }}>全国ランキング</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>近日公開</div>
        </div>
      </div>

      {/* 解いた問題一覧（スクロール） */}
      <div style={{ width: "100%" }}>
        <div style={{ fontSize: 12, color: "#6b6b6b", fontFamily: GOTHIC, marginBottom: 6 }}>解いた問題（{taResult.history.length}問）</div>
        <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${GRID}`, borderRadius: 8 }}>
          {isTC
            ? taResult.history.map((h, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: i < taResult.history.length - 1 ? "1px solid #e6e0cf" : "none", background: h.ok ? "transparent" : NG_BG }}>
                <span style={{ fontFamily: MINCHO, fontSize: 18, color: h.ok ? GRID : SHU, width: 20, textAlign: "center", flexShrink: 0 }}>{h.ok ? "○" : "✗"}</span>
                <span style={{ fontFamily: MINCHO, fontSize: 15, flex: 1 }}>
                  {h.chars.map((c, j) => (
                    <span key={j} style={j === h.focus ? { color: SHU, borderBottom: `2px solid ${SHU}`, fontWeight: 700 } : undefined}>{c}</span>
                  ))}
                </span>
                <span style={{ fontSize: 11, color: "#9a9a9a", flexShrink: 0 }}>正解：{h.needed ? "要る" : "要らない"}</span>
              </div>
            ))
            : taResult.history.map((h, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", borderBottom: i < taResult.history.length - 1 ? "1px solid #e6e0cf" : "none", background: h.ok ? "transparent" : NG_BG }}>
                <span style={{ fontFamily: MINCHO, fontSize: 18, color: h.ok ? GRID : SHU, width: 20, textAlign: "center", flexShrink: 0, marginTop: 2 }}>{h.ok ? "○" : "✗"}</span>
                {h.ok ? (
                  <span style={{ fontFamily: MINCHO, fontSize: 15, flex: 1 }}>{h.text}</span>
                ) : (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ fontFamily: MINCHO, fontSize: 15 }}><span style={{ fontSize: 11, color: SHU, fontFamily: GOTHIC, marginRight: 6 }}>あなた</span>{h.user}</div>
                    <div style={{ fontFamily: MINCHO, fontSize: 15, color: GRID }}><span style={{ fontSize: 11, color: GRID, fontFamily: GOTHIC, marginRight: 6 }}>正解</span>{h.text}</div>
                  </div>
                )}
                {!h.ok && <span style={{ fontSize: 11, color: "#9a9a9a", flexShrink: 0, marginTop: 2 }}>{h.correct}/{h.total}</span>}
              </div>
            ))}
        </div>
      </div>

      {buttons}
    </div>
  );
}
