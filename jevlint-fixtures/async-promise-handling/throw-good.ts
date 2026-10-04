export async function failSave(): Promise<void> {
  throw new Error("Draft storage is unavailable");
}
