declare function showSaveFailure(error: unknown): void;

async function saveDraft(): Promise<void> {
  await Promise.reject(new Error("Draft storage is unavailable"));
}

export function onSave(): void {
  void saveDraft().catch(showSaveFailure);
}
