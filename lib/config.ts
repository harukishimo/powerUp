export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "",
  spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "",
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "",
  serviceAccountPrivateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "",
  appAccessToken: process.env.APP_ACCESS_TOKEN ?? "",
};

export function isSheetsConfigured() {
  return Boolean(config.spreadsheetId && config.serviceAccountEmail && config.serviceAccountPrivateKey);
}

export function isGeminiConfigured() {
  return Boolean(config.geminiApiKey && config.geminiModel);
}

export function isProductionConfigMissing() {
  return process.env.NODE_ENV === "production" && !isSheetsConfigured();
}
