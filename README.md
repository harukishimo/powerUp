# powerUp

睡眠・食事・スマートフォン利用・実際の成果を記録し、自分の生産性が上がりやすい条件を見つけるNext.jsアプリです。

成果・集中・品質の実績とは別に、睡眠、起床後時間、現在の覚醒感、予定、直近の食事、デジタル注意環境から「現在時点の推定パフォーマンス」を表示します。推定値は評価時刻と入力カバー率を明示し、実績スコアや実績平均とは混ぜません。

## 技術構成

- Next.js App Router / React / TypeScript
- Google Spreadsheet（Google Sheets API）
- Google Gemini API（サーバー側のみ）
- Vercel
- データベースなし

## ローカル起動

```bash
npm install
cp .env.example .env.local
npm run dev
```

環境変数が未設定の開発環境では、メモリ上のデモデータへフォールバックします。実際の保存を行う場合は、下記のGoogle Sheets設定を行ってください。

## 環境変数

```text
GEMINI_API_KEY=
GEMINI_MODEL=
GOOGLE_SHEETS_SPREADSHEET_ID=1CqXYXrcsblxe2I7NBlesRSBq6DP4be1Bx8e1lyZWu50
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
APP_ACCESS_TOKEN=
```

`GEMINI_API_KEY`、サービスアカウント秘密鍵、アクセスコードはブラウザへ公開しないでください。`NEXT_PUBLIC_`接頭辞は付けません。

`APP_ACCESS_TOKEN`を設定すると、アプリ内アクセスゲートが有効になります。未設定の場合は、個人利用ではVercel Deployment Protectionなどの外部アクセス制御を利用してください。

## Google Spreadsheetの準備

接続先は[powerUp用Spreadsheet](https://docs.google.com/spreadsheets/d/1CqXYXrcsblxe2I7NBlesRSBq6DP4be1Bx8e1lyZWu50/edit)です。既存の`Tasks`タブは変更せず、アプリ用に次の6タブを使用します。

1. Google Cloudプロジェクトを作成する
2. Google Sheets APIを有効化する
3. サービスアカウントを作成する
4. 対象Spreadsheetをサービスアカウントのメールアドレスへ共有する
5. 初回アクセス時に次の6タブが自動作成されることを確認する

```text
daily_logs
meal_logs
snack_logs
ai_insights
habit_master
habit_logs
```

列定義は[`docs/技術要件書.md`](./docs/技術要件書.md)の「データモデルとGoogle Spreadsheet」を参照してください。`daily_logs`には画面の詳細状態を復元するための`payload_json`列に加え、推定値・評価時刻・6要素の内訳を実績と分離して保存します。

アプリ用タブが存在しない場合は初回利用時に自動作成され、列が旧構成の場合は不足したアプリ管理列が既存列を動かさず末尾へ自動追加されます。`Tasks`タブやアプリ管理外の列は変更しません。

サービスアカウントの秘密鍵はJSONファイルとしてコミットせず、VercelのEnvironment Variablesへ登録してください。改行はVercel上で`\\n`として保持し、アプリ側で復元します。

## 画面

- `/`：今日のコンディション、日次入力、Gemini提案
- `/logs`：直近7日間のデイリーログ振り返り
- `/habits`：継続項目の月間カレンダー、日別達成チェック、連続回数
- `/habits/manage`：継続項目の追加・編集・休止・再開
- `/access`：`APP_ACCESS_TOKEN`設定時のアクセスゲート
- `/api/health`：デプロイ後の設定状態確認（秘密情報そのものは返しません）

## PWA

`app/manifest.ts`と`public/icons/`に、Chromeがインストール可能なアプリとして判定するためのManifestと192px・512pxアイコンを用意しています。`public/sw.js`はPWAのライフサイクルを有効にしますが、`/api/`のレスポンスや個人データはキャッシュしません。

デプロイ後は、次の条件を満たした状態でChromeを再読み込みしてください。

1. HTTPS（またはlocalhost）でアクセスする
2. DevToolsのApplication → ManifestでManifestと2種類のアイコンが読み込めていることを確認する
3. 既存の通常ショートカットを削除し、ページを再読み込みする
4. アドレスバーのインストールアイコン、またはChromeメニューの「powerUpをインストール」を選ぶ

`APP_ACCESS_TOKEN`を使う場合も、Manifest・アイコン・Service Workerは認証リダイレクトの対象にせず、静的ファイルとして配信してください。

## API発火方針

- 入力中はAPIを発火しない
- 保存ボタンでのみ`POST /api/logs`
- 日付変更でのみ`GET /api/logs/[date]`
- Geminiボタンでのみ`POST /api/ai/score`
- 継続項目の追加・編集時に`POST /api/habits`または`PATCH /api/habits/[id]`
- カレンダーの達成チェック時に`POST /api/habit-logs`
- Geminiの失敗時も、決定的な採点と保存は継続する

詳細は[`docs/API発火仕様書.md`](./docs/API発火仕様書.md)を参照してください。

## 品質確認

```bash
npm run lint
npm run test
npx tsc --noEmit
npm run build
```

## Vercelデプロイ

1. GitリポジトリをVercelへ接続する
2. Development / Preview / Productionごとに環境変数を設定する
3. Preview用とProduction用のSpreadsheetを分ける
4. Previewデプロイで`/api/health`、保存、ログ表示、Geminiフォールバックを確認する
5. 個人データを扱う前に、Vercel Deployment Protectionまたは`APP_ACCESS_TOKEN`を有効化する
6. Productionへデプロイする

環境変数を変更した場合は、新しいデプロイへ反映されることを確認してください。

## ドキュメント

- [`docs/要件定義書.md`](./docs/要件定義書.md)
- [`docs/採点ロジックレビュー.md`](./docs/採点ロジックレビュー.md)
- [`docs/デザイン.md`](./docs/デザイン.md)
- [`docs/技術要件書.md`](./docs/技術要件書.md)
- [`docs/API発火仕様書.md`](./docs/API発火仕様書.md)
- [`docs/実装手順書.md`](./docs/実装手順書.md)
- [`docs/エージェント一覧定義書.md`](./docs/エージェント一覧定義書.md)
