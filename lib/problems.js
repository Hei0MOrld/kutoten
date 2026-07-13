// 句読点ゲーム 問題データ & パーサ
// text = 句読点入りの「正解」文。表示時は句読点を抜いて出す。
// variants = 複数正解を許す問題（読点の位置で意味が変わる文など）。

export const PUNCT = new Set(["、", "。", "！", "？"]);

// タップで循環する記号セット（難易度別）
export const CYCLE = {
  easy: ["、", "。"],
  normal: ["、", "。"],
  hard: ["、", "。", "！", "？"],
};

export const DIFF_LABEL = { easy: "やさしい", normal: "ふつう", hard: "むずかしい" };

import generated from "./problems-generated.json";
import { MEANING_CHANGE } from "./meaning-change";

const BASE_PROBLEMS = {
  easy: [
    { id: "e01", text: "今日は、いい天気ですね。" },
    { id: "e02", text: "はい、わかりました。" },
    { id: "e03", text: "私は、大学生です。" },
    { id: "e04", text: "ありがとう、また明日。" },
    { id: "e05", text: "そうだね、行ってみよう。" },
    { id: "e06", text: "お腹がすいたので、ご飯を食べた。" },
    { id: "e07", text: "雨が降ったので、傘をさした。" },
    { id: "e08", text: "彼は笑って、手を振った。" },
    { id: "e09", text: "駅に着いたら、電話するね。" },
    { id: "e10", text: "寒いから、上着を着なさい。" },
    { id: "e11", text: "よし、始めよう。" },
    { id: "e12", text: "それでは、また来週。" },
    { id: "e13", text: "眠いけれど、もう少し頑張る。" },
    { id: "e14", text: "犬が走り、猫が逃げた。" },
    { id: "e15", text: "朝起きて、顔を洗った。" },
    { id: "e16", text: "話を聞いて、少し安心した。" },
    { id: "e17", text: "急いだので、汗をかいた。" },
    { id: "e18", text: "本を閉じて、目をつむった。" },
    { id: "e19", text: "電気を消して、布団に入った。" },
    { id: "e20", text: "水を飲んで、一息ついた。" },
  ],
  normal: [
    { id: "n01", text: "昨日は雨だったので、試合は中止になりました。" },
    { id: "n02", text: "彼は急いで走ったが、電車には間に合わなかった。" },
    { id: "n03", text: "この本を読めば、きっと考え方が変わるだろう。" },
    { id: "n04", text: "準備ができたら、こちらのボタンを押してください。" },
    { id: "n05", text: "時間はまだあるから、ゆっくり考えて決めよう。" },
    { id: "n06", text: "彼女は困った顔をして、しばらく黙っていた。" },
    { id: "n07", text: "約束の時間になっても、彼は現れなかった。" },
    { id: "n08", text: "努力を続ければ、いつか報われる日が来る。" },
    { id: "n09", text: "窓を開けると、涼しい風が入ってきた。" },
    { id: "n10", text: "迷ったときは、初心に戻って考えるといい。" },
    { id: "n11", text: "新しい仕事は大変だが、とてもやりがいがある。" },
    { id: "n12", text: "みんなで協力すれば、この問題も解決できる。" },
    { id: "n13", text: "電車が遅れたため、待ち合わせに遅刻した。" },
    { id: "n14", text: "彼の話はおもしろかったが、少し長すぎた。" },
    { id: "n15", text: "計画は立てたものの、なかなか実行できずにいる。" },
    { id: "n16", text: "空が暗くなってきたので、そろそろ帰ろう。" },
    { id: "n17", text: "何度も練習したおかげで、本番はうまくいった。" },
    { id: "n18", text: "彼女が来るまで、ここで待つことにした。" },
    { id: "n19", text: "値段は高かったが、思い切って買ってしまった。" },
    { id: "n20", text: "資料をまとめてから、会議に臨むつもりだ。" },
  ],
  hard: [
    { id: "h01", text: "待って、今どこにいるの？" },
    { id: "h02", text: "本当に、これで終わりなの？" },
    { id: "h03", text: "やった、ついに完成した！" },
    { id: "h04", text: "なぜだ、どうしてこうなった。" },
    { id: "h05", text: "えっ、そんな話は聞いていない。どういうことだ。" },
    { id: "h06", text: "大丈夫、きっとうまくいくさ、と彼は笑った。" },
    { id: "h07", text: "信じられない、こんなことが起きるなんて。" },
    { id: "h08", text: "おい、勝手に決めるな！" },
    { id: "h09", text: "すごい、本当にできたんだね！" },
    { id: "h11", text: "まさか、君がやったのか？" },
    { id: "h12", text: "落ち着いて、深呼吸をして、もう一度考えよう。" },
    { id: "h13", text: "急げ、時間がない、置いていくぞ！" },
    { id: "h14", text: "彼は言った。もう二度と戻らない、と。" },
    { id: "h15", text: "本当にそれでいいのか、よく考えてほしい。" },
    { id: "h16", text: "やめろ、それ以上言うな！" },
    { id: "h17", text: "どうして、こんな簡単なことができないんだ。" },
    { id: "h18", text: "あれ、鍵をどこに置いたっけ。" },
    {
      id: "h10",
      // 読点の位置で意味が変わる有名な例。どちらも正解。
      text: "ここで、はきものを脱いでください。",
      tags: ["意味変化"],
      variants: ["ここでは、きものを脱いでください。"],
    },
  ],
};

// 内蔵（手書き）＋ 事前生成（problems-generated.json）＋ 意味が変わる系（手作り厳選）を合流。
// 意味変化系は「読点の位置で修飾先が実際に変わる」ものだけを厳選し、tags:["意味変化"] を付けている。
const MC = MEANING_CHANGE.map((p) => ({ ...p, tags: ["意味変化"], source: "builtin" }));

export const PROBLEMS = {
  easy: [...BASE_PROBLEMS.easy, ...(generated.easy || [])],
  normal: [...BASE_PROBLEMS.normal, ...(generated.normal || [])],
  hard: [...BASE_PROBLEMS.hard, ...MC, ...(generated.hard || [])],
};

// 意味が変わる系だけを取り出す（将来の「意味変化フォーカス」モード用）
export const MEANING_CHANGE_PROBLEMS = MC;

// 完成文 → { base: 句読点抜き文字配列, answer: {gap番号: 記号}, total: 句読点数 }
// gap g は base[g] の左のスキマ（g は 0..base.length）。
export function parse(full) {
  const base = [];
  const answer = {};
  for (const ch of full) {
    if (PUNCT.has(ch)) answer[base.length] = ch;
    else base.push(ch);
  }
  return { base, answer, total: Object.keys(answer).length };
}

// 正解文を1行で組み立てる（結果画面で「正解はこれ」を見せる用）
export function answerString(problem) {
  return (problem.variants && problem.variants.length)
    ? problem.text + "（別解: " + problem.variants.join(" / ") + "）"
    : problem.text;
}
