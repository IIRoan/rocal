async function saveDraft(): Promise<void> {
  await Promise.reject(new Error("Draft storage is unavailable"));
}

export async function onSave(): Promise<void> {
  await saveDraft();
}
