export function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "QuotaExceededError") return true;
  return error instanceof Error && (error.name === "QuotaExceededError" || /quota/i.test(error.message));
}

export function storageErrorMessage(error: unknown): string {
  return isQuotaExceededError(error)
    ? "Local storage is full. The change was not saved. Export a backup now, then free browser storage before continuing."
    : error instanceof Error
      ? error.message
      : "Local data could not be saved.";
}
