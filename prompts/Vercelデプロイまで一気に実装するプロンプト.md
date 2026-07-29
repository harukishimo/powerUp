# Vercelデプロイまで一気に実装するプロンプト

以下を、powerUpリポジトリを操作できるコーディングエージェントへそのまま渡して使用する。

````text
あなたはpowerUpの実装責任者です。
このリポジトリを、環境変数を設定すればVercelへデプロイできるNext.jsアプリまで一気に実装してください。
実装だけでなく、テスト、セキュリティ確認、デプロイ設定、README更新まで完了させてください。

## 最初に必ず読むファイル

- docs/要件定義書.md
- docs/デザイン.md
- docs/技術要件書.md
- docs/API発火仕様書.md
- docs/実装手順書.md
- docs/エージェント一覧定義書.md
- mock/index.html

要件定義書・デザイン仕様書・技術要件書・API発火仕様書に矛盾がある場合は、要件定義書の機能要件、API発火仕様書の発火条件、技術要件書のセキュリティ条件を優先してください。判断した内容はREADMEまたは実装メモへ記録してください。

## 実装の前提

- フロントエンドはNext.js App Router、React、TypeScriptで実装する
- DBは追加しない
- Google SpreadsheetをMVPの保存先にする
- Google Sheets APIはNext.jsのサーバー側からのみ呼び出す
- AIはGoogle Gemini APIを使う
- Gemini APIはNext.jsのサーバー側からのみ呼び出す
- デプロイ先はVercel
- `/Users/haruki.shimo/Documents/powerUp/mock/index.html`のUIを見た目の基準にする
- 既存のdocsとmockは削除しない
- 実際のAPIキー、サービスアカウント秘密鍵、Spreadsheetの実データはコードへ書かない
- 個人の睡眠・食事データを扱うため、Productionでは認証またはVercelのアクセス制御を有効にできる構成にする

## エージェント体制

次の役割を順番に、必要な箇所だけ並列に実行してください。

1. Orchestrator / Tech Lead：全体分解、仕様判断、完了判定
2. Requirements Agent：要件と受け入れ条件の確認
3. Architecture Agent：型、API境界、Server/Client境界の設計
4. UX/UI Agent：mockをもとに画面と状態を実装指示へ変換
5. Scoring Agent：固定配点の純粋関数とテスト
6. Frontend Agent：Next.js画面、フォーム、ログ振り返り
7. Backend & Sheets Agent：Sheets API、Route Handler、冪等保存
8. Gemini Agent：Gemini API、構造化出力、フォールバック
9. QA Agent：ユニット、API、UI、E2E、発火回数の確認
10. Blue Team：防御策、入力検証、認証、秘密情報、運用設定
11. Red Team：検証環境を対象に攻撃シナリオを実施
12. Purple Team：Redの指摘とBlueの修正を突合し、再テスト
13. DevOps Agent：Vercel Preview/Production設定とデプロイ準備

同じファイルを複数のエージェントが同時編集しないでください。各工程の終了時に、変更ファイル、実行コマンド、検証結果、残存リスク、次工程を報告してください。

## 実装する機能

### 今日の画面 `/`

- 総合スコア100点満点
- 睡眠50点、食事30点、スマートフォン10点、実際の成果10点
- Pixel Watch睡眠スコア0〜100を50点へ換算
- 朝食、昼食、夕食を別々に記録し、それぞれ8点で評価
- 間食を独立して記録し、1日3点で評価
- スマートフォン利用時間、作業中の分離、朝夜の利用抑制を記録
- 実際の成果、集中作業時間、振り返り、短いコメントを記録
- 7日間の推移とカテゴリ内訳を表示
- Gemini AI insightを表示

### ログ画面 `/logs`

- 直近7日間の日付を選択
- 日ごとの総合スコア、記録率、4カテゴリ内訳を表示
- 睡眠、朝昼夕の食事、間食、スマートフォン、成果コメントを表示
- Geminiの気づきと当日のタイムラインを表示
- 未入力と0点を区別

## API発火ルール

### 発火するAPI

- `GET /api/health`：手動、監視、デプロイ後の確認だけ。画面から自動発火しない
- `GET /api/logs?from=YYYY-MM-DD&to=YYYY-MM-DD`：今日・ログ画面の初期表示で一覧未取得の場合だけ
- `GET /api/logs/[date]`：別の日付を選択した場合だけ。同じ日付の再選択では発火しない
- `POST /api/logs`：ユーザーが明示的に保存ボタンを押した場合だけ
- `POST /api/ai/score`：ユーザーが「Gemini採点案」ボタンを押した場合だけ

### 発火しない操作

- テキスト入力の1文字ごとの変更
- 食事チェックリストの変更
- 間食フォームの追加・削除中
- カードの開閉、スクロール、グラフのホバー
- AI提案の表示だけ

### API実装ルール

- 保存APIは`clientRequestId`で冪等にする
- 保存中は保存ボタンをdisabledにする
- GETは同じ条件で重複発火させない
- Geminiの429は自動再試行せず、ユーザーの再実行を待つ
- API失敗時に入力中の状態を破棄しない
- APIレスポンスはZodで検証してからUIへ渡す
- ブラウザからGoogle Sheets APIやGemini APIへ直接アクセスしない

## 実装手順

### 1. 現状確認

- `git status`を確認する
- 既存docsとmockを読む
- Next.jsプロジェクトがなければ、App Router + TypeScriptで初期化する
- 既存ファイルを削除せず、必要なソースを追加する

### 2. 基盤とデザイン

- `app/layout.tsx`、`app/page.tsx`、`app/logs/page.tsx`を作る
- mockの配色、カード、サイドバー、モバイルレイアウトを再現する
- CSS変数と共通UIコンポーネントを作る
- 未入力、保存中、成功、エラー、AI提案の状態を実装する

### 3. 型と採点

- `types/domain.ts`、`types/api.ts`を作る
- `lib/validation.ts`にZodスキーマを作る
- `lib/scoring.ts`を純粋関数として実装する
- スコアの上限、境界値、未入力をテストする

固定配点：

```text
総合 = 睡眠50 + 食事30 + スマホ10 + 成果10
食事 = 朝食8 + 昼食8 + 夕食8 + 時間帯3 + 間食3
成果 = 実際の成果5 + 集中時間3 + 振り返り2
```

AIへ総合スコアの計算を委ねないでください。

### 4. Google Sheets

- `lib/sheets.ts`をサーバー専用で作る
- `daily_logs`、`meal_logs`、`snack_logs`、`ai_insights`の4タブを前提にする
- 技術要件書に記載されたヘッダーと型を使う
- 日次・食事は日付と区分をキーにupsertする
- 間食は`snack_id`で追加・更新する
- 同じリクエストの再送で二重行を作らない
- Google Sheets APIが利用できない場合の開発用mockアダプターを用意してもよい

### 5. Route Handler

次を実装する。

- `app/api/health/route.ts`
- `app/api/logs/route.ts`
- `app/api/logs/[date]/route.ts`
- `app/api/ai/score/route.ts`

各Route Handlerで、認証確認、Zod検証、エラー整形、requestId付与を行う。健康データや秘密情報をエラーメッセージに含めないでください。

### 6. Gemini

- `@google/genai`を使う
- モデル名は`GEMINI_MODEL`環境変数から読む
- Geminiへ渡す情報は成果コメント、必要な食事概要、決定的スコアなど最小限にする
- 氏名、メールアドレス、Spreadsheet URL、APIキーをプロンプトへ含めない
- 構造化出力で次の形式を返す

```json
{
  "achievementScore": 0,
  "confidence": "low | medium | high",
  "reason": "短い理由",
  "nextExperiment": "明日試すことを1つ"
}
```

- JSONの構文が正しくても、範囲、文字数、列挙値をZodで検証する
- Gemini失敗時は決定的採点と通常保存を継続する
- AI提案はユーザーが採用・修正してから保存する

### 7. UIとAPI接続

- 保存ボタンを押したときだけ`POST /api/logs`
- 日付選択時だけ詳細GET
- Geminiボタンを押したときだけAI POST
- 取得済みの日付はキャッシュして再利用
- `isLoading`中の二重発火を抑制
- 保存後に一覧と詳細を更新する

### 8. テスト

次のコマンドを実行できるよう`package.json`へ定義する。

```text
npm run lint
npm run test
npm run build
```

最低限、以下を検証する。

- 睡眠82 → 41点
- 朝昼夕・間食・時間帯の食事配点
- 集中時間29/30/60/90分の境界
- 未入力と0点
- 保存の冪等性
- Geminiの正常・429・不正JSON
- APIキーがクライアントへ漏れないこと
- 767px以下の主要画面

### 9. レッド・ブルー・パープルレビュー

#### Blue Team

- 入力検証、認証、レート制限、秘密情報、セキュリティヘッダーを確認
- データのuser/dateスコープを確認
- 外部APIのエラー・ログ・タイムアウトを確認

#### Red Team

検証用環境だけを対象に、以下を試す。

- 未認証アクセス
- 他日付・他ユーザー参照
- 巨大入力、不正型、API連打
- prompt injection
- XSSになり得るAI出力
- エラーからの秘密情報抽出
- Preview URLやクライアントバンドルからの環境変数探索

#### Purple Team

- 各Red findingに対するBlue修正を再現テストする
- 未解決のHigh/Criticalを残さない
- 重要な攻撃シナリオを回帰テストへ追加する

### 10. Vercelデプロイ準備

- `.env.example`を作成する。値は空欄またはダミー値のみとする
- `README.md`へSheetsタブ作成、サービスアカウント共有、環境変数設定を記載する
- VercelのPreviewとProductionでSpreadsheetを分ける
- VercelのNode.jsランタイムでRoute Handlerが動作することを確認する
- `/api/health`を用意する
- `npm run lint`、`npm run test`、`npm run build`を通す
- Vercelへの自動デプロイを阻害する未設定の必須環境変数を起動時に分かる形で示す
- 環境変数が未設定でも、ビルド自体は可能にし、実行時に安全な設定エラーを返す

## 必須環境変数

```text
GEMINI_API_KEY=
GEMINI_MODEL=
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
APP_ACCESS_TOKEN=
```

実データと秘密情報は、このプロンプトへ貼り付けず、Vercel Project SettingsのEnvironment Variablesへ設定する。Development、Preview、Productionを分けて設定し、変更後は新しいデプロイで反映する。

## 最終成果物

次の状態になった時点で実装完了とする。

- Next.jsアプリが起動する
- `/`と`/logs`が動作する
- Google Spreadsheetへ日次・食事・間食・AI提案を保存できる
- Gemini APIを明示操作で呼び出せる
- AI停止時も保存・採点が可能である
- `npm run lint`、`npm run test`、`npm run build`が成功する
- Blue / Red / Purpleレビューを完了する
- `.env.example`があり、秘密情報がリポジトリにない
- Vercelで環境変数を設定すればPreview/Productionへデプロイできる
- READMEにローカル起動、Sheets準備、環境変数、Vercel手順がある

## 進行中に守ること

- 不足するAPIキーやGoogle認証情報は勝手に生成・推測しない
- 必要な認証情報がない場合は、mockアダプターで実装とテストを進め、最後に不足する環境変数だけを報告する
- 実データを使ったテストをしない
- 既存のmockや仕様書を壊した場合は、実装完了と報告しない
- 仕様変更が必要な場合は、変更理由と影響範囲を記録してから実装する
````

## このプロンプトを使う前に利用者が準備するもの

1. Google Cloudプロジェクト
2. Google Sheets APIの有効化
3. 開発用・Preview用・Production用のSpreadsheet
4. Spreadsheetへアクセスできるサービスアカウント
5. Gemini APIキーとAI Studioで利用可能なモデル名
6. VercelプロジェクトまたはGitリポジトリへの接続権限

上記の秘密情報はプロンプト本文へ貼り付けず、Vercelの環境変数へ登録する。

## 参照資料

- [実装手順書](../docs/実装手順書.md)
- [エージェント一覧定義書](../docs/エージェント一覧定義書.md)
- [API発火仕様書](../docs/API発火仕様書.md)
- [Vercel環境変数](https://vercel.com/docs/environment-variables)
- [Vercel CLIの環境変数](https://vercel.com/docs/cli/env)
- [Gemini APIの構造化出力](https://ai.google.dev/gemini-api/docs/structured-output)
