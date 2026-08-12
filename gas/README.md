# LINE未完了タスクリマインダー（Google Apps Script）

`habit_master`と`habit_logs`を読み、今日の対象曜日に設定された有効な継続タスクのうち、未完了のものをLINE Messaging APIで通知します。Next.jsやVercelのJobは使用しません。

## 送信スケジュール

GAS自体は30分ごとに起動します。Apps Scriptの時間主導トリガーは実行時刻が多少ずれるため、時刻の完全一致ではなく、下記の「送信枠」ごとにScript Propertiesへ送信済み状態を記録します。

| 日本時間 | 最大送信回数 | 送信枠 | 文面 |
|---|---:|---|---|
| 00:00–05:59 | 0回 | 起動するが送信しない | なし |
| 06:00–12:29 | 1回 | `light-1` | 軽い口調・5種類からランダム |
| 12:30–18:59 | 1回 | `light-2` | 軽い口調・5種類からランダム |
| 19:00–21:59 | 1回／時間 | 19時・20時・21時 | 黄色信号・5種類からランダム |
| 22:00–23:59 | 2回／時間 | 毎時00分枠・30分枠 | 警告・5種類からランダム |

1日の最大送信数は9回です。対象タスクがすべて完了している場合は送信しません。同じ送信枠では、GASが複数回起動しても1回しか送信しません。

## 設定手順

1. powerUpで使用しているGoogle Spreadsheetを開き、「拡張機能」→「Apps Script」を開く。
2. [`Code.gs`](./Code.gs)を貼り付ける。
3. Apps Scriptのプロジェクト設定で「appsscript.json マニフェスト ファイルをエディタで表示する」を有効にし、[`appsscript.json`](./appsscript.json)の内容を反映する。
4. 「プロジェクトの設定」→「スクリプト プロパティ」に下記を登録する。

| キー | 必須 | 値 |
|---|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | 必須 | LINE Messaging APIのチャネルアクセストークン |
| `LINE_USER_ID` | 必須 | 通知先のLINE User ID（今回指定した`U...`形式の値） |
| `SPREADSHEET_ID` | 任意 | スプレッドシートに紐づけたGASなら初回セットアップ時に自動保存。スタンドアロンGASでは必須 |
| `TARGET_USER_KEY` | 任意 | 未設定時は`default` |
| `POWERUP_APP_URL` | 任意 | 設定するとメッセージ末尾へアプリURLを追加 |

アクセストークンはシートのセルやソースコードへ書かないでください。

5. `previewTodayReminder`を手動実行し、実行ログで未完了タスクと文面を確認する。この関数はLINE送信を行いません。
6. `setupDailyTaskReminderTrigger`を1回だけ手動実行し、権限を承認する。既存の同名トリガーは削除され、30分間隔のトリガーが1つ作成されます。
7. Apps Scriptの「トリガー」で`runDailyTaskReminder`が30分ごとに設定されていることを確認する。
8. LINE公式アカウントを通知先ユーザーが友だち追加していることを確認する。

## 運用関数

- `runDailyTaskReminder`: トリガー用。現在時刻と未完了状態を判定し、必要な場合だけ送信する。
- `previewTodayReminder`: LINE送信なしで、今日の抽出結果と軽い文面を確認する。
- `setupDailyTaskReminderTrigger`: 30分トリガーを再作成する。
- `removeDailyTaskReminderTriggers`: リマインダートリガーを停止する。
- `clearTodayReminderState`: 設定修正後などに当日の重複防止状態を消去する。

LINE送信には`X-Line-Retry-Key`を付け、リトライ中は同じキーと同じ文面をScript Propertiesに保持します。タイムアウトや5xxで次回再試行しても二重送信を防ぎ、LINEが同じリトライキーをすでに受理済みとして`409`を返した場合は送信済みとして扱います。4xxの設定エラーは同じ送信枠で繰り返さず、Apps Scriptの実行ログへ残します。

## 参照仕様

- [LINE Messaging API: Push message](https://developers.line.biz/en/reference/messaging-api/#send-push-message)
- [LINE Messaging API: Retry failed API requests](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
- [Apps Script: ClockTriggerBuilder](https://developers.google.com/apps-script/reference/script/clock-trigger-builder)
- [Apps Script: Installable triggers](https://developers.google.com/apps-script/guides/triggers/installable)
- [Apps Script: Properties Service](https://developers.google.com/apps-script/reference/properties)
- [Apps Script: Lock Service](https://developers.google.com/apps-script/reference/lock)
