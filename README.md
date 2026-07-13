# 句読点、 (kutoten)

抜けた句読点を、原稿用紙のマス目に打ち直す日本語パズル。採点は「朱入れ」形式で返ってくる。

## 動かす

```bash
npm install
npm run dev
```

http://localhost:3000 を開く。止めるときはターミナルで Ctrl + C。

## 構成

```
app/
  layout.js               メタ情報・html枠・globals.css読み込み
  page.js                 <Game /> を描画
  globals.css             リセット + body背景 + 演出のkeyframes
  api/generate/route.js   ★AI問題生成のサーバー側エンドポイント（Claude APIを呼ぶ）
components/
  Game.jsx                ゲーム本体（タイトル/待機/プレイ/結果/サマリー）※'use client'
lib/
  problems.js             内蔵問題データ + parse()
  scoring.js              grade()（採点・コンボ・難易度倍率・複数正解対応）
  validate.js             ★AI生成文の検品（記号・空白・難易度チェック）
```

## 遊び方・機能

- 難易度 easy / normal / hard（hardは「！」「？」も登場）
- スコア倍率：やさしい×1.0 ／ ふつう×1.3 ／ むずかしい×1.6
- ノーミス（★3）を連続すると **コンボ倍率**（連続2で×1.2〜上限×3.0）
- 採点は朱入れ表示。パーフェクトで朱印「秀」
- 「やめる」でセッションのサマリー（問題数・累計・最大コンボ）

## AI生成モード（任意）

タイトルの「問題」を **AI生成** にすると、Claudeが毎回あたらしい文を作る。
APIキーが要る（キーは**サーバー側だけ**で使い、ブラウザには出さない）。

1. `.env.local.example` を `.env.local` にコピー
2. 中の `ANTHROPIC_API_KEY` に自分のキーを貼る（https://console.anthropic.com/ で発行）
3. `npm run dev` を再起動

生成された文はサーバー側（`lib/validate.js`）で検品してから出す：
- 句読点は難易度に合ったものだけ（easy/normalは「、」「。」、hardは「！」「？」も可）
- 英数字・空白・かっこ・欧文記号が混ざった文は却下
- 句読点ゼロ・短すぎる文も却下
- 生成に失敗したら自動で内蔵問題に切り替え（キー未設定でも遊べる）

使用モデルは `app/api/generate/route.js` の `MODEL`。既定は haiku（速い・安い）。
品質を上げたければ `claude-sonnet-5` などに差し替え可。


## 解説機能（なぜこの句読点？）

結果画面の「なぜこの句読点？」を押すと、その正解文の句読点の理由を Claude が短く解説する。
**押したときだけ** `app/api/explain/route.js` 経由でAPIを呼ぶので、押さなければ課金は発生しない。
AIキー（`.env.local`）が要る。未設定なら「取得できませんでした」と出るだけで、ゲーム自体は普通に遊べる。


## 問題を大量に事前生成する（公開版の弾づくり）

`scripts/generate-problems.mjs` は、AIで問題＋解説を**大量生成して JSON に凍結**するスクリプト。
一度走らせておけば、公開版は `lib/problems-generated.json` を読むだけ＝**遊んでもAPI代ゼロ・表示も一瞬**。
生成問題は解説（why）を同梱するので、結果画面の解説もAPIなしで即表示される。

```bash
# .env.local に APIキーがある状態で
node scripts/generate-problems.mjs
```

- 既定で各難易度200問（計600問）、hardの約半分を「意味が変わる系」で生成。
- 途中で止めても、もう一度実行すれば続きから再開（こまめに保存している）。
- 調整用の環境変数：
  - `TARGET=100 node scripts/generate-problems.mjs`（各難易度の目標数）
  - `HENKA_RATIO=0.3 ...`（hardの意味変化の割合）
  - `MODEL=claude-sonnet-5 ...`（品質重視に切替）
- 生成後は `npm run dev` を再起動すると、内蔵58問に合流して出題される。
- コスト目安：haikuで計600問なら概ね数十円〜100円程度（残高に注意）。

生成された `lib/problems-generated.json` は目視で確認・手直しもできる（変な文を削る等）。

## 次にやれること（ロードマップ）

- 問題の難問モード（意味が変わる文）を `tags` で切り出し
- 生成問題のキャッシュ／日替わり問題／ランキング
- PWA化してスマホのホームに追加 → Vercelで公開

## メモ

- 句読点判定はローカル（正解位置との一致）。内蔵モードはAPI不要で完結。
- `npm audit fix --force` は打たないこと（Nextが壊れることがある）。公開前に一緒にバージョン整える。
