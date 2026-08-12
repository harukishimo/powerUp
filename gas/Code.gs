/**
 * powerUp 継続タスク LINE リマインダー
 *
 * 30分ごとのインストール型トリガーで runDailyTaskReminder を実行します。
 * LINEの認証情報はコードへ直書きせず、Script Propertiesへ保存してください。
 */

const POWERUP_TIME_ZONE = "Asia/Tokyo";
const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const REMINDER_HANDLER = "runDailyTaskReminder";
const HABIT_MASTER_SHEET = "habit_master";
const HABIT_LOG_SHEET = "habit_logs";
const DEFAULT_USER_KEY = "default";
const MAX_TASKS_IN_MESSAGE = 20;
const REMINDER_PROPERTY_PREFIX = "powerup:reminder:";

const REMINDER_TEMPLATES = {
  light: [
    "おはようございます！今日の未完了タスクはこちらです。\n{{TASKS}}\nまずはひとつ、軽く始めてみましょう。",
    "今日の積み上げ、まだここからです。\n{{TASKS}}\n5分だけでも手をつけると流れが作れます。",
    "ちょっとだけ進捗チェックです。\n{{TASKS}}\nできそうなものから1つ片づけましょう。",
    "今日の習慣、忘れていませんか？\n{{TASKS}}\n小さな達成をひとつ増やしておきましょう。",
    "やさしくリマインドです。\n{{TASKS}}\n未来の自分のために、少しだけ進めてみませんか？",
  ],
  yellow: [
    "そろそろ黄色信号です。今日の未完了タスクがあります。\n{{TASKS}}\n夜が深くなる前に、1つ終わらせておきましょう。",
    "夜の時間に入りました。まだ残っているタスクはこちらです。\n{{TASKS}}\n今のうちに着手すると安心です。",
    "今日の残り時間を意識するタイミングです。\n{{TASKS}}\n優先するものを1つ決めて進めましょう。",
    "未完了タスクを確認しましょう。\n{{TASKS}}\n全部でなくても、できるところまで進めておきましょう。",
    "このままだと持ち越しになりそうなタスクがあります。\n{{TASKS}}\n短時間で終わるものから片づけましょう。",
  ],
  alert: [
    "⚠️ 今日のラストスパートです！未完了タスクがあります。\n{{TASKS}}\n今日が終わる前にやっちゃいましょう。",
    "⚠️ まもなく今日が終わります。\n{{TASKS}}\n明日に持ち越さないものを今すぐ1つ終わらせましょう。",
    "⚠️ 最終チェックです。まだ完了していないタスクがあります。\n{{TASKS}}\nあと少し、今日のうちに片づけましょう。",
    "⚠️ 今日の締め切りが近づいています。\n{{TASKS}}\nできるものからチェックを付けていきましょう。",
    "⚠️ まだ未完了があります。今日の残り時間はわずかです。\n{{TASKS}}\n未来の自分のために、今ここで終わらせましょう。",
  ],
};

/** 30分ごとのトリガーから呼ばれるメイン処理。 */
function runDailyTaskReminder() {
  return runDailyTaskReminderAt_(new Date());
}

function runDailyTaskReminderAt_(now) {
  const time = getJstTimeParts_(now);
  const slot = getReminderSlot_(time.hour, time.minute);
  if (!slot) return logResult_({ status: "quiet_hours", date: time.date });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return logResult_({ status: "locked", date: time.date, slot: slot.id });

  try {
    const properties = PropertiesService.getScriptProperties();
    cleanupOldReminderProperties_(properties, time.date);
    const sentKey = reminderPropertyKey_("sent", time.date, slot.id);
    const failedKey = reminderPropertyKey_("failed", time.date, slot.id);
    if (properties.getProperty(sentKey)) return logResult_({ status: "already_sent", date: time.date, slot: slot.id });
    if (properties.getProperty(failedKey)) return logResult_({ status: "non_retryable_failure", date: time.date, slot: slot.id });

    const spreadsheet = getPowerUpSpreadsheet_(properties);
    const userKey = properties.getProperty("TARGET_USER_KEY") || DEFAULT_USER_KEY;
    const habits = readSheetObjects_(spreadsheet, HABIT_MASTER_SHEET, false);
    const habitLogs = readSheetObjects_(spreadsheet, HABIT_LOG_SHEET, true);
    const incompleteTasks = findIncompleteTasks_(habits, habitLogs, time.date, time.weekday, userKey);
    if (incompleteTasks.length === 0) {
      return logResult_({ status: "all_complete", date: time.date, slot: slot.id, incompleteCount: 0 });
    }

    const retryKeyProperty = reminderPropertyKey_("retry", time.date, slot.id);
    const retryMessageProperty = reminderPropertyKey_("message", time.date, slot.id);
    const retryKey = properties.getProperty(retryKeyProperty) || Utilities.getUuid();
    const storedMessage = properties.getProperty(retryMessageProperty);
    const appUrl = properties.getProperty("POWERUP_APP_URL") || "";
    const message = storedMessage || buildReminderMessage_(slot.tone, incompleteTasks, Math.random(), appUrl);
    properties.setProperty(retryKeyProperty, retryKey);
    properties.setProperty(retryMessageProperty, message);

    try {
      const response = executeLinePush_(message, retryKey, properties);
      properties.setProperty(sentKey, now.toISOString());
      properties.deleteProperty(retryKeyProperty);
      properties.deleteProperty(retryMessageProperty);
      return logResult_({
        status: response.statusCode === 409 ? "accepted_on_previous_attempt" : "sent",
        date: time.date,
        slot: slot.id,
        tone: slot.tone,
        incompleteCount: incompleteTasks.length,
      });
    } catch (error) {
      if (error && error.retryable === false) properties.setProperty(failedKey, now.toISOString());
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

/** 同名の古いトリガーを削除し、30分間隔のトリガーを1つだけ作成する。 */
function setupDailyTaskReminderTrigger() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheet = getPowerUpSpreadsheet_(properties);
  properties.setProperty("SPREADSHEET_ID", spreadsheet.getId());
  getRequiredProperty_(properties, "LINE_CHANNEL_ACCESS_TOKEN");
  getRequiredProperty_(properties, "LINE_USER_ID");
  readSheetObjects_(spreadsheet, HABIT_MASTER_SHEET, false);
  readSheetObjects_(spreadsheet, HABIT_LOG_SHEET, false);
  removeDailyTaskReminderTriggers();
  const trigger = ScriptApp.newTrigger(REMINDER_HANDLER).timeBased().everyMinutes(30).create();
  console.log(JSON.stringify({ status: "trigger_created", handler: REMINDER_HANDLER, triggerId: trigger.getUniqueId() }));
  return trigger.getUniqueId();
}

function removeDailyTaskReminderTriggers() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === REMINDER_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });
  console.log(JSON.stringify({ status: "triggers_removed", count: removed }));
  return removed;
}

/** LINEへ送信せず、現在の未完了タスクと軽い文面をログで確認する。 */
function previewTodayReminder() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheet = getPowerUpSpreadsheet_(properties);
  const time = getJstTimeParts_(new Date());
  const userKey = properties.getProperty("TARGET_USER_KEY") || DEFAULT_USER_KEY;
  const habits = readSheetObjects_(spreadsheet, HABIT_MASTER_SHEET, false);
  const habitLogs = readSheetObjects_(spreadsheet, HABIT_LOG_SHEET, true);
  const incompleteTasks = findIncompleteTasks_(habits, habitLogs, time.date, time.weekday, userKey);
  const message = incompleteTasks.length > 0
    ? buildReminderMessage_("light", incompleteTasks, Math.random(), properties.getProperty("POWERUP_APP_URL") || "")
    : "本日の対象タスクはすべて完了しています。";
  console.log(message);
  return { date: time.date, incompleteTasks: incompleteTasks, message: message };
}

/** 設定変更後などに、当日分の送信済み・失敗・リトライ状態を消去する。 */
function clearTodayReminderState() {
  const today = getJstTimeParts_(new Date()).date;
  const properties = PropertiesService.getScriptProperties();
  let deleted = 0;
  properties.getKeys().forEach(function (key) {
    if (key.indexOf(REMINDER_PROPERTY_PREFIX) === 0 && key.indexOf(":" + today + ":") >= 0) {
      properties.deleteProperty(key);
      deleted += 1;
    }
  });
  console.log(JSON.stringify({ status: "today_state_cleared", date: today, count: deleted }));
  return deleted;
}

function getReminderSlot_(hour, minute) {
  if (hour < 6 || hour >= 24) return null;
  if (hour < 12 || (hour === 12 && minute < 30)) return { id: "light-1", tone: "light" };
  if (hour < 19) return { id: "light-2", tone: "light" };
  if (hour < 22) return { id: "yellow-" + hour, tone: "yellow" };
  const half = minute < 30 ? "00" : "30";
  return { id: "alert-" + hour + half, tone: "alert" };
}

function getJstTimeParts_(date) {
  const dateText = Utilities.formatDate(date, POWERUP_TIME_ZONE, "yyyy-MM-dd");
  const hour = Number(Utilities.formatDate(date, POWERUP_TIME_ZONE, "HH"));
  const minute = Number(Utilities.formatDate(date, POWERUP_TIME_ZONE, "mm"));
  const weekday = new Date(dateText + "T12:00:00+09:00").getUTCDay();
  return { date: dateText, hour: hour, minute: minute, weekday: weekday };
}

function findIncompleteTasks_(habitRows, logRows, date, weekday, userKey) {
  const completedIds = {};
  logRows.forEach(function (row) {
    if (String(row.user_key || "") !== userKey) return;
    if (normalizeDateValue_(row.log_date) !== date) return;
    if (!booleanValue_(row.completed)) return;
    completedIds[String(row.habit_id || "")] = true;
  });

  const seen = {};
  return habitRows.reduce(function (tasks, row) {
    const habitId = String(row.habit_id || "");
    if (!habitId || seen[habitId]) return tasks;
    seen[habitId] = true;
    if (String(row.user_key || "") !== userKey) return tasks;
    if (!booleanValue_(row.active)) return tasks;
    const createdDate = normalizeDateValue_(row.created_at);
    if (createdDate && createdDate > date) return tasks;
    if (parseTargetDays_(row.target_days).indexOf(weekday) < 0) return tasks;
    if (completedIds[habitId]) return tasks;
    const title = normalizeTaskTitle_(row.habit_name);
    if (title) tasks.push({ id: habitId, title: title });
    return tasks;
  }, []);
}

function buildReminderMessage_(tone, tasks, randomValue, appUrl) {
  const templates = getTemplatesForTone_(tone);
  const index = Math.min(templates.length - 1, Math.max(0, Math.floor(randomValue * templates.length)));
  const taskLines = tasks.slice(0, MAX_TASKS_IN_MESSAGE).map(function (task) { return "・" + task.title; });
  if (tasks.length > MAX_TASKS_IN_MESSAGE) taskLines.push("・ほか" + (tasks.length - MAX_TASKS_IN_MESSAGE) + "件");
  let message = templates[index].replace("{{TASKS}}", taskLines.join("\n"));
  if (appUrl) message += "\n\npowerUpを開く: " + appUrl;
  return message.slice(0, 4900);
}

function getTemplatesForTone_(tone) {
  const templates = REMINDER_TEMPLATES[tone];
  if (!templates || templates.length !== 5) throw new Error("リマインドテンプレート設定が正しくありません: " + tone);
  return templates;
}

function executeLinePush_(message, retryKey, properties) {
  const accessToken = getRequiredProperty_(properties, "LINE_CHANNEL_ACCESS_TOKEN");
  const userId = getRequiredProperty_(properties, "LINE_USER_ID");
  const response = UrlFetchApp.fetch(LINE_PUSH_URL, {
    method: "post",
    contentType: "application/json; charset=UTF-8",
    headers: {
      Authorization: "Bearer " + accessToken,
      "X-Line-Retry-Key": retryKey,
    },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text: String(message) }],
      notificationDisabled: false,
    }),
    muteHttpExceptions: true,
  });
  const statusCode = response.getResponseCode();
  if ((statusCode >= 200 && statusCode < 300) || statusCode === 409) return { statusCode: statusCode };
  const error = new Error("LINE push failed (HTTP " + statusCode + "): " + String(response.getContentText() || "").slice(0, 500));
  error.retryable = statusCode === 429 || statusCode >= 500;
  throw error;
}

function getPowerUpSpreadsheet_(properties) {
  const spreadsheetId = properties.getProperty("SPREADSHEET_ID");
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error("SPREADSHEET_IDをScript Propertiesへ設定してください。");
  return active;
}

function readSheetObjects_(spreadsheet, sheetName, allowMissing) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    if (allowMissing) return [];
    throw new Error("必要なシートが見つかりません: " + sheetName);
  }
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function (value) { return String(value || "").trim(); });
  return values.slice(1).map(function (row) {
    const object = {};
    headers.forEach(function (header, index) { if (header) object[header] = row[index]; });
    return object;
  });
}

function parseTargetDays_(value) {
  if (Array.isArray(value)) return value.map(Number).filter(validWeekday_);
  const text = String(value || "").trim();
  if (!text) return [0, 1, 2, 3, 4, 5, 6];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const days = parsed.map(Number).filter(validWeekday_);
      if (days.length > 0) return days;
    }
  } catch (_error) {
    // 旧形式のカンマ区切りを下で処理する。
  }
  const days = text.split(",").map(Number).filter(validWeekday_);
  return days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
}

function validWeekday_(day) {
  return Number.isInteger(day) && day >= 0 && day <= 6;
}

function booleanValue_(value) {
  return value === true || value === 1 || String(value || "").toLowerCase() === "true";
}

function normalizeDateValue_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, POWERUP_TIME_ZONE, "yyyy-MM-dd");
  const text = String(value || "");
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function normalizeTaskTitle_(value) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function reminderPropertyKey_(kind, date, slotId) {
  return REMINDER_PROPERTY_PREFIX + kind + ":" + date + ":" + slotId;
}

function cleanupOldReminderProperties_(properties, today) {
  properties.getKeys().forEach(function (key) {
    if (key.indexOf(REMINDER_PROPERTY_PREFIX) === 0 && key.indexOf(":" + today + ":") < 0) {
      properties.deleteProperty(key);
    }
  });
}

function getRequiredProperty_(properties, key) {
  const value = properties.getProperty(key);
  if (!value) throw new Error(key + "をScript Propertiesへ設定してください。");
  return value;
}

function logResult_(result) {
  console.log(JSON.stringify(result));
  return result;
}
