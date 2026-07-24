export function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "QuotaExceededError") return true;
  return error instanceof Error && (error.name === "QuotaExceededError" || /quota/i.test(error.message));
}

export function storageErrorMessage(error: unknown): string {
  return isQuotaExceededError(error)
    ? "本地存储已满，本次更改未保存。请立即导出备份，并清理浏览器存储后继续。"
    : error instanceof Error
      ? error.message
      : "本地数据无法保存。";
}
